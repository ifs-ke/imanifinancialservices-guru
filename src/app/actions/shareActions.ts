
// src/app/actions/shareActions.ts
'use server';

import type { UserShareInfo } from '@/lib/types';
import {
    SearchUserByEmailInputSchema,
    ShareReviewInputSchema,
    RevokeShareInputSchema,
    GetSharedWithUsersInputSchema
} from '@/lib/schemas';
import { logWarn, logError, logInfo } from '@/lib/logger';
import { auth, clerkClient } from '@clerk/nextjs/server';

const LOCAL_ONLY_ERROR_MESSAGE = 'Sharing features are disabled in local-only mode as there is no central database for users or shared data.';

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const { userId: currentUserId } = auth();
    if (!currentUserId) {
        logWarn('searchUserByEmailApi: Unauthenticated attempt.', { apiAction: 'searchUserByEmailApi' });
        throw new Error('User not authenticated.');
    }

    const validationResult = SearchUserByEmailInputSchema.safeParse({ email });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for searchUserByEmailApi', { errors, apiAction: 'searchUserByEmailApi', receivedEmail: email, currentUserId });
        throw new Error(`Invalid input: ${errors.fieldErrors.email?.[0] || 'Invalid email'}`);
    }

    // In a real scenario, we would search Clerk users if the feature was not DB dependent.
    // Since DB is removed, true sharing is not possible.
    // For demonstration, if we were to use Clerk directly for user listing (requires appropriate permissions/plan):
    try {
        const users = await clerkClient.users.getUserList({ emailAddress: [email.trim().toLowerCase()] });
        if (users && users.data.length > 0) {
            const foundUser = users.data[0];
            if (foundUser.id === currentUserId) {
                logInfo('searchUserByEmailApi: User attempted to search for themselves.', { email, currentUserId });
                return null; // Cannot share with oneself
            }
            logInfo(`searchUserByEmailApi: Found user ${foundUser.id} for email ${email}`, { targetUserId: foundUser.id, currentUserId });
            return {
                userId: foundUser.id,
                email: foundUser.primaryEmailAddress?.emailAddress || email,
                name: foundUser.fullName || foundUser.firstName || foundUser.username || 'Clerk User',
            };
        }
        logInfo(`searchUserByEmailApi: No user found for email ${email}`, { currentUserId });
        return null;
    } catch (error: any) {
        logError('Error searching Clerk users by email', error, { emailToSearch: email, currentUserId, apiAction: 'searchUserByEmailApi' });
        // For local-only, still indicate feature limitation
        // throw new Error(LOCAL_ONLY_ERROR_MESSAGE);
        throw new Error(`Failed to search for user: ${error.message}. Sharing features might be limited.`);
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth();
    if (!currentUserId) {
        logWarn('shareReviewApi: Unauthenticated attempt.', { apiAction: 'shareReviewApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = ShareReviewInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for shareReviewApi', { errors, apiAction: 'shareReviewApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId, currentUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }
    logWarn(`shareReviewApi: Attempt to share review ${weekKey} with ${targetUserId}. ${LOCAL_ONLY_ERROR_MESSAGE}`, { currentUserId, targetUserId, weekKey, apiAction: 'shareReviewApi' });
    throw new Error(LOCAL_ONLY_ERROR_MESSAGE);
    // Original Prisma logic removed
}

export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth();
    if (!currentUserId) {
        logWarn('revokeShareApi: Unauthenticated attempt.', { apiAction: 'revokeShareApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = RevokeShareInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for revokeShareApi', { errors, apiAction: 'revokeShareApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId, currentUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }
    logWarn(`revokeShareApi: Attempt to revoke share for review ${weekKey} from ${targetUserId}. ${LOCAL_ONLY_ERROR_MESSAGE}`, { currentUserId, targetUserId, weekKey, apiAction: 'revokeShareApi' });
    throw new Error(LOCAL_ONLY_ERROR_MESSAGE);
    // Original Prisma logic removed
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const { userId: currentUserId } = auth();
    if (!currentUserId) {
        logWarn('getSharedWithUsersApi: Unauthenticated attempt.', { apiAction: 'getSharedWithUsersApi' });
        // Allow fetching shared list even if unauthenticated for the component to render an empty state,
        // but actual data would only be available if user was authenticated and review actually shared.
        // throw new Error('User not authenticated.');
    }
    const validationResult = GetSharedWithUsersInputSchema.safeParse({ weekKey });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for getSharedWithUsersApi', { errors, apiAction: 'getSharedWithUsersApi', receivedWeekKey: weekKey, currentUserId });
        throw new Error(`Invalid input: ${errors.fieldErrors.weekKey?.[0] || 'Invalid weekKey'}`);
    }
    logWarn(`getSharedWithUsersApi: Attempt to fetch shared users for review ${weekKey}. ${LOCAL_ONLY_ERROR_MESSAGE}`, { currentUserId, weekKey, apiAction: 'getSharedWithUsersApi' });
    return []; // No database to fetch from in local-only mode
    // Original Prisma logic removed
}
