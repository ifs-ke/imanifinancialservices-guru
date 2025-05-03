// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData } from '@/lib/storage-utils'; // Assuming hash utils are implemented

// Helper to safely get collection data for a specific user
async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
  try {
    const collection = db.collection(collectionName);
    const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
    return data.map((item: any) => {
        if (item.date && !(item.date instanceof Date)) {
            try {
                item.date = new Date(item.date);
                 if (isNaN(item.date.getTime())) throw new Error("Invalid date string");
            } catch (e) {
                 console.warn(`Invalid date format encountered in ${collectionName} for item ID ${item.id || 'N/A'} for user ${userId}. Setting to current date.`);
                 item.date = new Date();
            }
        }
        return item as T;
    });
  } catch (error) {
    console.error(`Error fetching ${collectionName} for user ${userId}:`, error);
    return [];
  }
}

// Helper to get weekly reviews owned by the specific user
async function getOwnedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
      // Find reviews where the userId field matches the logged-in user
      const ownedReviewsCursor = collection.find({ userId: userId }, { projection: { _id: 0 } }); // Exclude _id
      const reviewsMap: Record<string, WeeklyReviewData> = {};
      for await (const doc of ownedReviewsCursor) {
          if (doc.weekKey) { // Ensure weekKey exists
             reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
          }
      }
       return reviewsMap;
    } catch (error) {
      console.error(`Error fetching owned weeklyReviews for user ${userId}:`, error);
      return {};
    }
}

// Helper to get weekly reviews shared with the specific user
async function getSharedWeeklyReviews(db: any, userId: string): Promise<Record<string, WeeklyReviewData>> {
    try {
      const collection = db.collection('weeklyReviews');
      // Find reviews where the sharedWith array contains the logged-in user's ID
      // AND the ownerId is NOT the logged-in user's ID
       const sharedReviewsCursor = collection.find(
           { sharedWith: userId, userId: { $ne: userId } }, // Find where sharedWith includes userId, but user is not the owner
           { projection: { _id: 0 } } // Exclude _id
       );
       const reviewsMap: Record<string, WeeklyReviewData> = {};
       for await (const doc of sharedReviewsCursor) {
           if (doc.weekKey) {
               reviewsMap[doc.weekKey] = doc as WeeklyReviewData;
           }
       }
       return reviewsMap;
    } catch (error) {
      console.error(`Error fetching shared weeklyReviews for user ${userId}:`, error);
      return {};
    }
}


// Helper to get statement dates for a specific user
async function getStatementDates(db: any, userId: string): Promise<{ startDate?: string, endDate?: string }> {
    try {
        const collection = db.collection('userProfiles');
        const userProfile = await collection.findOne(
            { userId },
            { projection: { _id: 0, userId: 0, statementStartDate: 1, statementEndDate: 1 } }
        );
        return {
             startDate: userProfile?.statementStartDate instanceof Date ? userProfile.statementStartDate.toISOString() : undefined,
             endDate: userProfile?.statementEndDate instanceof Date ? userProfile.statementEndDate.toISOString() : undefined,
        };
    } catch (error) {
        console.error(`Error fetching statement dates for user ${userId}:`, error);
        return {};
    }
}


export async function GET() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db();

    // Check if user has ANY data (consider checking profile or a primary collection)
    const profileCount = await db.collection('userProfiles').countDocuments({ userId });
    // Optionally add checks for other essential collections if a profile might not exist initially
    // const transactionCount = await db.collection('transactions').countDocuments({ userId });
    // etc.

    if (profileCount === 0 /* && transactionCount === 0 etc. */) {
        console.log(`Sync: No existing data found for user ${userId}. Client should initiate save.`);
        return NextResponse.json({ message: 'No data found for user' }, { status: 404 });
    }

    // Fetch all data types concurrently
    const [
        transactions,
        debts,
        assetItems,
        otherLiabilityItems,
        budgetItems,
        ownedReviews,
        sharedReviews, // Fetch shared reviews
        dates
    ] = await Promise.all([
        getCollectionData<TransactionWithId>(db, 'transactions', userId),
        getCollectionData<DebtItem>(db, 'debts', userId),
        getCollectionData<StatementItem>(db, 'assetItems', userId),
        getCollectionData<OtherLiabilityItem>(db, 'otherLiabilityItems', userId),
        getCollectionData<BudgetItem>(db, 'budgetItems', userId),
        getOwnedWeeklyReviews(db, userId), // Fetch owned reviews
        getSharedWeeklyReviews(db, userId), // Fetch shared reviews
        getStatementDates(db, userId)
    ]);

     // Combine all data for hashing
     const dataToHash = {
       transactions,
       debts,
       assetItems,
       otherLiabilityItems,
       budgetItems,
       ownedReviews,
       sharedReviews, // Include shared reviews in the hash calculation
       startDate: dates.startDate,
       endDate: dates.endDate,
     };
     const dataHash = await hashData(JSON.stringify(dataToHash));


    // Return all fetched data associated with the user, including hash
    return NextResponse.json({
      transactions,
      debts,
      assetItems,
      otherLiabilityItems,
      budgetItems,
      ownedReviews,
      sharedReviews, // Include shared reviews in the response
      startDate: dates.startDate,
      endDate: dates.endDate,
      dataHash, // Send the hash to the client
    });
  } catch (error) {
    console.error(`Failed to fetch data for user ${userId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch data from database' }, { status: 500 });
  }
}
