
// src/app/actions/adminTestActions.ts
'use server';

import prisma from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { hashData } from '@/lib/storage-utils';
import { ensureUserInDb } from '@/app/actions/shareActions'; // Import the function

export async function checkDatabaseConnection(): Promise<{ success: boolean; message: string; data?: any; duration?: number }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  const startTime = performance.now();
  try {
    // Attempt to count users. This assumes a User table exists as per typical setup.
    // If it doesn't, this might fail, but the original error is about TestEntry.
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
  const { userId, user: clerkUser } = auth(); // Get full clerkUser object
  if (!userId || !clerkUser) {
    return { success: false, message: 'User not authenticated or Clerk user details missing.' };
  }
  if (!data || typeof data !== 'string' || data.trim() === '') {
    return { success: false, message: 'Test data cannot be empty.' };
  }

  const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress;
  if (!primaryEmail) {
    return { success: false, message: 'Primary email address for the user is not available.' };
  }

  const startTime = performance.now();
  try {
    // Ensure user exists in the database before creating a TestEntry that references them
    await ensureUserInDb(userId, primaryEmail, clerkUser.fullName);
    console.info(`[AdminActions] User ${userId} ensured in DB. Proceeding to save test data.`);

    const newEntry = await prisma.testEntry.create({
      data: {
        userId: userId, // This should now reference an existing user
        data: data.trim(),
      },
    });
    const duration = performance.now() - startTime;
    console.info(`[AdminActions] Test data saved successfully. User: ${userId}`, { userId, entryId: newEntry.id, duration });
    return { success: true, message: 'Test data saved successfully.', entryId: newEntry.id, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Failed to save test data. User: ${userId}`, { error, userId, data, duration });
    // Check if the error is specifically about the foreign key constraint to give a more targeted message if needed
    if (error.message && error.message.includes('Foreign key constraint failed')) {
        return { success: false, message: `Failed to save test data due to a database relationship issue. Ensure user record is properly created. Error: ${error.message}`, duration };
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
    console.info(`[AdminActions] Server hash calculated for comparison. User: ${userId}`, { userId, serverHash, duration });
    return { success: true, serverHash, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    console.error(`[AdminActions] Failed to calculate server hash for comparison. User: ${userId}`, { error, userId, duration });
    return { success: false, message: `Failed to calculate server hash: ${error.message}`, duration };
  }
}
    