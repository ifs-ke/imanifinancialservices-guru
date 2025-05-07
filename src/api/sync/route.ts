// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server'; // Re-enabled Clerk
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify
// import { logInfo, logWarn, logError } from '@/lib/logger'; // Logger removed
import { addCorsHeaders } from '@/lib/utils'; // Import CORS helper

// Helper to safely get collection data for a specific user
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  const logContext = { userId, collectionName, operation: 'getCollectionData' };
  console.log(`Sync API: Fetching ${collectionName} for user ${userId}`, logContext); // Replaced logInfo
  try {
    const collection = db.collection(collectionName);
    // Ensure userId field exists for querying
    await collection.createIndex({ userId: 1 }); // Create index if it doesn't exist
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
     console.log(`Sync API: Fetched ${data.length} items from ${collectionName}`, logContext); // Replaced logInfo

    // Ensure dates are valid Date objects after fetching
    return (data || []).map((item: any) => {
        if (item.date && !(item.date instanceof Date)) {
            try {
                const parsedDate = new Date(item.date); // Try parsing string dates
                 if (isNaN(parsedDate.getTime())) throw new Error("Invalid date string from DB");
                 item.date = parsedDate;
            } catch (e) {
                 console.warn(`Sync API: Invalid date format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting date.`, { ...logContext, itemDateValue: item.date }); // Replaced logWarn
                 // Handle appropriately - maybe skip item or use default? Using current date for now.
                 item.date = new Date(); // Default to current date if invalid
            }
        }
        if (item.timestamp && !(item.timestamp instanceof Date)) { // Handle notification timestamps
             try {
                 const parsedTimestamp = new Date(item.timestamp);
                  if (isNaN(parsedTimestamp.getTime())) throw new Error("Invalid timestamp string from DB");
                  item.timestamp = parsedTimestamp;
             } catch (e) {
                 console.warn(`Sync API: Invalid timestamp format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting timestamp.`, { ...logContext, itemTimestampValue: item.timestamp }); // Replaced logWarn
                 item.timestamp = new Date();
             }
        }
        return item as T;
    });
  } catch (error) {
     console.error(`Sync API: Error fetching ${collectionName} for user ${userId}:`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Replaced logError
    throw new Error(`Failed to fetch ${collectionName}`); // Re-throw to handle in main function
  }
}


// Helper to get weekly reviews owned by the specific user
async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getOwnedWeeklyReviews' };
    console.log(`Sync API: Fetching owned weekly reviews for user ${userId}`, logContext); // Replaced logInfo
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
       console.log(`Sync API: Fetched ${Object.keys(reviewsMap).length} owned weekly reviews`, logContext); // Replaced logInfo
       return reviewsMap;
    } catch (error) {
       console.error(`Sync API: Error fetching owned weeklyReviews for user ${userId}:`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Replaced logError
      throw new Error('Failed to fetch owned weekly reviews');
    }
}

// Helper to get weekly reviews shared with the specific user
async function getSharedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getSharedWeeklyReviews' };
    console.log(`Sync API: Fetching shared weekly reviews for user ${userId}`, logContext); // Replaced logInfo
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
        console.log(`Sync API: Fetched ${Object.keys(reviewsMap).length} shared weekly reviews`, logContext); // Replaced logInfo
       return reviewsMap;
    } catch (error) {
       console.error(`Sync API: Error fetching shared weeklyReviews for user ${userId}:`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Replaced logError
      throw new Error('Failed to fetch shared weekly reviews');
    }
}


// Helper function to get user profile data (including dates and getting started state)
async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const collectionName = 'userProfiles'; // Define collection name for clarity
    const logContext = { userId, collectionName, operation: 'getUserProfileData' };
    console.log(`Sync API: Fetching user profile data for user ${userId} from collection '${collectionName}'`, logContext); // Replaced logInfo
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 }); // Ensure index exists

        // Fetch the profile, projecting only necessary fields
        const userProfile = await collection.findOne(
            { userId },
            { projection: { _id: 0, statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } } // Exclude _id
        );

        console.log(`Sync API: Found user profile for user ${userId}:`, userProfile ? 'Yes' : 'No', userProfile ? undefined : { note: 'Profile not found in DB.' }); // Replaced logInfo

        if (!userProfile) {
            return { gettingStartedDismissed: false }; // Return default if no profile found
        }

        // Ensure we return the correct types/defaults
        const startDate = userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false; // Default to false if missing

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        console.error(`Sync API: Error fetching user profile data for user ${userId} from collection '${collectionName}':`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Replaced logError
        // Throw a more specific error to help diagnose
        throw new Error(`Failed to fetch user profile data. DB Error: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function GET() {
  const { userId } = auth();

  if (!userId) {
    console.warn("Sync API: Unauthorized access attempt."); // Replaced logWarn
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response); // Add CORS headers to error response
  }

  console.log(`Sync API: Initiating sync for user ${userId}`, { userId }); // Replaced logInfo

  try {
    console.log("Sync API: Connecting to database...", { userId }); // Replaced logInfo
    const client = await connectToDatabase();
    const db = client.db();
    console.log("Sync API: Database connection successful.", { userId }); // Replaced logInfo

    // Fetch all data types concurrently
    console.log("Sync API: Fetching all data collections concurrently...", { userId }); // Replaced logInfo
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

    console.log(`Sync API: Fetched data for user ${userId}. Transactions: ${transactions.length}, Debts: ${debts.length}, Assets: ${assetItems.length}, Owned Reviews: ${Object.keys(ownedReviews).length}, Shared Reviews: ${Object.keys(sharedReviews).length}, Profile:`, { ...profileData, userId }); // Replaced logInfo

     // Combine all fetched data
     const fetchedData = {
       transactions,
       debts,
       assetItems,
       otherLiabilityItems,
       budgetItems,
       ownedReviews,
       sharedReviews,
       startDate: profileData.startDate, // Pass dates as ISO strings or undefined
       endDate: profileData.endDate,
       gettingStartedDismissed: profileData.gettingStartedDismissed, // Include the fetched value
     };

      // Prepare data structure for hashing (consistent sorting, date formats)
      console.log("Sync API: Preparing fetched data for hashing...", { userId }); // Replaced logInfo
      const preparedData = prepareDataForHashing(fetchedData as any); // Use 'as any' cautiously or create a proper type
      const dataString = stringify(preparedData); // Use stable stringify for hashing
      console.log("Sync API: Generating hash for prepared data...", { userId }); // Replaced logInfo
      const dataHash = await hashData(dataString);

      console.log(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, { userId }); // Replaced logInfo

    // Return all fetched data (in prepared format) associated with the user, including hash
    const response = NextResponse.json({
      ...preparedData, // Send the prepared data (dates as strings, sorted arrays)
      dataHash,
    });
     return addCorsHeaders(response);
  } catch (error: any) {
    console.error(`Sync API: Failed to fetch data for user ${userId}:`, { error, stack: error.stack, userId }); // Replaced logError
    // Return a more specific error message if possible
    const errorMessage = error.message || 'Failed to fetch data from database';
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response);
  }
}
