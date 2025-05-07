
// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
// import { auth } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError } from '@/lib/logger';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';

async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
    const logContext = { userId, collectionName, operation: 'getCollectionData' };
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 });
        const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
        logInfo(`Fetched ${data.length} items from ${collectionName}`, logContext);
        return (data || []).map((item: any) => {
            for (const dateKey of ['date', 'timestamp']) {
                if (item[dateKey] && !(item[dateKey] instanceof Date)) {
                    try {
                        const parsedDate = new Date(item[dateKey]);
                        if (isNaN(parsedDate.getTime())) throw new Error("Invalid date format from DB");
                        item[dateKey] = parsedDate;
                    } catch (e) {
                        logWarn(`Invalid ${dateKey} format for item ID ${item.id || 'N/A'}. Defaulting date.`, { ...logContext, itemDateValue: item[dateKey] });
                        item[dateKey] = new Date();
                    }
                }
            }
            return item as T;
        });
    } catch (error) {
        logError(`Error fetching ${collectionName}`, error, logContext);
        return [];
    }
}

async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getOwnedWeeklyReviews' };
    try {
        const collection = db.collection('weeklyReviews');
        await collection.createIndex({ userId: 1, weekKey: 1 });
        const ownedReviewsCursor = collection.find({ userId: userId }, { projection: { _id: 0 } });
        const reviewsMap: Record<string, WeeklyReviewData> = {};
        for await (const doc of ownedReviewsCursor) {
            if (doc && doc.weekKey) {
                doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
                reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
            }
        }
        logInfo(`Fetched ${Object.keys(reviewsMap).length} owned weekly reviews.`, logContext);
        return reviewsMap;
    } catch (error) {
        logError('Error fetching owned weeklyReviews', error, logContext);
        return {};
    }
}

async function getSharedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getSharedWeeklyReviews' };
    try {
        const collection = db.collection('weeklyReviews');
        await collection.createIndex({ sharedWith: 1 });
        const sharedReviewsCursor = collection.find(
            { sharedWith: userId, userId: { $ne: userId } },
            { projection: { _id: 0 } }
        );
        const reviewsMap: Record<string, WeeklyReviewData> = {};
        for await (const doc of sharedReviewsCursor) {
            if (doc && doc.weekKey) {
                doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
                reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
            }
        }
        logInfo(`Fetched ${Object.keys(reviewsMap).length} shared weekly reviews.`, logContext);
        return reviewsMap;
    } catch (error) {
        logError('Error fetching shared weeklyReviews', error, logContext);
        return {};
    }
}

async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const logContext = { userId, operation: 'getUserProfileData' };
    logInfo(`Fetching user profile data from collection 'userProfiles'`, logContext);
    try {
        const collection = db.collection('userProfiles');
        await collection.createIndex({ userId: 1 });
        const userProfile = await collection.findOne(
            { userId },
            { projection: { statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1, _id: 0 } }
        );
        logInfo(userProfile ? 'Found user profile.' : 'No profile found, returning defaults.', logContext);

        if (!userProfile) {
            return { startDate: undefined, endDate: undefined, gettingStartedDismissed: false };
        }
        const startDate = userProfile.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile.gettingStartedDismissed ?? false;
        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        logError('Error fetching user profile data', error, logContext);
        throw new Error(`Failed to fetch user profile data. DB Error: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function GET() {
  // const { userId } = auth(); // Clerk disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
  const logContext = { userId, api: '/api/sync', method: 'GET' };


  // if (!userId) { // Clerk disabled
  //   logWarn("Unauthorized sync attempt: User not logged in.", logContext);
  //   return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  // }

  logInfo('Initiating sync.', logContext);

  try {
    logInfo("Connecting to database...", logContext);
    const client = await connectToDatabase();
    const db = client.db();
    logInfo("Database connection successful.", logContext);

    logInfo("Fetching all data collections concurrently...", logContext);
    const [
        transactions, debts, assetItems, otherLiabilityItems,
        budgetItems, notifications, ownedReviews, sharedReviews, profileData
    ] = await Promise.all([
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId),
        getCollectionData<NotificationItem>(db, 'notifications', userId),
        getOwnedWeeklyReviews(db, userId),
        getSharedWeeklyReviews(db, userId),
        getUserProfileData(db, userId)
    ]);

    logInfo(`Fetched data summary: Transactions: ${transactions.length}, Debts: ${debts.length}, Assets: ${assetItems.length}, Notifications: ${notifications.length}, Owned Reviews: ${Object.keys(ownedReviews).length}, Shared Reviews: ${Object.keys(sharedReviews).length}`, { ...logContext, profileData });

     const fetchedData = {
       transactions: transactions || [], debts: debts || [], assetItems: assetItems || [],
       otherLiabilityItems: otherLiabilityItems || [], budgetItems: budgetItems || [],
       ownedReviews: ownedReviews || {}, sharedReviews: sharedReviews || {},
       notifications: notifications || [], startDate: profileData.startDate,
       endDate: profileData.endDate, gettingStartedDismissed: profileData.gettingStartedDismissed,
     };

      logInfo("Preparing fetched data for hashing...", logContext);
       let preparedData; let dataString; let dataHash;
       try {
           preparedData = prepareDataForHashing(fetchedData);
           dataString = stringify(preparedData);
           logInfo("Generating hash for prepared data...", logContext);
           dataHash = await hashData(dataString);
           logInfo(`Generated server hash: ${dataHash}`, logContext);
       } catch (prepError) {
            logError('Error preparing data for hashing', prepError, logContext);
            return NextResponse.json({ ...fetchedData, dataHash: null, error: "Failed to prepare data for hashing on server." }, { status: 500 });
        }

    return NextResponse.json({ ...preparedData, dataHash });
  } catch (error: any) {
    logError('Failed to fetch data', error, logContext);
    const errorMessage = error.message || 'Failed to fetch data from database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
