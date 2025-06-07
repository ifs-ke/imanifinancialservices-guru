
// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { currentUser, clerkClient } from '@clerk/nextjs/server';
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

async function getCurrentServerDataForUser(userId: string) {
    const [
        transactions, debts, assetItems, otherLiabilityItems,
        budgetItems, ownedReviewsPrisma, statementSettings, investmentItems
    ] = await prisma.$transaction([
        prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
        prisma.debt.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
        prisma.assetItem.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
        prisma.otherLiabilityItem.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
        prisma.budgetItem.findMany({ where: { userId }, orderBy: [{ period: 'desc' }, { description: 'asc' }] }),
        prisma.weeklyReview.findMany({ where: { userId } }),
        prisma.statementSettings.findUnique({ where: { userId } }),
        prisma.investmentItem.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    ]);

    const ownedReviewsMap: Record<string, WeeklyReviewData> = {};
    ownedReviewsPrisma.forEach(review => {
      ownedReviewsMap[review.weekKey] = {
        ownerId: review.userId,
        journal: review.journal || "",
        transactionComments: typeof review.transactionComments === 'object' && review.transactionComments !== null ? review.transactionComments as Record<string, string> : {},
        weekKey: review.weekKey,
      };
    });

    return {
      transactions: transactions.map(t => ({...t, date: t.date || new Date(0), categoryName: t.categoryName || null })),
      debts: debts.map(d => ({...d})),
      assetItems: assetItems.map(a => ({...a})),
      otherLiabilityItems: otherLiabilityItems.map(l => ({...l})),
      budgetItems: budgetItems.map(b => ({...b})),
      investmentItems: investmentItems.map(i => ({...i, purchaseDate: i.purchaseDate || new Date(0)})),
      ownedReviews: ownedReviewsMap,
      startDate: statementSettings?.statementStartDate?.toISOString(),
      endDate: statementSettings?.statementEndDate?.toISOString(),
      gettingStartedDismissed: statementSettings?.gettingStartedDismissed ?? false,
    };
}


