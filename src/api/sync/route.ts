// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
// import { auth } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify
// import { logInfo, logWarn, logError } from '@/lib/logger'; // Logger removed
import { addCorsHeaders } from '@/lib/utils'; // Import CORS helper

// Consistent placeholder ID
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

// Helper to safely get collection data for a specific user
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  const logContext = { userId, collectionName, operation: 'getCollectionData' };
  // console.log(`Sync API: Fetching ${collectionName} for user ${userId}`, logContext); // Console log commented out
  try {
    const collection = db.collection(collectionName);
    // Ensure userId field exists for querying
    await collection.createIndex({ userId: 1 }); // Create index if it doesn't exist
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
     // console.log(`Sync API: Fetched ${data?.length ?? 0} items from ${collectionName}`, logContext); // Console log commented out

    // Ensure data is always an array, even if null/undefined/empty from DB
    const dataArray = Array.isArray(data) ? data : [];

    // Ensure dates are valid Date objects after fetching
    return dataArray.map((item: any) => {
        if (item.date && !(item.date instanceof Date)) {
            try {
                const parsedDate = new Date(item.date); // Try parsing string dates
                 if (isNaN(parsedDate.getTime())) throw new Error("Invalid date string from DB");
                 item.date = parsedDate;
            } catch (e) {
                 // console.warn(`Sync API: Invalid date format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting date.`, { ...logContext, itemDateValue: item.date }); // Console log commented out
                 // Handle appropriately - maybe skip item or use default? Using current date for now.
                 item.date = new Date(0); // Default to epoch if invalid to avoid errors, prepareData will handle formatting
            }
        }
        if (item.timestamp && !(item.timestamp instanceof Date)) { // Handle notification timestamps
             try {
                 const parsedTimestamp = new Date(item.timestamp);
                  if (isNaN(parsedTimestamp.getTime())) throw new Error("Invalid timestamp string from DB");
                  item.timestamp = parsedTimestamp;
             } catch (e) {
                 // console.warn(`Sync API: Invalid timestamp format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting timestamp.`, { ...logContext, itemTimestampValue: item.timestamp }); // Console log commented out
                 item.timestamp = new Date(0); // Default to epoch
             }
        }
        return item as T;
    });
  } catch (error) {
     // console.error(`Sync API: Error fetching ${collectionName} for user ${userId}:`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
    // Return empty array on error to prevent downstream iteration issues
    // The main function will catch and report the error.
    return [];
  }
}


// Helper to get weekly reviews owned by the specific user
async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getOwnedWeeklyReviews' };
    // console.log(`Sync API: Fetching owned weekly reviews for user ${userId}`, logContext); // Console log commented out
    let reviewsMap: Record<string, WeeklyReviewData> = {};
    try {
      const collection = db.collection('weeklyReviews');
      await collection.createIndex({ userId: 1, weekKey: 1 }); // Index for querying
      const ownedReviewsCursor = collection.find({ userId: userId }, { projection: { _id: 0 } });

      for await (const doc of ownedReviewsCursor) {
          if (doc.weekKey && typeof doc.weekKey === 'string') { // Ensure weekKey is a string
             // Ensure sharedWith is an array, default to empty if missing/null
             doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
             reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
          } else {
              // console.warn(`Sync API: Found owned review with invalid or missing weekKey for user ${userId}. Skipping.`, { ...logContext, docId: doc._id }); // Console log commented out
          }
      }
       // console.log(`Sync API: Fetched ${Object.keys(reviewsMap).length} owned weekly reviews`, logContext); // Console log commented out
       return reviewsMap;
    } catch (error) {
       // console.error(`Sync API: Error fetching owned weeklyReviews for user ${userId}:`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
       // Return empty object on error
       return {};
    }
}

// Helper to get weekly reviews shared with the specific user
async function getSharedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    const logContext = { userId, operation: 'getSharedWeeklyReviews' };
    // console.log(`Sync API: Fetching shared weekly reviews for user ${userId}`, logContext); // Console log commented out
    let reviewsMap: Record<string, WeeklyReviewData> = {};
    try {
      const collection = db.collection('weeklyReviews');
       await collection.createIndex({ sharedWith: 1 }); // Index for querying shared reviews
       const sharedReviewsCursor = collection.find(
           { sharedWith: userId, userId: { $ne: userId } }, // sharedWith includes user, user is not owner
           { projection: { _id: 0 } }
       );

       for await (const doc of sharedReviewsCursor) {
           if (doc.weekKey && typeof doc.weekKey === 'string') { // Ensure weekKey is a string
                // Ensure sharedWith is an array, default to empty if missing/null
                doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
               reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
           } else {
              // console.warn(`Sync API: Found shared review with invalid or missing weekKey shared with user ${userId}. Skipping.`, { ...logContext, docId: doc._id, ownerId: doc.userId }); // Console log commented out
           }
       }
        // console.log(`Sync API: Fetched ${Object.keys(reviewsMap).length} shared weekly reviews`, logContext); // Console log commented out
       return reviewsMap;
    } catch (error) {
       // console.error(`Sync API: Error fetching shared weeklyReviews for user ${userId}:`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
       // Return empty object on error
       return {};
    }
}


