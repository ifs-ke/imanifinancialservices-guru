// src/app/api/save/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import { Collection, ClientSession } from 'mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';
import { logInfo, logWarn, logError } from '@/lib/logger';
import { addCorsHeaders } from '@/lib/utils';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
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

async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[], session: ClientSession) {
  const logContext = { userId, collectionName, operation: 'replaceCollectionData' };
  logInfo(`Save API: Starting replace for ${collectionName}`, logContext);
  try {
    const collection: Collection = db.collection(collectionName);
    const dataWithUserIdAndProcessed = (data || []).map(item => ({
      ...item,
      userId,
      ...(item.date && typeof item.date === 'string' ? { date: new Date(item.date) } : {}),
      ...(collectionName === 'budgetItems' && !item.period ? { period: 'unknown-period' } : {}),
      _id: item._id || undefined
    }));

    const itemIdsToKeep = new Set(dataWithUserIdAndProcessed.map(d => d.id));
    const deleteFilter = { userId, id: { $nin: Array.from(itemIdsToKeep) } };
    logInfo(`Save API: Performing deleteMany for ${collectionName} with filter: ${JSON.stringify(deleteFilter)}`, logContext);
    await collection.deleteMany(deleteFilter, { session });

    if (dataWithUserIdAndProcessed.length > 0) {
      const bulkOps = dataWithUserIdAndProcessed.map(doc => ({
        updateOne: {
          filter: { userId, id: doc.id },
          update: { $set: { ...doc, userId } },
          upsert: true
        }
      }));
      logInfo(`Save API: Performing bulkWrite for ${collectionName} with ${bulkOps.length} operations`, logContext);
      await collection.bulkWrite(bulkOps, { session });
    } else {
      logInfo(`Save API: No data provided for ${collectionName}, deleted existing data.`, logContext);
    }
    logInfo(`Save API: Successfully processed ${collectionName}`, logContext);
  } catch (error) {
    logError(`Save API: Error replacing ${collectionName}`, error, logContext);
    throw new Error(`Failed to save ${collectionName}`);
  }
}

async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>, session: ClientSession) {
  const logContext = { userId, operation: 'saveOwnedWeeklyReviews' };
  logInfo(`Save API: Starting save for owned weekly reviews`, logContext);
  try {
    const collection: Collection = db.collection('weeklyReviews');
    const reviewKeys = Object.keys(ownedReviews || {});

    if (reviewKeys.length === 0) {
      logInfo(`Save API: No owned reviews provided to save.`, logContext);
      return;
    }

    const bulkOps = reviewKeys.map(weekKey => {
      const reviewData = ownedReviews[weekKey];
      if (!reviewData || reviewData.ownerId !== userId) {
        logWarn(`Save API: SECURITY WARNING: Attempted to save review ${weekKey} with mismatched ownerId (expected ${userId}, got ${reviewData?.ownerId}). Skipping.`, logContext);
        return null;
      }
      const cleanSharedWith = Array.isArray(reviewData.sharedWith) ? reviewData.sharedWith : undefined;

      return {
        updateOne: {
          filter: { userId, weekKey },
          update: { $set: { ...reviewData, userId, weekKey, sharedWith: cleanSharedWith } },
          upsert: true
        }
      };
    }).filter(op => op !== null) as any[];

    if (bulkOps.length > 0) {
      logInfo(`Save API: Performing bulkWrite for owned weeklyReviews with ${bulkOps.length} operations`, logContext);
      await collection.bulkWrite(bulkOps, { session });
      logInfo(`Save API: Successfully saved/updated ${bulkOps.length} owned weeklyReviews`, logContext);
    } else {
      logInfo(`Save API: No valid owned reviews to save.`, logContext);
    }
  } catch (error) {
    logError(`Save API: Error saving owned weeklyReviews`, error, logContext);
    throw new Error('Failed to save owned weekly reviews');
  }
}

