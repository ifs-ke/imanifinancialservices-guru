
// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { addCorsHeaders } from '@/lib/utils'; 
import { logWarn } from '@/lib/logger'; 
import { hashData } from '@/lib/storage-utils'; // Still need hashData for an empty payload
import stringify from 'fast-json-stable-stringify';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';

interface EmptySyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
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
  const { userId: clerkUserId } = { userId: process.env.NEXT_PUBLIC_MOCK_USER_ID }; // Using mock user ID
  const logContextBase = { userId: clerkUserId || 'unknown-sync-get', operation: 'GET /api/sync', apiRoute: '/api/sync' };

  logWarn('Sync API: MongoDB has been removed. Sync operation will return empty data.', logContextBase, clerkUserId);

  const emptyData: EmptySyncedData = {
    transactions: [],
    debts: [],
    assetItems: [],
    otherLiabilityItems: [],
    budgetItems: [],
    ownedReviews: {},
    sharedReviews: {},
    notifications: [],
    gettingStartedDismissed: false, // Default value
  };

  try {
    const dataString = stringify(emptyData);
    const dataHash = await hashData(dataString);

    const responsePayload = {
      ...emptyData,
      dataHash,
    };
    
    const response = NextResponse.json(responsePayload);
    return addCorsHeaders(response);

  } catch (error: any) {
    logError('Sync API: Error generating hash for empty data.', error, logContextBase, clerkUserId);
    const errorResponse = NextResponse.json({ 
      error: 'Failed to process sync request due to internal error (hashing empty data).',
      message: 'Database functionality is disabled.' 
    }, { status: 500 });
    return addCorsHeaders(errorResponse);
  }
}
