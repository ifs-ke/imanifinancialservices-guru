
// src/app/actions/adminTestActions.ts
'use server';

import prisma from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { logError, logInfo, logDebug } from '@/lib/logger';
import { hashData } from '@/lib/storage-utils'; // Import hashData

export async function checkDatabaseConnection(): Promise<{ success: boolean; message: string; data?: any; duration?: number }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  const startTime = performance.now();
  try {
    const userCount = await prisma.user.count();
    const duration = performance.now() - startTime;
    logInfo('Database connection test successful.', { userId, userCount, duration });
    return { success: true, message: `Successfully connected. Found ${userCount} user(s).`, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    logError('Database connection test failed.', error, { userId, duration });
    return { success: false, message: `Database connection failed: ${error.message}`, duration };
  }
}

export async function saveTestData(data: string): Promise<{ success: boolean; message: string; entryId?: string; duration?: number }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  if (!data || typeof data !== 'string' || data.trim() === '') {
    return { success: false, message: 'Test data cannot be empty.' };
  }

  const startTime = performance.now();
  try {
    const newEntry = await prisma.testEntry.create({
      data: {
        userId: userId,
        data: data.trim(),
      },
    });
    const duration = performance.now() - startTime;
    logInfo('Test data saved successfully.', { userId, entryId: newEntry.id, duration });
    return { success: true, message: 'Test data saved successfully.', entryId: newEntry.id, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    logError('Failed to save test data.', error, { userId, data, duration });
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
      logInfo('Test data fetched successfully.', { userId, entryId: entry.id, duration });
      return { success: true, message: 'Latest test data fetched.', data: entry, duration };
    } else {
      logInfo('No test data found for user.', { userId, duration });
      return { success: true, message: 'No test data found.', data: null, duration };
    }
  } catch (error: any) {
    const duration = performance.now() - startTime;
    logError('Failed to fetch test data.', error, { userId, duration });
    return { success: false, message: `Failed to fetch test data: ${error.message}`, duration };
  }
}

export async function getHashForServerComparison(dataString: string): Promise<{ success: boolean; serverHash?: string; duration?: number; message?: string }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  logDebug("getHashForServerComparison called", { userId, dataStringLength: dataString.length });
  const startTime = performance.now();
  try {
    const serverHash = await hashData(dataString);
    const duration = performance.now() - startTime;
    logInfo('Server hash calculated for comparison.', { userId, serverHash, duration });
    return { success: true, serverHash, duration };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    logError('Failed to calculate server hash for comparison.', error, { userId, duration });
    return { success: false, message: `Failed to calculate server hash: ${error.message}`, duration };
  }
}
