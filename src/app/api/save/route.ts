// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
// import { auth } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import { Collection, ClientSession } from 'mongodb'; // Import ClientSession
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils'; // Use updated hash utils
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
// import { logInfo, logWarn, logError } from '@/lib/logger'; // Logger removed
import { addCorsHeaders } from '@/lib/utils'; // Import CORS helper

// Consistent placeholder ID
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '10 s'), // Allow 10 requests per 10 seconds per user
});

// Define the structure of the incoming request body (should match client's prepared data + hash)
interface SaveDataPayload {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[]; // Includes period field now
  ownedReviews: Record<string, WeeklyReviewData>;
  startDate?: string; // Date as ISO string
  endDate?: string;   // Date as ISO string
  gettingStartedDismissed?: boolean;
  dataHash: string; // Hash of the prepared data being saved
}

// Helper function to safely replace data in a collection for a specific user using a transaction session
async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[], session: ClientSession) { // Accept session
    const logContext = { userId, collectionName, operation: 'replaceCollectionData' };
    // console.log(`Save API: Starting replace for ${collectionName}`, logContext); // Console log commented out
    try {
        const collection: Collection = db.collection(collectionName);
        // Data received should already have Dates/Periods converted to strings by prepareDataForHashing on client
        // Convert Dates back to Date objects before saving to MongoDB where applicable
        const dataWithUserIdAndProcessed = (data || []).map(item => ({
            ...item,
            userId,
             // Only convert 'date' if it exists and is a string (relevant for transactions)
            ...(item.date && typeof item.date === 'string' ? { date: new Date(item.date) } : {}),
             // Ensure 'period' exists for budget items (already string from prepareDataForHashing)
            ...(collectionName === 'budgetItems' && !item.period ? { period: 'unknown-period' } : {}), // Handle missing period defensively
             // Ensure _id is handled correctly
            _id: item._id || undefined // Let Mongo generate _id if not present
        }));

        // Use 'id' (application-generated ID) for matching which items to keep
        const itemIdsToKeep = new Set(dataWithUserIdAndProcessed.map(d => d.id));

        // Delete documents for the user that are *not* in the incoming data list
        const deleteFilter = { userId, id: { $nin: Array.from(itemIdsToKeep) } };
        // console.log(`Save API: Performing deleteMany for ${collectionName} with filter: ${JSON.stringify(deleteFilter)}`, logContext); // Console log commented out
        await collection.deleteMany(deleteFilter, { session });

        // Upsert documents from the incoming list
        if (dataWithUserIdAndProcessed.length > 0) {
            const bulkOps = dataWithUserIdAndProcessed.map(doc => ({
                 updateOne: {
                     // Use 'id' (application-generated) for matching during upsert
                     filter: { userId: userId, id: doc.id },
                     update: { $set: { ...doc, userId: userId } }, // Ensure userId is set correctly
                     upsert: true // Create if doesn't exist based on filter (id and userId)
                 }
             }));
             // console.log(`Save API: Performing bulkWrite for ${collectionName} with ${bulkOps.length} operations`, logContext); // Console log commented out
            await collection.bulkWrite(bulkOps, { session });
        } else {
             // console.log(`Save API: No data provided for ${collectionName}, deleted existing data.`, logContext); // Console log commented out
        }

        // console.log(`Save API: Successfully processed ${collectionName}`, logContext); // Console log commented out

    } catch (error) {
        // console.error(`Save API: Error replacing ${collectionName}`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
        throw new Error(`Failed to save ${collectionName}`);
    }
}


