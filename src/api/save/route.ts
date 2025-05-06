// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import { Collection, ClientSession } from 'mongodb'; // Import ClientSession
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils'; // Use updated hash utils
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify
import { Ratelimit } from '@upstash/ratelimit'; // Import Ratelimit
import { kv } from '@vercel/kv'; // Import Vercel KV

// Initialize rate limiter (e.g., 5 requests per 10 seconds per user)
// NOTE: Requires @upstash/ratelimit and @vercel/kv to be installed
// You'll need to configure Upstash Redis or Vercel KV in your Vercel project.
const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(5, '10 s'),
  analytics: true,
  prefix: '@upstash/ratelimit',
});

// Define the structure of the incoming request body (should match client's prepared data + hash)
interface SaveDataPayload {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  startDate?: string; // Date as ISO string
  endDate?: string;   // Date as ISO string
  gettingStartedDismissed?: boolean;
  dataHash: string; // Hash of the prepared data being saved
}

// Helper function to safely replace data in a collection for a specific user WITHIN A TRANSACTION
async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[], session: ClientSession) { // Added session parameter
  try {
    const collection: Collection = db.collection(collectionName);
    const dataWithUserIdAndDates = data.map(item => ({
        ...item,
        userId,
        ...(item.date && typeof item.date === 'string' ? { date: new Date(item.date) } : {}),
        ...(item.timestamp && typeof item.timestamp === 'string' ? { timestamp: new Date(item.timestamp) } : {}), // Handle timestamp if present
    }));

    // Operations must use the provided session
    console.time(`replace_${collectionName}_${userId}`); // Start timing
    await collection.deleteMany({ userId }, { session });
    if (dataWithUserIdAndDates.length > 0) {
      await collection.insertMany(dataWithUserIdAndDates, { session });
    }
    console.timeEnd(`replace_${collectionName}_${userId}`); // End timing
    console.log(`Save API: Successfully staged replace for ${collectionName} in transaction for user ${userId}`);

  } catch (error) {
    console.error(`Save API: Error staging replace for ${collectionName} for user ${userId}:`, error);
    throw new Error(`Failed to save ${collectionName}`); // Throw error to abort transaction
  }
}

// Helper function to save/update owned weekly reviews for a specific user WITHIN A TRANSACTION
async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>, session: ClientSession) { // Added session parameter
    try {
        const collection: Collection = db.collection('weeklyReviews');
        const reviewKeys = Object.keys(ownedReviews);

        if (reviewKeys.length === 0) {
             console.log(`Save API: No owned reviews provided to save for user ${userId}.`);
             return;
        }

        const bulkOps = reviewKeys.map(weekKey => {
            const reviewData = ownedReviews[weekKey];
             if (reviewData.ownerId !== userId) {
                 console.warn(`Save API SECURITY WARNING: Attempted to save review ${weekKey} with mismatched ownerId (expected ${userId}, got ${reviewData.ownerId}). Skipping.`);
                 return null;
             }
            const cleanSharedWith = Array.isArray(reviewData.sharedWith) ? reviewData.sharedWith : undefined;

            return {
                 updateOne: {
                     filter: { userId: userId, weekKey: weekKey },
                     update: { $set: { ...reviewData, userId: userId, weekKey: weekKey, sharedWith: cleanSharedWith } },
                     upsert: true
                 }
             };
         }).filter(op => op !== null);


        if (bulkOps.length > 0) {
             console.time(`save_owned_reviews_${userId}`); // Start timing
             await collection.bulkWrite(bulkOps as any, { session }); // Use the provided session
             console.timeEnd(`save_owned_reviews_${userId}`); // End timing
             console.log(`Save API: Successfully staged save/update for ${bulkOps.length} owned weeklyReviews in transaction for user ${userId}`);
         } else {
             console.log(`Save API: No valid owned reviews to stage for save for user ${userId}.`);
         }

    } catch (error) {
        console.error(`Save API: Error staging save for owned weeklyReviews for user ${userId}:`, error);
        throw new Error('Failed to save owned weekly reviews'); // Throw error to abort transaction
    }
}


// Helper function to save statement dates and getting started state for a specific user WITHIN A TRANSACTION
async function saveUserProfileData(db: any, userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean, session: ClientSession) { // Added session parameter
    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        console.log(`Save API: No user profile data fields provided for user ${userId}. Skipping profile update staging.`);
        return;
    }

    try {
        const collection: Collection = db.collection('userProfiles');
        const updateDoc: { [key: string]: any } = {};

        if (startDate !== undefined) {
            updateDoc.statementStartDate = startDate ? new Date(startDate) : null;
        }
        if (endDate !== undefined) {
            updateDoc.statementEndDate = endDate ? new Date(endDate) : null;
        }
        if (gettingStartedDismissed !== undefined) {
            updateDoc.gettingStartedDismissed = gettingStartedDismissed;
        }

        if (Object.keys(updateDoc).length > 0) {
             console.time(`save_user_profile_${userId}`); // Start timing
             await collection.updateOne(
                 { userId },
                 { $set: updateDoc },
                 { upsert: true, session } // Use the provided session
             );
             console.timeEnd(`save_user_profile_${userId}`); // End timing
             console.log(`Save API: Successfully staged user profile data save in transaction for user ${userId}:`, updateDoc);
         } else {
              console.log(`Save API: No valid user profile fields to stage for update for user ${userId}.`);
         }

    } catch (error) {
        console.error(`Save API: Error staging save for user profile data for user ${userId}:`, error);
        throw new Error('Failed to save user profile data'); // Throw error to abort transaction
    }
}


