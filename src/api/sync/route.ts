// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { MongoClient, Db } from 'mongodb';
import connectToDatabase from '@/lib/mongodb';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { addCorsHeaders } from '@/lib/utils';
import type {
  TransactionWithId,
  DebtItem,
  StatementItem,
  OtherLiabilityItem,
  BudgetItem,
  WeeklyReviewData,
  NotificationItem
} from '@/lib/types';
import { logError, logInfo, logWarn, logDebug } from '@/lib/logger';

// Constants
const COLLECTIONS = {
  TRANSACTIONS: 'transactions',
  DEBTS: 'debts',
  ASSETS: 'assetItems',
  LIABILITIES: 'otherLiabilityItems',
  BUDGETS: 'budgetItems',
  REVIEWS: 'weeklyReviews',
  PROFILES: 'userProfiles',
  NOTIFICATIONS: 'notifications'
} as const;

// Types
interface UserProfileData {
  startDate?: Date;
  endDate?: Date;
  gettingStartedDismissed: boolean;
}

interface SyncResponseData {
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
  dataHash: string;
}

// Helper functions
async function handleDatabaseOperation<T>(
  operation: () => Promise<T>,
  context: { userId: string; operation: string; apiRoute: string }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logError(`Database operation failed: ${context.operation}`, error, { ...context });
    throw error;
  }
}

async function getCollectionData<T>(
  db: Db,
  collectionName: string,
  userId: string
): Promise<T[]> {
  const context = { userId, collectionName, operation: 'getCollectionData', apiRoute: '/api/sync' };
  logDebug(`Sync API: Fetching ${collectionName} for user ${userId}`, context);

  return handleDatabaseOperation(async () => {
    const collection = db.collection(collectionName);
    // Ensure index on userId for efficient querying
    try {
      await collection.createIndex({ userId: 1 });
      logDebug(`Index on userId ensured for collection ${collectionName}`, context);
    } catch (indexError) {
      logWarn(`Failed to ensure index on userId for ${collectionName}. This might impact performance.`, indexError, context);
    }
    
    const data = await collection.find({ userId }, { 
      projection: { _id: 0, userId: 0 } // Exclude MongoDB _id and our userId from returned docs
    }).toArray();
    logDebug(`Sync API: Fetched ${data?.length ?? 0} items from ${collectionName}`, context);

    return (data || []).map(item => normalizeItemDates(item, collectionName, userId));
  }, context);
}

function normalizeItemDates(item: any, collectionName: string, userId: string) {
  const dateFields = ['date', 'timestamp', 'createdAt', 'updatedAt']; // Add other date fields if any
  const normalizedItem = { ...item };

  for (const field of dateFields) {
    if (item[field] && !(item[field] instanceof Date)) {
      try {
        const parsedDate = new Date(item[field]);
        if (!isNaN(parsedDate.getTime())) {
          normalizedItem[field] = parsedDate;
        } else {
          logWarn(`Invalid date in ${collectionName} for user ${userId}`, {
            field,
            value: item[field],
            itemId: item.id,
            apiRoute: '/api/sync'
          }, userId);
          normalizedItem[field] = new Date(0); // Default to epoch if invalid
        }
      } catch (error) {
        logWarn(`Date parsing failed in ${collectionName} for user ${userId}`, {
          field,
          error: error instanceof Error ? error.message : 'Unknown error',
          apiRoute: '/api/sync'
        }, userId);
        normalizedItem[field] = new Date(0); // Default to epoch
      }
    }
  }

  // Ensure budget items have a period (default if missing - defensive)
  if (collectionName === COLLECTIONS.BUDGETS && !normalizedItem.period) {
    logWarn(`Budget item missing period for ID ${normalizedItem.id || 'N/A'}, user ${userId}. Defaulting period.`, { apiRoute: '/api/sync' }, userId);
    normalizedItem.period = 'unknown-period'; // Assign a default/error period
  }

  return normalizedItem;
}

