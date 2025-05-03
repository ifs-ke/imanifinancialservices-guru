// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import { Collection } from 'mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils'; // Assuming hash utils are implemented

// Define the structure of the incoming request body
interface SaveDataPayload {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>; // Only owned reviews are sent for saving
  startDate?: string; // Date as ISO string
  endDate?: string;   // Date as ISO string
  dataHash: string; // Hash of the data being saved
}

// Helper function to safely upsert data into a collection for a specific user
async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[]) {
  try {
    const collection: Collection = db.collection(collectionName);
    const dataWithUserId = data.map(item => ({
        ...item,
        userId, // Add userId for scoping
        ...(item.date && typeof item.date === 'string' ? { date: new Date(item.date) } : {}),
    }));

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await collection.deleteMany({ userId }, { session });
        if (dataWithUserId.length > 0) {
          await collection.insertMany(dataWithUserId, { session });
        }
      });
       console.log(`Successfully replaced ${collectionName} for user ${userId}`);
    } finally {
        await session.endSession();
    }
  } catch (error) {
    console.error(`Error replacing ${collectionName} for user ${userId}:`, error);
    throw new Error(`Failed to save ${collectionName}`);
  }
}

// Helper function to save/update owned weekly reviews for a specific user
async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>) {
    try {
        const collection: Collection = db.collection('weeklyReviews');
        const reviewKeys = Object.keys(ownedReviews);

        if (reviewKeys.length === 0) {
             // If the user sends an empty ownedReviews object, potentially delete all their owned reviews.
             // Be cautious with this logic. Maybe only update/insert?
             // For now, we only upsert provided reviews.
             console.log(`No owned reviews provided to save for user ${userId}.`);
             return;
        }

        const bulkOps = reviewKeys.map(weekKey => {
            const reviewData = ownedReviews[weekKey];
             // Ensure ownerId matches the current user before saving
             if (reviewData.ownerId !== userId) {
                 console.warn(`Skipping save for review ${weekKey}: ownerId mismatch (expected ${userId}, got ${reviewData.ownerId})`);
                 return null; // Skip this operation
             }
            return {
                 updateOne: {
                     filter: { userId: userId, weekKey: weekKey }, // Find specific review by user and week
                     update: { $set: { userId: userId, weekKey: weekKey, ...reviewData } }, // Set all fields including userId and weekKey
                     upsert: true // Create if it doesn't exist
                 }
             };
         }).filter(op => op !== null); // Filter out null operations


        if (bulkOps.length > 0) {
             await collection.bulkWrite(bulkOps as any); // Perform bulk upsert
             console.log(`Successfully saved/updated ${bulkOps.length} owned weeklyReviews for user ${userId}`);
         } else {
             console.log(`No valid owned reviews to save for user ${userId}.`);
         }

    } catch (error) {
        console.error(`Error saving owned weeklyReviews for user ${userId}:`, error);
        throw new Error('Failed to save owned weekly reviews');
    }
}


// Helper function to save statement dates for a specific user
async function saveStatementDates(db: any, userId: string, startDate?: string, endDate?: string) {
    if (startDate === undefined && endDate === undefined) return;

    try {
        const collection: Collection = db.collection('userProfiles');
        const updateDoc: any = {};
         if (startDate !== undefined) updateDoc.statementStartDate = startDate ? new Date(startDate) : null;
         if (endDate !== undefined) updateDoc.statementEndDate = endDate ? new Date(endDate) : null;

        if (Object.keys(updateDoc).length > 0) {
             await collection.updateOne(
                 { userId },
                 { $set: { userId, ...updateDoc } },
                 { upsert: true }
             );
             console.log(`Successfully saved statement dates for user ${userId}`);
         }

    } catch (error) {
        console.error(`Error saving statement dates for user ${userId}:`, error);
        throw new Error('Failed to save statement dates');
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

  if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const {
      transactions = [],
      debts = [],
      assetItems = [],
      otherLiabilityItems = [],
      budgetItems = [],
      ownedReviews = {}, // Only expect ownedReviews
      startDate,
      endDate,
      dataHash // Expect the hash from the client
  } = payload;

   // Verify hash before proceeding
   const dataToVerify = {
       transactions, debts, assetItems, otherLiabilityItems,
       budgetItems, ownedReviews, startDate, endDate
   };
   const calculatedHash = await hashData(JSON.stringify(dataToVerify)); // Recalculate hash server-side

   // Simple comparison for now. In production, use a secure comparison function.
    if (calculatedHash !== dataHash) {
       console.error(`Data integrity check failed for user ${userId}. Client hash: ${dataHash}, Server hash: ${calculatedHash}`);
       return NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
    }
    console.log(`Data integrity check passed for user ${userId}.`);


  try {
    const client = await connectToDatabase();
    const db = client.db();

    // Perform all database operations, passing the userId to each helper
    await Promise.all([
      replaceCollectionData(db, 'transactions', userId, transactions),
      replaceCollectionData(db, 'debts', userId, debts),
      replaceCollectionData(db, 'assetItems', userId, assetItems),
      replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems),
      replaceCollectionData(db, 'budgetItems', userId, budgetItems),
      saveOwnedWeeklyReviews(db, userId, ownedReviews), // Save only OWNED reviews
      saveStatementDates(db, userId, startDate, endDate)
    ]);

     return NextResponse.json({ message: `Data saved successfully for user ${userId}` });
  } catch (error: any) {
    console.error(`Failed to save data for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to save data to database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
