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
import prisma from '@/lib/prisma';

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
        throw new Error(`Failed to search for user: ${error.message}.`);
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

    if (currentUserId === targetUserId) {
        logWarn('shareReviewApi: User attempted to share a review with themselves.', { weekKey, targetUserId, currentUserId });
        throw new Error('You cannot share a review with yourself.');
    }

    try {
        // Ensure the weekly review exists for the owner (currentUserId) and weekKey
        let review = await prisma.weeklyReview.findUnique({
            where: { userId_weekKey: { userId: currentUserId, weekKey } },
        });

        if (!review) {
            // If the review doesn't exist, create a shell for it before sharing
            logInfo(`shareReviewApi: WeeklyReview for ${currentUserId} week ${weekKey} not found. Creating shell.`, { currentUserId, weekKey, targetUserId });
            review = await prisma.weeklyReview.create({
                data: {
                    userId: currentUserId,
                    weekKey: weekKey,
                    journal: "", // Default empty journal
                },
            });
        }

        // Create the share record
        await prisma.sharedReview.create({
            data: {
                weekKey: weekKey,
                reviewOwnerId: currentUserId,
                sharedWithId: targetUserId,
            },
        });
        logInfo(`shareReviewApi: Review ${weekKey} owned by ${currentUserId} shared with ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
    } catch (error: any) {
        if (error.code === 'P2002') { // Unique constraint violation
            logWarn(`shareReviewApi: Review ${weekKey} by ${currentUserId} already shared with ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
            // Optionally, don't throw an error, just log it as it's already shared.
            // throw new Error('This review is already shared with the selected user.');
            return; // Consider it a success if already shared
        }
        logError('Error sharing review in DB', error, { weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
        throw new Error(`Failed to share review: ${error.message}`);
    }
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

    try {
        await prisma.sharedReview.deleteMany({
            where: {
                weekKey: weekKey,
                reviewOwnerId: currentUserId,
                sharedWithId: targetUserId,
            },
        });
        logInfo(`revokeShareApi: Share for review ${weekKey} owned by ${currentUserId} revoked from ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
    } catch (error: any) {
        logError('Error revoking share in DB', error, { weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
        throw new Error(`Failed to revoke share: ${error.message}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const { userId: currentUserId } = auth();
    if (!currentUserId) {
        logWarn('getSharedWithUsersApi: Unauthenticated attempt.', { apiAction: 'getSharedWithUsersApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = GetSharedWithUsersInputSchema.safeParse({ weekKey });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for getSharedWithUsersApi', { errors, apiAction: 'getSharedWithUsersApi', receivedWeekKey: weekKey, currentUserId });
        throw new Error(`Invalid input: ${errors.fieldErrors.weekKey?.[0] || 'Invalid weekKey'}`);
    }

    try {
        const shares = await prisma.sharedReview.findMany({
            where: {
                weekKey: weekKey,
                reviewOwnerId: currentUserId,
            },
            select: {
                sharedWithId: true,
            },
        });

        if (shares.length === 0) {
            return [];
        }

        const sharedWithUserIds = shares.map(share => share.sharedWithId);
        const clerkUsers = await clerkClient.users.getUserList({ userId: sharedWithUserIds });

        const userShareInfoList: UserShareInfo[] = clerkUsers.data.map(clerkUser => ({
            userId: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress || 'No email',
            name: clerkUser.fullName || clerkUser.firstName || clerkUser.username || 'Clerk User',
        }));
        logInfo(`getSharedWithUsersApi: Fetched ${userShareInfoList.length} users shared with for review ${weekKey} by ${currentUserId}.`, { currentUserId, weekKey });
        return userShareInfoList;
    } catch (error: any) {
        logError('Error fetching shared users list', error, { weekKey, reviewOwnerId: currentUserId });
        throw new Error(`Failed to fetch shared users: ${error.message}`);
    }
}

// Helper to ensure user exists in your DB, creating if not.
// Call this after Clerk authentication.
export async function ensureUserInDb(userId: string, email: string, name?: string | null) {
    try {
        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            logInfo(`User ${userId} not found in DB. Creating...`, { userId, email, name });
            user = await prisma.user.create({
                data: {
                    id: userId,
                    email: email,
                    name: name,
                },
            });
        }
        return user;
    } catch (error: any) {
        logError('Error ensuring user in DB', error, { userId, email, name });
        // Depending on policy, you might want to throw or handle this gracefully
        throw new Error('Failed to ensure user record in database.');
    }
}
