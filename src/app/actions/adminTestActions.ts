
// src/app/actions/adminTestActions.ts
'use server';

import prisma from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { hashData, verifyHash } // verifyHash might not be directly used here but good to have if we expand
from '@/lib/storage-utils';
import { ensureUserInDb } from '@/app/actions/shareActions';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';

export async function checkDatabaseConnection(): Promise<{ success: boolean; message: string; data?: any; duration?: number }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  const startTime = performance.now();
  try {
    const userCount = await prisma.user.count();
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Database connection test successful. User: ${userId}`, { userId, userCount, duration });
    return { success: true, message: `Successfully connected. Found ${userCount} user(s).`, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Database connection test failed. User: ${userId}`, { error, userId, duration });
    return { success: false, message: `Database connection failed: ${error.message}`, duration };
  }
}

export async function saveTestData(data: string): Promise<{ success: boolean; message: string; entryId?: string; duration?: number }> {
  const { userId, user: clerkUser } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  if (!clerkUser || !clerkUser.primaryEmailAddress?.emailAddress) {
    return { success: false, message: 'User not authenticated or essential Clerk user details (like primary email) are missing.' };
  }
  if (!data || typeof data !== 'string' || data.trim() === '') {
    return { success: false, message: 'Test data cannot be empty.' };
  }

  const primaryEmail = clerkUser.primaryEmailAddress.emailAddress;


  const startTime = performance.now();
  try {
    await ensureUserInDb(userId, primaryEmail, clerkUser.fullName);
    console.info(`[AdminActions] User ${userId} ensured in DB. Proceeding to save test data.`);

    const newEntry = await prisma.testEntry.create({
      data: {
        userId: userId,
        data: data.trim(),
      },
    });
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Test data saved successfully. User: ${userId}`, { userId, entryId: newEntry.id, duration });
    return { success: true, message: 'Test data saved successfully.', entryId: newEntry.id, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Failed to save test data. User: ${userId}`, { error, userId, data, duration });
    if (error.message && error.message.includes('Foreign key constraint failed')) {
        return { success: false, message: `Failed to save test data due to a database relationship issue. Error: ${error.message}`, duration };
    }
    return { success: false, message: `Failed to save test data: ${error.message}`, duration };
  }
}

export async function fetchTestData(): Promise<{ success: boolean; message: string; data?: { id: string; data: string; createdAt: Date } | null; duration?: number }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }

  const startTime = performance.now();
  try {
    const entry = await prisma.testEntry.findFirst({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, data: true, createdAt: true },
    });
    const duration = performance.now() - startTime;

    if (entry) {
      console.info(`[AdminActions] Test data fetched successfully. User: ${userId}`, { userId, entryId: entry.id, duration });
      return { success: true, message: 'Latest test data fetched.', data: entry, duration };
    } else {
      console.info(`[AdminActions] No test data found for user. User: ${userId}`, { userId, duration });
      return { success: true, message: 'No test data found.', data: null, duration };
    }
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Failed to fetch test data. User: ${userId}`, { error, userId, duration });
    return { success: false, message: `Failed to fetch test data: ${error.message}`, duration };
  }
}

export async function getHashForServerComparison(dataString: string): Promise<{ success: boolean; serverHash?: string; duration?: number; message?: string }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  console.debug(`[AdminActions] getHashForServerComparison called. User: ${userId}`, { userId, dataStringLength: dataString.length });
  const startTime = performance.now();
  try {
    const serverHash = await hashData(dataString);
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Server hash calculated for string comparison. User: ${userId}`, { userId, serverHash, duration });
    return { success: true, serverHash, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Failed to calculate server hash for string comparison. User: ${userId}`, { error, userId, duration });
    return { success: false, message: `Failed to calculate server hash: ${error.message}`, duration };
  }
}

export async function getHashForServerPreparedObject(rawData: any): Promise<{ success: boolean; serverPreparedString?: string; serverHash?: string; duration?: number; message?: string }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  console.debug(`[AdminActions] getHashForServerPreparedObject called. User: ${userId}`, { userId });
  const startTime = performance.now();
  try {
    const serverPreparedData = prepareDataForHashing(rawData);
    const serverPreparedString = stringify(serverPreparedData);
    const serverHash = await hashData(serverPreparedString);
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Server hash calculated for server-prepared object. User: ${userId}`, { userId, serverHash, serverPreparedStringLength: serverPreparedString.length, duration });
    return { success: true, serverPreparedString, serverHash, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Failed to prepare/hash object on server. User: ${userId}`, { error, userId, duration });
    return { success: false, message: `Failed to prepare/hash object on server: ${error.message}`, duration };
  }
}

// --- New Database CRUD Test Actions ---
export async function createMultipleTestEntries(entriesData: { data: string }[]): Promise<{ success: boolean; message: string; createdIds?: string[]; duration?: number }> {
  const { userId, user: clerkUser } = auth();
   if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  if (!clerkUser || !clerkUser.primaryEmailAddress?.emailAddress) {
    return { success: false, message: 'User not authenticated or essential Clerk user details (like primary email) are missing.' };
  }
  const startTime = performance.now();
  try {
    await ensureUserInDb(userId, clerkUser.primaryEmailAddress.emailAddress, clerkUser.fullName);
    const createdEntries = await prisma.testEntry.createMany({
      data: entriesData.map(entry => ({ userId, data: entry.data })),
    });
    // Note: createMany for PostgreSQL doesn't return IDs directly in the same way.
    // We'll fetch them back for confirmation if needed, or just return count.
    // For simplicity, returning count for now.
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Created ${createdEntries.count} test entries for user ${userId}.`, { duration });
    // Fetching IDs to return
    const newEntries = await prisma.testEntry.findMany({
        where: {userId},
        orderBy: { createdAt: 'desc'},
        take: entriesData.length
    });
    return { success: true, message: `${createdEntries.count} entries created.`, createdIds: newEntries.map(e => e.id).reverse(), duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Error creating multiple test entries for user ${userId}:`, error, {duration});
    return { success: false, message: `Error: ${error.message}`, duration };
  }
}

export async function readAllTestEntries(): Promise<{ success: boolean; message: string; entries?: { id: string; data: string }[]; duration?: number }> {
  const { userId } = auth();
  if (!userId) return { success: false, message: 'User not authenticated.' };
  const startTime = performance.now();
  try {
    const entries = await prisma.testEntry.findMany({
      where: { userId },
      select: { id: true, data: true },
      orderBy: { createdAt: 'asc' },
    });
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Read ${entries.length} test entries for user ${userId}.`, { duration });
    return { success: true, message: `${entries.length} entries fetched.`, entries, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
     console.error(`[AdminActions] Error reading test entries for user ${userId}:`, error, {duration});
    return { success: false, message: `Error: ${error.message}`, duration };
  }
}

