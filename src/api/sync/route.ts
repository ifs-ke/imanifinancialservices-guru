// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server'; // Re-enable Clerk server-side auth
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify
import { logInfo, logWarn, logError } from '@/lib/logger'; // Import server-side logger
import { addCorsHeaders } from '@/lib/utils'; // Import CORS helper

// No longer need placeholder
// const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

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
                 logWarn(`Sync API: Invalid date format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}. Defaulting date.`, { ...logContext, itemDateValue: item.date });
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
                 logWarn(`Sync API: Invalid timestamp format encountered in DB for ${collectionName}, item ID ${item.id || 'N/A'}. Defaulting timestamp.`, { ...logContext, itemTimestampValue: item.timestamp });
                 item.timestamp = new Date(0); // Default to epoch
             }
        }
         // Ensure budget items have a period (default if missing - defensive)
         if (collectionName === 'budgetItems' && !item.period) {
             logWarn(`Sync API: Budget item missing period ID ${item.id || 'N/A'}. Defaulting period.`, logContext);
             item.period = 'unknown-period'; // Assign a default/error period
         }

        return item as T;
    });
  } catch (error) {
     logError(`Sync API: Error fetching ${collectionName} for user ${userId}`, error, logContext);
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
      // IMPORTANT: Query using 'ownerId' field from the data structure
      const ownedReviewsCursor = collection.find({ ownerId: userId }, { projection: { _id: 0 } });

      for await (const doc of ownedReviewsCursor) {
          if (doc.weekKey && typeof doc.weekKey === 'string') { // Ensure weekKey is a string
             doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
             reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
          } else {
              logWarn(`Sync API: Found owned review with invalid or missing weekKey for user ${userId}. Skipping.`, { ...logContext, docId: doc._id });
          }
      }
       // console.log(`Sync API: Fetched ${Object.keys(reviewsMap).length} owned weekly reviews`, logContext); // Console log commented out
       return reviewsMap;
    } catch (error) {
       logError(`Sync API: Error fetching owned weeklyReviews for user ${userId}`, error, logContext);
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
           // Query where sharedWith includes the user, and ownerId is NOT the user
           { sharedWith: userId, ownerId: { $ne: userId } },
           { projection: { _id: 0 } }
       );

       for await (const doc of sharedReviewsCursor) {
           if (doc.weekKey && typeof doc.weekKey === 'string') { // Ensure weekKey is a string
                doc.sharedWith = Array.isArray(doc.sharedWith) ? doc.sharedWith : [];
               reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
           } else {
              logWarn(`Sync API: Found shared review with invalid or missing weekKey shared with user ${userId}. Skipping.`, { ...logContext, docId: doc._id, ownerId: doc.ownerId });
           }
       }
        // console.log(`Sync API: Fetched ${Object.keys(reviewsMap).length} shared weekly reviews`, logContext); // Console log commented out
       return reviewsMap;
    } catch (error) {
       logError(`Sync API: Error fetching shared weeklyReviews for user ${userId}`, error, logContext);
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
            // Include _id temporarily for debugging, then revert to projection
            // { projection: { _id: 0, statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } }
            { projection: { statementStartDate: 1, statementEndDate: 1, gettingStartedDismissed: 1 } } // Keep _id included for now
        );

        // console.log(`Sync API: Found user profile for user ${userId}:`, userProfile ? 'Yes' : 'No', userProfile ? undefined : { note: 'Profile not found in DB.' }); // Console log commented out

        if (!userProfile) {
            logWarn(`Sync API: User profile not found for user ${userId}. Returning defaults.`, logContext);
            return { gettingStartedDismissed: false }; // Return default if no profile found
        }

        // Convert valid dates to ISO strings for transport
        const startDate = userProfile.statementStartDate instanceof Date && !isNaN(userProfile.statementStartDate.getTime()) ? userProfile.statementStartDate.toISOString() : undefined;
        const endDate = userProfile.statementEndDate instanceof Date && !isNaN(userProfile.statementEndDate.getTime()) ? userProfile.statementEndDate.toISOString() : undefined;
        const gettingStartedDismissed = typeof userProfile?.gettingStartedDismissed === 'boolean' ? userProfile.gettingStartedDismissed : false;


        return { startDate, endDate, gettingStartedDismissed };
    } catch (error) {
        logError(`Sync API: Error fetching user profile data for user ${userId} from collection '${collectionName}'`, error, logContext);
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
  const { userId } = auth(); // Use Clerk's auth() to get the real user ID
  const logContextBase = { userId: userId || 'unauthenticated', operation: 'GET /api/sync' };

  if (!userId) {
    logWarn("Sync API: Unauthorized access attempt.", logContextBase);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response); // Add CORS headers to error response
  }

  logInfo(`Sync API: Initiating sync for user ${userId}`, logContextBase);

  let client; // Declare client outside try block
  try {
    logInfo("Sync API: Connecting to database...", logContextBase);
    client = await connectToDatabase(); // Assign client here
    const db = client.db();
    logInfo("Sync API: Database connection successful.", logContextBase);

    logInfo("Sync API: Fetching all data collections concurrently...", logContextBase);
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

     // Check critical fetch results (user profile)
     if (profileDataResult.status === 'rejected') {
         logError("Sync API: Critical error fetching user profile data.", profileDataResult.reason, logContextBase);
         // Throw the specific error from getUserProfileData if available
         throw profileDataResult.reason || new Error("Failed to fetch user profile data.");
     }

     // Handle potential rejections gracefully for non-critical data
     const fetchedTransactions = transactions.status === 'fulfilled' ? transactions.value : [];
     const fetchedDebts = debts.status === 'fulfilled' ? debts.value : [];
     const fetchedAssetItems = assetItems.status === 'fulfilled' ? assetItems.value : [];
     const fetchedOtherLiabilityItems = otherLiabilityItems.status === 'fulfilled' ? otherLiabilityItems.value : [];
     const fetchedBudgetItems = budgetItems.status === 'fulfilled' ? budgetItems.value : []; // Handle budget items
     const fetchedOwnedReviews = ownedReviews.status === 'fulfilled' ? ownedReviews.value : {};
     const fetchedSharedReviews = sharedReviews.status === 'fulfilled' ? sharedReviews.value : {};
     const fetchedProfileData = profileDataResult.value; // Already checked
     const fetchedNotifications = notificationsResult.status === 'fulfilled' ? notificationsResult.value : []; // Handle notifications


    logInfo(`Sync API: Fetched data summary. Transactions: ${fetchedTransactions.length}, Debts: ${fetchedDebts.length}, Budget Items: ${fetchedBudgetItems.length}`, logContextBase);

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
      logInfo("Sync API: Preparing fetched data for hashing...", logContextBase);
      const preparedData = prepareDataForHashing(fetchedData as any); // Use 'as any' or refine type
      const dataString = stringify(preparedData);
      logInfo("Sync API: Generating hash for prepared data...", logContextBase);
      const dataHash = await hashData(dataString);

      logInfo(`Sync API: Generated server hash: ${dataHash}`, logContextBase);

    // Return all fetched data (in prepared format) associated with the user, including hash
    const response = NextResponse.json({
      ...preparedData, // Send prepared data (dates as strings, sorted arrays, budget includes period)
      dataHash,
    });
     return addCorsHeaders(response); // Add CORS headers to success response
  } catch (error: any) {
    logError(`Sync API: Unrecoverable error during sync`, error, logContextBase);
    // Determine a more specific error message if possible
    let errorMessage = 'Failed to fetch entire data from database.';
    if (error.message?.includes('Failed to fetch user profile data')) {
        errorMessage = `Internal Server Error (${error.message})`; // Include the specific profile fetch error
    } else if (error.message?.includes('Failed to connect to MongoDB')) {
        errorMessage = `Failed to connect to database: ${error.message}`; // Include connection error details
    }
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response); // Ensure CORS headers on internal server error
  }
}
