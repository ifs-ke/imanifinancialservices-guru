// src/app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError } from '@/lib/logger';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

async function getCollectionData<T>(db: any, collectionName: string, userId: string): Promise<T[]> {
    const logContext = { userId, collectionName, operation: 'getCollectionData' };
    try {
        const collection = db.collection(collectionName);
        await collection.createIndex({ userId: 1 });
        const data = await collection.find({ userId }, { projection: { _id: 0, userId: 0 } }).toArray();
        logInfo(`Fetched ${data.length} items from ${collectionName}`, logContext);
        return (data || []).map((item: any) => {
            for (const dateKey of ['date', 'timestamp']) {
                if (item[dateKey] && !(item[dateKey] instanceof Date)) {
                    try {
                        const parsedDate = new Date(item[dateKey]);
                        if (isNaN(parsedDate.getTime())) throw new Error("Invalid date format from DB");
                        item[dateKey] = parsedDate;
                    } catch (e) {
                        logWarn(`Invalid ${dateKey} format for item ID ${item.id || 'N/A'}. Defaulting date.`, { ...logContext, itemDateValue: item[dateKey] });
                        item[dateKey] = new Date();
                    }
                }
            }
            return item as T;
        });
    } catch (error) {
        logError(`Error fetching ${collectionName}`, error, logContext);
        return [];