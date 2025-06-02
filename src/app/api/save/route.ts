
// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, InvestmentItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { addCorsHeaders } from '@/lib/utils';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';
import { SaveDataPayloadSchema } from '@/lib/schemas';
import { ensureUserInDb } from '@/app/actions/shareActions';

const ratelimit = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  ? new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(20, '10 s'),
    })
  : null;

async function upsertStatementSettings(tx: any, userId: string, startDate?: string | null, endDate?: string | null, gettingStartedDismissed?: boolean) {
    const logContext = { userId, operation: 'upsertStatementSettings', apiRoute: '/api/save' };
    logDebug(`Save API: Starting upsert for StatementSettings`, logContext, userId);

    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        logDebug(`Save API: No StatementSettings fields provided. Skipping update.`, logContext, userId);
        return;
    }

    const dataToUpdate: { statementStartDate?: Date | null, statementEndDate?: Date | null, gettingStartedDismissed?: boolean } = {};

    if (startDate !== undefined) {
        if (startDate === null) {
            dataToUpdate.statementStartDate = null;
        } else {
            const parsed = new Date(startDate);
            if (isNaN(parsed.getTime())) {
                logWarn('Invalid startDate string received in upsertStatementSettings. Setting to null.', { ...logContext, startDate });
                dataToUpdate.statementStartDate = null; // Or throw error, depending on strictness
            } else {
                dataToUpdate.statementStartDate = parsed;
            }
        }
    }
    if (endDate !== undefined) {
        if (endDate === null) {
            dataToUpdate.statementEndDate = null;
        } else {
            const parsed = new Date(endDate);
            if (isNaN(parsed.getTime())) {
                logWarn('Invalid endDate string received in upsertStatementSettings. Setting to null.', { ...logContext, endDate });
                dataToUpdate.statementEndDate = null; // Or throw error
            } else {
                dataToUpdate.statementEndDate = parsed;
            }
        }
    }
    if (gettingStartedDismissed !== undefined) {
        dataToUpdate.gettingStartedDismissed = gettingStartedDismissed;
    }

    if (Object.keys(dataToUpdate).length > 0) {
        await tx.statementSettings.upsert({
            where: { userId },
            update: dataToUpdate,
            create: { userId, ...dataToUpdate },
        });
        logInfo(`Save API: Successfully saved/updated StatementSettings`, logContext, userId);
    } else {
        logDebug(`Save API: No valid StatementSettings fields to update.`, logContext, userId);
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
  
  try {
    await ensureUserInDb(userId, clerkUser.primaryEmailAddress.emailAddress, clerkUser.fullName);
  } catch (dbError: any) {
    logError('Save API: Failed to ensure user in DB.', dbError, logContextBase);
    const response = NextResponse.json({ error: 'Database operation failed while verifying user.' }, { status: 500 });
    return addCorsHeaders(response);
  }


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
  const { dataHash: clientDataHash, ...receivedData } = payload;
  // Server-side hash verification against clientDataHash is disabled.
  // We use prepareDataForHashing to ensure consistent structure for saving.
  const preparedDataForSaving = prepareDataForHashing(receivedData as any);

  logInfo(`Save API: Proceeding with save (server-side hash check disabled). Received client hash: ${clientDataHash}`, logContextBase, userId);

  try {
    await prisma.$transaction(async (tx) => {
      const {
        transactions = [],
        debts = [],
        assetItems = [],
        otherLiabilityItems = [],
        budgetItems = [],
        ownedReviews = {},
        investmentItems = [],
        startDate,
        endDate,
        gettingStartedDismissed
      } = preparedDataForSaving;

      // Clear existing data for this user
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });
      await tx.assetItem.deleteMany({ where: { userId } });
      await tx.otherLiabilityItem.deleteMany({ where: { userId } });
      await tx.budgetItem.deleteMany({ where: { userId } });
      await tx.weeklyReview.deleteMany({ where: { userId } }); // Assuming weekly reviews are owned by the user
      await tx.investmentItem.deleteMany({where: {userId}});
      // StatementSettings is upserted, not fully deleted.

      // Insert new data
      if (transactions.length > 0) {
        await tx.transaction.createMany({
          data: transactions.map((t:any) => ({ ...t, userId, date: new Date(t.date), amount: Number(t.amount) })),
        });
      }
      if (debts.length > 0) {
        await tx.debt.createMany({ data: debts.map((d:any) => ({ ...d, userId, principal: Number(d.principal), interestRate: Number(d.interestRate), minPayment: Number(d.minPayment) })) });
      }
      if (investmentItems.length > 0) {
        await tx.investmentItem.createMany({
          data: investmentItems.map((i:any) => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate), quantity: Number(i.quantity), purchasePrice: Number(i.purchasePrice), currentValue: Number(i.currentValue) })),
        });
      }
      if (assetItems.length > 0) {
        await tx.assetItem.createMany({ data: assetItems.map((a:any) => ({ ...a, userId, amount: Number(a.amount) })) });
      }
      if (otherLiabilityItems.length > 0) {
        await tx.otherLiabilityItem.createMany({ data: otherLiabilityItems.map((l:any) => ({ ...l, userId, amount: Number(l.amount) })) });
      }
      if (budgetItems.length > 0) {
        await tx.budgetItem.createMany({ data: budgetItems.map((b:any) => ({ ...b, userId, amount: Number(b.amount) })) });
      }
      if (Object.keys(ownedReviews).length > 0) {
        await tx.weeklyReview.createMany({
          data: Object.entries(ownedReviews).map(([weekKey, reviewData]: [string, any]) => ({
            userId,
            weekKey,
            journal: reviewData.journal,
            transactionComments: reviewData.transactionComments || undefined, // Prisma handles JSON
            // sharedWith will be managed by SharedReview table, not directly on WeeklyReview
          })),
        });
      }
      // Upsert StatementSettings (handles creation if not exists, or update if exists)
      await upsertStatementSettings(tx, userId, startDate, endDate, gettingStartedDismissed);
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

