// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; 
import stringify from 'fast-json-stable-stringify'; 
import { addCorsHeaders } from '@/lib/utils'; 
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; 

async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  const logContext = { userId, collectionName, operation: 'getCollectionData', apiRoute: '/api/sync' };
  logDebug(`Sync API: Fetching ${collectionName} for user ${userId}`, logContext);
  try {
    const collection = db.collection(collectionName);
    await collection.createIndex({ userId: 1 }); 
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
    logDebug(`Sync API: Fetched ${data?.length ?? 0} items from ${collectionName}`, logContext);

    const dataArray = Array.isArray(data) ? data : [];

    return dataArray.map((item: any) => {
        if (item.date && !(item.date instanceof Date)) {
            try {
                const parsedDate = new Date(item.date);
                 if (isNaN(parsedDate.getTime())) throw new Error("Invalid date string from DB");
                 item.date = parsedDate;
            } catch (e) {
                 logWarn(`Sync API: Invalid date format in ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting date.`,{...logContext, itemDateValue: item.date}, userId);
                 item.date = new Date(0); 
            }
        }
        if (item.timestamp && !(item.timestamp instanceof Date)) {
             try {
                 const parsedTimestamp = new Date(item.timestamp);
                  if (isNaN(parsedTimestamp.getTime())) throw new Error("Invalid timestamp string from DB");
                  item.timestamp = parsedTimestamp;
             } catch (e) {
                 logWarn(`Sync API: Invalid timestamp format in ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting timestamp.`, {...logContext, itemTimestampValue: item.timestamp}, userId);
                 item.timestamp = new Date(0); 
             }
        }
         if (collectionName === 'budgetItems' && !item.period) {
             logWarn(`Sync API: Budget item missing period ID ${item.id || 'N/A'}, user ${userId}. Defaulting period.`, logContext, userId);
             item.period = 'unknown-period'; 
         }
        return item as T;
    });
  } catch (error) {
    logError(`Sync API: Error fetching ${collectionName} for user ${userId}:`, error, logContext);
    return [];
  }
}

async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getOwnedWeeklyReviews', apiRoute: '/api/sync' };
    logDebug(`Sync API: Fetching owned weekly reviews for user ${userId}`, logContext);
    let reviewsMap: Record<string, WeeklyReviewData> = {};
    try {
      const collection = db.collection('weeklyReviews');
      await collection.createIndex({ userId: 1, weekKey: 1 }); 
      const ownedReviewsCursor = collection.find({ userId: userId }, { projection: { _id: 0 } });

      for await (const doc of ownedReviewsCursor) {
          if (doc.weekKey && typeof doc.weekKey === 'string') { 
             doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
             reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
          } else {
              logWarn(`Sync API: Found owned review with invalid/missing weekKey for user ${userId}. Skipping.`, { ...logContext, docId: doc._id }, userId);
          }
      }
       logDebug(`Sync API: Fetched ${Object.keys(reviewsMap).length} owned weekly reviews`, logContext);
       return reviewsMap;
    } catch (error) {
       logError(`Sync API: Error fetching owned weeklyReviews for user ${userId}:`, error, logContext);
       return {};
    }
}

async function getSharedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getSharedWeeklyReviews', apiRoute: '/api/sync' };
    logDebug(`Sync API: Fetching shared weekly reviews for user ${userId}`, logContext);
    let reviewsMap: Record<string, WeeklyReviewData> = {};
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
              logWarn(`Sync API: Found shared review with invalid/missing weekKey shared with user ${userId}. Skipping.`, { ...logContext, docId: doc._id, ownerId: doc.userId }, userId);
           }
       }
        logDebug(`Sync API: Fetched ${Object.keys(reviewsMap).length} shared weekly reviews`, logContext);
       return reviewsMap;
    } catch (error) {
       logError(`Sync API: Error fetching shared weeklyReviews for user ${userId}:`, error, logContext);
       return {};
    }
}

async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const collectionName = 'userProfiles';
    const logContext = { userId, collectionName, operation: 'getUserProfileData', apiRoute: '/api/sync' };
    logDebug(`Sync API: Fetching user profile data for user ${userId} from collection '${collectionName}'`, logContext);
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 });

        const userProfile = await collection.findOne(
            { userId },
            { projection: { _id: 0, statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } }
        );

        logDebug(`Sync API: Found user profile for user ${userId}:`, { ...logContext, profileFound: !!userProfile });

        if (!userProfile) {
            return { gettingStartedDismissed: false }; 
        }
        const startDate = userProfile.statementStartDate instanceof Date && !isNaN(userProfile.statementStartDate.getTime()) ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile.statementEndDate instanceof Date && !isNaN(userProfile.statementEndDate.getTime()) ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false;

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        logError(`Sync API: Error fetching user profile data for user ${userId} from collection '${collectionName}':`, error, logContext);
        throw new Error(`Failed to fetch user profile data. DB Error: ${error instanceof Error ? error.message : String(error)}`);
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
    logWarn("Sync API: Unauthorized access attempt (GET).", logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  logInfo(`Sync API: Initiating sync for user ${userId}`, logContextBase);

  try {
    logInfo("Sync API: Connecting to database...", logContextBase);
    const client = await connectToDatabase();
    const db = client.db();
    logInfo("Sync API: Database connection successful.", logContextBase);

    logDebug("Sync API: Fetching all data collections concurrently...", logContextBase);
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
         logError("Sync API: Critical error fetching user profile data.", profileDataResult.reason, logContextBase);
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

    logInfo(`Sync API: Fetched data for user ${userId}. Tx: ${fetchedTransactions.length}, Debts: ${fetchedDebts.length}, Budget: ${fetchedBudgetItems.length}`, logContextBase);

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

      logDebug("Sync API: Preparing fetched data for hashing...", logContextBase);
      const preparedData = prepareDataForHashing(fetchedData as SyncedData); 
      const dataString = stringify(preparedData);
      logDebug("Sync API: Generating hash for prepared data...", logContextBase);
      const dataHash = await hashData(dataString);

      logInfo(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, logContextBase);

    const response = NextResponse.json({
      ...preparedData, 
      dataHash,
    });
     return addCorsHeaders(response);
  } catch (error: any) {
    logError(`Sync API: Unrecoverable error during GET sync for user ${userId}.`, error, { ...logContextBase, cause: error.cause }); 
    const errorMessage = error.message || 'Failed to fetch data from database';
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response);
  }
}