// Helper function to save/update owned weekly reviews for a specific user using a transaction session
async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>, session: ClientSession) { // Accept session
    const logContext = { userId, operation: 'saveOwnedWeeklyReviews' };
    // console.log(`Save API: Starting save for owned weekly reviews`, logContext); // Console log commented out
    try {
        const collection: Collection = db.collection('weeklyReviews');
        const reviewKeys = Object.keys(ownedReviews || {});

        if (reviewKeys.length === 0) {
             // console.log(`Save API: No owned reviews provided to save.`, logContext); // Console log commented out
             return;
        }

        const bulkOps = reviewKeys.map(weekKey => {
            const reviewData = ownedReviews[weekKey];
             if (!reviewData || reviewData.ownerId !== userId) {
                 // console.warn(`Save API: SECURITY WARNING: Attempted to save review ${weekKey} with mismatched ownerId (expected ${userId}, got ${reviewData?.ownerId}). Skipping.`, logContext); // Console log commented out
                 return null;
             }
            const cleanSharedWith = Array.isArray(reviewData.sharedWith) ? reviewData.sharedWith : undefined;

            return {
                 updateOne: {
                     filter: { userId: userId, weekKey: weekKey }, // Use userId (ownerId) and weekKey
                     update: { $set: { ...reviewData, userId: userId, weekKey: weekKey, sharedWith: cleanSharedWith } }, // Ensure userId and weekKey are set
                     upsert: true
                 }
             };
         }).filter(op => op !== null);


        if (bulkOps.length > 0) {
             // console.log(`Save API: Performing bulkWrite for owned weeklyReviews with ${bulkOps.length} operations`, logContext); // Console log commented out
             await collection.bulkWrite(bulkOps as any, { session }); // Pass session
             // console.log(`Save API: Successfully saved/updated ${bulkOps.length} owned weeklyReviews`, logContext); // Console log commented out
         } else {
             // console.log(`Save API: No valid owned reviews to save.`, logContext); // Console log commented out
         }

    } catch (error) {
        // console.error(`Save API: Error saving owned weeklyReviews`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
        throw new Error('Failed to save owned weekly reviews');
    }
}

