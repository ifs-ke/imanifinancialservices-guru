// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';

// Helper to safely get collection data for a specific user
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  try {
    const collection = db.collection(collectionName);
    // Filter by userId and exclude _id and userId from the returned documents
    // This is the core security measure for fetching data.
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
    return data.map((item: any) => {
        // Ensure date fields common across types are handled
        if (item.date && !(item.date instanceof Date)) {
            try {
                item.date = new Date(item.date);
                 if (isNaN(item.date.getTime())) throw new Error("Invalid date string");
            } catch (e) {
                 console.warn(`Invalid date format encountered in ${collectionName} for item ID ${item.id || 'N/A'} for user ${userId}. Setting to current date.`);
                 item.date = new Date(); // Fallback for invalid dates
            }
        }
        return item as T;
    });
  } catch (error) {
    console.error(`Error fetching ${collectionName} for user ${userId}:`, error);
    // Consider throwing the error or returning a specific indicator if needed
    return []; // Return empty array on error for now
  }
}

// Helper to safely get weekly reviews data for a specific user
async function getWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
      // Filter by userId and exclude _id and userId
      const userReviewDoc = await collection.findOne({ userId }, { projection: { _id: 0, userId: 0 } });
      return userReviewDoc ? userReviewDoc.reviews || {} : {};
    } catch (error) {
      console.error(`Error fetching weeklyReviews for user ${userId}:`, error);
      return {};
    }
}

// Helper to get statement dates for a specific user
async function getStatementDates(db: any, userId: string): Promise<{ startDate?: string, endDate?: string }> {
    try {
        const collection = db.collection('userProfiles');
        // Filter by userId and project only the required date fields
        const userProfile = await collection.findOne(
            { userId }, // Filter by userId
            { projection: { _id: 0, userId: 0, statementStartDate: 1, statementEndDate: 1 } }
        );
        return {
             // Convert Date objects back to ISO strings for the response
             startDate: userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined,
             endDate: userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined,
        };
    } catch (error) {
        console.error(`Error fetching statement dates for user ${userId}:`, error);
        return {};
    }
}


export async function GET() {
  // Retrieve the userId using Clerk's auth() helper.
  // This ensures that only authenticated users can access this endpoint,
  // and we know *which* user's data to fetch.
  const { userId } = auth();

  if (!userId) {
    // If no userId, the request is unauthorized
    return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(); // Use default database from connection string

    // Check if user has ANY data in essential collections to determine if it's a "first sync"
    const [transactionCount, debtCount, budgetCount, profileCount, reviewCount] = await Promise.all([
        db.collection('transactions').countDocuments({ userId }), // Filter by userId
        db.collection('debts').countDocuments({ userId }), // Filter by userId
        db.collection('budgetItems').countDocuments({ userId }), // Filter by userId
        db.collection('userProfiles').countDocuments({ userId }), // Check profile for dates etc.
        db.collection('weeklyReviews').countDocuments({ userId }) // Check reviews
    ]);

    // If user has no data across essential collections, return 404.
    // This prevents returning an empty object for a user who has never saved data.
    if (transactionCount === 0 && debtCount === 0 && budgetCount === 0 && profileCount === 0 && reviewCount === 0) {
        console.log(`Sync: No existing data found for user ${userId}. Client should initiate save.`);
        // Return 404 specifically to indicate no data exists for this user yet
        return NextResponse.json({ message: 'No data found for user' }, { status: 404 });
    }

    // Fetch data specific to the authenticated user from all relevant collections
    // The userId is passed to each helper function to ensure data is correctly scoped.
    const [
        transactions,
        debts,
        assetItems,
        otherLiabilityItems,
        budgetItems,
        reviews,
        dates
    ] = await Promise.all([
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId),
        getWeeklyReviews(db, userId),
        getStatementDates(db, userId) // Fetch dates for the user
    ]);

    // Return all fetched data associated with the user
    return NextResponse.json({
      transactions,
      debts,
      assetItems,
      otherLiabilityItems,
      budgetItems,
      reviews,
      startDate: dates.startDate, // Include dates in response
      endDate: dates.endDate,
    });
  } catch (error) {
    console.error(`Failed to fetch data for user ${userId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch data from database' }, { status: 500 });
  }
}

    