export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  const user = await currentUser();
  const userId = user?.id;
  const logContextBase = { userId: userId || 'unknown-save-post', operation: 'POST /api/save', apiRoute: '/api/save' };

  if (!user || !userId) {
    console.warn(`[API /api/save] Save API: Unauthorized save attempt (no userId from currentUser).`, logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  const userEmailForDb = user.primaryEmailAddress?.emailAddress;
  const userNameForDb = user.fullName;

  if (!userEmailForDb) {
    console.error(`[API /api/save] CRITICAL - Primary email not available from currentUser() for user ${userId}. This user may have an incomplete Clerk profile or there's an issue fetching it. Cannot proceed with save.`, logContextBase);
    const response = NextResponse.json({ error: 'Essential user information (email) is missing. Cannot save.' }, { status: 500 });
    return addCorsHeaders(response);
  }

  try {
    await ensureUserInDb(userId, userEmailForDb, userNameForDb);
  } catch (dbError: any) {
    console.error(`[API /api/save] Failed to ensure user in DB. User: ${userId}`, { error: dbError, ...logContextBase });
    const response = NextResponse.json({ error: 'Database operation failed while verifying user.' }, { status: 500 });
    return addCorsHeaders(response);
  }

  if (ratelimit) {
    const { success, limit, remaining, reset } = await ratelimit.limit(userId);
    if (!success) {
        console.warn(`[API /api/save] Rate limit exceeded. User: ${userId}`, { ...logContextBase, rateLimit: { limit, remaining, reset } });
        const response = NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
        return addCorsHeaders(response);
    }
  }

  let rawPayload: any;
  try {
    rawPayload = await request.json();
  } catch (error: any) {
    console.error(`[API /api/save] JSON parsing failed. User: ${userId}`, { error, ...logContextBase });
    const response = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    return addCorsHeaders(response);
  }

  const validationResult = SaveDataPayloadSchema.safeParse(rawPayload);
  if (!validationResult.success) {
    console.warn(`[API /api/save] Invalid payload structure. User: ${userId}`, { ...logContextBase, errors: validationResult.error.flatten(), receivedPayload: rawPayload });
    const response = NextResponse.json({ error: 'Invalid payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    return addCorsHeaders(response);
  }

  const payload = validationResult.data;
  const { payloadDataHash: clientProvidedPayloadHash, lastKnownServerHash: clientLastKnownServerHash, ...receivedDataForSave } = payload;

  const preparedDataForSaving = prepareDataForHashing(receivedDataForSave as any);
  const serverCalculatedHashOfReceivedPayload = await hashData(stringify(preparedDataForSaving));

  if (HASH_CHECK_ENABLED_ON_SERVER && serverCalculatedHashOfReceivedPayload !== clientProvidedPayloadHash) {
    console.error(`[API /api/save] PAYLOAD INTEGRITY CHECK FAILED! Client's payload hash (${clientProvidedPayloadHash}) does not match server's hash of received data (${serverCalculatedHashOfReceivedPayload}). User: ${userId}`, {
      error: new Error('Payload hash mismatch during save.'), ...logContextBase
    });
    const response = NextResponse.json({ error: 'Data integrity check failed. Your data may be out of sync or corrupted. Please try syncing again.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  console.info(`[API /api/save] Payload integrity check passed. User: ${userId}`, { clientProvidedPayloadHash, ...logContextBase });

  if (HASH_CHECK_ENABLED_ON_SERVER && clientLastKnownServerHash) {
    const currentServerData = await getCurrentServerDataForUser(userId);
    const preparedCurrentServerData = prepareDataForHashing(currentServerData);
    const currentServerStateHash = await hashData(stringify(preparedCurrentServerData));

    if (clientLastKnownServerHash !== currentServerStateHash) {
        console.warn(`[API /api/save] STALE DATA DETECTED! Client's last known server hash (${clientLastKnownServerHash}) does not match current server state hash (${currentServerStateHash}). User: ${userId}`, { ...logContextBase, currentServerHash: currentServerStateHash });
        const response = NextResponse.json({ error: "Your data is out of sync with the server. Please sync again before saving.", currentServerHash: currentServerStateHash }, { status: 409 }); // 409 Conflict
        return addCorsHeaders(response);
    }
    console.info(`[API /api/save] Client's last known server hash matches current server state. Proceeding with save. User: ${userId}`, { clientLastKnownServerHash, currentServerStateHash, ...logContextBase });
  } else if (HASH_CHECK_ENABLED_ON_SERVER && !clientLastKnownServerHash) {
    console.warn(`[API /api/save] Client did not provide lastKnownServerHash. Proceeding with save, but this might be risky if client data is stale. User: ${userId}`, logContextBase);
  }


  try {
    const {
        transactions = [], debts = [], assetItems = [],
        otherLiabilityItems = [], budgetItems = [],
        ownedReviews = {}, investmentItems = [],
        startDate, endDate, gettingStartedDismissed
    } = preparedDataForSaving;

    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });
      await tx.investmentItem.deleteMany({where: {userId}});
      await tx.assetItem.deleteMany({ where: { userId } });
      await tx.otherLiabilityItem.deleteMany({ where: { userId } });
      await tx.budgetItem.deleteMany({ where: { userId } });
      await tx.weeklyReview.deleteMany({ where: { userId } });
      await tx.sharedReview.deleteMany({ where: { reviewOwnerId: userId } });

      const deDuplicateAndPrepare = <T extends { id: string }>(items: T[], collectionName: string): T[] => {
        const uniqueItemsMap = new Map<string, T>();
        (items || []).forEach((item: T) => {
            if (!item.id) {
                console.warn(`[API /api/save] Item in '${collectionName}' for user ${userId} is missing an ID. Skipping.`);
                return;
            }
            if (!uniqueItemsMap.has(item.id)) {
                uniqueItemsMap.set(item.id, item);
            } else {
                console.warn(`[API /api/save] Duplicate ID '${item.id}' found in client payload for '${collectionName}' for user ${userId}. Using first instance.`);
            }
        });
        return Array.from(uniqueItemsMap.values());
      };

      const uniqueTransactions = deDuplicateAndPrepare(transactions, 'transactions');
      if (uniqueTransactions.length > 0) await tx.transaction.createMany({ data: uniqueTransactions.map((t:any) => ({ ...t, userId, date: new Date(t.date), amount: Number(t.amount) })) });

      const uniqueDebts = deDuplicateAndPrepare(debts, 'debts');
      if (uniqueDebts.length > 0) await tx.debt.createMany({ data: uniqueDebts.map((d:any) => ({ ...d, userId, principal: Number(d.principal), interestRate: Number(d.interestRate), minPayment: Number(d.minPayment) })) });

      const uniqueInvestmentItems = deDuplicateAndPrepare(investmentItems, 'investmentItems');
      if (uniqueInvestmentItems.length > 0) await tx.investmentItem.createMany({ data: uniqueInvestmentItems.map((i:any) => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate), quantity: Number(i.quantity), purchasePrice: Number(i.purchasePrice), currentValue: Number(i.currentValue) })) });

      const uniqueAssetItems = deDuplicateAndPrepare(assetItems, 'assetItems');
      if (uniqueAssetItems.length > 0) await tx.assetItem.createMany({ data: uniqueAssetItems.map((a:any) => ({ ...a, userId, amount: Number(a.amount) })) });

      const uniqueOtherLiabilityItems = deDuplicateAndPrepare(otherLiabilityItems, 'otherLiabilityItems');
      if (uniqueOtherLiabilityItems.length > 0) await tx.otherLiabilityItem.createMany({ data: uniqueOtherLiabilityItems.map((l:any) => ({ ...l, userId, amount: Number(l.amount) })) });

      const uniqueBudgetItems = deDuplicateAndPrepare(budgetItems, 'budgetItems');
      if (uniqueBudgetItems.length > 0) await tx.budgetItem.createMany({ data: uniqueBudgetItems.map((b:any) => ({ ...b, userId, amount: Number(b.amount) })) });

      if (Object.keys(ownedReviews).length > 0) {
        await tx.weeklyReview.createMany({
          data: Object.entries(ownedReviews).map(([weekKey, reviewData]: [string, any]) => ({
            userId, weekKey, journal: reviewData.journal, transactionComments: reviewData.transactionComments || undefined,
          })),
        });
      }
      await upsertStatementSettings(tx, userId, startDate, endDate, gettingStartedDismissed);
    });

    const newServerHashAfterSave = serverCalculatedHashOfReceivedPayload;
    console.info(`[API /api/save] Prisma transaction committed. User: ${userId}. New server hash: ${newServerHashAfterSave}`, logContextBase);
    const response = NextResponse.json({ message: `Data saved successfully for user ${userId}`, newServerHash: newServerHashAfterSave });
    return addCorsHeaders(response);

  } catch (error: any) {
    console.error(`[API /api/save] Prisma transaction failed. User: ${userId}`, { error, ...logContextBase });
    const errorMessage = error.message || 'An unknown error occurred during save.';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  }
}
