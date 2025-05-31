
// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, InvestmentItem } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { addCorsHeaders } from '@/lib/utils';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';
import { SaveDataPayloadSchema } from '@/lib/schemas';
import { ensureUserInDb } from '@/app/actions/shareActions'; // For ensuring user exists

const ratelimit = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(20, '10 s'), // Allow more requests for save
    })
  : null;

async function upsertUserProfile(userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean) {
    const logContext = { userId, operation: 'upsertUserProfile', apiRoute: '/api/save' };
    logDebug(`Save API: Starting upsert for user profile data`, logContext, userId);

    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        logDebug(`Save API: No user profile data fields provided. Skipping profile update.`, logContext, userId);
        return;
    }

    const dataToUpdate: { statementStartDate?: Date | null, statementEndDate?: Date | null, gettingStartedDismissed?: boolean } = {};
    if (startDate !== undefined) dataToUpdate.statementStartDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) dataToUpdate.statementEndDate = endDate ? new Date(endDate) : null;
    if (gettingStartedDismissed !== undefined) dataToUpdate.gettingStartedDismissed = gettingStartedDismissed;

    if (Object.keys(dataToUpdate).length > 0) {
        await prisma.statementSettings.upsert({
            where: { userId },
            update: dataToUpdate,
            create: { userId, ...dataToUpdate },
        });
        logInfo(`Save API: Successfully saved/updated user profile (StatementSettings)`, logContext, userId);
    } else {
        logDebug(`Save API: No valid user profile fields to update.`, logContext, userId);
    }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  const { userId, user: clerkUser } = auth();
  const logContextBase = { userId: userId || 'unknown-save-post', operation: 'POST /api/save', apiRoute: '/api/save' };

  if (!userId || !clerkUser || !clerkUser.primaryEmailAddressId) {
    logWarn('Save API: Unauthorized save attempt: User not logged in or email missing.', logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in or email not available.' }, { status: 401 });
    return addCorsHeaders(response);
  }
  // Ensure user exists in DB
  await ensureUserInDb(userId, clerkUser.primaryEmailAddress.emailAddress, clerkUser.fullName);


  if (ratelimit) {
    const { success, limit, remaining, reset } = await ratelimit.limit(userId);
    const logContextWithRateLimit = { ...logContextBase, rateLimit: { limit, remaining, reset } };
    if (!success) {
        logWarn('Save API: Rate limit exceeded.', logContextWithRateLimit, userId);
        const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
        return addCorsHeaders(response);
    }
    logDebug('Save API: Rate limit check passed.', logContextWithRateLimit, userId);
  } else {
    logWarn('Save API: Rate limiting is not configured (KV_REST_API_URL or KV_REST_API_TOKEN missing).', logContextBase);
  }


  let rawPayload: any;
  try {
    rawPayload = await request.json();
  } catch (error: any) {
    logError('Save API: Invalid request body - JSON parsing failed.', error, logContextBase, userId);
    const response = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    return addCorsHeaders(response);
  }

  const validationResult = SaveDataPayloadSchema.safeParse(rawPayload);
  if (!validationResult.success) {
    logWarn('Save API: Invalid payload structure or data types.', { ...logContextBase, errors: validationResult.error.flatten() }, userId);
    const response = NextResponse.json({ error: 'Invalid payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    return addCorsHeaders(response);
  }

  const payload = validationResult.data;
  const { dataHash, ...receivedData } = payload;
  const preparedDataForVerification = prepareDataForHashing(receivedData as any);
  const dataString = stringify(preparedDataForVerification);
  const calculatedServerHash = await hashData(dataString);

  logDebug(`Save API: Received hash: ${dataHash}, Calculated server hash: ${calculatedServerHash}`, logContextBase, userId);

  const isValid = await verifyHash(dataString, dataHash);
  if (!isValid) {
    logError('Save API: Data integrity check failed!', { clientHash: dataHash, serverHash: calculatedServerHash }, logContextBase, userId);
    const response = NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  logInfo('Save API: Data integrity check passed. Proceeding with save.', logContextBase, userId);

  try {
    await prisma.$transaction(async (tx) => {
      const {
        transactions = [],
        debts = [],
        assetItems = [],
        otherLiabilityItems = [],
        budgetItems = [],
        ownedReviews = {},
        investmentItems = [], // Added
        startDate,
        endDate,
        gettingStartedDismissed
      } = preparedDataForVerification;

      // Clear existing data for this user
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });
      await tx.assetItem.deleteMany({ where: { userId } });
      await tx.otherLiabilityItem.deleteMany({ where: { userId } });
      await tx.budgetItem.deleteMany({ where: { userId } });
      await tx.weeklyReview.deleteMany({ where: { userId } }); // Deletes owned reviews
      await tx.investmentItem.deleteMany({where: {userId}}); // Added

      // Insert new data
      if (transactions.length > 0) {
        await tx.transaction.createMany({
          data: transactions.map(t => ({ ...t, userId, date: new Date(t.date) })),
        });
      }
      if (debts.length > 0) {
        await tx.debt.createMany({ data: debts.map(d => ({ ...d, userId })) });
      }
      if (investmentItems.length > 0) { // Added
        await tx.investmentItem.createMany({
          data: investmentItems.map(i => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate) })),
        });
      }
      if (assetItems.length > 0) {
        await tx.assetItem.createMany({ data: assetItems.map(a => ({ ...a, userId })) });
      }
      if (otherLiabilityItems.length > 0) {
        await tx.otherLiabilityItem.createMany({ data: otherLiabilityItems.map(l => ({ ...l, userId })) });
      }
      if (budgetItems.length > 0) {
        await tx.budgetItem.createMany({ data: budgetItems.map(b => ({ ...b, userId })) });
      }
      if (Object.keys(ownedReviews).length > 0) {
        await tx.weeklyReview.createMany({
          data: Object.entries(ownedReviews).map(([weekKey, reviewData]) => ({
            userId,
            weekKey,
            journal: reviewData.journal,
            transactionComments: reviewData.transactionComments || undefined, // Prisma expects JsonNull for undefined optional Json
          })),
        });
      }
      // User Profile (StatementSettings)
      await upsertUserProfile(userId, startDate, endDate, gettingStartedDismissed);
    });

    logInfo('Save API: Prisma transaction committed successfully.', logContextBase, userId);
    const response = NextResponse.json({ message: `Data saved successfully for user ${userId}` });
    return addCorsHeaders(response);

  } catch (error: any) {
    logError('Save API: Prisma transaction failed or aborted.', error, logContextBase, userId);
    const errorMessage = error instanceof Error ? `Failed to save data: ${error.message}` : 'An unknown error occurred during save.';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  }
}