// Helper function to save user profile data using a transaction session
async function saveUserProfileData(db: any, userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean, session?: ClientSession) { // Accept optional session
    const logContext = { userId, operation: 'saveUserProfileData' };
    // console.log(`Save API: Starting save for user profile data`, logContext); // Console log commented out

    // Only proceed if at least one field is provided and defined
    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        // console.log(`Save API: No user profile data fields provided. Skipping profile update.`, logContext); // Console log commented out
        return;
    }

    try {
        const collection: Collection = db.collection('userProfiles');
        const updateDoc: { [key: string]: any } = {};

        if (startDate !== undefined) {
            try {
                 // Convert valid ISO string back to Date for storage
                updateDoc.statementStartDate = startDate ? new Date(startDate) : null;
            } catch { updateDoc.statementStartDate = null; /* console.warn(`Save API: Invalid start date format received: ${startDate}`, logContext); */ } // Console log commented out
        }
        if (endDate !== undefined) {
            try {
                 // Convert valid ISO string back to Date for storage
                updateDoc.statementEndDate = endDate ? new Date(endDate) : null;
            } catch { updateDoc.statementEndDate = null; /* console.warn(`Save API: Invalid end date format received: ${endDate}`, logContext); */ } // Console log commented out
        }
        if (gettingStartedDismissed !== undefined) {
            updateDoc.gettingStartedDismissed = gettingStartedDismissed;
        }


        if (Object.keys(updateDoc).length > 0) {
             // console.log(`Save API: Updating user profile with data: ${JSON.stringify(updateDoc)}`, logContext); // Console log commented out
             await collection.updateOne(
                 { userId },
                 { $set: updateDoc },
                 // Use upsert true. Pass session if provided (critical for transaction)
                 session ? { upsert: true, session } : { upsert: true }
             );
             // console.log(`Save API: Successfully saved user profile data`, logContext); // Console log commented out
         } else {
              // console.log(`Save API: No valid user profile fields to update.`, logContext); // Console log commented out
         }

    } catch (error) {
        // console.error(`Save API: Error saving user profile data`, { ...logContext, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
        throw new Error('Failed to save user profile data');
    }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  // const { userId } = auth(); // Clerk disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder
  const logContextBase = { userId: userId || 'unknown', operation: 'POST /api/save' };

  if (!userId) {
    // console.warn('Save API: Unauthorized save attempt: User not logged in.', logContextBase); // Console log commented out
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response); // Add CORS headers to error response
  }

  // Apply Rate Limiting
  const { success, limit, remaining, reset } = await ratelimit.limit(userId);
  const logContextWithRateLimit = { ...logContextBase, rateLimit: { limit, remaining, reset } };

  if (!success) {
      // console.warn('Save API: Rate limit exceeded.', logContextWithRateLimit); // Console log commented out
       const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
       return addCorsHeaders(response); // Ensure CORS headers on rate limit response
  }
  // console.log('Save API: Rate limit check passed.', logContextWithRateLimit); // Console log commented out


  let payload: SaveDataPayload;
  try {
    payload = await request.json();
  } catch (error) {
    // console.error('Save API: Invalid request body.', { ...logContextWithRateLimit, error, stack: error instanceof Error ? error.stack : undefined }); // Console log commented out
    const response = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    return addCorsHeaders(response); // Ensure CORS headers on bad request response
  }

  if (!payload || typeof payload !== 'object' || !payload.dataHash) {
      // console.warn('Save API: Invalid payload structure or missing dataHash.', logContextWithRateLimit); // Console log commented out
       const response = NextResponse.json({ error: 'Invalid payload or missing dataHash' }, { status: 400 });
       return addCorsHeaders(response); // Ensure CORS headers on bad request response
  }

  const { dataHash, ...receivedData } = payload;

   // Re-prepare the *received* data for hashing on the server-side
   const preparedDataForVerification = prepareDataForHashing(receivedData as any);
   const dataString = stringify(preparedDataForVerification);
   const calculatedServerHash = await hashData(dataString);

    // console.log(`Save API: Received hash: ${dataHash}, Calculated server hash: ${calculatedServerHash}`, logContextWithRateLimit); // Console log commented out

    const isValid = await verifyHash(dataString, dataHash);

    if (!isValid) {
       // console.error('Save API: Data integrity check failed!', { ...logContextWithRateLimit, clientHash: dataHash, serverHash: calculatedServerHash }); // Console log commented out
       // console.log("Data that resulted in hash mismatch (truncated):", { dataStringTruncated: dataString.substring(0, 300) + (dataString.length > 300 ? "..." : "") }, logContextWithRateLimit); // Console log commented out
       const response = NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
       return addCorsHeaders(response); // Ensure CORS headers on integrity check failure
    }
    // console.log('Save API: Data integrity check passed. Proceeding with save.', logContextWithRateLimit); // Console log commented out

  const client = await connectToDatabase();
  const db = client.db();
  const session = client.startSession(); // Start MongoDB session

  try {
    // console.log('Save API: Starting MongoDB transaction.', logContextWithRateLimit); // Console log commented out
    await session.withTransaction(async () => {
        // Use the verified prepared data for saving
        const {
          transactions = [],
          debts = [],
          assetItems = [],
          otherLiabilityItems = [],
          budgetItems = [], // Includes period field
          ownedReviews = {},
          startDate,
          endDate,
          gettingStartedDismissed
        } = preparedDataForVerification;


        // Perform all database operations within the transaction
        await Promise.all([
            replaceCollectionData(db, 'transactions', userId, transactions, session),
            replaceCollectionData(db, 'debts', userId, debts, session),
            replaceCollectionData(db, 'assetItems', userId, assetItems, session),
            replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems, session),
            replaceCollectionData(db, 'budgetItems', userId, budgetItems, session), // Updated call
            saveOwnedWeeklyReviews(db, userId, ownedReviews, session),
            saveUserProfileData(db, userId, startDate, endDate, gettingStartedDismissed, session)
        ]);
    });
    // console.log('Save API: MongoDB transaction committed successfully.', logContextWithRateLimit); // Console log commented out
     const response = NextResponse.json({ message: `Data saved successfully for user ${userId}` });
     return addCorsHeaders(response); // Add CORS headers to success response
  } catch (error: any) {
    // Transaction automatically aborted on error by withTransaction
    // console.error('Save API: MongoDB transaction failed or aborted.', { ...logContextWithRateLimit, error, stack: error.stack }); // Console log commented out
    const errorMessage = error instanceof Error ? `Failed to save data: ${error.message}` : 'An unknown error occurred during save.';
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response); // Ensure CORS headers on internal server error
  } finally {
     await session.endSession(); // Ensure session is always closed
     // console.log('Save API: MongoDB session ended.', logContextWithRateLimit); // Console log commented out
  }
}