async function getWeeklyReviews(
  db: Db,
  userId: string,
  type: 'owned' | 'shared'
): Promise<Record<string, WeeklyReviewData>> {
  const context = { userId, operation: `get${type.charAt(0).toUpperCase() + type.slice(1)}WeeklyReviews`, apiRoute: '/api/sync' };
  logDebug(`Sync API: Fetching ${type} weekly reviews for user ${userId}`, context);

  return handleDatabaseOperation(async () => {
    const collection = db.collection(COLLECTIONS.REVIEWS);
    const reviewsMap: Record<string, WeeklyReviewData> = {};

    const query = type === 'owned' 
      ? { userId } 
      : { sharedWith: userId, userId: { $ne: userId } }; // Shared with user, but not owned by them

    // Ensure indexes for efficient querying
    try {
      if (type === 'owned') {
        await collection.createIndex({ userId: 1, weekKey: 1 });
        logDebug(`Index on userId and weekKey ensured for owned reviews.`, context);
      } else {
        await collection.createIndex({ sharedWith: 1 });
        logDebug(`Index on sharedWith ensured for shared reviews.`, context);
      }
    } catch (indexError) {
      logWarn(`Failed to ensure index for ${type} reviews. This might impact performance.`, indexError, context);
    }


    const cursor = collection.find(query, { projection: { _id: 0 } }); // Exclude _id

    for await (const doc of cursor) {
      if (doc.weekKey && typeof doc.weekKey === 'string') {
        // Ensure sharedWith is an array, even if undefined or null in DB
        doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
        reviewsMap[doc.weekKey] = doc as unknown as WeeklyReviewData; // Cast after ensuring structure
      } else {
        logWarn(`Invalid weekly review document for user ${userId}`, {
          type,
          docId: doc._id, // Log MongoDB _id for direct lookup if needed
          ownerId: doc.userId,
          apiRoute: '/api/sync'
        }, userId);
      }
    }
    logDebug(`Sync API: Fetched ${Object.keys(reviewsMap).length} ${type} weekly reviews`, context);
    return reviewsMap;
  }, context);
}

async function getUserProfileData(
  db: Db,
  userId: string
): Promise<UserProfileData> {
  const context = { userId, operation: 'getUserProfileData', apiRoute: '/api/sync' };
  logDebug(`Sync API: Fetching user profile data for user ${userId}`, context);

  return handleDatabaseOperation(async () => {
    const collection = db.collection(COLLECTIONS.PROFILES);
    // Ensure index on userId
     try {
      await collection.createIndex({ userId: 1 });
      logDebug(`Index on userId ensured for collection ${COLLECTIONS.PROFILES}`, context);
    } catch (indexError) {
      logWarn(`Failed to ensure index on userId for ${COLLECTIONS.PROFILES}. This might impact performance.`, indexError, context);
    }

    const profile = await collection.findOne(
      { userId },
      { 
        projection: { 
          _id: 0, 
          statementStartDate: 1, 
          statementEndDate: 1, 
          gettingStartedDismissed: 1 
        } 
      }
    );
    logDebug(`Sync API: Found user profile for user ${userId}:`, { ...context, profileFound: !!profile });

    if (!profile) {
      return { gettingStartedDismissed: false }; // Return default if no profile found
    }

    const parseDate = (date: unknown): Date | undefined => {
      if (date instanceof Date && !isNaN(date.getTime())) {
        return date;
      }
      // If it's a string, try parsing; otherwise, undefined
      if (typeof date === 'string') {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime()) ? parsed : undefined;
      }
      return undefined;
    };

    return {
      startDate: parseDate(profile.statementStartDate),
      endDate: parseDate(profile.statementEndDate),
      gettingStartedDismissed: profile.gettingStartedDismissed ?? false
    };
  }, context);
}