export async function updateSingleTestEntry(id: string, newData: string): Promise<{ success: boolean; message: string; updatedId?: string; duration?: number }> {
  const { userId } = auth();
  if (!userId) return { success: false, message: 'User not authenticated.' };
  const startTime = performance.now();
  try {
    const updatedEntry = await prisma.testEntry.update({
      where: { id, userId }, // Ensure user owns the entry
      data: { data: newData },
    });
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Updated test entry ${id} for user ${userId}.`, { duration });
    return { success: true, message: `Entry ${id} updated.`, updatedId: updatedEntry.id, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Error updating test entry ${id} for user ${userId}:`, error, {duration});
    return { success: false, message: `Error updating entry ${id}: ${error.message}`, duration };
  }
}

export async function deleteSingleTestEntry(id: string): Promise<{ success: boolean; message: string; deletedId?: string; duration?: number }> {
  const { userId } = auth();
  if (!userId) return { success: false, message: 'User not authenticated.' };
  const startTime = performance.now();
  try {
    const deletedEntry = await prisma.testEntry.delete({
      where: { id, userId }, // Ensure user owns the entry
    });
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Deleted test entry ${id} for user ${userId}.`, { duration });
    return { success: true, message: `Entry ${id} deleted.`, deletedId: deletedEntry.id, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
     console.error(`[AdminActions] Error deleting test entry ${id} for user ${userId}:`, error, {duration});
    return { success: false, message: `Error deleting entry ${id}: ${error.message}`, duration };
  }
}

export async function deleteAllUserTestEntries(): Promise<{ success: boolean; message: string; count?: number; duration?: number }> {
  const { userId } = auth();
  if (!userId) return { success: false, message: 'User not authenticated.' };
  const startTime = performance.now();
  try {
    const { count } = await prisma.testEntry.deleteMany({
      where: { userId },
    });
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Deleted ${count} test entries for user ${userId}.`, { duration });
    return { success: true, message: `${count} entries deleted.`, count, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Error deleting all test entries for user ${userId}:`, error, {duration});
    return { success: false, message: `Error: ${error.message}`, duration };
  }
}

export async function getClerkUserInfo(): Promise<{ success: boolean; message: string; userInfo?: Record<string, any>; duration?: number }> {
  const { userId, user: clerkUser } = auth();
  const startTime = performance.now();

  if (!userId) {
    return { success: false, message: 'User not authenticated.', duration: performance.now() - startTime };
  }
  if (!clerkUser) {
    // This can happen if Clerk session is present but full user object isn't hydrated yet.
    return { success: false, message: 'Clerk user details not available at this moment. Try again.', duration: performance.now() - startTime };
  }

  try {
    const userInfoToReturn = {
      id: clerkUser.id,
      primaryEmail: clerkUser.primaryEmailAddress?.emailAddress,
      fullName: clerkUser.fullName,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      username: clerkUser.username,
      createdAt: clerkUser.createdAt ? new Date(clerkUser.createdAt).toLocaleString() : null,
      updatedAt: clerkUser.updatedAt ? new Date(clerkUser.updatedAt).toLocaleString() : null,
      lastSignInAt: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt).toLocaleString() : null,
      // Only include metadata if necessary and be mindful of what's exposed
      // publicMetadata: clerkUser.publicMetadata,
      // privateMetadata: clerkUser.privateMetadata, // Be very cautious exposing privateMetadata
      // unsafeMetadata: clerkUser.unsafeMetadata,   // Be very cautious exposing unsafeMetadata
    };
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Fetched Clerk user info. User: ${userId}`, { userId, duration });
    return { success: true, message: 'Clerk user information fetched.', userInfo: userInfoToReturn, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Failed to fetch Clerk user info. User: ${userId}`, { error, userId, duration });
    return { success: false, message: `Failed to fetch Clerk user info: ${error.message}`, duration };
  }
}
    
