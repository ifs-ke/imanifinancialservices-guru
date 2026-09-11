// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/serverAuth';
import prisma from '@/lib/prisma';
import type { WeeklyReviewData } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { addCorsHeaders } from '@/lib/utils';
import { SaveDataPayloadSchema } from '@/lib/schemas';
import { ensureUserInDb } from '@/app/actions/shareActions';
import {
  ensureUserInFirestore,
  fetchUserDataFromFirestore,
  saveUserDataToFirestore,
} from '@/lib/firestoreBackend';

const HASH_CHECK_ENABLED_ON_SERVER = true;

const ratelimit =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Ratelimit({
        redis: kv,
        limiter: Ratelimit.slidingWindow(30, '10 s'),
      })
    : null;

async function upsertStatementSettings(
  tx: any,
  userId: string,
  startDate?: string | null,
  endDate?: string | null,
  gettingStartedDismissed?: boolean
) {
  if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
    return;
  }

  const dataToUpdate: {
    statementStartDate?: Date | null;
    statementEndDate?: Date | null;
    gettingStartedDismissed?: boolean;
  } = {};

  if (startDate !== undefined) {
    dataToUpdate.statementStartDate = startDate ? new Date(startDate) : null;
  }
  if (endDate !== undefined) {
    dataToUpdate.statementEndDate = endDate ? new Date(endDate) : null;
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
  }
}

