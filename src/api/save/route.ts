
// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
// import { auth } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import { Collection } from 'mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { logInfo, logWarn, logError } from '@/lib/logger';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '10 s'), // Increased limit slightly
  analytics: true,
  prefix: '@upstash/ratelimit_ifc_guru_save',
});

interface SaveDataPayload {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed?: boolean;
  dataHash: string;
}

async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[], session: any) {
  try {
    const collection: Collection = db.collection(collectionName);
    const dataWithUserIdAndDates = data.map(item => ({
        ...item,
        userId,
        ...(item.date && typeof item.date === 'string' ? { date: new Date(item.date) } : {}),
        ...(item.timestamp && typeof item.timestamp === 'string' ? { timestamp: new Date(item.timestamp) } : {}),
    }));

    const logContext = { userId, collectionName, operation: 'replaceCollectionData' };
    logInfo(`Staging delete and insert for ${collectionName}`, logContext);

    // Optimized operations within transaction
    const newIds = new Set(dataWithUserIdAndDates.map(d => d.id)); // Assuming 'id' is the unique key from client

    // Delete only documents not in the new dataset
    const deleteResult = await collection.deleteMany({ userId, id: { $nin: Array.from(newIds) } }, { session });
    logInfo(`Staged delete of ${deleteResult.deletedCount} old documents from ${collectionName}`, logContext);

    if (dataWithUserIdAndDates.length > 0) {
      const bulkOps = dataWithUserIdAndDates.map(doc => ({
        updateOne: {
          filter: { userId, id: doc.id }, // Match by userId and client-generated id
          update: { $set: doc },
          upsert: true
        }
      }));
      const insertResult = await collection.bulkWrite(bulkOps, { session, ordered: false });
      logInfo(`Staged upsert of ${insertResult.upsertedCount + insertResult.modifiedCount} documents to ${collectionName}`, logContext);
    }

  } catch (error) {
    logError(`Error staging replace for ${collectionName}`, error, { userId, collectionName });
    throw new Error(`Failed to save ${collectionName}`);
  }
}

async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>, session: any) {
    const logContext = { userId, operation: 'saveOwnedWeeklyReviews' };
    try {
        const collection: Collection = db.collection('weeklyReviews');
        const reviewKeys = Object.keys(ownedReviews);

        if (reviewKeys.length === 0) {
             logInfo('No owned reviews provided to save.', logContext);
             return;
        }

        const bulkOps = reviewKeys.map(weekKey => {
            const reviewData = ownedReviews[weekKey];
             if (reviewData.ownerId !== userId) {
                 logWarn(`SECURITY WARNING: Attempted to save review ${weekKey} with mismatched ownerId (expected ${userId}, got ${reviewData.ownerId}). Skipping.`, logContext);
                 return null;
             }
            const cleanSharedWith = Array.isArray(reviewData.sharedWith) ? reviewData.sharedWith : []; // Ensure it's an array or undefined

            return {
                 updateOne: {
                     filter: { userId: userId, weekKey: weekKey },
                     update: { $set: { ...reviewData, userId: userId, weekKey: weekKey, sharedWith: cleanSharedWith } },
                     upsert: true
                 }
             };
         }).filter(op => op !== null);


        if (bulkOps.length > 0) {
             const result = await collection.bulkWrite(bulkOps as any, { session, ordered: false });
             logInfo(`Successfully staged save/update for ${result.upsertedCount + result.modifiedCount} owned weeklyReviews.`, logContext);
         } else {
             logInfo('No valid owned reviews to stage for save.', logContext);
         }

    } catch (error) {
        logError('Error staging save for owned weeklyReviews', error, logContext);
        throw new Error('Failed to save owned weekly reviews');
    }
}

