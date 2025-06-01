// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; 
import stringify from 'fast-json-stable-stringify'; 
import { addCorsHeaders } from '@/lib/utils'; 
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; 

async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  const logContext = { userId, collectionName, operation: 'getCollectionData', apiRoute: '/api/sync' };
  logDebug(`Sync API: Fetching ${collectionName} for user ${userId}`, logContext, userId);
  try {
    const collection = db.collection(collectionName);
    await collection.createIndex({ userId: 1 }); 
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
    logDebug(`Sync API: Fetched ${data?.length ?? 0} items from ${collectionName}`, logContext, userId);

    const dataArray = Array.isArray(data) ? data : [];

    return dataArray.map((item: any) => {
        if (item.date && !(item.date instanceof Date)) {
            try {
                const parsedDate = new Date(item.date);
                if (isNaN(parsedDate.getTime())) throw new Error("Invalid date string from DB");
                item.date = parsedDate;
            } catch (error) {
                 logWarn(`Sync API: Invalid date format in ${collectionName}, item ID ${item.id || 'N/A'}. Defaulting date.`,{...logContext, itemDateValue: item.date, itemId: item.id}, userId);
                 item.date = new Date(0); 
            }
        }
        if (item.timestamp && !(item.timestamp instanceof Date)) {
             try {
                 const parsedTimestamp = new Date(item.timestamp);
                if (isNaN(parsedTimestamp.getTime())) throw new Error("Invalid timestamp string from DB");
                item.timestamp = parsedTimestamp;
            } catch (error) {
                 logWarn(`Sync API: Invalid timestamp format in ${collectionName}, item ID ${item.id || 'N/A'}. Defaulting timestamp.`, {...logContext, itemTimestampValue: item.timestamp, itemId: item.id}, userId);
                item.timestamp = new Date(0);
             }
        }
         if (collectionName === 'budgetItems' && !item.period) {
             logWarn(`Sync API: Budget item missing period ID ${item.id || 'N/A'}. Defaulting period.`, {...logContext, itemId: item.id}, userId);
             item.period = 'unknown-period'; 
         }
        return item as T;
    });
  } catch (error: any) {
    logError(`Sync API: DB Error fetching ${collectionName}`, error instanceof Error ? error : new Error(String(error)), logContext, userId);
    return [];
  }
}

async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getOwnedWeeklyReviews', apiRoute: '/api/sync' };
    logDebug(`Sync API: Fetching owned weekly reviews for user ${userId}`, logContext, userId);
    const reviewsMap: Record<string, WeeklyReviewData> = {};
    try {
      const collection = db.collection('weeklyReviews');
      await collection.createIndex({ userId: 1, weekKey: 1 }); 
      const ownedReviewsCursor = collection.find({ userId: userId }, { projection: { _id: 0 } });

      for await (const doc of ownedReviewsCursor) {
          if (doc.weekKey && typeof doc.weekKey === 'string') { 
             doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
             reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
          } else {
              logWarn(`Sync API: Found owned review with invalid/missing weekKey. Skipping.`, { ...logContext, docId: doc._id }, userId);
          }
      }
       logDebug(`Sync API: Fetched ${Object.keys(reviewsMap).length} owned weekly reviews`, logContext, userId);
       return reviewsMap;
    } catch (error: any) {
       logError(`Sync API: DB Error fetching owned weeklyReviews`, error instanceof Error ? error : new Error(String(error)), logContext, userId);
       return {};
    }
}

async function getSharedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getSharedWeeklyReviews', apiRoute: '/api/sync' };
    logDebug(`Sync API: Fetching shared weekly reviews for user ${userId}`, logContext, userId);
    const reviewsMap: Record<string, WeeklyReviewData> = {};
    try {
      const collection = db.collection('weeklyReviews');
       await collection.createIndex({ sharedWith: 1 }); 
       const sharedReviewsCursor = collection.find(
           { sharedWith: userId, userId: { $ne: userId } }, 
           { projection: { _id: 0 } }
       );

       for await (const doc of sharedReviewsCursor) {
           if (doc.weekKey && typeof doc.weekKey === 'string') { 
                doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
               reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
           } else {
              logWarn(`Sync API: Found shared review with invalid/missing weekKey. Skipping.`, { ...logContext, docId: doc._id, ownerId: doc.userId }, userId);
           }
       }
        logDebug(`Sync API: Fetched ${Object.keys(reviewsMap).length} shared weekly reviews`, logContext, userId);
       return reviewsMap;
    } catch (error: any) {
       logError(`Sync API: DB Error fetching shared weeklyReviews`, error instanceof Error ? error : new Error(String(error)), logContext, userId);
       return {};
    }
}

