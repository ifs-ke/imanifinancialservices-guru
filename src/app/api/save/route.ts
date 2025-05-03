// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import { Collection } from 'mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';

// Define the structure of the incoming request body
interface SaveDataPayload {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  reviews: Record<string, WeeklyReviewData>;
  startDate?: string; // Date as ISO string
  endDate?: string;   // Date as ISO string
}

// Helper function to safely upsert data into a collection
// It deletes all existing documents for the user and inserts the new ones.
// This is simpler than merging but overwrites any server-side changes not reflected in the client state.
async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[]) {
  try {
    const collection: Collection = db.collection(collectionName);
    // Add userId to each item before inserting
    const dataWithUserId = data.map(item => ({ ...item, userId }));

    // Start a session for transaction
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Delete existing documents for the user within the transaction
        await collection.deleteMany({ userId }, { session });
        // Insert new documents if data is not empty
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
    throw new Error(`Failed to save ${collectionName}`); // Re-throw to signal failure
  }
}

// Helper function to save weekly reviews (potentially different structure)
// Assumes a single document per user holding the reviews object
async function saveWeeklyReviews(db: any, userId: string, reviews: Record<string, WeeklyReviewData>) {
    try {
        const collection: Collection = db.collection('weeklyReviews');
        // Use upsert to create or replace the user's review document
        await collection.updateOne(
            { userId }, // Filter by userId
            { $set: { userId, reviews } }, // Set the userId and the entire reviews object
            { upsert: true } // Create the document if it doesn't exist
        );
         console.log(`Successfully saved weeklyReviews for user ${userId}`);
    } catch (error) {
        console.error(`Error saving weeklyReviews for user ${userId}:`, error);
        throw new Error('Failed to save weekly reviews');
    }
}

// Helper function to save statement dates (store in a separate doc or user profile)
// For simplicity, storing in a 'userProfiles' collection
async function saveStatementDates(db: any, userId: string, startDate?: string, endDate?: string) {
    if (startDate === undefined && endDate === undefined) return; // Nothing to save

    try {
        const collection: Collection = db.collection('userProfiles'); // Example collection
        const updateDoc: any = {};
        if (startDate !== undefined) updateDoc.statementStartDate = startDate ? new Date(startDate) : null; // Store as Date or null
        if (endDate !== undefined) updateDoc.statementEndDate = endDate ? new Date(endDate) : null;

        if (Object.keys(updateDoc).length > 0) {
             await collection.updateOne(
                 { userId },
                 { $set: updateDoc },
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: SaveDataPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Basic validation
  if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const {
      transactions = [],
      debts = [],
      assetItems = [],
      otherLiabilityItems = [],
      budgetItems = [],
      reviews = {},
      startDate,
      endDate
  } = payload;


  try {
    const client = await connectToDatabase();
    const db = client.db();

    // Perform all database operations
    // Use Promise.all to run replacements in parallel for efficiency
    await Promise.all([
      replaceCollectionData(db, 'transactions', userId, transactions),
      replaceCollectionData(db, 'debts', userId, debts),
      replaceCollectionData(db, 'assetItems', userId, assetItems),
      replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems),
      replaceCollectionData(db, 'budgetItems', userId, budgetItems),
      saveWeeklyReviews(db, userId, reviews), // Use specific function for reviews
      saveStatementDates(db, userId, startDate, endDate) // Save dates
    ]);

    return NextResponse.json({ message: 'Data saved successfully' });
  } catch (error: any) {
    console.error('Failed to save user data:', error);
    // Return specific error message if available, otherwise generic message
    const errorMessage = error instanceof Error ? error.message : 'Failed to save data to database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