async function saveUserProfileData(db: any, userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean, session: any) {
    const logContext = { userId, operation: 'saveUserProfileData' };
    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        logInfo('No user profile data fields provided. Skipping profile update staging.', logContext);
        return;
    }

    try {
        const collection: Collection = db.collection('userProfiles');
        const updateDoc: { [key: string]: any } = {};

        if (startDate !== undefined) updateDoc.statementStartDate = startDate ? new Date(startDate) : null;
        if (endDate !== undefined) updateDoc.statementEndDate = endDate ? new Date(endDate) : null;
        if (gettingStartedDismissed !== undefined) updateDoc.gettingStartedDismissed = gettingStartedDismissed;

        if (Object.keys(updateDoc).length > 0) {
             await collection.updateOne({ userId }, { $set: updateDoc }, { upsert: true, session });
             logInfo('Successfully staged user profile data save.', { ...logContext, updateDoc });
         } else {
              logInfo('No valid user profile fields to stage for update.', logContext);
         }
    } catch (error) {
        logError('Error staging save for user profile data', error, logContext);
        throw new Error('Failed to save user profile data');
    }
}

export async function POST(request: Request) {
  // const { userId } = auth(); // Clerk disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
  const logContext = { userId, api: '/api/save', method: 'POST' };

  // if (!userId) { // Clerk disabled
  //   logWarn('Unauthorized save attempt: User not logged in.', logContext);
  //   return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
  // }

  const identifier = userId;
  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

  if (!success) {
      logWarn(`Rate limit exceeded for user. Limit: ${limit}, Remaining: ${remaining}`, logContext);
      return NextResponse.json({ error: 'Too many save requests. Please try again later.' }, { status: 429, headers: { 'X-RateLimit-Limit': limit.toString(), 'X-RateLimit-Remaining': remaining.toString(), 'X-RateLimit-Reset': reset.toString() } });
  }
  logInfo(`Rate limit check passed. Remaining: ${remaining}`, logContext);

  let payload: SaveDataPayload;
  try {
    payload = await request.json();
  } catch (error) {
    logError('Invalid request body', error, logContext);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || !payload.dataHash) {
      logError('Invalid payload or missing dataHash', undefined, logContext);
      return NextResponse.json({ error: 'Invalid payload or missing dataHash' }, { status: 400 });
  }

  const { dataHash, ...receivedData } = payload;
  const preparedDataForVerification = prepareDataForHashing(receivedData as any);
  const dataString = stringify(preparedDataForVerification);
  const calculatedServerHash = await hashData(dataString);

  logInfo(`Received hash: ${dataHash}, Calculated server hash: ${calculatedServerHash}`, logContext);

  const isValid = await verifyHash(dataString, dataHash);

  if (!isValid) {
    logError('Data integrity check failed.', undefined, { ...logContext, clientHash: dataHash, serverHash: calculatedServerHash, dataSummary: { transactions: preparedDataForVerification.transactions?.length, debts: preparedDataForVerification.debts?.length }});
    return NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
  }
  logInfo('Data integrity check passed. Proceeding with save transaction.', logContext);

  const client = await connectToDatabase();
  const session = client.startSession();

  try {
      logInfo('Starting save transaction.', logContext);
      await session.withTransaction(async () => {
          const db = client.db();
          const { transactions = [], debts = [], assetItems = [], otherLiabilityItems = [], budgetItems = [], ownedReviews = {}, startDate, endDate, gettingStartedDismissed } = preparedDataForVerification;

          await replaceCollectionData(db, 'transactions', userId, transactions, session);
          await replaceCollectionData(db, 'debts', userId, debts, session);
          await replaceCollectionData(db, 'assetItems', userId, assetItems, session);
          await replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems, session);
          await replaceCollectionData(db, 'budgetItems', userId, budgetItems, session);
          await saveOwnedWeeklyReviews(db, userId, ownedReviews, session);
          await saveUserProfileData(db, userId, startDate, endDate, gettingStartedDismissed, session);
          logInfo('Transaction staged successfully.', logContext);
      });
      logInfo('Transaction committed successfully.', logContext);
      return NextResponse.json({ message: `Data saved successfully for user ${userId}` });

  } catch (error: any) {
      logError('Transaction aborted.', error, logContext);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save data to database due to transaction error';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
      await session.endSession();
      logInfo('Session ended.', logContext);
  }
}
