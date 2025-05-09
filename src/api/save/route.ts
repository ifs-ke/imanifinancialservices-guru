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
import { addCorsHeaders } from '@/lib/utils';
import { SaveDataPayloadSchema } from '@/lib/schemas'; // Import Zod schema

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});

async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[], session: ClientSession) {
  const logContext = { userId, collectionName, operation: 'replaceCollectionData', apiRoute: '/api/save' };
  console.log(`Save API: Starting replace for ${collectionName}`, logContext);
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
    console.log(`Save API: Performing deleteMany for ${collectionName} with filter: ${JSON.stringify(deleteFilter)}`, logContext);
    await collection.deleteMany(deleteFilter, { session });

    if (dataWithUserIdAndProcessed.length > 0) {
      const bulkOps = dataWithUserIdAndProcessed.map(doc => ({
        updateOne: {
          filter: { userId, id: doc.id },
          update: { $set: { ...doc, userId } },
          upsert: true
        }
      }));
      console.log(`Save API: Performing bulkWrite for ${collectionName} with ${bulkOps.length} operations`, logContext);
      await collection.bulkWrite(bulkOps, { session });
    } else {
      console.log(`Save API: No data provided for ${collectionName}, deleted existing data.`, logContext);
    }
    console.log(`Save API: Successfully processed ${collectionName}`, logContext);
  } catch (error: any) {
    console.error(`Save API: Error replacing ${collectionName}`, { ...logContext, errorMessage: error.message, stack: error.stack });
    throw new Error(`Failed to save ${collectionName}`);
  }
}

