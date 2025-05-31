
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

  if (!userId || !clerkUser || !clerkUser.primaryEmailAddressId) {
    logWarn("Sync API: Unauthorized access attempt (GET).", logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in or email missing.' }, { status: 401 });
    return addCorsHeaders(response);
  }
  await ensureUserInDb(userId, clerkUser.primaryEmailAddress.emailAddress, clerkUser.fullName);

  logInfo(`Sync API: Initiating sync for user ${userId}`, logContextBase, userId);

  try {
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

    const ownedReviewsMap: Record<string, WeeklyReviewData> = {};
    ownedReviewsPrisma.forEach(review => {
      ownedReviewsMap[review.weekKey] = {
        ownerId: review.userId,
        ownerUsername: clerkUser.fullName || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress,
        journal: review.journal || "",
        // Prisma returns JSON as object with PostgreSQL
        transactionComments: review.transactionComments as Record<string, string> || {}, 
        weekKey: review.weekKey,
      };
    });

    const sharedReviewsMap: Record<string, WeeklyReviewData> = {};
    const ownerIdsOfSharedReviews = Array.from(new Set(sharedReviewsPrisma.map(sr => sr.reviewOwnerId)));
    let ownerUserDetails: Record<string, { name?: string | null, email?: string | null }> = {};

    if (ownerIdsOfSharedReviews.length > 0) {
        const clerkOwnerUsers = await clerkClient.users.getUserList({ userId: ownerIdsOfSharedReviews });
        clerkOwnerUsers.data.forEach(u => {
            ownerUserDetails[u.id] = { name: u.fullName || u.firstName, email: u.primaryEmailAddress?.emailAddress };
        });
    }

    sharedReviewsPrisma.forEach(share => {
      const originalReview = share.originalReview;
      if (originalReview) {
        sharedReviewsMap[originalReview.weekKey] = {
          ownerId: originalReview.userId,
          ownerUsername: ownerUserDetails[originalReview.userId]?.name || ownerUserDetails[originalReview.userId]?.email || originalReview.userId,
          journal: originalReview.journal || "",
          // Prisma returns JSON as object with PostgreSQL
          transactionComments: originalReview.transactionComments as Record<string, string> || {}, 
          weekKey: originalReview.weekKey,
          sharedWith: [userId]
        };
      }
    });

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

    const preparedData = prepareDataForHashing(fetchedData as any);
    const dataString = stringify(preparedData);
    const dataHash = await hashData(dataString);

    logInfo(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, logContextBase, userId);
    const response = NextResponse.json({ ...preparedData, dataHash });
    return addCorsHeaders(response);

  } catch (error: any) {
    logError(`Sync API: Unrecoverable error during GET sync for user ${userId}.`, error, logContextBase, userId);
    const errorMessage = error.message || 'Failed to fetch data from database';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  }
}
