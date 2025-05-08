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
    await collection.createIndex({ userId: 1 }); // Ensure index exists
    // Fetch all data, projecting out MongoDB's _id and our userId
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
     // console.log(`Sync API: Fetched ${data?.length ?? 0} items from ${collectionName}`, logContext); // Console log commented out

    const dataArray = Array.isArray(data) ? data : [];

    // Process dates and ensure required fields for specific collections
    return dataArray.map((item: any) => {
        // Process 'date' field if present (mainly for transactions)
        if (item.date && !(item.date instanceof Date)) {
            try {
                const parsedDate = new Date(item.date);
                 if (isNaN(parsedDate.getTime())) throw new Error("Invalid date string from DB");
                 item.date = parsedDate;
            } catch (e) {
                 // console.warn(`Sync API: Invalid date format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting date.`, { ...logContext, itemDateValue: item.date }); // Console log commented out
                 item.date = new Date(0); // Default to epoch if invalid
            }
        }
        // Process 'timestamp' field if present (mainly for notifications)
        if (item.timestamp && !(item.timestamp instanceof Date)) {
             try {
                 const parsedTimestamp = new Date(item.timestamp);
                  if (isNaN(parsedTimestamp.getTime())) throw new Error("Invalid timestamp string from DB");
                  item.timestamp = parsedTimestamp;
             } catch (e) {
                 // console.warn(`Sync API: Invalid timestamp format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}, user ${userId}. Defaulting timestamp.`, { ...logContext, itemTimestampValue: item.timestamp }); // Console log commented out
                 item.timestamp = new Date(0); // Default to epoch
             }
        }
         // Ensure budget items have a period (default if missing - defensive)
         if (collectionName === 'budgetItems' && !item.period) {
             // console.warn(`Sync API: Budget item missing period ID ${item.id || 'N/A'}, user ${userId}. Defaulting period.`, logContext); // Console log commented out
             item.period = 'unknown-period'; // Assign a default/error period
         }

        return item as T;
    });
  } catch (error) {
     // console.error(`Sync API: Error fetching ${collectionName} for user ${userId}:`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
    // Return empty array on error to prevent downstream iteration issues
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
       return {};
    }
}


// Helper function to get user profile data (including dates and getting started state)
async function getUserProfileData(db: any, userId: string): Promise<{ startDate?: string, endDate?: string, gettingStartedDismissed?: boolean }> {
    const collectionName = 'userProfiles';
    const logContext = { userId, collectionName, operation: 'getUserProfileData' };
    // console.log(`Sync API: Fetching user profile data for user ${userId} from collection '${collectionName}'`, logContext); // Console log commented out
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 });

        const userProfile = await collection.findOne(
            { userId },
            { projection: { _id: 0, statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } }
        );

        // console.log(`Sync API: Found user profile for user ${userId}:`, userProfile ? 'Yes' : 'No', userProfile ? undefined : { note: 'Profile not found in DB.' }); // Console log commented out

        if (!userProfile) {
            return { gettingStartedDismissed: false }; // Return default if no profile found
        }

        // Convert valid dates to ISO strings for transport
        const startDate = userProfile.statementStartDate instanceof Date && !isNaN(userProfile.statementStartDate.getTime()) ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile.statementEndDate instanceof Date && !isNaN(userProfile.statementEndDate.getTime()) ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = userProfile?.gettingStartedDismissed ?? false;

        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        // console.error(`Sync API: Error fetching user profile data for user ${userId} from collection '${collectionName}':`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
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

    // console.log("Sync API: Fetching all data collections concurrently...", { userId }); // Console log commented out
    const [
        transactions, debts, assetItems, otherLiabilityItems, budgetItems,
        ownedReviews, sharedReviews, profileDataResult, notificationsResult
    ] = await Promise.allSettled([ // Use allSettled for resilience
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId), // Fetch budget items
        getOwnedWeeklyReviews(db, userId),
        getSharedWeeklyReviews(db, userId),
        getUserProfileData(db, userId),
        getCollectionData<NotificationItem>(db, 'notifications', userId) // Fetch notifications
    ]);

     // Check critical fetch results
     if (profileDataResult.status === 'rejected') {
         // console.error("Sync API: Critical error fetching user profile data.", { error: profileDataResult.reason, userId }); // Console log commented out
         throw profileDataResult.reason; // Propagate critical error
     }

     // Handle potential rejections gracefully (return empty arrays/objects)
     const fetchedTransactions = transactions.status === 'fulfilled' ? transactions.value : [];
     const fetchedDebts = debts.status === 'fulfilled' ? debts.value : [];
     const fetchedAssetItems = assetItems.status === 'fulfilled' ? assetItems.value : [];
     const fetchedOtherLiabilityItems = otherLiabilityItems.status === 'fulfilled' ? otherLiabilityItems.value : [];
     const fetchedBudgetItems = budgetItems.status === 'fulfilled' ? budgetItems.value : []; // Handle budget items
     const fetchedOwnedReviews = ownedReviews.status === 'fulfilled' ? ownedReviews.value : {};
     const fetchedSharedReviews = sharedReviews.status === 'fulfilled' ? sharedReviews.value : {};
     const fetchedProfileData = profileDataResult.value; // Already checked
     const fetchedNotifications = notificationsResult.status === 'fulfilled' ? notificationsResult.value : []; // Handle notifications


    // console.log(`Sync API: Fetched data for user ${userId}. Transactions: ${fetchedTransactions.length}, Debts: ${fetchedDebts.length}, Budget Items: ${fetchedBudgetItems.length}, ...`, { userId }); // Console log commented out

     // Combine all data for hashing/response
     const fetchedData = {
       transactions: fetchedTransactions,
       debts: fetchedDebts,
       assetItems: fetchedAssetItems,
       otherLiabilityItems: fetchedOtherLiabilityItems,
       budgetItems: fetchedBudgetItems, // Include budget items
       ownedReviews: fetchedOwnedReviews,
       sharedReviews: fetchedSharedReviews,
       notifications: fetchedNotifications, // Include notifications
       startDate: fetchedProfileData.startDate, // Pass dates as ISO strings or undefined
       endDate: fetchedProfileData.endDate,
       gettingStartedDismissed: fetchedProfileData.gettingStartedDismissed,
     };

      // Prepare data structure for hashing
      // console.log("Sync API: Preparing fetched data for hashing...", { userId }); // Console log commented out
      const preparedData = prepareDataForHashing(fetchedData as any); // Use 'as any' or refine type
      const dataString = stringify(preparedData);
      // console.log("Sync API: Generating hash for prepared data...", { userId }); // Console log commented out
      const dataHash = await hashData(dataString);

      // console.log(`Sync API: Generated server hash for user ${userId}: ${dataHash}`, { userId }); // Console log commented out

    // Return all fetched data (in prepared format) associated with the user, including hash
    const response = NextResponse.json({
      ...preparedData, // Send prepared data (dates as strings, sorted arrays, budget includes period)
      dataHash,
    });
     return addCorsHeaders(response); // Add CORS headers to success response
  } catch (error: any) {
    // console.error(`Sync API: Unrecoverable error during sync for user ${userId}:`, { error, stack: error.stack, userId }); // Console log commented out
    const errorMessage = error.message || 'Failed to fetch data from database';
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response); // Ensure CORS headers on internal server error
  }
}