async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const collectionName = 'userProfiles';
    const logContext = { userId, collectionName, operation: 'getUserProfileData', apiRoute: '/api/sync' };
    logDebug(`Sync API: Fetching user profile data from collection '${collectionName}'`, logContext, userId);
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 });

        const userProfile = await collection.findOne(
            { userId },
            { projection: { _id: 0, statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } }
        );

        logDebug(`Sync API: Found user profile`, { ...logContext, profileFound: !!userProfile, profileData: userProfile ? {...userProfile, statementStartDate: userProfile.statementStartDate?.toString(), statementEndDate: userProfile.statementEndDate?.toString()} : null }, userId);

        if (!userProfile) {
            return { gettingStartedDismissed: false }; 
        }
        const startDate = userProfile.statementStartDate instanceof Date && !isNaN(userProfile.statementStartDate.getTime()) ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile.statementEndDate instanceof Date && !isNaN(userProfile.statementEndDate.getTime()) ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false;

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error: any) {
        logError(`Sync API: DB Error fetching user profile data from collection '${collectionName}'`, error, logContext, userId);
        throw error; 
    }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function GET() {
  const { userId } = auth();
  const logContextBase = { userId: userId || 'unknown-sync-get', operation: 'GET /api/sync', apiRoute: '/api/sync' };

  if (!userId) {
    logWarn("Sync API: Unauthorized access attempt (GET).", logContextBase, userId);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  logInfo(`Sync API: Initiating sync for user ${userId}`, logContextBase, userId);

  try {
    logInfo("Sync API: Connecting to database...", logContextBase, userId);
    const client = await connectToDatabase();
    const db = client.db();
    logInfo("Sync API: Database connection successful.", logContextBase, userId);

    logDebug("Sync API: Fetching all data collections concurrently...", logContextBase, userId);
    const [
        transactions, debts, assetItems, otherLiabilityItems, budgetItems,
        ownedReviews, sharedReviews, profileDataResult, notificationsResult
    ] = await Promise.allSettled([ 
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId), 
        getOwnedWeeklyReviews(db, userId),
        getSharedWeeklyReviews(db, userId),
        getUserProfileData(db, userId),
        getCollectionData<NotificationItem>(db, 'notifications', userId)
    ]);

     if (profileDataResult.status === 'rejected') {
         logError("Sync API: Critical error fetching user profile data.", profileDataResult.reason, logContextBase, userId);
         throw profileDataResult.reason; 
     }

     const fetchedTransactions = transactions.status === 'fulfilled' ? transactions.value : [];
     const fetchedDebts = debts.status === 'fulfilled' ? debts.value : [];
     const fetchedAssetItems = assetItems.status === 'fulfilled' ? assetItems.value : [];
     const fetchedOtherLiabilityItems = otherLiabilityItems.status === 'fulfilled' ? otherLiabilityItems.value : [];
     const fetchedBudgetItems = budgetItems.status === 'fulfilled' ? budgetItems.value : []; 
     const fetchedOwnedReviews = ownedReviews.status === 'fulfilled' ? ownedReviews.value : {};
     const fetchedSharedReviews = sharedReviews.status === 'fulfilled' ? sharedReviews.value : {};
     const fetchedProfileData = profileDataResult.value; 
     const fetchedNotifications = notificationsResult.status === 'fulfilled' ? notificationsResult.value : []; 

    logInfo(`Sync API: Fetched data for user ${userId}. Tx: ${fetchedTransactions.length}, Debts: ${fetchedDebts.length}, Budget: ${fetchedBudgetItems.length}`, logContextBase, userId);

     const fetchedData = {
       transactions: fetchedTransactions,
       debts: fetchedDebts,
       assetItems: fetchedAssetItems,
       otherLiabilityItems: fetchedOtherLiabilityItems,
       budgetItems: fetchedBudgetItems, 
       ownedReviews: fetchedOwnedReviews,
       sharedReviews: fetchedSharedReviews,
       notifications: fetchedNotifications, 
       startDate: fetchedProfileData.startDate, 
       endDate: fetchedProfileData.endDate,
       gettingStartedDismissed: fetchedProfileData.gettingStartedDismissed,
     };

      logDebug("Sync API: Preparing fetched data for hashing...", logContextBase, userId);
      const preparedData = prepareDataForHashing(fetchedData as SyncedData); 
      const dataString = stringify(preparedData);
      logDebug("Sync API: Generating hash for prepared data...", logContextBase, userId);
      const dataHash = await hashData(dataString);

      logInfo(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, logContextBase, userId);

    const response = NextResponse.json({
      ...preparedData, 
      dataHash,
    });
     return addCorsHeaders(response);
  } catch (error: any) {
    logError(`Sync API: Unrecoverable error during GET sync for user ${userId}.`, error, { ...logContextBase, cause: error.cause }, userId); 
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data from database';
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response);
  }
}

interface SyncedData { // Local interface to avoid import cycle if SyncedData type is also in types.ts
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  startDate?: string; // Dates are strings here
  endDate?: string;
  gettingStartedDismissed: boolean;
}
