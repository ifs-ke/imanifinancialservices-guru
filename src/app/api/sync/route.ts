
// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { currentUser, clerkClient } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { addCorsHeaders } from '@/lib/utils';
import { ensureUserInDb } from '@/app/actions/shareActions';

interface SyncedDataForClient {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  investmentItems: InvestmentItem[];
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function GET() {
  const user = await currentUser();
  const userId = user?.id;
  const logContextBase = { userId: userId || 'unknown-sync-get', operation: 'GET /api/sync', apiRoute: '/api/sync' };

  if (!user || !userId || !user.primaryEmailAddress?.emailAddress) {
    console.warn(`[API /api/sync] Sync API: Unauthorized access attempt (GET). User, ID, or primary email missing. User: ${userId || 'unknown'}`, logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in or primary email missing.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  try {
    await ensureUserInDb(userId, user.primaryEmailAddress.emailAddress, user.fullName);
    console.debug(`[API /api/sync] Sync API: User ensured in DB successfully. User: ${userId}`, logContextBase);
  } catch (dbError: any) {
    console.error(`[API /api/sync] Sync API: Failed to ensure user in DB during sync GET. User: ${userId}`, { error: dbError, ...logContextBase });
    const response = NextResponse.json({ error: 'Database operation failed while verifying user for sync.' }, { status: 500 });
    return addCorsHeaders(response);
  }

  console.info(`[API /api/sync] Sync API: Initiating sync for user ${userId}`, logContextBase);

  try {
    console.debug(`[API /api/sync] Sync API: Starting Prisma transaction to fetch data. User: ${userId}`, logContextBase);
    let transactions, debts, assetItems, otherLiabilityItems, budgetItems, ownedReviewsPrisma, sharedReviewsPrisma, statementSettings, notifications, investmentItems;

    try {
        [
        transactions, debts, assetItems, otherLiabilityItems,
        budgetItems, ownedReviewsPrisma, sharedReviewsPrisma,
        statementSettings, notifications, investmentItems
        ] = await prisma.$transaction([
        prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
        prisma.debt.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
        prisma.assetItem.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
        prisma.otherLiabilityItem.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
        prisma.budgetItem.findMany({ where: { userId }, orderBy: [{ period: 'desc' }, { description: 'asc' }] }),
        prisma.weeklyReview.findMany({ where: { userId } }),
        prisma.sharedReview.findMany({
            where: { sharedWithId: userId },
            include: { originalReview: true },
        }),
        prisma.statementSettings.findUnique({ where: { userId } }),
        prisma.notification.findMany({ where: { userId }, orderBy: { timestamp: 'desc' }, take: 50 }),
        prisma.investmentItem.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
        ]);
        console.debug(`[API /api/sync] Sync API: Prisma transaction completed. User: ${userId}`, { ...logContextBase,
        txCount: transactions.length,
        debtCount: debts.length,
        assetCount: assetItems.length,
        otherLiabilityCount: otherLiabilityItems.length,
        budgetCount: budgetItems.length,
        ownedReviewsCount: ownedReviewsPrisma.length,
        sharedReviewsCount: sharedReviewsPrisma.length,
        investmentCount: investmentItems.length,
        statementSettingsFound: !!statementSettings,
        notificationsCount: notifications.length,
        });
    } catch (prismaError: any) {
        console.error(`[API /api/sync] Sync API: Prisma transaction failed. User: ${userId}`, { error: prismaError, ...logContextBase });
        throw new Error('Database query failed during sync.');
    }


    const ownedReviewsMap: Record<string, WeeklyReviewData> = {};
    ownedReviewsPrisma.forEach(reviewItem => { // Renamed review to reviewItem to avoid conflict
      ownedReviewsMap[reviewItem.weekKey] = {
        ownerId: reviewItem.userId,
        ownerUsername: user.fullName || user.username || user.primaryEmailAddress?.emailAddress,
        journal: reviewItem.journal || "",
        transactionComments: typeof reviewItem.transactionComments === 'object' && reviewItem.transactionComments !== null ? reviewItem.transactionComments as Record<string, string> : {},
        weekKey: reviewItem.weekKey,
      };
    });
    console.debug(`[API /api/sync] Sync API: Owned reviews mapped. User: ${userId}`, {...logContextBase, count: Object.keys(ownedReviewsMap).length});

    const sharedReviewsMap: Record<string, WeeklyReviewData> = {};
    const ownerIdsOfSharedReviews = Array.from(new Set(sharedReviewsPrisma.map(sr => sr.originalReview.userId)));
    let ownerUserDetails: Record<string, { name?: string | null, email?: string | null }> = {};

    if (ownerIdsOfSharedReviews.length > 0) {
        console.debug(`[API /api/sync] Sync API: Fetching Clerk user details for ${ownerIdsOfSharedReviews.length} shared review owners. User: ${userId}`, logContextBase);
        try {
            const clerkOwnerUsers = await clerkClient.users.getUserList({ userId: ownerIdsOfSharedReviews });
            clerkOwnerUsers.data.forEach(u => {
                ownerUserDetails[u.id] = { name: u.fullName || u.firstName, email: u.primaryEmailAddress?.emailAddress };
            });
            console.debug(`[API /api/sync] Sync API: Clerk user details for shared review owners fetched. User: ${userId}`, {...logContextBase, count: clerkOwnerUsers.data.length});
        } catch (clerkError: any) {
            console.error(`[API /api/sync] Sync API: Failed to fetch Clerk user details for shared review owners. User: ${userId}`, { error: clerkError, ...logContextBase });
        }
    }

    sharedReviewsPrisma.forEach(share => {
      const originalReview = share.originalReview;
      if (originalReview) {
        sharedReviewsMap[originalReview.weekKey] = {
          ownerId: originalReview.userId,
          ownerUsername: ownerUserDetails[originalReview.userId]?.name || ownerUserDetails[originalReview.userId]?.email || originalReview.userId,
          journal: originalReview.journal || "",
          transactionComments: typeof originalReview.transactionComments === 'object' && originalReview.transactionComments !== null ? originalReview.transactionComments as Record<string, string> : {},
          weekKey: originalReview.weekKey,
          sharedWith: [userId] // Current user is the one it's shared with
        };
      }
    });
    console.debug(`[API /api/sync] Sync API: Shared reviews mapped. User: ${userId}`, {...logContextBase, count: Object.keys(sharedReviewsMap).length });

    const fetchedData: SyncedDataForClient = {
      transactions: transactions.map(t => ({...t, date: t.date || new Date(0), categoryName: t.categoryName || null })),
      debts: debts.map(d => ({...d})),
      assetItems: assetItems.map(a => ({...a})),
      otherLiabilityItems: otherLiabilityItems.map(l => ({...l})),
      budgetItems: budgetItems.map(b => ({...b})),
      investmentItems: investmentItems.map(i => ({...i, purchaseDate: i.purchaseDate || new Date(0)})),
      ownedReviews: ownedReviewsMap,
      sharedReviews: sharedReviewsMap,
      notifications: notifications.map(n => ({...n, timestamp: n.timestamp || new Date(0)})),
      startDate: statementSettings?.statementStartDate?.toISOString(),
      endDate: statementSettings?.statementEndDate?.toISOString(),
      gettingStartedDismissed: statementSettings?.gettingStartedDismissed ?? false,
    };
    console.debug(`[API /api/sync] Sync API: fetchedData object assembled. User: ${userId}`, logContextBase);

    const preparedData = prepareDataForHashing(fetchedData as any);
    console.debug(`[API /api/sync] Sync API: Data prepared for hashing. User: ${userId}`, logContextBase);

    const dataString = stringify(preparedData);
    console.debug(`[API /api/sync] Sync API: Data stringified for hashing. User: ${userId}`, {...logContextBase, stringLength: dataString.length});

    const dataHash = await hashData(dataString);
    console.info(`[API /api/sync] Sync API: Generated server hash for user ${userId}: ${dataHash}`, logContextBase);

    const response = NextResponse.json({ ...preparedData, dataHash });
    return addCorsHeaders(response);

  } catch (error: any) {
    console.error(`[API /api/sync] Sync API: Unrecoverable error during GET sync for user ${userId}.`, { error, ...logContextBase, errorDetails: error.message, stack: error.stack });
    const errorMessage = error.message || 'Failed to fetch data from database';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  }
}
    