async function getCurrentServerDataForUser(userId: string) {
  try {
    const firestoreData = await fetchUserDataFromFirestore(userId);
    return firestoreData;
  } catch (_e) {
    try {
      const [
        transactions,
        debts,
        assetItems,
        otherLiabilityItems,
        budgetItems,
        ownedReviewsPrisma,
        statementSettings,
        investmentItems,
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
      (ownedReviewsPrisma || []).forEach((review) => {
        ownedReviewsMap[review.weekKey] = {
          ownerId: review.userId,
          journal: review.journal || '',
          transactionComments:
            typeof review.transactionComments === 'object' && review.transactionComments !== null
              ? (review.transactionComments as Record<string, string>)
              : {},
          weekKey: review.weekKey,
        };
      });

      return {
        transactions: (transactions || []).map((t) => ({ ...t, date: t.date?.toISOString() || new Date(0).toISOString(), categoryName: t.categoryName || null })),
        debts: (debts || []).map((d) => ({ ...d })),
        assetItems: (assetItems || []).map((a) => ({ ...a })),
        otherLiabilityItems: (otherLiabilityItems || []).map((l) => ({ ...l })),
        budgetItems: (budgetItems || []).map((b) => ({ ...b })),
        investmentItems: (investmentItems || []).map((i) => ({ ...i, purchaseDate: i.purchaseDate?.toISOString() || new Date(0).toISOString() })),
        ownedReviews: ownedReviewsMap,
        sharedReviews: {},
        notifications: [],
        startDate: statementSettings?.statementStartDate?.toISOString(),
        endDate: statementSettings?.statementEndDate?.toISOString(),
        gettingStartedDismissed: statementSettings?.gettingStartedDismissed ?? false,
      };
    } catch (_prismaErr) {
      return {
        transactions: [],
        debts: [],
        assetItems: [],
        otherLiabilityItems: [],
        budgetItems: [],
        investmentItems: [],
        ownedReviews: {},
        sharedReviews: {},
        notifications: [],
        gettingStartedDismissed: false,
      };
    }
  }
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
    console.warn(`[API /api/save] Unauthorized save attempt.`, logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  const primaryEmail = user.email || user.primaryEmailAddress?.emailAddress || `${userId}@user.imanifinancial.com`;

  try {
    await Promise.allSettled([
      ensureUserInFirestore(userId, primaryEmail, user.fullName || user.name),
      ensureUserInDb(userId, primaryEmail, user.fullName || user.name),
    ]);
  } catch (dbError: any) {
    console.warn(`[API /api/save] Failed to ensure user in DB:`, dbError?.message);
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
    console.warn(`[API /api/save] Invalid payload structure. User: ${userId}`, { ...logContextBase, errors: validationResult.error.flatten() });
    const response = NextResponse.json({ error: 'Invalid payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    return addCorsHeaders(response);
  }

  const payloadFromClient = validationResult.data;
  const { payloadDataHash: clientProvidedPayloadHash, lastKnownServerHash: clientLastKnownServerHash, ...dataForDbOperations } = payloadFromClient;

  // Hash integrity verification
  const dataForHashCheck = prepareDataForHashing(dataForDbOperations as any);
  const serverCalculatedHashOfReceivedPayload = await hashData(stringify(dataForHashCheck));

  if (HASH_CHECK_ENABLED_ON_SERVER && serverCalculatedHashOfReceivedPayload !== clientProvidedPayloadHash) {
    console.error(`[API /api/save] PAYLOAD INTEGRITY CHECK FAILED! Expected ${serverCalculatedHashOfReceivedPayload}, got ${clientProvidedPayloadHash}`);
    const response = NextResponse.json({ error: 'Data integrity check failed. Please sync and try again.' }, { status: 400 });
    return addCorsHeaders(response);
  }

  if (HASH_CHECK_ENABLED_ON_SERVER && clientLastKnownServerHash) {
    const currentServerDataForComparison = await getCurrentServerDataForUser(userId);
    const preparedCurrentFullServerData = prepareDataForHashing(currentServerDataForComparison);
    const currentServerStateHash = await hashData(stringify(preparedCurrentFullServerData));

    if (clientLastKnownServerHash !== currentServerStateHash) {
      console.warn(`[API /api/save] STALE DATA DETECTED! Client: ${clientLastKnownServerHash}, Server: ${currentServerStateHash}`);
      const response = NextResponse.json({ error: 'Your data is out of sync with the server. Please sync again before saving.', currentServerHash: currentServerStateHash }, { status: 409 });
      return addCorsHeaders(response);
    }
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
      startDate,
      endDate,
      gettingStartedDismissed,
    } = dataForDbOperations;

    // 1. Save to Cloud Firestore (Authoritative Data Source)
    const firestorePayload: any = {};
    if (transactionChanges?.created?.length || transactionChanges?.updated?.length) {
      firestorePayload.transactions = [
        ...(transactionChanges.created || []),
        ...(transactionChanges.updated || []),
      ];
    }
    if (transactionChanges?.deletedIds?.length) {
      firestorePayload.deletedTransactions = transactionChanges.deletedIds;
    }

    if (debtChanges?.created?.length || debtChanges?.updated?.length) {
      firestorePayload.debts = [
        ...(debtChanges.created || []),
        ...(debtChanges.updated || []),
      ];
    }
    if (debtChanges?.deletedIds?.length) {
      firestorePayload.deletedDebts = debtChanges.deletedIds;
    }

    if (assetItemChanges?.created?.length || assetItemChanges?.updated?.length) {
      firestorePayload.assetItems = [
        ...(assetItemChanges.created || []),
        ...(assetItemChanges.updated || []),
      ];
    }
    if (assetItemChanges?.deletedIds?.length) {
      firestorePayload.deletedAssetItems = assetItemChanges.deletedIds;
    }

    if (otherLiabilityItemChanges?.created?.length || otherLiabilityItemChanges?.updated?.length) {
      firestorePayload.otherLiabilityItems = [
        ...(otherLiabilityItemChanges.created || []),
        ...(otherLiabilityItemChanges.updated || []),
      ];
    }
    if (otherLiabilityItemChanges?.deletedIds?.length) {
      firestorePayload.deletedOtherLiabilityItems = otherLiabilityItemChanges.deletedIds;
    }

    if (budgetItemChanges?.created?.length || budgetItemChanges?.updated?.length) {
      firestorePayload.budgetItems = [
        ...(budgetItemChanges.created || []),
        ...(budgetItemChanges.updated || []),
      ];
    }
    if (budgetItemChanges?.deletedIds?.length) {
      firestorePayload.deletedBudgetItems = budgetItemChanges.deletedIds;
    }

    if (investmentItemChanges?.created?.length || investmentItemChanges?.updated?.length) {
      firestorePayload.investmentItems = [
        ...(investmentItemChanges.created || []),
        ...(investmentItemChanges.updated || []),
      ];
    }
    if (investmentItemChanges?.deletedIds?.length) {
      firestorePayload.deletedInvestmentItems = investmentItemChanges.deletedIds;
    }

    if (ownedReviewChanges?.created?.length || ownedReviewChanges?.updated?.length) {
      const reviewMap: Record<string, any> = {};
      [...(ownedReviewChanges.created || []), ...(ownedReviewChanges.updated || [])].forEach((r) => {
        reviewMap[r.weekKey] = r;
      });
      firestorePayload.weeklyReviews = reviewMap;
    }
    if (ownedReviewChanges?.deletedIds?.length) {
      firestorePayload.deletedWeeklyReviews = ownedReviewChanges.deletedIds;
    }

    if (startDate !== undefined) firestorePayload.startDate = startDate;
    if (endDate !== undefined) firestorePayload.endDate = endDate;
    if (gettingStartedDismissed !== undefined) firestorePayload.gettingStartedDismissed = gettingStartedDismissed;

    await saveUserDataToFirestore(userId, firestorePayload);

    // 2. Persist to Prisma for dual-write parity
    try {
      await prisma.$transaction(async (tx) => {
        if (transactionChanges) {
          if (transactionChanges.created?.length) {
            await tx.transaction.createMany({ data: transactionChanges.created.map((t) => ({ ...t, userId, date: new Date(t.date) })) });
          }
          if (transactionChanges.updated?.length) {
            for (const item of transactionChanges.updated) {
              await tx.transaction.update({ where: { id: item.id, userId }, data: { ...item, date: new Date(item.date), userId } });
            }
          }
          if (transactionChanges.deletedIds?.length) {
            await tx.transaction.deleteMany({ where: { id: { in: transactionChanges.deletedIds }, userId } });
          }
        }

        if (debtChanges) {
          if (debtChanges.created?.length) {
            await tx.debt.createMany({ data: debtChanges.created.map((d) => ({ ...d, userId })) });
          }
          if (debtChanges.updated?.length) {
            for (const item of debtChanges.updated) {
              await tx.debt.update({ where: { id: item.id, userId }, data: { ...item, userId } });
            }
          }
          if (debtChanges.deletedIds?.length) {
            await tx.debt.deleteMany({ where: { id: { in: debtChanges.deletedIds }, userId } });
          }
        }

        if (investmentItemChanges) {
          if (investmentItemChanges.created?.length) {
            await tx.investmentItem.createMany({ data: investmentItemChanges.created.map((i) => ({ ...i, userId, purchaseDate: new Date(i.purchaseDate) })) });
          }
          if (investmentItemChanges.updated?.length) {
            for (const item of investmentItemChanges.updated) {
              await tx.investmentItem.update({ where: { id: item.id, userId }, data: { ...item, purchaseDate: new Date(item.purchaseDate), userId } });
            }
          }
          if (investmentItemChanges.deletedIds?.length) {
            await tx.investmentItem.deleteMany({ where: { id: { in: investmentItemChanges.deletedIds }, userId } });
          }
        }

        if (assetItemChanges) {
          if (assetItemChanges.created?.length) {
            await tx.assetItem.createMany({ data: assetItemChanges.created.map((a) => ({ ...a, userId })) });
          }
          if (assetItemChanges.updated?.length) {
            for (const item of assetItemChanges.updated) {
              await tx.assetItem.update({ where: { id: item.id, userId }, data: { ...item, userId } });
            }
          }
          if (assetItemChanges.deletedIds?.length) {
            await tx.assetItem.deleteMany({ where: { id: { in: assetItemChanges.deletedIds }, userId } });
          }
        }

        if (otherLiabilityItemChanges) {
          if (otherLiabilityItemChanges.created?.length) {
            await tx.otherLiabilityItem.createMany({ data: otherLiabilityItemChanges.created.map((l) => ({ ...l, userId })) });
          }
          if (otherLiabilityItemChanges.updated?.length) {
            for (const item of otherLiabilityItemChanges.updated) {
              await tx.otherLiabilityItem.update({ where: { id: item.id, userId }, data: { ...item, userId } });
            }
          }
          if (otherLiabilityItemChanges.deletedIds?.length) {
            await tx.otherLiabilityItem.deleteMany({ where: { id: { in: otherLiabilityItemChanges.deletedIds }, userId } });
          }
        }

        if (budgetItemChanges) {
          if (budgetItemChanges.created?.length) {
            await tx.budgetItem.createMany({ data: budgetItemChanges.created.map((b) => ({ ...b, userId })) });
          }
          if (budgetItemChanges.updated?.length) {
            for (const item of budgetItemChanges.updated) {
              await tx.budgetItem.update({ where: { id: item.id, userId }, data: { ...item, userId } });
            }
          }
          if (budgetItemChanges.deletedIds?.length) {
            await tx.budgetItem.deleteMany({ where: { id: { in: budgetItemChanges.deletedIds }, userId } });
          }
        }

        if (ownedReviewChanges) {
          if (ownedReviewChanges.created?.length) {
            await tx.weeklyReview.createMany({
              data: ownedReviewChanges.created.map((r) => ({
                userId,
                weekKey: r.weekKey,
                journal: r.journal,
                transactionComments: r.transactionComments || undefined,
              })),
            });
          }
          if (ownedReviewChanges.updated?.length) {
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
          if (ownedReviewChanges.deletedIds?.length) {
            await tx.weeklyReview.deleteMany({ where: { weekKey: { in: ownedReviewChanges.deletedIds }, userId } });
          }
        }

        await upsertStatementSettings(tx, userId, startDate, endDate, gettingStartedDismissed);
      });
    } catch (prismaSyncErr: any) {
      console.warn(`[API /api/save] Relational mirror sync warning:`, prismaSyncErr?.message);
    }

    // 3. Compute new full server state hash from Firestore
    const newFullServerData = await getCurrentServerDataForUser(userId);
    const preparedNewFullServerData = prepareDataForHashing(newFullServerData);
    const newServerHashAfterSave = await hashData(stringify(preparedNewFullServerData));

    console.info(`[API /api/save] Save committed to Firestore for user ${userId}. New hash: ${newServerHashAfterSave}`);
    const response = NextResponse.json({ message: `Data saved successfully to Firestore for user ${userId}`, newServerHash: newServerHashAfterSave });
    return addCorsHeaders(response);
  } catch (error: any) {
    console.error(`[API /api/save] Save failed for user ${userId}:`, error);
    const response = NextResponse.json({ error: error.message || 'An unknown error occurred during save.' }, { status: 500 });
    return addCorsHeaders(response);
  }
}
