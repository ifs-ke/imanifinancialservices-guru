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
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; 
import { SaveDataPayloadSchema } from '@/lib/schemas';


const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '10 s'), 
});

async function replaceCollectionData(db: any, collectionName: string, userId: string, data: any[], session: ClientSession) { 
    const logContext = { userId, collectionName, operation: 'replaceCollectionData', apiRoute: '/api/save' };
    logDebug(`Save API: Starting replace for ${collectionName}`, logContext, userId);
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
        logDebug(`Save API: Performing deleteMany for ${collectionName}`, logContext, {filter: deleteFilter}, userId);
        await collection.deleteMany(deleteFilter, { session });

        if (dataWithUserIdAndProcessed.length > 0) {
            const bulkOps = dataWithUserIdAndProcessed.map(doc => ({
                 updateOne: {
                     filter: { userId: userId, id: doc.id },
                     update: { $set: { ...doc, userId: userId } }, 
                     upsert: true 
                 }
             }));
             logDebug(`Save API: Performing bulkWrite for ${collectionName}`, logContext, {opCount: bulkOps.length}, userId);
            await collection.bulkWrite(bulkOps, { session });
        } else {
             logDebug(`Save API: No data provided for ${collectionName}, deleted existing data.`, logContext, userId);
        }
        logInfo(`Save API: Successfully processed ${collectionName}`, logContext, userId);
    } catch (error: any) {
        logError(`Save API: DB Error replacing ${collectionName}`, error, logContext, userId);
        throw new Error(`Failed to save ${collectionName}: ${error.message}`);
    }
}

async function saveOwnedWeeklyReviews(db: any, userId: string, ownedReviews: Record<string, WeeklyReviewData>, session: ClientSession) { 
    const logContext = { userId, operation: 'saveOwnedWeeklyReviews', apiRoute: '/api/save' };
    logDebug(`Save API: Starting save for owned weekly reviews`, logContext, userId);
    try {
        const collection: Collection = db.collection('weeklyReviews');
        const reviewKeys = Object.keys(ownedReviews || {});

        if (reviewKeys.length === 0) {
             logDebug(`Save API: No owned reviews provided to save.`, logContext, userId);
             return;
        }

        const bulkOps = reviewKeys.map(weekKey => {
            const reviewData = ownedReviews[weekKey];
             if (!reviewData || reviewData.ownerId !== userId) {
                 logWarn(`Save API: SECURITY WARNING: Attempted to save review ${weekKey} with mismatched ownerId (expected ${userId}, got ${reviewData?.ownerId}). Skipping.`, { ...logContext, expectedOwnerId: userId, actualOwnerId: reviewData?.ownerId }, userId);
                 return null;
             }
            const cleanSharedWith = Array.isArray(reviewData.sharedWith) ? reviewData.sharedWith : undefined;

            return {
                 updateOne: {
                     filter: { userId: userId, weekKey: weekKey }, 
                     update: { $set: { ...reviewData, userId: userId, weekKey: weekKey, sharedWith: cleanSharedWith } }, 
                     upsert: true
                 }
             };
         }).filter(op => op !== null);


        if (bulkOps.length > 0) {
             logDebug(`Save API: Performing bulkWrite for owned weeklyReviews`, logContext, {opCount: bulkOps.length}, userId);
             await collection.bulkWrite(bulkOps as any, { session }); 
             logInfo(`Save API: Successfully saved/updated ${bulkOps.length} owned weeklyReviews`, logContext, userId);
         } else {
             logDebug(`Save API: No valid owned reviews to save.`, logContext, userId);
         }
    } catch (error: any) {
        logError(`Save API: DB Error saving owned weeklyReviews`, error, logContext, userId);
        throw new Error(`Failed to save owned weekly reviews: ${error.message}`);
    }
}