export async function POST(request: Request) {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  }

  // Apply rate limiting
  const identifier = userId; // Rate limit based on user ID
  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

  if (!success) {
      console.warn(`Save API: Rate limit exceeded for user ${userId}. Limit: ${limit}, Remaining: ${remaining}`);
      return NextResponse.json({ error: 'Too many save requests. Please try again later.' }, { status: 429 });
  }
  console.log(`Save API: Rate limit check passed for user ${userId}. Remaining: ${remaining}`);


  let payload: SaveDataPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || !payload.dataHash) {
      return NextResponse.json({ error: 'Invalid payload or missing dataHash' }, { status: 400 });
  }

  const { dataHash, ...receivedData } = payload;

  // Re-prepare the *received* data for hashing on the server-side
  const preparedDataForVerification = prepareDataForHashing(receivedData as any); // Cast as any for flexibility if needed
  const dataString = stringify(preparedDataForVerification);
  const calculatedServerHash = await hashData(dataString);

  console.log(`Save API: Received hash: ${dataHash}, Calculated server hash: ${calculatedServerHash}`);

  const isValid = await verifyHash(dataString, dataHash);

  if (!isValid) {
    console.error(`Save API: Data integrity check failed for user ${userId}. Client hash: ${dataHash}, Server hash: ${calculatedServerHash}`);
    // Enhanced logging for mismatch debugging: Log key counts/lengths, avoid full data
    console.log("Save API: Data causing mismatch (summary):", {
      transactions: preparedDataForVerification.transactions?.length ?? 'N/A',
      debts: preparedDataForVerification.debts?.length ?? 'N/A',
      assetItems: preparedDataForVerification.assetItems?.length ?? 'N/A',
      otherLiabilityItems: preparedDataForVerification.otherLiabilityItems?.length ?? 'N/A',
      budgetItems: preparedDataForVerification.budgetItems?.length ?? 'N/A',
      ownedReviewsKeys: Object.keys(preparedDataForVerification.ownedReviews ?? {}).length,
      notifications: preparedDataForVerification.notifications?.length ?? 'N/A',
      startDate: preparedDataForVerification.startDate,
      endDate: preparedDataForVerification.endDate,
      gettingStartedDismissed: preparedDataForVerification.gettingStartedDismissed,
    });
    // Optionally log the first few chars of the stringified data for deeper debugging (CAREFUL!)
    // console.log("Save API: Stringified Data (first 500 chars):", dataString.substring(0, 500));
    return NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
  }
  console.log(`Save API: Data integrity check passed for user ${userId}. Proceeding with save transaction.`);

  const client = await connectToDatabase();
  const session = client.startSession(); // Start a MongoDB session

  try {
      console.time(`save_transaction_${userId}`); // Start overall transaction timing
      // --- Start Transaction ---
      await session.withTransaction(async () => {
          const db = client.db();
          // Use the verified prepared data for saving
          const {
            transactions = [],
            debts = [],
            assetItems = [],
            otherLiabilityItems = [],
            budgetItems = [],
            ownedReviews = {},
            startDate,
            endDate,
            gettingStartedDismissed
          } = preparedDataForVerification;

          // Perform all database operations within the transaction, passing the session
          await replaceCollectionData(db, 'transactions', userId, transactions, session);
          await replaceCollectionData(db, 'debts', userId, debts, session);
          await replaceCollectionData(db, 'assetItems', userId, assetItems, session);
          await replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems, session);
          await replaceCollectionData(db, 'budgetItems', userId, budgetItems, session);
          await saveOwnedWeeklyReviews(db, userId, ownedReviews, session);
          await saveUserProfileData(db, userId, startDate, endDate, gettingStartedDismissed, session);

          // If all operations succeed, the transaction will be committed automatically.
          console.log(`Save API: Transaction staged successfully for user ${userId}.`);
      });
      // --- Transaction Committed Successfully ---
      console.timeEnd(`save_transaction_${userId}`); // End overall transaction timing
      console.log(`Save API: Transaction committed for user ${userId}.`);
      return NextResponse.json({ message: `Data saved successfully for user ${userId}` });

  } catch (error: any) {
      // If any operation within the transaction fails, it will be automatically aborted.
      console.timeEnd(`save_transaction_${userId}`); // End overall transaction timing (even on error)
      console.error(`Save API: Transaction aborted for user ${userId}. Error:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save data to database';
      // Return 500 for server errors, which include transaction failures
      return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
      // Ensure the session is always ended, regardless of success or failure
      await session.endSession();
      console.log(`Save API: Session ended for user ${userId}.`);
  }
}
