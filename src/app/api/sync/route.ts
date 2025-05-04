// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify

// Helper to safely get collection data for a specific user
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  try {
    const collection = db.collection(collectionName);
    // Ensure userId field exists for querying
    await collection.createIndex({ userId: 1 }); // Create index if it doesn't exist
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();

    // Ensure dates are valid Date objects after fetching
    return data.map((item: any) => {
        if (item.date && !(item.date instanceof Date)) {
            try {
                const parsedDate = new Date(item.date); // Try parsing string dates
                 if (isNaN(parsedDate.getTime())) throw new Error("Invalid date string from DB");
                 item.date = parsedDate;
            } catch (e) {
                 console.warn(`Sync API: Invalid date format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting date.`);
                 // Handle appropriately - maybe skip item or use default? Using current date for now.
                 item.date = new Date(); // Default to current date if invalid
            }
        }
        return item as T;
    });
  } catch (error) {
    console.error(`Sync API: Error fetching ${collectionName} for user ${userId}:`, error);
    throw new Error(`Failed to fetch ${collectionName}`); // Re-throw to handle in main function
  }
}

// Helper to get weekly reviews owned by the specific user
async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
      await collection.createIndex({ userId: 1, weekKey: 1 }); // Index for querying
      const ownedReviewsCursor = collection.find({ userId: userId }, { projection: { _id: 0 } });
      const reviewsMap: Record<string, WeeklyReviewData> = {};
      for await (const doc of ownedReviewsCursor) {
          if (doc.weekKey) {
             // Ensure sharedWith is an array, default to empty if missing/null
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
       await collection.createIndex({ sharedWith: 1 }); // Index for querying shared reviews
       const sharedReviewsCursor = collection.find(
           { sharedWith: userId, userId: { $ne: userId } }, // sharedWith includes user, user is not owner
           { projection: { _id: 0 } }
       );
       const reviewsMap: Record<string, WeeklyReviewData> = {};
       for await (const doc of sharedReviewsCursor) {
           if (doc.weekKey) {
                // Ensure sharedWith is an array, default to empty if missing/null
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


// Helper to get user profile data (including dates and getting started state)
async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    try {
        const collection = db.collection('userProfiles');
         await collection.createIndex({ userId: 1 });
        const userProfile = await collection.findOne(
            { userId },
            { projection: { _id: 0, userId: 0, statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } }
        );

        // Ensure we return the correct types/defaults
        const startDate = userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false; // Default to false if missing

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        console.error(`Sync API: Error fetching user profile data for user ${userId}:`, error);
        throw new Error('Failed to fetch user profile data');
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
    const client = await connectToDatabase();
    const db = client.db();

    // Fetch all data types concurrently
    const [
        transactions,
        debts,
        assetItems,
        otherLiabilityItems,
        budgetItems,
        ownedReviews,
        sharedReviews,
        profileData
    ] = await Promise.all([
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId),
        getOwnedWeeklyReviews(db, userId),
        getSharedWeeklyReviews(db, userId),
        getUserProfileData(db, userId) // Fetch profile data including gettingStartedDismissed
    ]);

    console.log(`Sync API: Fetched data for user ${userId}. Transactions: ${transactions.length}, Debts: ${debts.length}, Assets: ${assetItems.length}, Profile:`, profileData);

     // Combine all fetched data
     const fetchedData = {
       transactions,
       debts,
       assetItems,
       otherLiabilityItems,
       budgetItems,
       ownedReviews,
       sharedReviews,
       startDate: profileData.startDate,
       endDate: profileData.endDate,
       gettingStartedDismissed: profileData.gettingStartedDismissed, // Include the fetched value
     };

      // Prepare data structure for hashing (consistent sorting, date formats)
      const preparedData = prepareDataForHashing(fetchedData);
      const dataString = stringify(preparedData); // Use stable stringify for hashing
      const dataHash = await hashData(dataString);

      console.log(`Sync API: Generated server hash for user ${userId}: ${dataHash}`);

    // Return all fetched data (in prepared format) associated with the user, including hash
    return NextResponse.json({
      ...preparedData, // Send the prepared data (dates as strings, sorted arrays)
      dataHash,
    });
  } catch (error: any) {
    console.error(`Sync API: Failed to fetch data for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data from database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
