
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

const HASH_CHECK_ENABLED_ON_SERVER = true;

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
                logWarn('Invalid startDate string received in upsertStatementSettings. Setting to null.', { ...logContext, startDateValue: startDate }, userId);
                dataToUpdate.statementStartDate = null;
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
                logWarn('Invalid endDate string received in upsertStatementSettings. Setting to null.', { ...logContext, endDateValue: endDate }, userId);
                dataToUpdate.statementEndDate = null;
            } else {
                dataToUpdate.statementEndDate = parsed;
            }
        }
    }
    if (gettingStartedDismissed !== undefined) {
        dataToUpdate.gettingStartedDismissed = gettingStartedDismissed;
    }

    if (Object.keys(dataToUpdate).length > 0) {
        logDebug(`Save API: Upserting StatementSettings with data:`, { ...logContext, updateData: dataToUpdate }, userId);
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

  if (!userId || !clerkUser || !clerkUser.primaryEmailAddress?.emailAddress) {
    logWarn('Save API: Unauthorized save attempt: User not logged in or primary email missing.', logContextBase, userId);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in or primary email not available.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  try {
    await ensureUserInDb(userId, clerkUser.primaryEmailAddress.emailAddress, clerkUser.fullName);
  } catch (dbError: any) {
    logError('Save API: Failed to ensure user in DB.', dbError, logContextBase, userId);
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
    logWarn('Save API: Rate limiting is not configured (KV_REST_API_URL or KV_REST_API_TOKEN missing).', logContextBase, userId);
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
    logWarn('Save API: Invalid payload structure or data types.', { ...logContextBase, errors: validationResult.error.flatten(), receivedPayload: rawPayload }, userId);
    const response = NextResponse.json({ error: 'Invalid payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    return addCorsHeaders(response);
  }

  const payload = validationResult.data;
  const { dataHash: clientDataHash, ...receivedData } = payload;

  const preparedDataForSaving = prepareDataForHashing(receivedData as any);
  const serverCalculatedReceivedDataHash = await hashData(stringify(preparedDataForSaving));

  if (HASH_CHECK_ENABLED_ON_SERVER && serverCalculatedReceivedDataHash !== clientDataHash) {
    logError('Save API: Data integrity check failed! Client hash does not match server-calculated hash of received data.',
        new Error('Client vs Server hash mismatch for received data'), {
      clientHash: clientDataHash,
      serverCalculatedHash: serverCalculatedReceivedDataHash,
    }, userId);
    const response = NextResponse.json({ error: 'Data integrity check failed. Your data may be out of sync or corrupted. Please try syncing again.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  logInfo('Save API: Server-side data integrity check of client hash passed (or was skipped).', {
      clientHash: clientDataHash,
      serverCalculatedHash: serverCalculatedReceivedDataHash,
      hashCheckEnabled: HASH_CHECK_ENABLED_ON_SERVER
  }, userId);

  try {
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

    logDebug('Save API: Data prepared for Prisma transaction.', {
        userId,
        transactionCount: transactions.length,
        debtCount: debts.length,
        assetItemCount: assetItems.length,
        otherLiabilityItemCount: otherLiabilityItems.length,
        budgetItemCount: budgetItems.length,
        ownedReviewCount: Object.keys(ownedReviews).length,
        investmentItemCount: investmentItems.length,
        startDate, endDate, gettingStartedDismissed
    }, userId);

    await prisma.$transaction(async (tx) => {
      logDebug('Save API: Starting delete operations within transaction.', { userId }, userId);
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });
      await tx.investmentItem.deleteMany({where: {userId}});
      await tx.assetItem.deleteMany({ where: { userId } });
      await tx.otherLiabilityItem.deleteMany({ where: { userId } });
      await tx.budgetItem.deleteMany({ where: { userId } });
      await tx.weeklyReview.deleteMany({ where: { userId } });
      // Note: StatementSettings is upserted, not deleted first.
      logDebug('Save API: Delete operations completed.', { userId }, userId);

      logDebug('Save API: Starting create operations.', { userId }, userId);
      if (transactions.length > 0) {
        logDebug(`Save API: Creating ${transactions.length} transactions.`, { userId }, userId);
        await tx.transaction.createMany({
          data: transactions.map((t:any) => ({ ...t, userId, date: new Date(t.date), amount: Number(t.amount) })),
        });
      }
      if (debts.length > 0) {
        logDebug(`Save API: Creating ${debts.length} debts.`, { userId }, userId);
        await tx.debt.createMany({ data: debts.map((d:any) => ({ ...d, userId, principal: Number(d.principal), interestRate: Number(d.interestRate), minPayment: Number(d.minPayment) })) });
      }
      if (investmentItems.length > 0) {
        logDebug(`Save API: Creating ${investmentItems.length} investment items.`, { userId }, userId);
        await tx.investmentItem.createMany({
          data: investmentItems.map((i:any) => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate), quantity: Number(i.quantity), purchasePrice: Number(i.purchasePrice), currentValue: Number(i.currentValue) })),
        });
      }
      if (assetItems.length > 0) {
        logDebug(`Save API: Creating ${assetItems.length} asset items.`, { userId }, userId);
        await tx.assetItem.createMany({ data: assetItems.map((a:any) => ({ ...a, userId, amount: Number(a.amount) })) });
      }
      if (otherLiabilityItems.length > 0) {
        logDebug(`Save API: Creating ${otherLiabilityItems.length} other liability items.`, { userId }, userId);
        await tx.otherLiabilityItem.createMany({ data: otherLiabilityItems.map((l:any) => ({ ...l, userId, amount: Number(l.amount) })) });
      }
      if (budgetItems.length > 0) {
        logDebug(`Save API: Creating ${budgetItems.length} budget items.`, { userId }, userId);
        await tx.budgetItem.createMany({ data: budgetItems.map((b:any) => ({ ...b, userId, amount: Number(b.amount) })) });
      }
      if (Object.keys(ownedReviews).length > 0) {
        logDebug(`Save API: Creating ${Object.keys(ownedReviews).length} owned reviews.`, { userId }, userId);
        await tx.weeklyReview.createMany({
          data: Object.entries(ownedReviews).map(([weekKey, reviewData]: [string, any]) => ({
            userId,
            weekKey,
            journal: reviewData.journal,
            transactionComments: reviewData.transactionComments || undefined,
            // sharedWith is handled by the SharedReview table, not directly on WeeklyReview
          })),
        });
      }
      logDebug('Save API: Create operations completed.', { userId }, userId);
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
