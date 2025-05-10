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
  context: { userId: string; operation: string }
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Database operation failed: ${context.operation}`, {
      ...context,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

async function getCollectionData<T>(
  db: Db,
  collectionName: string,
  userId: string
): Promise<T[]> {
  const context = { userId, collectionName, operation: 'getCollectionData' };

  return handleDatabaseOperation(async () => {
    const collection = db.collection(collectionName);
    await collection.createIndex({ userId: 1 });
    
    const data = await collection.find({ userId }, { 
      projection: { _id: 0, userId: 0 } 
    }).toArray();

    return data.map(item => normalizeItemDates(item, collectionName, userId));
  }, context);
}

function normalizeItemDates(item: any, collectionName: string, userId: string) {
  const dateFields = ['date', 'timestamp', 'createdAt', 'updatedAt'];
  const normalizedItem = { ...item };

  for (const field of dateFields) {
    if (item[field] && !(item[field] instanceof Date)) {
      try {
        const parsedDate = new Date(item[field]);
        if (!isNaN(parsedDate.getTime())) {
          normalizedItem[field] = parsedDate;
        } else {
          console.warn(`Invalid date in ${collectionName} for user ${userId}`, {
            field,
            value: item[field],
            itemId: item.id
          });
          normalizedItem[field] = new Date(0);
        }
      } catch (error) {
        console.warn(`Date parsing failed in ${collectionName} for user ${userId}`, {
          field,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        normalizedItem[field] = new Date(0);
      }
    }
  }

  // Special handling for budget items
  if (collectionName === COLLECTIONS.BUDGETS && !normalizedItem.period) {
    normalizedItem.period = 'unknown-period';
  }

  return normalizedItem;
}

async function getWeeklyReviews(
  db: Db,
  userId: string,
  type: 'owned' | 'shared'
): Promise<Record<string, WeeklyReviewData>> {
  const context = { userId, operation: `get${type.charAt(0).toUpperCase() + type.slice(1)}WeeklyReviews` };

  return handleDatabaseOperation(async () => {
    const collection = db.collection(COLLECTIONS.REVIEWS);
    const reviewsMap: Record<string, WeeklyReviewData> = {};

    const query = type === 'owned' 
      ? { userId } 
      : { sharedWith: userId, userId: { $ne: userId } };

    await collection.createIndex(type === 'owned' 
      ? { userId: 1, weekKey: 1 } 
      : { sharedWith: 1 });

    const cursor = collection.find(query, { projection: { _id: 0 } });

    for await (const doc of cursor) {
      if (doc.weekKey && typeof doc.weekKey === 'string') {
        doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
        reviewsMap[doc.weekKey] = doc as unknown as WeeklyReviewData;
      } else {
        console.warn(`Invalid weekly review document for user ${userId}`, {
          type,
          docId: doc._id,
          ownerId: doc.userId
        });
      }
    }

    return reviewsMap;
  }, context);
}

async function getUserProfileData(
  db: Db,
  userId: string
): Promise<UserProfileData> {
  const context = { userId, operation: 'getUserProfileData' };

  return handleDatabaseOperation(async () => {
    const collection = db.collection(COLLECTIONS.PROFILES);
    await collection.createIndex({ userId: 1 });

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

    if (!profile) {
      return { gettingStartedDismissed: false };
    }

    const parseDate = (date: unknown): Date | undefined => {
      if (date instanceof Date && !isNaN(date.getTime())) {
        return date;
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
  const [
    transactions,
    debts,
    assetItems,
    otherLiabilityItems,
    budgetItems,
    ownedReviews,
    sharedReviews,
    profileData,
    notifications
  ] = await Promise.all([
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

  // Convert Date objects to ISO strings for the response
  return {
    transactions,
    debts,
    assetItems,
    otherLiabilityItems,
    budgetItems,
    ownedReviews,
    sharedReviews,
    notifications,
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

  if (!userId) {
    console.warn("Unauthorized sync attempt");
    const response = NextResponse.json(
      { error: 'Unauthorized' }, 
      { status: 401 }
    );
    return addCorsHeaders(response);
  }

  try {
    const client = await connectToDatabase();
    const db = client.db();

    const fetchedData = await fetchAllUserData(db, userId);
    
    // Create a copy of the data with Date objects for hashing
    const dataForHashing = {
      ...fetchedData,
      startDate: fetchedData.startDate ? new Date(fetchedData.startDate) : undefined,
      endDate: fetchedData.endDate ? new Date(fetchedData.endDate) : undefined
    };
    
    const preparedData = prepareDataForHashing(dataForHashing);
    const dataHash = await hashData(stringify(preparedData));

    const responseData: SyncResponseData = {
      ...fetchedData,
      dataHash
    };

    return addCorsHeaders(NextResponse.json(responseData));
  } catch (error) {
    console.error("Sync failed", {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const status = error instanceof Error && error.message.includes('Unauthorized') 
      ? 401 
      : 500;

    const response = NextResponse.json(
      { error: 'Failed to sync data' },
      { status }
    );

    return addCorsHeaders(response);
  }
}