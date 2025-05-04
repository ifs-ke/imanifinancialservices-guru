// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import { Collection } from 'mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils'; // Use updated hash utils
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify

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

// Helper function to safely replace data in a collection for a specific user
async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[]) {
  try {
    const collection: Collection = db.collection(collectionName);
    // Data received should already have Dates converted to ISO strings by prepareDataForHashing on client
    // Convert back to Date objects before saving to MongoDB where applicable
    const dataWithUserIdAndDates = data.map(item => ({
        ...item,
        userId,
        ...(item.date && typeof item.date === 'string' ? { date: new Date(item.date) } : {}), // Convert 'date' string back to Date
        // Note: We DO NOT convert startDate/endDate here as they belong in userProfiles
    }));

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Delete existing data scoped to the user within the transaction
        await collection.deleteMany({ userId }, { session });
        // Insert new data if any exists
        if (dataWithUserIdAndDates.length > 0) {
          await collection.insertMany(dataWithUserIdAndDates, { session });
        }
      });
       console.log(`Save API: Successfully replaced ${collectionName} for user ${userId}`);
    } finally {
        await session.endSession();
    }
  } catch (error) {
    console.error(`Save API: Error replacing ${collectionName} for user ${userId}:`, error);
    throw new Error(`Failed to save ${collectionName}`);
  }
}

// Helper function to save/update owned weekly reviews for a specific user
async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>) {
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
             await collection.bulkWrite(bulkOps as any);
             console.log(`Save API: Successfully saved/updated ${bulkOps.length} owned weeklyReviews for user ${userId}`);
         } else {
             console.log(`Save API: No valid owned reviews to save for user ${userId}.`);
         }

    } catch (error) {
        console.error(`Save API: Error saving owned weeklyReviews for user ${userId}:`, error);
        throw new Error('Failed to save owned weekly reviews');
    }
}


// Helper function to save statement dates and getting started state for a specific user
async function saveUserProfileData(db: any, userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean) {
     // Only proceed if at least one field is provided
    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        console.log(`Save API: No user profile data fields provided for user ${userId}. Skipping profile update.`);
        return;
    }

    try {
        const collection: Collection = db.collection('userProfiles');
        const updateDoc: { [key: string]: any } = {}; // Use a more specific type if possible

        // Conditionally add fields to the update document only if they are defined
        if (startDate !== undefined) {
            // Store as Date object if valid ISO string, otherwise null
            updateDoc.statementStartDate = startDate ? new Date(startDate) : null;
        }
        if (endDate !== undefined) {
             // Store as Date object if valid ISO string, otherwise null
            updateDoc.statementEndDate = endDate ? new Date(endDate) : null;
        }
        if (gettingStartedDismissed !== undefined) {
            updateDoc.gettingStartedDismissed = gettingStartedDismissed;
        }


        if (Object.keys(updateDoc).length > 0) {
             await collection.updateOne(
                 { userId }, // Filter by userId
                 { $set: updateDoc }, // Set only the provided fields
                 { upsert: true } // Create profile if it doesn't exist
             );
             console.log(`Save API: Successfully saved user profile data for user ${userId}:`, updateDoc);
         } else {
              console.log(`Save API: No valid user profile fields to update for user ${userId}.`);
         }

    } catch (error) {
        console.error(`Save API: Error saving user profile data for user ${userId}:`, error);
        throw new Error('Failed to save user profile data');
    }
}


export async function POST(request: Request) {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  }

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
       // Optionally log more details about the data being compared (careful with sensitive info)
       // console.log("Save API: Received Prepared Data:", JSON.stringify(preparedDataForVerification).substring(0, 500));
       return NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
    }
    console.log(`Save API: Data integrity check passed for user ${userId}. Proceeding with save.`);


  try {
    const client = await connectToDatabase();
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
      gettingStartedDismissed // Get the state from the verified data
    } = preparedDataForVerification;


    // Perform all database operations
    await Promise.all([
      replaceCollectionData(db, 'transactions', userId, transactions),
      replaceCollectionData(db, 'debts', userId, debts),
      replaceCollectionData(db, 'assetItems', userId, assetItems),
      replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems),
      replaceCollectionData(db, 'budgetItems', userId, budgetItems),
      saveOwnedWeeklyReviews(db, userId, ownedReviews),
      // Pass the gettingStartedDismissed value to the profile update function
      saveUserProfileData(db, userId, startDate, endDate, gettingStartedDismissed)
    ]);

     return NextResponse.json({ message: `Data saved successfully for user ${userId}` });
  } catch (error: any) {
    console.error(`Save API: Failed to save data for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save data to database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
