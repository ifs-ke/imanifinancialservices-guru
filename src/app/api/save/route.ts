
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

  let userEmailForDb: string | undefined | null = user.primaryEmailAddress?.emailAddress;
  let userNameForDb: string | undefined | null = user.fullName;

  if (!userEmailForDb) {
    console.warn(`[API /api/save] Primary email not available from currentUser() for ${userId}. Attempting direct fetch.`, logContextBase);
    try {
      const fetchedClerkUser = await clerkClient.users.getUser(userId);
      userEmailForDb = fetchedClerkUser?.primaryEmailAddress?.emailAddress;
      userNameForDb = fetchedClerkUser?.fullName ?? fetchedClerkUser?.firstName ?? userNameForDb;
      if (!userEmailForDb) {
        console.error(`[API /api/save] CRITICAL - Could not retrieve primary email for user ${userId} even after direct Clerk fetch.`, logContextBase);
        const response = NextResponse.json({ error: 'Failed to retrieve essential user information.' }, { status: 500 });
        return addCorsHeaders(response);
      }
    } catch (clerkError: any) {
      console.error(`[API /api/save] CRITICAL - Error fetching user details from Clerk for ${userId}.`, { error: clerkError, ...logContextBase });
      const response = NextResponse.json({ error: 'Failed to communicate with authentication provider.' }, { status: 500 });
      return addCorsHeaders(response);
    }
  }

  try {
    await ensureUserInDb(userId, userEmailForDb!, userNameForDb);
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

  // 1. Payload Integrity Check
  if (HASH_CHECK_ENABLED_ON_SERVER && serverCalculatedHashOfReceivedPayload !== clientProvidedPayloadHash) {
    console.error(`[API /api/save] PAYLOAD INTEGRITY CHECK FAILED! Client's payload hash does not match server's hash of received data. User: ${userId}`, {
      error: new Error('Payload hash mismatch during save.'), clientPayloadHash, serverCalculatedHashOfReceivedPayload, ...logContextBase
    });
    // This indicates the data sent might be different from what the client intended to hash and send, or client-side hashing issue.
    const response = NextResponse.json({ error: 'Data integrity check failed. Payload may have been corrupted or hashing differs.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  console.info(`[API /api/save] Payload integrity check passed. User: ${userId}`, { clientPayloadHash, ...logContextBase });

  // 2. Stale Data Check (Only if client sent a lastKnownServerHash)
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
    // This could be an initial save or a "force save" scenario from the client.
    // Depending on strictness, you might choose to reject here too if a hash is always expected after first sync.
  }


  try {
    const {
        transactions = [], debts = [], assetItems = [],
        otherLiabilityItems = [], budgetItems = [],
        ownedReviews = {}, investmentItems = [],
        startDate, endDate, gettingStartedDismissed
    } = preparedDataForSaving; // Use the data from preparedDataForSaving

    await prisma.$transaction(async (tx) => {
      // Clear existing data for the user. This is a "replace all" strategy.
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });
      await tx.investmentItem.deleteMany({where: {userId}});
      await tx.assetItem.deleteMany({ where: { userId } });
      await tx.otherLiabilityItem.deleteMany({ where: { userId } });
      await tx.budgetItem.deleteMany({ where: { userId } });
      await tx.weeklyReview.deleteMany({ where: { userId } }); // Clears owned reviews
      // Note: SharedReview entries where this user IS THE OWNER are implicitly handled by cascade or need explicit logic if not cascading.
      // For shared reviews where this user is a recipient, those are not cleared here.
      await tx.sharedReview.deleteMany({ where: { reviewOwnerId: userId } }); // Clear shares initiated by this user

      // Create new data
      if (transactions.length > 0) await tx.transaction.createMany({ data: transactions.map((t:any) => ({ ...t, userId, date: new Date(t.date), amount: Number(t.amount) })) });
      if (debts.length > 0) await tx.debt.createMany({ data: debts.map((d:any) => ({ ...d, userId, principal: Number(d.principal), interestRate: Number(d.interestRate), minPayment: Number(d.minPayment) })) });
      if (investmentItems.length > 0) await tx.investmentItem.createMany({ data: investmentItems.map((i:any) => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate), quantity: Number(i.quantity), purchasePrice: Number(i.purchasePrice), currentValue: Number(i.currentValue) })) });
      if (assetItems.length > 0) await tx.assetItem.createMany({ data: assetItems.map((a:any) => ({ ...a, userId, amount: Number(a.amount) })) });
      if (otherLiabilityItems.length > 0) await tx.otherLiabilityItem.createMany({ data: otherLiabilityItems.map((l:any) => ({ ...l, userId, amount: Number(l.amount) })) });
      if (budgetItems.length > 0) await tx.budgetItem.createMany({ data: budgetItems.map((b:any) => ({ ...b, userId, amount: Number(b.amount) })) });
      
      if (Object.keys(ownedReviews).length > 0) {
        await tx.weeklyReview.createMany({
          data: Object.entries(ownedReviews).map(([weekKey, reviewData]: [string, any]) => ({
            userId, weekKey, journal: reviewData.journal, transactionComments: reviewData.transactionComments || undefined,
          })),
        });
      }
      // Save statement settings (start/end date, getting started)
      await upsertStatementSettings(tx, userId, startDate, endDate, gettingStartedDismissed);
    });

    // After successful save, the new server state hash is the hash of the data we just saved.
    const newServerHashAfterSave = serverCalculatedHashOfReceivedPayload; // This is the hash of the data that was just written.
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
