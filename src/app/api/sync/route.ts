
// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server'; // Added clerkClient
import prisma from '@/lib/prisma';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { addCorsHeaders } from '@/lib/utils';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';
import { ensureUserInDb } from '@/app/actions/shareActions'; // For ensuring user exists

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
  const { userId, user: clerkUser } = auth();
  const logContextBase = { userId: userId || 'unknown-sync-get', operation: 'GET /api/sync', apiRoute: '/api/sync' };

  if (!userId || !clerkUser || !clerkUser.primaryEmailAddress?.emailAddress) {
    logWarn("Sync API: Unauthorized access attempt (GET). User, or primary email missing.", logContextBase, userId);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in or primary email missing.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  try {
    await ensureUserInDb(userId, clerkUser.primaryEmailAddress.emailAddress, clerkUser.fullName);
    logDebug("Sync API: User ensured in DB successfully.", logContextBase, userId);
  } catch (dbError: any) {
    logError('Sync API: Failed to ensure user in DB during sync GET.', dbError, logContextBase, userId);
    const response = NextResponse.json({ error: 'Database operation failed while verifying user for sync.' }, { status: 500 });
    return addCorsHeaders(response);
  }


  logInfo(`Sync API: Initiating sync for user ${userId}`, logContextBase, userId);

  try {
    logDebug("Sync API: Starting Prisma transaction to fetch data.", logContextBase, userId);
    const [
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
    logDebug("Sync API: Prisma transaction completed.", { ...logContextBase,
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
    }, userId);


    const ownedReviewsMap: Record<string, WeeklyReviewData> = {};
    ownedReviewsPrisma.forEach(review => {
      ownedReviewsMap[review.weekKey] = {
        ownerId: review.userId,
        ownerUsername: clerkUser.fullName || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress,
        journal: review.journal || "",
        transactionComments: typeof review.transactionComments === 'object' && review.transactionComments !== null ? review.transactionComments as Record<string, string> : {},
        weekKey: review.weekKey,
      };
    });
    logDebug("Sync API: Owned reviews mapped.", {...logContextBase, count: Object.keys(ownedReviewsMap).length}, userId);

    const sharedReviewsMap: Record<string, WeeklyReviewData> = {};
    const ownerIdsOfSharedReviews = Array.from(new Set(sharedReviewsPrisma.map(sr => sr.originalReview.userId)));
    let ownerUserDetails: Record<string, { name?: string | null, email?: string | null }> = {};

    if (ownerIdsOfSharedReviews.length > 0) {
        logDebug(`Sync API: Fetching Clerk user details for ${ownerIdsOfSharedReviews.length} shared review owners.`, logContextBase, userId);
        const clerkOwnerUsers = await clerkClient.users.getUserList({ userId: ownerIdsOfSharedReviews });
        clerkOwnerUsers.data.forEach(u => {
            ownerUserDetails[u.id] = { name: u.fullName || u.firstName, email: u.primaryEmailAddress?.emailAddress };
        });
        logDebug("Sync API: Clerk user details for shared review owners fetched.", {...logContextBase, count: clerkOwnerUsers.data.length}, userId);
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
          sharedWith: [userId]
        };
      }
    });
    logDebug("Sync API: Shared reviews mapped.", {...logContextBase, count: Object.keys(sharedReviewsMap).length }, userId);

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
    logDebug("Sync API: fetchedData object assembled.", logContextBase, userId);
    // logDebug("Sync API: fetchedData structure (partial for brevity):", { ...logContextBase, transactionsCount: fetchedData.transactions.length, debtsCount: fetchedData.debts.length, budgetItemsCount: fetchedData.budgetItems.length }, userId);


    const preparedData = prepareDataForHashing(fetchedData as any);
    logDebug("Sync API: Data prepared for hashing.", logContextBase, userId);
    // logDebug("Sync API: preparedData structure (partial for brevity):", { ...logContextBase, transactionsCount: preparedData.transactions.length, debtsCount: preparedData.debts.length, budgetItemsCount: preparedData.budgetItems.length }, userId);


    const dataString = stringify(preparedData);
    logDebug("Sync API: Data stringified for hashing.", {...logContextBase, stringLength: dataString.length}, userId);

    const dataHash = await hashData(dataString);
    logInfo(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, logContextBase, userId);

    const response = NextResponse.json({ ...preparedData, dataHash });
    return addCorsHeaders(response);

  } catch (error: any) {
    logError(`Sync API: Unrecoverable error during GET sync for user ${userId}.`, error, { ...logContextBase, errorDetails: error.message, stack: error.stack }, userId);
    const errorMessage = error.message || 'Failed to fetch data from database';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  }
}

