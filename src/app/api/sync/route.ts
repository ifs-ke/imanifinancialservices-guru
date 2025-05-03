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
                item.date = new Date(item.date);
                 if (isNaN(item.date.getTime())) throw new Error("Invalid date string from DB");
            } catch (e) {
                 console.warn(`Invalid date format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting date.`);
                 // Handle appropriately - maybe skip item or use default? Using current date for now.
                 item.date = new Date();
            }
        }
        return item as T;
    });
  } catch (error) {
    console.error(`Error fetching ${collectionName} for user ${userId}:`, error);
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
      console.error(`Error fetching owned weeklyReviews for user ${userId}:`, error);
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
      console.error(`Error fetching shared weeklyReviews for user ${userId}:`, error);
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
        return {
             startDate: userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined,
             endDate: userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined,
             gettingStartedDismissed: userProfile?.gettingStartedDismissed ?? false, // Default to false if undefined
        };
    } catch (error) {
        console.error(`Error fetching user profile data for user ${userId}:`, error);
        throw new Error('Failed to fetch user profile data');
    }
}


export async function GET() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  }

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
        getUserProfileData(db, userId)
    ]).catch(fetchError => {
         // If any fetch fails, log it and throw a generic error
         console.error(`Sync fetch failed for user ${userId}:`, fetchError);
         throw new Error("Failed to fetch all required data from database.");
     });

     // Check if *any* data exists for the user across primary collections.
     // This helps differentiate a truly new user from one whose profile might be missing.
     const hasAnyData = transactions.length > 0 || debts.length > 0 || assetItems.length > 0 || otherLiabilityItems.length > 0 || budgetItems.length > 0 || Object.keys(ownedReviews).length > 0;

      if (!hasAnyData && !profileData.gettingStartedDismissed && profileData.startDate === undefined && profileData.endDate === undefined) {
           console.log(`Sync: No existing data found for user ${userId}. Client should initiate save if they have local data.`);
           // Return 404 but include empty structure and a hash for consistency? Or just 404?
           // Returning empty structure + hash seems safer for client logic.
            const emptyData = {
                 transactions: [], debts: [], assetItems: [], otherLiabilityItems: [],
                 budgetItems: [], ownedReviews: {}, sharedReviews: {},
                 startDate: undefined, endDate: undefined, gettingStartedDismissed: false
             };
             const preparedEmptyData = prepareDataForHashing(emptyData);
             const emptyDataHash = await hashData(stringify(preparedEmptyData));

            return NextResponse.json({ ...preparedEmptyData, dataHash: emptyDataHash }, { status: 200 }); // Send 200 with empty data + hash
           // Original 404 logic: return NextResponse.json({ message: 'No data found for user' }, { status: 404 });
       }


     // Combine all fetched data for hashing and response
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
       gettingStartedDismissed: profileData.gettingStartedDismissed,
     };

      // Prepare data structure for hashing (consistent sorting, date formats)
      const preparedData = prepareDataForHashing(fetchedData);
      const dataString = stringify(preparedData); // Use stable stringify for hashing
      const dataHash = await hashData(dataString);

      console.log(`Sync API: Generated server hash for user ${userId}: ${dataHash}`);
      // console.log("Sync API: Data used for server hash calculation:", dataString.substring(0, 300) + "..."); // Log truncated data


    // Return all fetched data (in prepared format) associated with the user, including hash
    return NextResponse.json({
      ...preparedData, // Send the prepared data (dates as strings, sorted arrays)
      dataHash,
    });
  } catch (error: any) {
    console.error(`Failed to fetch data for user ${userId}:`, error);
    // Use the error message if available, otherwise a generic message
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data from database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