async function saveUserProfileData(db: any, userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean, session?: ClientSession) {
  const logContext = { userId, operation: 'saveUserProfileData' };
  logInfo(`Save API: Starting save for user profile data`, logContext);
  if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
    logInfo(`Save API: No user profile data fields provided. Skipping profile update.`, logContext);
    return;
  }

  try {
    const collection: Collection = db.collection('userProfiles');
    const updateDoc: { [key: string]: any } = {};

    if (startDate !== undefined) {
      try { 
        updateDoc.statementStartDate = startDate ? new Date(startDate) : null; 
      } catch { 
        updateDoc.statementStartDate = null; 
        logWarn(`Save API: Invalid start date format received: ${startDate}`, logContext); 
      }
    }
    if (endDate !== undefined) {
      try { 
        updateDoc.statementEndDate = endDate ? new Date(endDate) : null; 
      } catch { 
        updateDoc.statementEndDate = null; 
        logWarn(`Save API: Invalid end date format received: ${endDate}`, logContext); 
      }
    }
    if (gettingStartedDismissed !== undefined) {
      updateDoc.gettingStartedDismissed = gettingStartedDismissed;
    }

    if (Object.keys(updateDoc).length > 0) {
      logInfo(`Save API: Updating user profile with data: ${JSON.stringify(updateDoc)}`, logContext);
      await collection.updateOne(
        { userId },
        { $set: updateDoc },
        { upsert: true, session }
      );
      logInfo(`Save API: Successfully saved user profile data`, logContext);
    } else {
      logInfo(`Save API: No valid user profile fields to update.`, logContext);
    }
  } catch (error) {
    logError(`Save API: Error saving user profile data`, error, logContext);
    throw new Error('Failed to save user profile data');
  }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  const { userId } = auth();
  
  if (!userId) {
    logWarn('Save API: Unauthorized save attempt: User not logged in.', { operation: 'POST /api/save' });
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  const logContextBase = { userId, operation: 'POST /api/save' };
  const { success, limit, remaining, reset } = await ratelimit.limit(userId);
  const logContextWithRateLimit = { ...logContextBase, rateLimit: { limit, remaining, reset } };

  if (!success) {
    logWarn('Save API: Rate limit exceeded.', logContextWithRateLimit);
    const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    return addCorsHeaders(response);
  }
  logInfo('Save API: Rate limit check passed.', logContextWithRateLimit);

  let payload: SaveDataPayload;
  try {
    payload = await request.json();
  } catch (error) {
    logError('Save API: Invalid request body.', error, logContextWithRateLimit);
    const response = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    return addCorsHeaders(response);
  }

  if (!payload || typeof payload !== 'object' || !payload.dataHash) {
    logWarn('Save API: Invalid payload structure or missing dataHash.', logContextWithRateLimit);
    const response = NextResponse.json({ error: 'Invalid payload or missing dataHash' }, { status: 400 });
    return addCorsHeaders(response);
  }

  const { dataHash, ...receivedData } = payload;
  const preparedDataForVerification = prepareDataForHashing(receivedData);
  const dataString = stringify(preparedDataForVerification);
  const calculatedServerHash = await hashData(dataString);

  logInfo(`Save API: Received hash: ${dataHash}, Calculated server hash: ${calculatedServerHash}`, logContextWithRateLimit);

  const isValid = await verifyHash(dataString, dataHash);

  if (!isValid) {
    logError('Save API: Data integrity check failed!', { ...logContextWithRateLimit, clientHash: dataHash, serverHash: calculatedServerHash });
    logWarn("Data that resulted in hash mismatch (truncated):", { 
      dataStringTruncated: dataString.substring(0, 300) + (dataString.length > 300 ? "..." : "") 
    }, logContextWithRateLimit);
    const response = NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  logInfo('Save API: Data integrity check passed. Proceeding with save.', logContextWithRateLimit);

  const client = await connectToDatabase();
  const db = client.db();
  const session = client.startSession();

  try {
    logInfo('Save API: Starting MongoDB transaction.', logContextWithRateLimit);
    await session.withTransaction(async () => {
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

      await Promise.all([
        replaceCollectionData(db, 'transactions', userId, transactions, session),
        replaceCollectionData(db, 'debts', userId, debts, session),
        replaceCollectionData(db, 'assetItems', userId, assetItems, session),
        replaceCollectionData(db, 'otherLiabilityItems', userId, otherLiabilityItems, session),
        replaceCollectionData(db, 'budgetItems', userId, budgetItems, session),
        saveOwnedWeeklyReviews(db, userId, ownedReviews, session),
        saveUserProfileData(db, userId, startDate, endDate, gettingStartedDismissed, session)
      ]);
    });
    logInfo('Save API: MongoDB transaction committed successfully.', logContextWithRateLimit);
    const response = NextResponse.json({ message: `Data saved successfully for user ${userId}` });
    return addCorsHeaders(response);
  } catch (error: any) {
    logError('Save API: MongoDB transaction failed or aborted.', error, logContextWithRateLimit);
    const errorMessage = error instanceof Error ? `Failed to save data: ${error.message}` : 'An unknown error occurred during save.';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  } finally {
    await session.endSession();
    logInfo('Save API: MongoDB session ended.', logContextWithRateLimit);
  }
}