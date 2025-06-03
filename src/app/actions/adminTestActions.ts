
// src/app/actions/adminTestActions.ts
'use server';

import prisma from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { logError, logInfo } from '@/lib/logger';

export async function checkDatabaseConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  try {
    // A simple query to check connectivity, e.g., count users or a specific table.
    // Using User table count as it should exist with Clerk integration.
    const userCount = await prisma.user.count();
    logInfo('Database connection test successful.', { userId, userCount });
    return { success: true, message: `Successfully connected to the database. Found ${userCount} user(s).` };
  } catch (error: any) {
    logError('Database connection test failed.', error, { userId });
    return { success: false, message: `Database connection failed: ${error.message}` };
  }
}

export async function saveTestData(data: string): Promise<{ success: boolean; message: string; entryId?: string }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }
  if (!data || typeof data !== 'string' || data.trim() === '') {
    return { success: false, message: 'Test data cannot be empty.' };
  }

  try {
    const newEntry = await prisma.testEntry.create({
      data: {
        userId: userId,
        data: data.trim(),
      },
    });
    logInfo('Test data saved successfully.', { userId, entryId: newEntry.id });
    return { success: true, message: 'Test data saved successfully.', entryId: newEntry.id };
  } catch (error: any) {
    logError('Failed to save test data.', error, { userId, data });
    return { success: false, message: `Failed to save test data: ${error.message}` };
  }
}

export async function fetchTestData(): Promise<{ success: boolean; message: string; data?: { id: string; data: string; createdAt: Date } | null }> {
  const { userId } = auth();
  if (!userId) {
    return { success: false, message: 'User not authenticated.' };
  }

  try {
    const entry = await prisma.testEntry.findFirst({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }, // Get the latest entry
      select: { id: true, data: true, createdAt: true },
    });

    if (entry) {
      logInfo('Test data fetched successfully.', { userId, entryId: entry.id });
      return { success: true, message: 'Latest test data fetched successfully.', data: entry };
    } else {
      logInfo('No test data found for user.', { userId });
      return { success: true, message: 'No test data found for this user.', data: null };
    }
  } catch (error: any) {
    logError('Failed to fetch test data.', error, { userId });
    return { success: false, message: `Failed to fetch test data: ${error.message}` };
  }
}
