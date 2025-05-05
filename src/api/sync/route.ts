// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types'; // Import NotificationItem
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';

// Helper to safely get collection data for a specific user
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  try {
    const collection = db.collection(collectionName);
    await collection.createIndex({ userId: 1 });
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();

    // Ensure dates are valid Date objects after fetching
    return data.map((item: any) => {
        // Convert 'date' and 'timestamp' fields if they exist and are strings/numbers
        for (const dateKey of ['date', 'timestamp']) {
             if (item[dateKey] && !(item[dateKey] instanceof Date)) {
                 try {
                     const parsedDate = new Date(item[dateKey]);
                     if (isNaN(parsedDate.getTime())) throw new Error("Invalid date format from DB");
                     item[dateKey] = parsedDate;
                 } catch (e) {
                      console.warn(`Sync API: Invalid ${dateKey} format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting date.`);
                      item[dateKey] = new Date(); // Default to current date if invalid
                 }
             }
        }
        return item as T;
    });
  } catch (error) {
    console.error(`Sync API: Error fetching ${collectionName} for user ${userId}:`, error);
    throw new Error(`Failed to fetch ${collectionName}`);
  }
}

// Helper to get weekly reviews owned by the specific user
async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
      await collection.createIndex({ userId: 1, weekKey: 1 });
      const ownedReviewsCursor = collection.find({ userId: userId }, { projection: { _id: 0 } });
      const reviewsMap: Record<string, WeeklyReviewData> = {};
      for await (const doc of ownedReviewsCursor) {
          if (doc.weekKey) {
             doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
             reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
          }
      }
       return reviewsMap;
    } catch (error) {
      console.error(`Sync API: Error fetching owned weeklyReviews for user ${userId}:`, error);
      throw new Error('Failed to fetch owned weekly reviews');
    }
}

// Helper to get weekly reviews shared with the specific user
async function getSharedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
       await collection.createIndex({ sharedWith: 1 });
       const sharedReviewsCursor = collection.find(
           { sharedWith: userId, userId: { $ne: userId } },
           { projection: { _id: 0 } }
       );
       const reviewsMap: Record<string, WeeklyReviewData> = {};
       for await (const doc of sharedReviewsCursor) {
           if (doc.weekKey) {
                doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
               reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
           }
       }
       return reviewsMap;
    } catch (error) {
      console.error(`Sync API: Error fetching shared weeklyReviews for user ${userId}:`, error);
      throw new Error('Failed to fetch shared weekly reviews');
    }
}


// Helper function to get user profile data
async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const collectionName = 'userProfiles';
    console.log(`Sync API: Fetching user profile data for user ${userId} from collection '${collectionName}'`);
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 });

        const userProfile = await collection.findOne(
            { userId },
            { projection: { statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1, _id: 0 } } // Exclude _id
        );

        console.log(`Sync API: Found user profile for user ${userId}:`, userProfile ? 'Yes' : 'No');

        const startDate = userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false;

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        console.error(`Sync API: Error fetching user profile data for user ${userId} from collection '${collectionName}':`, error);
        throw new Error(`Failed to fetch user profile data. DB Error: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export async function GET() {
  const { userId } = auth();

  if (!userId) {
    console.warn("Sync API: Unauthorized access attempt.");
    return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  }

  console.log(`Sync API: Initiating sync for user ${userId}`);

  try {
    console.log("Sync API: Connecting to database...");
    const client = await connectToDatabase();
    const db = client.db();
    console.log("Sync API: Database connection successful.");

    // Fetch all data types concurrently
    console.log("Sync API: Fetching all data collections concurrently...");
    const [
        transactions,
        debts,
        assetItems,
        otherLiabilityItems,
        budgetItems,
        ownedReviews,
        sharedReviews,
        notifications, // Fetch notifications
        profileData
    ] = await Promise.all([
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId),
        getCollectionData<NotificationItem>(db, 'notifications', userId), // Fetch notifications
        getOwnedWeeklyReviews(db, userId),
        getSharedWeeklyReviews(db, userId),
        getUserProfileData(db, userId)
    ]);

    console.log(`Sync API: Fetched data for user ${userId}. Transactions: ${transactions.length}, Debts: ${debts.length}, Assets: ${assetItems.length}, Owned Reviews: ${Object.keys(ownedReviews).length}, Shared Reviews: ${Object.keys(sharedReviews).length}, Notifications: ${notifications.length}, Profile:`, profileData);

     // Combine all fetched data
     const fetchedData = {
       transactions,
       debts,
       assetItems,
       otherLiabilityItems,
       budgetItems,
       ownedReviews,
       sharedReviews,
       notifications, // Include notifications
       startDate: profileData.startDate,
       endDate: profileData.endDate,
       gettingStartedDismissed: profileData.gettingStartedDismissed,
     };

      console.log("Sync API: Preparing fetched data for hashing...");
      const preparedData = prepareDataForHashing(fetchedData);
      const dataString = stringify(preparedData);
      console.log("Sync API: Generating hash for prepared data...");
      const dataHash = await hashData(dataString);

      console.log(`Sync API: Generated server hash for user ${userId}: ${dataHash}`);

    return NextResponse.json({
      ...preparedData,
      dataHash,
    });
  } catch (error: any) {
    console.error(`Sync API: Failed to fetch data for user ${userId}:`, error);
    const errorMessage = error.message || 'Failed to fetch data from database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
