// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';

// Helper to safely get collection data
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  try {
    const collection = db.collection(collectionName);
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
    return data.map((item: any) => {
        // Ensure date fields common across types are handled
        if (item.date && !(item.date instanceof Date)) {
            try {
                item.date = new Date(item.date);
                 if (isNaN(item.date.getTime())) throw new Error("Invalid date string");
            } catch (e) {
                 console.warn(`Invalid date format encountered in ${collectionName} for item ID ${item.id || 'N/A'}. Setting to current date.`);
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

// Helper to safely get weekly reviews data
async function getWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
      const userReviewDoc = await collection.findOne({ userId }, { projection: { _id: 0, userId: 0 } });
      return userReviewDoc ? userReviewDoc.reviews || {} : {};
    } catch (error) {
      console.error(`Error fetching weeklyReviews for user ${userId}:`, error);
      return {};
    }
}

// Helper to get statement dates
async function getStatementDates(db: any, userId: string): Promise<{ startDate?: string, endDate?: string }> {
    try {
        const collection = db.collection('userProfiles');
        const userProfile = await collection.findOne({ userId }, { projection: { _id: 0, userId: 0, statementStartDate: 1, statementEndDate: 1 } });
        return {
            startDate: userProfile?.statementStartDate?.toISOString(), // Return ISO string or undefined
            endDate: userProfile?.statementEndDate?.toISOString(),
        };
    } catch (error) {
        console.error(`Error fetching statement dates for user ${userId}:`, error);
        return {};
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

    // Check if user has ANY data to determine if it's a "first sync" scenario
    // We can check one collection, e.g., transactions
    const hasExistingData = await db.collection('transactions').findOne({ userId }, { projection: { _id: 1 } });

    // If user has no data AT ALL, return a 404.
    // The client hook (useSyncManager) should interpret this 404 on initial fetch
    // as a signal to perform an initial save.
    // We need to be careful not to send 404 if *some* collections exist but others don't.
    // A more robust check might involve checking multiple essential collections.
    // For now, checking one might suffice, assuming transactions are core.
    // Let's refine: fetch counts from essential collections. If all are zero, return 404.
    const [transactionCount, debtCount, budgetCount] = await Promise.all([
        db.collection('transactions').countDocuments({ userId }),
        db.collection('debts').countDocuments({ userId }),
        db.collection('budgetItems').countDocuments({ userId }),
        // Add other essential collections if needed
    ]);

    if (transactionCount === 0 && debtCount === 0 && budgetCount === 0) {
        console.log(`Sync: No existing data found for user ${userId}. Client should initiate save.`);
        return NextResponse.json({ message: 'No data found for user' }, { status: 404 });
    }


    // Fetch data from all relevant collections in parallel if data exists
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
        getStatementDates(db, userId) // Fetch dates separately
    ]);

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
    console.error('Failed to fetch user data:', error);
    return NextResponse.json({ error: 'Failed to fetch data from database' }, { status: 500 });
  }
}
