// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types'; // Import NotificationItem
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
    return (data || []).map((item: any) => { // Default to empty array if data is null/undefined
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
    // Return empty array on error to prevent downstream iteration issues
    return [];
    // throw new Error(`Failed to fetch ${collectionName}`); // Re-throw to handle in main function (optional)
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
          if (doc && doc.weekKey) { // Check if doc exists
             // Ensure sharedWith is an array, default to empty if missing/null
             doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
             reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
          }
      }
       return reviewsMap;
    } catch (error) {
      console.error(`Sync API: Error fetching owned weeklyReviews for user ${userId}:`, error);
      return {}; // Return empty object on error
      // throw new Error('Failed to fetch owned weekly reviews');
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
           if (doc && doc.weekKey) { // Check if doc exists
                // Ensure sharedWith is an array, default to empty if missing/null
                doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
               reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
           }
       }
       return reviewsMap;
    } catch (error) {
      console.error(`Sync API: Error fetching shared weeklyReviews for user ${userId}:`, error);
      return {}; // Return empty object on error
      // throw new Error('Failed to fetch shared weekly reviews');
    }
}


// Helper function to get user profile data (including dates and getting started state)
async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const collectionName = 'userProfiles'; // Define collection name for clarity
    console.log(`Sync API: Fetching user profile data for user ${userId} from collection '${collectionName}'`);
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 }); // Ensure index exists

        const userProfile = await collection.findOne(
            { userId },
            // Corrected projection: Ensure only existing fields are projected
             { projection: { statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1, _id: 0 } } // Include only fields we need, exclude _id
        );

        console.log(`Sync API: Found user profile for user ${userId}:`, userProfile ? 'Yes' : 'No');

        if (!userProfile) {
            // If no profile found, return default values
            console.log(`Sync API: No profile found for user ${userId}, returning defaults.`);
            return { startDate: undefined, endDate: undefined, gettingStartedDismissed: false };
        }

        // Ensure we return the correct types/defaults from the found profile
        const startDate = userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false; // Default to false if missing

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        console.error(`Sync API: Error fetching user profile data for user ${userId} from collection '${collectionName}':`, error);
        // Throw a more specific error to help diagnose
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
        getUserProfileData(db, userId) // Fetch profile data including gettingStartedDismissed
    ]);

    console.log(`Sync API: Fetched data for user ${userId}. Transactions: ${transactions.length}, Debts: ${debts.length}, Assets: ${assetItems.length}, Notifications: ${notifications.length}, Owned Reviews: ${Object.keys(ownedReviews).length}, Shared Reviews: ${Object.keys(sharedReviews).length}, Profile:`, profileData);

     // Combine all fetched data, ensuring arrays default to [] if fetch failed
     const fetchedData = {
       transactions: transactions || [],
       debts: debts || [],
       assetItems: assetItems || [],
       otherLiabilityItems: otherLiabilityItems || [],
       budgetItems: budgetItems || [],
       ownedReviews: ownedReviews || {},
       sharedReviews: sharedReviews || {},
       notifications: notifications || [], // Include notifications, default to empty
       startDate: profileData.startDate,
       endDate: profileData.endDate,
       gettingStartedDismissed: profileData.gettingStartedDismissed, // Include the fetched value
     };

      // Prepare data structure for hashing (consistent sorting, date formats)
      console.log("Sync API: Preparing fetched data for hashing...");
       // Add try-catch around preparation in case of unexpected data structure issues
       let preparedData;
       let dataString;
       let dataHash;
       try {
           preparedData = prepareDataForHashing(fetchedData);
           dataString = stringify(preparedData); // Use stable stringify for hashing
           console.log("Sync API: Generating hash for prepared data...");
           dataHash = await hashData(dataString);
           console.log(`Sync API: Generated server hash for user ${userId}: ${dataHash}`);
       } catch (prepError) {
            console.error(`Sync API: Error preparing data for hashing for user ${userId}:`, prepError);
            // Decide how to handle this - maybe return data without hash or throw error?
            // For now, let's return data without hash but log the error.
            return NextResponse.json({
                ...fetchedData, // Return unprepared data in this case
                dataHash: null, // Indicate hash failed
                error: "Failed to prepare data for hashing on server."
            }, { status: 500 }); // Indicate server error
        }


    // Return all fetched data (in prepared format) associated with the user, including hash
    return NextResponse.json({
      ...preparedData, // Send the prepared data (dates as strings, sorted arrays)
      dataHash,
    });
  } catch (error: any) {
    console.error(`Sync API: Failed to fetch data for user ${userId}:`, error);
    // Return a more specific error message if possible
    const errorMessage = error.message || 'Failed to fetch data from database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
