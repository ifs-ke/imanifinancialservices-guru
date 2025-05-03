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

// Helper function to safely upsert data into a collection for a specific user
// It deletes all existing documents for the user and inserts the new ones.
// This ensures that data is always scoped to the correct user.
async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[]) {
  try {
    const collection: Collection = db.collection(collectionName);
    // Add userId to each item before inserting
    // Ensure dates are stored as BSON Date objects
    const dataWithUserId = data.map(item => ({
        ...item,
        userId, // Add userId for scoping
        // Convert common date fields to Date objects if they are strings
        ...(item.date && typeof item.date === 'string' ? { date: new Date(item.date) } : {}),
    }));


    // Start a session for transaction
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        // Delete existing documents ONLY for the specific user within the transaction
        await collection.deleteMany({ userId }, { session }); // Critical: Filter by userId
        // Insert new documents for the user if data is not empty
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

// Helper function to save weekly reviews for a specific user
async function saveWeeklyReviews(db: any, userId: string, reviews: Record<string, WeeklyReviewData>) {
    try {
        const collection: Collection = db.collection('weeklyReviews');
        // Use upsert to create or replace the specific user's review document
        await collection.updateOne(
            { userId }, // Filter by userId
            { $set: { userId, reviews } }, // Set the userId and the entire reviews object for this user
            { upsert: true } // Create the document if it doesn't exist for this user
        );
         console.log(`Successfully saved weeklyReviews for user ${userId}`);
    } catch (error) {
        console.error(`Error saving weeklyReviews for user ${userId}:`, error);
        throw new Error('Failed to save weekly reviews');
    }
}

// Helper function to save statement dates for a specific user
async function saveStatementDates(db: any, userId: string, startDate?: string, endDate?: string) {
    if (startDate === undefined && endDate === undefined) return; // Nothing to save

    try {
        const collection: Collection = db.collection('userProfiles'); // Example collection
        const updateDoc: any = {};
         // Store dates as BSON Date objects if provided, otherwise store null
         if (startDate !== undefined) updateDoc.statementStartDate = startDate ? new Date(startDate) : null;
         if (endDate !== undefined) updateDoc.statementEndDate = endDate ? new Date(endDate) : null;


        if (Object.keys(updateDoc).length > 0) {
             await collection.updateOne(
                 { userId }, // Filter by userId
                 { $set: { userId, ...updateDoc } }, // Ensure userId is set on upsert
                 { upsert: true } // Create profile if it doesn't exist
             );
             console.log(`Successfully saved statement dates for user ${userId}`);
         }

    } catch (error) {
        console.error(`Error saving statement dates for user ${userId}:`, error);
        throw new Error('Failed to save statement dates');
    }
}


export async function POST(request: Request) {
  // Retrieve the userId using Clerk's auth() helper
  // This is the primary mechanism for ensuring data is associated with the correct user.
  const { userId } = auth();

  if (!userId) {
    // If no userId, the request is unauthorized
    return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
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
    const db = client.db(); // Use the default database from the connection URI

    // Perform all database operations, passing the userId to each helper
    // This ensures all data operations are scoped to the authenticated user.
    await Promise.all([
      replaceCollectionData(db, 'transactions', userId, transactions),
      replaceCollectionData(db, 'debts', userId, debts),
      replaceCollectionData(db, 'assetItems', userId, assetItems),
      replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems),
      replaceCollectionData(db, 'budgetItems', userId, budgetItems),
      saveWeeklyReviews(db, userId, reviews), // Pass userId
      saveStatementDates(db, userId, startDate, endDate) // Pass userId
    ]);

     return NextResponse.json({ message: `Data saved successfully for user ${userId}` });
  } catch (error: any) {
    console.error(`Failed to save data for user ${userId}:`, error);
    // Return specific error message if available, otherwise generic message
    const errorMessage = error instanceof Error ? error.message : 'Failed to save data to database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

    