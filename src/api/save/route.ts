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
import { SaveDataPayloadSchema, type TransactionItemForAPIType, type DebtItemForAPIType, type BaseItemForAPIType, type BudgetItemForAPIType, type InvestmentItemForAPIType, type WeeklyReviewDataForAPIType } from '@/lib/schemas';
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

  const payloadFromClient = validationResult.data;
  const { payloadDataHash: clientProvidedPayloadHash, lastKnownServerHash: clientLastKnownServerHash, ...dataForDbOperations } = payloadFromClient;
  const dataForHashCheck = prepareDataForHashing(dataForDbOperations as any);
  const serverCalculatedHashOfReceivedPayload = await hashData(stringify(dataForHashCheck));

  if (HASH_CHECK_ENABLED_ON_SERVER && serverCalculatedHashOfReceivedPayload !== clientProvidedPayloadHash) {
    console.error(`[API /api/save] PAYLOAD INTEGRITY CHECK FAILED! Client's payload hash (${clientProvidedPayloadHash}) does not match server's hash of received data (${serverCalculatedHashOfReceivedPayload}). User: ${userId}`, {
      error: new Error('Payload hash mismatch during save.'), ...logContextBase
    });
    const response = NextResponse.json({ error: 'Data integrity check failed. Your data may be out of sync or corrupted. Please try syncing again.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  console.info(`[API /api/save] Payload integrity check passed. User: ${userId}`, { clientProvidedPayloadHash, ...logContextBase });

  if (HASH_CHECK_ENABLED_ON_SERVER && clientLastKnownServerHash) {
    const currentServerDataForComparison = await getCurrentServerDataForUser(userId);
    const preparedCurrentFullServerData = prepareDataForHashing(currentServerDataForComparison);
    const currentServerStateHash = await hashData(stringify(preparedCurrentFullServerData));

    if (clientLastKnownServerHash !== currentServerStateHash) {
        console.warn(`[API /api/save] STALE DATA DETECTED! Client's last known server hash (${clientLastKnownServerHash}) does not match current server state hash (${currentServerStateHash}). User: ${userId}`, { ...logContextBase, currentServerHash: currentServerStateHash });
        const response = NextResponse.json({ error: "Your data is out of sync with the server. Please sync again before saving.", currentServerHash: currentServerStateHash }, { status: 409 });
        return addCorsHeaders(response);
    }
    console.info(`[API /api/save] Client's last known server hash matches current server state. Proceeding with save. User: ${userId}`, { clientLastKnownServerHash, currentServerStateHash, ...logContextBase });
  } else if (HASH_CHECK_ENABLED_ON_SERVER && !clientLastKnownServerHash) {
    console.warn(`[API /api/save] Client did not provide lastKnownServerHash. Proceeding with save (force save scenario). User: ${userId}`, logContextBase);
  }

  try {
    const {
        transactions: transactionChanges,
        debts: debtChanges,
        assetItems: assetItemChanges,
        otherLiabilityItems: otherLiabilityItemChanges,
        budgetItems: budgetItemChanges,
        ownedReviews: ownedReviewChanges,
        investmentItems: investmentItemChanges,
        startDate, endDate, gettingStartedDismissed
    } = dataForDbOperations;

    await prisma.$transaction(async (tx) => {
        // Process Transactions
        if (transactionChanges) {
            if (transactionChanges.created && transactionChanges.created.length > 0) {
              await tx.transaction.createMany({ data: transactionChanges.created.map((t) => ({ ...t, userId, date: new Date(t.date) })) });
            }
            if (transactionChanges.updated && transactionChanges.updated.length > 0) {
              for (const item of transactionChanges.updated) {
                await tx.transaction.update({ where: { id: item.id, userId }, data: { ...item, date: new Date(item.date), userId } });
              }
            }
            if (transactionChanges.deletedIds && transactionChanges.deletedIds.length > 0) {
              await tx.transaction.deleteMany({ where: { id: { in: transactionChanges.deletedIds }, userId } });
            }
        }

        // Process Debts
        if (debtChanges) {
            if (debtChanges.created && debtChanges.created.length > 0) {
              await tx.debt.createMany({ data: debtChanges.created.map((d) => ({ ...d, userId })) });
            }
            if (debtChanges.updated && debtChanges.updated.length > 0) {
              for (const item of debtChanges.updated) {
                await tx.debt.update({ where: { id: item.id, userId }, data: { ...item, userId } });
              }
            }
            if (debtChanges.deletedIds && debtChanges.deletedIds.length > 0) {
              await tx.debt.deleteMany({ where: { id: { in: debtChanges.deletedIds }, userId } });
            }
        }

        // Process InvestmentItems
        if (investmentItemChanges) {
            if (investmentItemChanges.created && investmentItemChanges.created.length > 0) {
              await tx.investmentItem.createMany({ data: investmentItemChanges.created.map((i) => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate) })) });
            }
            if (investmentItemChanges.updated && investmentItemChanges.updated.length > 0) {
              for (const item of investmentItemChanges.updated) {
                await tx.investmentItem.update({ where: { id: item.id, userId }, data: { ...item, purchaseDate: new Date(item.purchaseDate), userId } });
              }
            }
            if (investmentItemChanges.deletedIds && investmentItemChanges.deletedIds.length > 0) {
              await tx.investmentItem.deleteMany({ where: { id: { in: investmentItemChanges.deletedIds }, userId } });
            }
        }

        // Process AssetItems
        if (assetItemChanges) {
            if (assetItemChanges.created && assetItemChanges.created.length > 0) {
              await tx.assetItem.createMany({ data: assetItemChanges.created.map((a) => ({ ...a, userId })) });
            }
            if (assetItemChanges.updated && assetItemChanges.updated.length > 0) {
              for (const item of assetItemChanges.updated) {
                await tx.assetItem.update({ where: { id: item.id, userId }, data: { ...item, userId } });
              }
            }
            if (assetItemChanges.deletedIds && assetItemChanges.deletedIds.length > 0) {
              await tx.assetItem.deleteMany({ where: { id: { in: assetItemChanges.deletedIds }, userId } });
            }
        }

        // Process OtherLiabilityItems
        if (otherLiabilityItemChanges) {
            if (otherLiabilityItemChanges.created && otherLiabilityItemChanges.created.length > 0) {
              await tx.otherLiabilityItem.createMany({ data: otherLiabilityItemChanges.created.map((l) => ({ ...l, userId })) });
            }
            if (otherLiabilityItemChanges.updated && otherLiabilityItemChanges.updated.length > 0) {
              for (const item of otherLiabilityItemChanges.updated) {
                await tx.otherLiabilityItem.update({ where: { id: item.id, userId }, data: { ...item, userId } });
              }
            }
            if (otherLiabilityItemChanges.deletedIds && otherLiabilityItemChanges.deletedIds.length > 0) {
              await tx.otherLiabilityItem.deleteMany({ where: { id: { in: otherLiabilityItemChanges.deletedIds }, userId } });
            }
        }

        // Process BudgetItems
        if (budgetItemChanges) {
            if (budgetItemChanges.created && budgetItemChanges.created.length > 0) {
              await tx.budgetItem.createMany({ data: budgetItemChanges.created.map((b) => ({ ...b, userId })) });
            }
            if (budgetItemChanges.updated && budgetItemChanges.updated.length > 0) {
              for (const item of budgetItemChanges.updated) {
                await tx.budgetItem.update({ where: { id: item.id, userId }, data: { ...item, userId } });
              }
            }
            if (budgetItemChanges.deletedIds && budgetItemChanges.deletedIds.length > 0) {
              await tx.budgetItem.deleteMany({ where: { id: { in: budgetItemChanges.deletedIds }, userId } });
            }
        }

        // Process OwnedReviews
        if (ownedReviewChanges) {
            if (ownedReviewChanges.created && ownedReviewChanges.created.length > 0) {
              await tx.weeklyReview.createMany({
                data: ownedReviewChanges.created.map((r) => ({
                  userId,
                  weekKey: r.weekKey,
                  journal: r.journal,
                  transactionComments: r.transactionComments || undefined,
                })),
              });
            }
            if (ownedReviewChanges.updated && ownedReviewChanges.updated.length > 0) {
              for (const item of ownedReviewChanges.updated) {
                await tx.weeklyReview.update({
                  where: { userId_weekKey: { userId, weekKey: item.weekKey } },
                  data: {
                    journal: item.journal,
                    transactionComments: item.transactionComments || undefined,
                  },
                });
              }
            }
            if (ownedReviewChanges.deletedIds && ownedReviewChanges.deletedIds.length > 0) {
              await tx.weeklyReview.deleteMany({ where: { weekKey: { in: ownedReviewChanges.deletedIds }, userId } });
              await tx.sharedReview.deleteMany({ where: { weekKey: { in: ownedReviewChanges.deletedIds }, reviewOwnerId: userId } });
            }
        }

        await upsertStatementSettings(tx, userId, startDate, endDate, gettingStartedDismissed);
    });

    const newFullServerData = await getCurrentServerDataForUser(userId);
    const preparedNewFullServerData = prepareDataForHashing(newFullServerData);
    const newServerHashAfterSave = await hashData(stringify(preparedNewFullServerData));

    console.info(`[API /api/save] Prisma transaction committed. User: ${userId}. New server (full snapshot) hash: ${newServerHashAfterSave}`, logContextBase);
    const response = NextResponse.json({ message: `Data saved successfully for user ${userId}`, newServerHash: newServerHashAfterSave });
    return addCorsHeaders(response);

  } catch (error: any) {
    console.error(`[API /api/save] Prisma transaction failed. User: ${userId}`, { error, ...logContextBase });
    const errorMessage = error.message || 'An unknown error occurred during save.';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  }
}