async function fetchAllUserData(db: Db, userId: string): Promise<Omit<SyncResponseData, 'dataHash'>> {
  const logContext = { userId, operation: 'fetchAllUserData', apiRoute: '/api/sync' };
  logInfo("Sync API: Fetching all data collections concurrently...", logContext);
  const [
    transactions,
    debts,
    assetItems,
    otherLiabilityItems,
    budgetItems,
    ownedReviews,
    sharedReviews,
    profileDataResult, // Keep as result to check status
    notifications
  ] = await Promise.allSettled([
    getCollectionData<TransactionWithId>(db, COLLECTIONS.TRANSACTIONS, userId),
    getCollectionData<DebtItem>(db, COLLECTIONS.DEBTS, userId),
    getCollectionData<StatementItem>(db, COLLECTIONS.ASSETS, userId),
    getCollectionData<OtherLiabilityItem>(db, COLLECTIONS.LIABILITIES, userId),
    getCollectionData<BudgetItem>(db, COLLECTIONS.BUDGETS, userId),
    getWeeklyReviews(db, userId, 'owned'),
    getWeeklyReviews(db, userId, 'shared'),
    getUserProfileData(db, userId),
    getCollectionData<NotificationItem>(db, COLLECTIONS.NOTIFICATIONS, userId)
  ]);

  if (profileDataResult.status === 'rejected') {
    logError("Sync API: Critical error fetching user profile data.", profileDataResult.reason, logContext);
    throw profileDataResult.reason; // Propagate critical error
  }
  const profileData = profileDataResult.value;

  // Handle potential rejections gracefully for non-critical data
  const handleSettledResult = <T>(result: PromiseSettledResult<T>, defaultValue: T, collectionName: string): T => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      logError(`Sync API: Failed to fetch ${collectionName} data. Using default.`, result.reason, { ...logContext, collectionName });
      return defaultValue;
    }
  };

  const fetchedTransactions = handleSettledResult(transactions, [], COLLECTIONS.TRANSACTIONS);
  const fetchedDebts = handleSettledResult(debts, [], COLLECTIONS.DEBTS);
  const fetchedAssetItems = handleSettledResult(assetItems, [], COLLECTIONS.ASSETS);
  const fetchedOtherLiabilityItems = handleSettledResult(otherLiabilityItems, [], COLLECTIONS.LIABILITIES);
  const fetchedBudgetItems = handleSettledResult(budgetItems, [], COLLECTIONS.BUDGETS);
  const fetchedOwnedReviews = handleSettledResult(ownedReviews, {}, 'owned weekly reviews');
  const fetchedSharedReviews = handleSettledResult(sharedReviews, {}, 'shared weekly reviews');
  const fetchedNotifications = handleSettledResult(notifications, [], COLLECTIONS.NOTIFICATIONS);

  logInfo(`Sync API: Fetched data summary for user ${userId}. Transactions: ${fetchedTransactions.length}, Debts: ${fetchedDebts.length}, Budget Items: ${fetchedBudgetItems.length}`, logContext);

  // Convert Date objects to ISO strings for the response
  return {
    transactions: fetchedTransactions,
    debts: fetchedDebts,
    assetItems: fetchedAssetItems,
    otherLiabilityItems: fetchedOtherLiabilityItems,
    budgetItems: fetchedBudgetItems,
    ownedReviews: fetchedOwnedReviews,
    sharedReviews: fetchedSharedReviews,
    notifications: fetchedNotifications,
    startDate: profileData.startDate?.toISOString(),
    endDate: profileData.endDate?.toISOString(),
    gettingStartedDismissed: profileData.gettingStartedDismissed
  };
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function GET() {
  const { userId } = auth();
  const logContextBase = { userId: userId || 'unknown-get-sync', operation: 'GET /api/sync', apiRoute: '/api/sync' };

  if (!userId) {
    logWarn("Sync API: Unauthorized sync attempt (GET).", { ...logContextBase, errorType: 'Unauthorized' });
    const response = NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
    return addCorsHeaders(response);
  }

  logInfo(`Sync API: Initiating sync for user ${userId}`, logContextBase);

  try {
    logInfo("Sync API: Connecting to database...", logContextBase);
    const client = await connectToDatabase();
    const db = client.db();
    logInfo("Sync API: Database connection successful.", logContextBase);

    const fetchedData = await fetchAllUserData(db, userId);
    
    // Create a copy of the data with Date objects for hashing
    // This is what `prepareDataForHashing` expects
    const dataForHashing = {
      ...fetchedData,
      startDate: fetchedData.startDate ? new Date(fetchedData.startDate) : undefined,
      endDate: fetchedData.endDate ? new Date(fetchedData.endDate) : undefined
    };
    
    logInfo("Sync API: Preparing fetched data for hashing...", logContextBase);
    const preparedData = prepareDataForHashing(dataForHashing as SyncedData); // Cast as SyncedData which prepareDataForHashing expects
    const dataString = stringify(preparedData);
    logInfo("Sync API: Generating hash for prepared data...", logContextBase);
    const dataHash = await hashData(dataString);

    logInfo(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, logContextBase);

    const responseData: SyncResponseData = {
      ...fetchedData, // This already has dates as ISO strings from fetchAllUserData
      dataHash
    };

    return addCorsHeaders(NextResponse.json(responseData));
  } catch (error: any) {
    logError(`Sync API: Unrecoverable error during GET sync for user ${userId}.`, error, logContextBase);

    const status = error.message?.includes('Unauthorized') 
      ? 401 
      : 500;
    const errorMessage = error.message || 'Failed to sync data';

    const response = NextResponse.json(
      { error: errorMessage },
      { status }
    );

    return addCorsHeaders(response);
  }
}

    