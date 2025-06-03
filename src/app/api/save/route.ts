
// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server'; // Added clerkClient
import prisma from '@/lib/prisma';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, InvestmentItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { addCorsHeaders } from '@/lib/utils';
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
    console.debug(`[API /api/save] Save API: Starting upsert for StatementSettings. User: ${userId}`, logContext);

    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        console.debug(`[API /api/save] Save API: No StatementSettings fields provided. Skipping update. User: ${userId}`, logContext);
        return;
    }

    const dataToUpdate: { statementStartDate?: Date | null, statementEndDate?: Date | null, gettingStartedDismissed?: boolean } = {};

    if (startDate !== undefined) {
        if (startDate === null) {
            dataToUpdate.statementStartDate = null;
        } else {
            const parsed = new Date(startDate);
            if (isNaN(parsed.getTime())) {
                console.warn(`[API /api/save] Invalid startDate string received in upsertStatementSettings. Setting to null. User: ${userId}`, { ...logContext, startDateValue: startDate });
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
                console.warn(`[API /api/save] Invalid endDate string received in upsertStatementSettings. Setting to null. User: ${userId}`, { ...logContext, endDateValue: endDate });
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
        console.debug(`[API /api/save] Save API: Upserting StatementSettings with data. User: ${userId}`, { ...logContext, updateData: dataToUpdate });
        await tx.statementSettings.upsert({
            where: { userId },
            update: dataToUpdate,
            create: { userId, ...dataToUpdate },
        });
        console.info(`[API /api/save] Save API: Successfully saved/updated StatementSettings. User: ${userId}`, logContext);
    } else {
        console.debug(`[API /api/save] Save API: No valid StatementSettings fields to update. User: ${userId}`, logContext);
    }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  const { userId, user: authClerkUser } = auth(); // Renamed user to authClerkUser for clarity
  const logContextBase = { userId: userId || 'unknown-save-post', operation: 'POST /api/save', apiRoute: '/api/save' };

  if (!userId) {
    console.warn(`[API /api/save] Save API: Unauthorized save attempt: User not authenticated (no userId).`, logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  let userEmailForDb: string | undefined | null = authClerkUser?.primaryEmailAddress?.emailAddress;
  let userNameForDb: string | undefined | null = authClerkUser?.fullName;

  if (!userEmailForDb) {
    console.warn(`[API /api/save] Primary email not immediately available from auth().user for ${userId}. Attempting direct fetch from Clerk.`, logContextBase);
    try {
      const fetchedClerkUser = await clerkClient.users.getUser(userId);
      userEmailForDb = fetchedClerkUser?.primaryEmailAddress?.emailAddress;
      userNameForDb = fetchedClerkUser?.fullName ?? fetchedClerkUser?.firstName ?? userNameForDb;
      if (!userEmailForDb) {
        console.error(`[API /api/save] Save API: CRITICAL - Could not retrieve primary email for user ${userId} even after direct Clerk fetch. Cannot ensure user in DB.`, logContextBase);
        const response = NextResponse.json({ error: 'Failed to retrieve essential user information from authentication provider. Cannot save data.' }, { status: 500 });
        return addCorsHeaders(response);
      }
      console.info(`[API /api/save] Successfully fetched email for user ${userId} via clerkClient.`, logContextBase);
    } catch (clerkError: any) {
      console.error(`[API /api/save] Save API: CRITICAL - Error fetching user details from Clerk for ${userId}. Cannot ensure user in DB.`, { error: clerkError, ...logContextBase });
      const response = NextResponse.json({ error: 'Failed to communicate with authentication provider to verify user details. Cannot save data.' }, { status: 500 });
      return addCorsHeaders(response);
    }
  }

  try {
    // Ensure userEmailForDb is a string when passed to ensureUserInDb
    await ensureUserInDb(userId, userEmailForDb!, userNameForDb);
  } catch (dbError: any) {
    console.error(`[API /api/save] Save API: Failed to ensure user in DB. User: ${userId}`, { error: dbError, ...logContextBase });
    const response = NextResponse.json({ error: 'Database operation failed while verifying user.' }, { status: 500 });
    return addCorsHeaders(response);
  }

  if (ratelimit) {
    const { success, limit, remaining, reset } = await ratelimit.limit(userId);
    const logContextWithRateLimit = { ...logContextBase, rateLimit: { limit, remaining, reset } };
    if (!success) {
        console.warn(`[API /api/save] Save API: Rate limit exceeded. User: ${userId}`, logContextWithRateLimit);
        const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
        return addCorsHeaders(response);
    }
    console.debug(`[API /api/save] Save API: Rate limit check passed. User: ${userId}`, logContextWithRateLimit);
  } else {
    console.warn(`[API /api/save] Save API: Rate limiting is not configured (KV_REST_API_URL or KV_REST_API_TOKEN missing). User: ${userId}`, logContextBase);
  }

  let rawPayload: any;
  try {
    rawPayload = await request.json();
  } catch (error: any) {
    console.error(`[API /api/save] Save API: Invalid request body - JSON parsing failed. User: ${userId}`, { error, ...logContextBase });
    const response = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    return addCorsHeaders(response);
  }

  const validationResult = SaveDataPayloadSchema.safeParse(rawPayload);
  if (!validationResult.success) {
    console.warn(`[API /api/save] Save API: Invalid payload structure or data types. User: ${userId}`, { ...logContextBase, errors: validationResult.error.flatten(), receivedPayload: rawPayload });
    const response = NextResponse.json({ error: 'Invalid payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    return addCorsHeaders(response);
  }

  const payload = validationResult.data;
  const { dataHash: clientDataHash, ...receivedData } = payload;

  const preparedDataForSaving = prepareDataForHashing(receivedData as any);
  const serverCalculatedReceivedDataHash = await hashData(stringify(preparedDataForSaving));

  if (HASH_CHECK_ENABLED_ON_SERVER && serverCalculatedReceivedDataHash !== clientDataHash) {
    console.error(`[API /api/save] Save API: Data integrity check failed! Client hash does not match server-calculated hash of received data. User: ${userId}`, {
      error: new Error('Client vs Server hash mismatch for received data'),
      clientHash: clientDataHash,
      serverCalculatedHash: serverCalculatedReceivedDataHash,
      ...logContextBase
    });
    const response = NextResponse.json({ error: 'Data integrity check failed. Your data may be out of sync or corrupted. Please try syncing again.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  console.info(`[API /api/save] Save API: Server-side data integrity check of client hash passed (or was skipped). User: ${userId}`, {
      clientHash: clientDataHash,
      serverCalculatedHash: serverCalculatedReceivedDataHash,
      hashCheckEnabled: HASH_CHECK_ENABLED_ON_SERVER,
      ...logContextBase
  });

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

    console.debug(`[API /api/save] Save API: Data prepared for Prisma transaction. User: ${userId}`, {
        userId,
        transactionCount: transactions.length,
        debtCount: debts.length,
        assetItemCount: assetItems.length,
        otherLiabilityItemCount: otherLiabilityItems.length,
        budgetItemCount: budgetItems.length,
        ownedReviewCount: Object.keys(ownedReviews).length,
        investmentItemCount: investmentItems.length,
        startDate, endDate, gettingStartedDismissed
    });

    await prisma.$transaction(async (tx) => {
      console.debug(`[API /api/save] Save API: Starting delete operations within transaction. User: ${userId}`, { userId });
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });
      await tx.investmentItem.deleteMany({where: {userId}});
      await tx.assetItem.deleteMany({ where: { userId } });
      await tx.otherLiabilityItem.deleteMany({ where: { userId } });
      await tx.budgetItem.deleteMany({ where: { userId } });
      await tx.weeklyReview.deleteMany({ where: { userId } });
      await tx.sharedReview.deleteMany({ where: { reviewOwnerId: userId } });

      console.debug(`[API /api/save] Save API: Delete operations completed. User: ${userId}`, { userId });

      console.debug(`[API /api/save] Save API: Starting create operations. User: ${userId}`, { userId });
      if (transactions.length > 0) {
        console.debug(`[API /api/save] Creating ${transactions.length} transactions. User: ${userId}`);
        await tx.transaction.createMany({
          data: transactions.map((t:any) => ({ ...t, userId, date: new Date(t.date), amount: Number(t.amount) })),
        });
      }
      if (debts.length > 0) {
        console.debug(`[API /api/save] Creating ${debts.length} debts. User: ${userId}`);
        await tx.debt.createMany({ data: debts.map((d:any) => ({ ...d, userId, principal: Number(d.principal), interestRate: Number(d.interestRate), minPayment: Number(d.minPayment) })) });
      }
      if (investmentItems.length > 0) {
        console.debug(`[API /api/save] Creating ${investmentItems.length} investment items. User: ${userId}`);
        await tx.investmentItem.createMany({
          data: investmentItems.map((i:any) => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate), quantity: Number(i.quantity), purchasePrice: Number(i.purchasePrice), currentValue: Number(i.currentValue) })),
        });
      }
      if (assetItems.length > 0) {
        console.debug(`[API /api/save] Creating ${assetItems.length} asset items. User: ${userId}`);
        await tx.assetItem.createMany({ data: assetItems.map((a:any) => ({ ...a, userId, amount: Number(a.amount) })) });
      }
      if (otherLiabilityItems.length > 0) {
        console.debug(`[API /api/save] Creating ${otherLiabilityItems.length} other liability items. User: ${userId}`);
        await tx.otherLiabilityItem.createMany({ data: otherLiabilityItems.map((l:any) => ({ ...l, userId, amount: Number(l.amount) })) });
      }
      if (budgetItems.length > 0) {
        console.debug(`[API /api/save] Creating ${budgetItems.length} budget items. User: ${userId}`);
        await tx.budgetItem.createMany({ data: budgetItems.map((b:any) => ({ ...b, userId, amount: Number(b.amount) })) });
      }
      if (Object.keys(ownedReviews).length > 0) {
        console.debug(`[API /api/save] Creating ${Object.keys(ownedReviews).length} owned reviews. User: ${userId}`);
        await tx.weeklyReview.createMany({
          data: Object.entries(ownedReviews).map(([weekKey, reviewData]: [string, any]) => ({
            userId,
            weekKey,
            journal: reviewData.journal,
            transactionComments: reviewData.transactionComments || undefined,
          })),
        });
      }
      console.debug(`[API /api/save] Create operations completed. User: ${userId}`, { userId });
      await upsertStatementSettings(tx, userId, startDate, endDate, gettingStartedDismissed);
    });

    console.info(`[API /api/save] Save API: Prisma transaction committed successfully. User: ${userId}`, logContextBase);
    const response = NextResponse.json({ message: `Data saved successfully for user ${userId}` });
    return addCorsHeaders(response);

  } catch (error: any) {
    console.error(`[API /api/save] Save API: Prisma transaction failed or aborted. User: ${userId}`, { error, ...logContextBase });
    const errorMessage = error instanceof Error ? `Failed to save data: ${error.message}` : 'An unknown error occurred during save.';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  }
}

    