async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>, session: ClientSession) {
  const logContext = { userId, operation: 'saveOwnedWeeklyReviews', apiRoute: '/api/save' };
  console.log(`Save API: Starting save for owned weekly reviews`, logContext);
  try {
    const collection: Collection = db.collection('weeklyReviews');
    const reviewKeys = Object.keys(ownedReviews || {});

    if (reviewKeys.length === 0) {
      console.log(`Save API: No owned reviews provided to save.`, logContext);
      return;
    }

    const bulkOps = reviewKeys.map(weekKey => {
      const reviewData = ownedReviews[weekKey];
      if (!reviewData || reviewData.ownerId !== userId) {
        console.warn(`Save API: SECURITY WARNING: Attempted to save review ${weekKey} with mismatched ownerId (expected ${userId}, got ${reviewData?.ownerId}). Skipping.`, logContext);
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
      console.log(`Save API: Performing bulkWrite for owned weeklyReviews with ${bulkOps.length} operations`, logContext);
      await collection.bulkWrite(bulkOps, { session });
      console.log(`Save API: Successfully saved/updated ${bulkOps.length} owned weeklyReviews`, logContext);
    } else {
      console.log(`Save API: No valid owned reviews to save.`, logContext);
    }
  } catch (error: any) {
    console.error(`Save API: Error saving owned weeklyReviews`, { ...logContext, errorMessage: error.message, stack: error.stack });
    throw new Error('Failed to save owned weekly reviews');
  }
}

async function saveUserProfileData(db: any, userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean, session?: ClientSession) {
  const logContext = { userId, operation: 'saveUserProfileData', apiRoute: '/api/save' };
  console.log(`Save API: Starting save for user profile data`, logContext);
  if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
    console.log(`Save API: No user profile data fields provided. Skipping profile update.`, logContext);
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
        console.warn(`Save API: Invalid start date format received: ${startDate}`, logContext); 
      }
    }
    if (endDate !== undefined) {
      try { 
        updateDoc.statementEndDate = endDate ? new Date(endDate) : null; 
      } catch { 
        updateDoc.statementEndDate = null; 
        console.warn(`Save API: Invalid end date format received: ${endDate}`, logContext); 
      }
    }
    if (gettingStartedDismissed !== undefined) {
      updateDoc.gettingStartedDismissed = gettingStartedDismissed;
    }

    if (Object.keys(updateDoc).length > 0) {
      console.log(`Save API: Updating user profile with data: ${JSON.stringify(updateDoc)}`, logContext);
      await collection.updateOne(
        { userId },
        { $set: updateDoc },
        { upsert: true, session }
      );
      console.log(`Save API: Successfully saved user profile data`, logContext);
    } else {
      console.log(`Save API: No valid user profile fields to update.`, logContext);
    }
  } catch (error: any) {
    console.error(`Save API: Error saving user profile data`, { ...logContext, errorMessage: error.message, stack: error.stack });
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
    console.warn('Save API: Unauthorized save attempt: User not logged in.', { operation: 'POST /api/save', apiRoute: '/api/save' });
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  const logContextBase = { userId, operation: 'POST /api/save', apiRoute: '/api/save' };
  const { success, limit, remaining, reset } = await ratelimit.limit(userId);
  const logContextWithRateLimit = { ...logContextBase, rateLimit: { limit, remaining, reset } };

  if (!success) {
    console.warn('Save API: Rate limit exceeded.', logContextWithRateLimit);
    const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    return addCorsHeaders(response);
  }
  console.log('Save API: Rate limit check passed.', logContextWithRateLimit);

  let rawPayload: any;
  try {
    rawPayload = await request.json();
  } catch (error: any) {
    console.error('Save API: Invalid request body - JSON parsing failed.', { ...logContextWithRateLimit, errorMessage: error.message, stack: error.stack });
    const response = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    return addCorsHeaders(response);
  }

  const validationResult = SaveDataPayloadSchema.safeParse(rawPayload);
  if (!validationResult.success) {
    console.warn('Save API: Invalid payload structure or data types.', { ...logContextWithRateLimit, errors: validationResult.error.flatten() });
    const response = NextResponse.json({ error: 'Invalid payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    return addCorsHeaders(response);
  }

  const payload = validationResult.data;

  const { dataHash, ...receivedData } = payload;
  const preparedDataForVerification = prepareDataForHashing(receivedData as any); 
  const dataString = stringify(preparedDataForVerification);
  const calculatedServerHash = await hashData(dataString);

  console.log(`Save API: Received hash: ${dataHash}, Calculated server hash: ${calculatedServerHash}`, logContextWithRateLimit);

  const isValid = await verifyHash(dataString, dataHash);

  if (!isValid) {
    console.error('Save API: Data integrity check failed!', { ...logContextWithRateLimit, clientHash: dataHash, serverHash: calculatedServerHash });
    console.warn("Data that resulted in hash mismatch (truncated):", { 
      dataStringTruncated: dataString.substring(0, 300) + (dataString.length > 300 ? "..." : "") 
    }, logContextWithRateLimit);
    const response = NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  console.log('Save API: Data integrity check passed. Proceeding with save.', logContextWithRateLimit);

  const client = await connectToDatabase();
  const db = client.db();
  const session = client.startSession();

  try {
    console.log('Save API: Starting MongoDB transaction.', logContextWithRateLimit);
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
        saveUserProfileData(db, userId, startDate?.toString(), endDate?.toString(), gettingStartedDismissed, session)
      ]);
    });
    console.log('Save API: MongoDB transaction committed successfully.', logContextWithRateLimit);
    const response = NextResponse.json({ message: `Data saved successfully for user ${userId}` });
    return addCorsHeaders(response);
  } catch (error: any) {
    console.error('Save API: MongoDB transaction failed or aborted.', { ...logContextWithRateLimit, errorMessage: error.message, stack: error.stack });
    const errorMessage = error instanceof Error ? `Failed to save data: ${error.message}` : 'An unknown error occurred during save.';
    const response = NextResponse.json({ error: errorMessage }, { status: 500 });
    return addCorsHeaders(response);
  } finally {
    await session.endSession();
    console.log('Save API: MongoDB session ended.', logContextWithRateLimit);
  }
}