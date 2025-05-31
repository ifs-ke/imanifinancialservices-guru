
// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { addCorsHeaders } from '@/lib/utils';
import { logWarn } from '@/lib/logger';
import { hashData } from '@/lib/storage-utils';
import stringify from 'fast-json-stable-stringify';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';

// Interface for the expected structure, even if empty
interface EmptySyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  investmentItems: InvestmentItem[]; // Added
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
  // const { userId } = auth(); // Clerk auth, if needed for logging
  const mockUserIdIfNoClerk = process.env.NEXT_PUBLIC_MOCK_USER_ID || 'local-user';
  const logContextBase = { userId: mockUserIdIfNoClerk, operation: 'GET /api/sync (DISABLED)', apiRoute: '/api/sync' };

  logWarn('Sync API: Server-side sync is disabled. Returning empty data structure for local-only mode.', logContextBase);

  const emptyData: EmptySyncedData = {
    transactions: [],
    debts: [],
    assetItems: [],
    otherLiabilityItems: [],
    budgetItems: [],
    ownedReviews: {},
    sharedReviews: {},
    notifications: [],
    investmentItems: [], // Added
    gettingStartedDismissed: false, // Default value
    // startDate and endDate will be undefined, client will set defaults
  };

  try {
    // The client still expects a hash, so we provide one for the empty state
    const dataString = stringify(emptyData); // Stringify the empty structure
    const dataHash = await hashData(dataString);

    const responsePayload = {
      ...emptyData,
      dataHash,
      message: "Server-side sync is disabled. Using local browser storage.",
      status: "local_only_mode"
    };

    const response = NextResponse.json(responsePayload, { status: 200 });
    return addCorsHeaders(response);

  } catch (error: any) {
    logWarn('Sync API: Error generating hash for empty data during local-only mode response.', { ...logContextBase, error: error.message });
    const errorResponse = NextResponse.json({
      error: 'Failed to prepare local-only mode response.',
      message: 'Server-side sync is disabled.'
    }, { status: 500 });
    return addCorsHeaders(errorResponse);
  }
}