// Helper function to get user profile data (including dates and getting started state)
async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const collectionName = 'userProfiles'; // Define collection name for clarity
    const logContext = { userId, collectionName, operation: 'getUserProfileData' };
    // console.log(`Sync API: Fetching user profile data for user ${userId} from collection '${collectionName}'`, logContext); // Console log commented out
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 }); // Ensure index exists

        const userProfile = await collection.findOne(
            { userId },
            // Projection: Only include necessary fields. Explicitly exclude _id if needed.
            { projection: { _id: 0, statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } }
        );


        // console.log(`Sync API: Found user profile for user ${userId}:`, userProfile ? 'Yes' : 'No', userProfile ? undefined : { note: 'Profile not found in DB.' }); // Console log commented out

        if (!userProfile) {
            return { gettingStartedDismissed: false }; // Return default if no profile found
        }

        // Ensure we return the correct types/defaults
        const startDate = userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false; // Default to false if missing

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        // console.error(`Sync API: Error fetching user profile data for user ${userId} from collection '${collectionName}':`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
        // Throw a more specific error to help diagnose in the main handler
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
  // const { userId } = auth(); // Clerk disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

  if (!userId) {
    // console.warn("Sync API: Unauthorized access attempt."); // Console log commented out
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response); // Add CORS headers to error response
  }

  // console.log(`Sync API: Initiating sync for user ${userId}`, { userId }); // Console log commented out

  try {
    // console.log("Sync API: Connecting to database...", { userId }); // Console log commented out
    const client = await connectToDatabase();
    const db = client.db();
    // console.log("Sync API: Database connection successful.", { userId }); // Console log commented out

    // Fetch all data types concurrently
    // console.log("Sync API: Fetching all data collections concurrently...", { userId }); // Console log commented out
    const [
        transactions,
        debts,
        assetItems,
        otherLiabilityItems,
        budgetItems,
        ownedReviews,
        sharedReviews,
        profileDataResult // Capture result which might be an error
    ] = await Promise.allSettled([ // Use allSettled to handle individual promise failures
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId),
        getOwnedWeeklyReviews(db, userId),
        getSharedWeeklyReviews(db, userId),
        getUserProfileData(db, userId) // Fetch profile data
    ]);

     // Check results from Promise.allSettled
     if (profileDataResult.status === 'rejected') {
         // console.error("Sync API: Critical error fetching user profile data.", { error: profileDataResult.reason, userId }); // Console log commented out
         // Throw the specific error from getUserProfileData
         throw profileDataResult.reason;
     }

     // Handle potential rejections for other data types gracefully (return empty arrays/objects)
     const fetchedTransactions = transactions.status === 'fulfilled' ? transactions.value : [];
     const fetchedDebts = debts.status === 'fulfilled' ? debts.value : [];
     const fetchedAssetItems = assetItems.status === 'fulfilled' ? assetItems.value : [];
     const fetchedOtherLiabilityItems = otherLiabilityItems.status === 'fulfilled' ? otherLiabilityItems.value : [];
     const fetchedBudgetItems = budgetItems.status === 'fulfilled' ? budgetItems.value : [];
     const fetchedOwnedReviews = ownedReviews.status === 'fulfilled' ? ownedReviews.value : {};
     const fetchedSharedReviews = sharedReviews.status === 'fulfilled' ? sharedReviews.value : {};
     const fetchedProfileData = profileDataResult.value; // Already checked for rejection

    // Include Notifications fetch - Note: Notifications are typically client-managed, but we fetch if stored server-side
     const [fetchedNotificationsResult] = await Promise.allSettled([
         getCollectionData<NotificationItem>(db, 'notifications', userId) // Assuming notifications are stored per-user
     ]);
     const fetchedNotifications = fetchedNotificationsResult.status === 'fulfilled' ? fetchedNotificationsResult.value : [];


    // console.log(`Sync API: Fetched data for user ${userId}. Transactions: ${fetchedTransactions.length}, Debts: ${fetchedDebts.length}, Assets: ${fetchedAssetItems.length}, Owned Reviews: ${Object.keys(fetchedOwnedReviews).length}, Shared Reviews: ${Object.keys(fetchedSharedReviews).length}, Profile:`, { ...fetchedProfileData, userId }); // Console log commented out

     // Combine all successfully fetched or defaulted data
     const fetchedData = {
       transactions: fetchedTransactions,
       debts: fetchedDebts,
       assetItems: fetchedAssetItems,
       otherLiabilityItems: fetchedOtherLiabilityItems,
       budgetItems: fetchedBudgetItems,
       ownedReviews: fetchedOwnedReviews,
       sharedReviews: fetchedSharedReviews,
       notifications: fetchedNotifications, // Include fetched notifications
       startDate: fetchedProfileData.startDate, // Pass dates as ISO strings or undefined
       endDate: fetchedProfileData.endDate,
       gettingStartedDismissed: fetchedProfileData.gettingStartedDismissed, // Include the fetched value
     };

      // Prepare data structure for hashing (consistent sorting, date formats)
      // console.log("Sync API: Preparing fetched data for hashing...", { userId }); // Console log commented out
      // Pass the successfully combined data structure to prepareDataForHashing
      const preparedData = prepareDataForHashing(fetchedData as any); // Use 'as any' or define a more specific type if needed
      const dataString = stringify(preparedData); // Use stable stringify for hashing
      // console.log("Sync API: Generating hash for prepared data...", { userId }); // Console log commented out
      const dataHash = await hashData(dataString);

      // console.log(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, { userId }); // Console log commented out

    // Return all fetched data (in prepared format) associated with the user, including hash
    const response = NextResponse.json({
      ...preparedData, // Send the prepared data (dates as strings, sorted arrays)
      dataHash,
    });
     return addCorsHeaders(response); // Add CORS headers to success response
  } catch (error: any) {
    // This catch block now primarily handles errors from connectToDatabase or critical fetch failures (like getUserProfileData)
    // console.error(`Sync API: Unrecoverable error during sync for user ${userId}:`, { error, stack: error.stack, userId }); // Console log commented out
    // Ensure consistent JSON error response format
    const errorMessage = error.message || 'Failed to fetch data from database';
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response); // Ensure CORS headers on internal server error
  }
}
