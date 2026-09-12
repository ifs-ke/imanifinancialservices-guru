// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/serverAuth';
import prisma from '@/lib/prisma';
import type {
  TransactionWithId,
  DebtItem,
  StatementItem,
  OtherLiabilityItem,
  BudgetItem,
  WeeklyReviewData,
  NotificationItem,
  InvestmentItem,
} from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { addCorsHeaders } from '@/lib/utils';
import { ensureUserInDb } from '@/app/actions/shareActions';
import {
  ensureUserInFirestore,
  fetchUserDataFromFirestore,
  type SyncedFirestoreData,
} from '@/lib/firestoreBackend';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function GET() {
  const user = await currentUser();
  const userId = user?.id;
  const logContextBase = { userId: userId || 'unknown-sync-get', operation: 'GET /api/sync', apiRoute: '/api/sync' };

  if (!user || !userId) {
    console.warn(`[API /api/sync] Unauthorized access attempt (GET). User missing.`, logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  const primaryEmail = user.email || user.primaryEmailAddress?.emailAddress || `${userId}@user.ifs-guru.com`;

  try {
    // 1. Ensure user in Firestore & Relational DB
    await Promise.allSettled([
      ensureUserInFirestore(userId, primaryEmail, user.fullName || user.name),
      ensureUserInDb(userId, primaryEmail, user.fullName || user.name),
    ]);
  } catch (dbError: any) {
    console.warn(`[API /api/sync] Warning ensuring user profile:`, { error: dbError.message, ...logContextBase });
  }

  console.info(`[API /api/sync] Initiating Firestore-driven sync for user ${userId}`, logContextBase);

  try {
    let fetchedData: SyncedFirestoreData;

    // Primary Source: Cloud Firestore
    try {
      fetchedData = await fetchUserDataFromFirestore(userId);
      console.info(`[API /api/sync] Fetched data from Firestore successfully for user ${userId}`, {
        txCount: fetchedData.transactions.length,
        debtCount: fetchedData.debts.length,
        assetCount: fetchedData.assetItems.length,
        budgetCount: fetchedData.budgetItems.length,
        investmentCount: fetchedData.investmentItems.length,
      });
    } catch (firestoreErr: any) {
      console.warn(`[API /api/sync] Firestore fetch fell back to DB:`, firestoreErr?.message);

      // Fallback to Prisma if Firestore encountered an issue
      try {
        const [
          transactions,
          debts,
          assetItems,
          otherLiabilityItems,
          budgetItems,
          ownedReviewsPrisma,
          statementSettings,
          notifications,
          investmentItems,
        ] = await prisma.$transaction([
          prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
          prisma.debt.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
          prisma.assetItem.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
          prisma.otherLiabilityItem.findMany({ where: { userId }, orderBy: { description: 'asc' } }),
          prisma.budgetItem.findMany({ where: { userId }, orderBy: [{ period: 'desc' }, { description: 'asc' }] }),
          prisma.weeklyReview.findMany({ where: { userId } }),
          prisma.statementSettings.findUnique({ where: { userId } }),
          prisma.notification.findMany({ where: { userId }, orderBy: { timestamp: 'desc' }, take: 50 }),
          prisma.investmentItem.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
        ]);

        const ownedReviewsMap: Record<string, WeeklyReviewData> = {};
        (ownedReviewsPrisma || []).forEach((reviewItem) => {
          ownedReviewsMap[reviewItem.weekKey] = {
            ownerId: reviewItem.userId,
            ownerUsername: user.fullName || user.username || primaryEmail,
            journal: reviewItem.journal || '',
            transactionComments:
              typeof reviewItem.transactionComments === 'object' && reviewItem.transactionComments !== null
                ? (reviewItem.transactionComments as Record<string, string>)
                : {},
            weekKey: reviewItem.weekKey,
          };
        });

        fetchedData = {
          transactions: (transactions || []).map((t) => ({ ...t, date: t.date ? t.date.toISOString() : new Date(0).toISOString(), categoryName: t.categoryName || null })),
          debts: (debts || []).map((d) => ({ ...d })),
          assetItems: (assetItems || []).map((a) => ({ ...a })),
          otherLiabilityItems: (otherLiabilityItems || []).map((l) => ({ ...l })),
          budgetItems: (budgetItems || []).map((b) => ({ ...b })),
          investmentItems: (investmentItems || []).map((i) => ({ ...i, purchaseDate: i.purchaseDate ? i.purchaseDate.toISOString() : new Date(0).toISOString() })),
          ownedReviews: ownedReviewsMap,
          sharedReviews: {},
          notifications: (notifications || []).map((n) => ({ ...n, timestamp: n.timestamp ? n.timestamp.toISOString() : new Date(0).toISOString() })),
          startDate: statementSettings?.statementStartDate?.toISOString(),
          endDate: statementSettings?.statementEndDate?.toISOString(),
          gettingStartedDismissed: statementSettings?.gettingStartedDismissed ?? false,
        };
      } catch (prismaErr: any) {
        console.warn(`[API /api/sync] Prisma fallback unavailable for ${userId}:`, prismaErr?.message || prismaErr);
        fetchedData = {
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

    const preparedData = prepareDataForHashing(fetchedData as any);
    const dataString = stringify(preparedData);
    const dataHash = await hashData(dataString);

    console.info(`[API /api/sync] Firestore sync computed hash for user ${userId}: ${dataHash}`);

    const response = NextResponse.json({ ...preparedData, dataHash });
    return addCorsHeaders(response);
  } catch (error: any) {
    console.error(`[API /api/sync] Error during GET sync for user ${userId}:`, error);
    const response = NextResponse.json({ error: error.message || 'Failed to sync data from backend' }, { status: 500 });
    return addCorsHeaders(response);
  }
}