async function saveUserProfileData(db: any, userId: string, startDate?: string, endDate?: string, gettingStartedDismissed?: boolean, session?: ClientSession) { 
    const logContext = { userId, operation: 'saveUserProfileData', apiRoute: '/api/save' };
    logDebug(`Save API: Starting save for user profile data`, logContext, userId);

    if (startDate === undefined && endDate === undefined && gettingStartedDismissed === undefined) {
        logDebug(`Save API: No user profile data fields provided. Skipping profile update.`, logContext, userId);
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
                logWarn(`Save API: Invalid start date format received.`, { ...logContext, startDateValue: startDate }, userId); 
            }
        }
        if (endDate !== undefined) {
            try { 
                updateDoc.statementEndDate = endDate ? new Date(endDate) : null; 
            } catch { 
                updateDoc.statementEndDate = null; 
                logWarn(`Save API: Invalid end date format received.`, { ...logContext, endDateValue: endDate }, userId); 
            }
        }
        if (gettingStartedDismissed !== undefined) {
            updateDoc.gettingStartedDismissed = gettingStartedDismissed;
        }

        if (Object.keys(updateDoc).length > 0) {
             logDebug(`Save API: Updating user profile`, logContext, {updateData: updateDoc}, userId);
             await collection.updateOne(
                 { userId },
                 { $set: updateDoc },
                 session ? { upsert: true, session } : { upsert: true }
             );
             logInfo(`Save API: Successfully saved user profile data`, logContext, userId);
         } else {
              logDebug(`Save API: No valid user profile fields to update.`, logContext, userId);
         }
    } catch (error: any) {
        logError(`Save API: DB Error saving user profile data`, error, logContext, userId);
        throw new Error(`Failed to save user profile data: ${error.message}`);
    }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  addCorsHeaders(response);
  return response;
}

export async function POST(request: Request) {
  const { userId } = auth();
  
  const logContextBase = { userId: userId || 'unknown-save-post', operation: 'POST /api/save', apiRoute: '/api/save' };

  if (!userId) {
    logWarn('Save API: Unauthorized save attempt: User not logged in.', logContextBase, userId);
    const response = NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    return addCorsHeaders(response);
  }

  const { success, limit, remaining, reset } = await ratelimit.limit(userId);
  const logContextWithRateLimit = { ...logContextBase, rateLimit: { limit, remaining, reset } };

  if (!success) {
      logWarn('Save API: Rate limit exceeded.', logContextWithRateLimit, userId);
       const response = NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
       return addCorsHeaders(response);
  }
  logDebug('Save API: Rate limit check passed.', logContextWithRateLimit, userId);

  let rawPayload: any;
  try {
    rawPayload = await request.json();
  } catch (error: any) {
    logError('Save API: Invalid request body - JSON parsing failed.', error, logContextWithRateLimit, userId);
    const response = NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    return addCorsHeaders(response);
  }

  const validationResult = SaveDataPayloadSchema.safeParse(rawPayload);
  if (!validationResult.success) {
    logWarn('Save API: Invalid payload structure or data types.', { ...logContextWithRateLimit, errors: validationResult.error.flatten() }, userId);
    const response = NextResponse.json({ error: 'Invalid payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    return addCorsHeaders(response);
  }
  
  const payload = validationResult.data;
  const { dataHash, ...receivedData } = payload;
  const preparedDataForVerification = prepareDataForHashing(receivedData as any); 
  const dataString = stringify(preparedDataForVerification);
  const calculatedServerHash = await hashData(dataString);

  logDebug(`Save API: Received hash: ${dataHash}, Calculated server hash: ${calculatedServerHash}`, logContextWithRateLimit, userId);

  const isValid = await verifyHash(dataString, dataHash);

  if (!isValid) {
    logError('Save API: Data integrity check failed!', { clientHash: dataHash, serverHash: calculatedServerHash, dataStringTruncated: dataString.substring(0, 300) + (dataString.length > 300 ? "..." : "") }, logContextWithRateLimit, userId);
    const response = NextResponse.json({ error: 'Data integrity check failed. Save aborted.' }, { status: 400 });
    return addCorsHeaders(response);
  }
  logInfo('Save API: Data integrity check passed. Proceeding with save.', logContextWithRateLimit, userId);

  const client = await connectToDatabase();
  const db = client.db();
  const session = client.startSession(); 

  try {
    logInfo('Save API: Starting MongoDB transaction.', logContextWithRateLimit, userId);
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
    logInfo('Save API: MongoDB transaction committed successfully.', logContextWithRateLimit, userId);
     const response = NextResponse.json({ message: `Data saved successfully for user ${userId}` });
     return addCorsHeaders(response);
  } catch (error: any) {
    logError('Save API: MongoDB transaction failed or aborted.', error, logContextWithRateLimit, userId);
    const errorMessage = error instanceof Error ? `Failed to save data: ${error.message}` : 'An unknown error occurred during save.';
     const response = NextResponse.json({ error: errorMessage }, { status: 500 });
     return addCorsHeaders(response);
  } finally {
     await session.endSession(); 
     logDebug('Save API: MongoDB session ended.', logContextWithRateLimit, userId);
  }
}
