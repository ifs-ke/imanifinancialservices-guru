// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';

// Helper to safely get collection data
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  try {
    const collection = db.collection(collectionName);
    // Find documents matching the userId and project to exclude _id and userId
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
    // Ensure date fields are Date objects if they exist
    return data.map((item: any) => {
        if (item.date && typeof item.date === 'string') {
            item.date = new Date(item.date);
        }
        return item as T;
    });
  } catch (error) {
    console.error(`Error fetching ${collectionName} for user ${userId}:`, error);
    return []; // Return empty array on error
  }
}

// Helper to safely get weekly reviews data (special structure)
async function getWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
      // Weekly reviews might be stored differently, assuming one document per user for simplicity
      const userReviewDoc = await collection.findOne({ userId }, { projection: { _id: 0, userId: 0 } });
      return userReviewDoc ? userReviewDoc.reviews || {} : {}; // Return the 'reviews' object or an empty object
    } catch (error) {
      console.error(`Error fetching weeklyReviews for user ${userId}:`, error);
      return {}; // Return empty object on error
    }
}


export async function GET() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(); // Use default database from connection string

    // Fetch data from all relevant collections in parallel
    const [
        transactions,
        debts,
        assetItems,
        otherLiabilityItems,
        budgetItems,
        reviews
    ] = await Promise.all([
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId),
        getWeeklyReviews(db, userId) // Use the specific helper for reviews
    ]);

    return NextResponse.json({
      transactions,
      debts,
      assetItems,
      otherLiabilityItems,
      budgetItems,
      reviews,
    });
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    return NextResponse.json({ error: 'Failed to fetch data from database' }, { status: 500 });
  }
}
