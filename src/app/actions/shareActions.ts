
// src/app/actions/shareActions.ts
'use server';

import type { UserShareInfo } from '@/lib/types';
import {
    SearchUserByEmailInputSchema,
    ShareReviewInputSchema,
    RevokeShareInputSchema,
    GetSharedWithUsersInputSchema
} from '@/lib/schemas';
import { currentUser, clerkClient } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';
import { logInfo, logWarn, logError } from '@/lib/logger';

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const user = await currentUser();
    const currentUserId = user?.id;
    if (!currentUserId) {
        logWarn('[ShareActions] searchUserByEmailApi: Unauthenticated attempt.', { apiAction: 'searchUserByEmailApi' });
        throw new Error('User not authenticated.');
    }

    const validationResult = SearchUserByEmailInputSchema.safeParse({ email });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('[ShareActions] Invalid input for searchUserByEmailApi', { errors, apiAction: 'searchUserByEmailApi', receivedEmail: email, currentUserId });
        throw new Error(`Invalid input: ${errors.fieldErrors.email?.[0] || 'Invalid email'}`);
    }

    try {
        const users = await clerkClient.users.getUserList({ emailAddress: [email.trim().toLowerCase()] });
        if (users && users.data.length > 0) {
            const foundUser = users.data[0];
            if (foundUser.id === currentUserId) {
                logInfo(`[ShareActions] searchUserByEmailApi: User attempted to search for themselves. User: ${currentUserId}`, { email, currentUserId });
                // It's okay to return the user's own info if they search themselves,
                // the share dialog should prevent sharing with self.
                return {
                    userId: foundUser.id,
                    email: foundUser.primaryEmailAddress?.emailAddress || email,
                    name: foundUser.fullName || foundUser.firstName || foundUser.username || 'Clerk User',
                };
            }
            logInfo(`[ShareActions] searchUserByEmailApi: Found user ${foundUser.id} for email ${email}. CurrentUser: ${currentUserId}`, { targetUserId: foundUser.id, currentUserId });
            return {
                userId: foundUser.id,
                email: foundUser.primaryEmailAddress?.emailAddress || email,
                name: foundUser.fullName || foundUser.firstName || foundUser.username || 'Clerk User',
            };
        }
        logInfo(`[ShareActions] searchUserByEmailApi: No user found for email ${email}. CurrentUser: ${currentUserId}`);
        return null;
    } catch (error: any) {
        logError('[ShareActions] Error searching Clerk users by email', error, { emailToSearch: email, currentUserId, apiAction: 'searchUserByEmailApi' });
        throw new Error(`Failed to search for user: ${error.message}.`);
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const user = await currentUser();
    const currentUserId = user?.id;
    const currentUsername = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'A user';

    if (!currentUserId) {
        logWarn('[ShareActions] shareReviewApi: Unauthenticated attempt.', { apiAction: 'shareReviewApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = ShareReviewInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('[ShareActions] Invalid input for shareReviewApi', { errors, apiAction: 'shareReviewApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId, currentUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }

    if (currentUserId === targetUserId) {
        logWarn(`[ShareActions] shareReviewApi: User attempted to share a review with themselves. User: ${currentUserId}`, { weekKey, targetUserId, currentUserId });
        throw new Error('You cannot share a review with yourself.');
    }

    try {
        // Ensure the sharer exists in our User table (important for relations)
        await ensureUserInDb(currentUserId, user.primaryEmailAddress!.emailAddress!, user.fullName);
        // Ensure the target user exists in our User table
        const targetClerkUser = await clerkClient.users.getUser(targetUserId);
        if (!targetClerkUser || !targetClerkUser.primaryEmailAddress?.emailAddress) {
            throw new Error(`Recipient user ${targetUserId} not found or missing email in Clerk.`);
        }
        await ensureUserInDb(targetUserId, targetClerkUser.primaryEmailAddress.emailAddress, targetClerkUser.fullName);


        let review = await prisma.weeklyReview.findUnique({
            where: { userId_weekKey: { userId: currentUserId, weekKey } },
        });

        if (!review) {
            logInfo(`[ShareActions] shareReviewApi: WeeklyReview for ${currentUserId} week ${weekKey} not found. Creating shell.`, { currentUserId, weekKey, targetUserId });
            review = await prisma.weeklyReview.create({
                data: {
                    userId: currentUserId,
                    weekKey: weekKey,
                    journal: "", // Default empty journal
                    transactionComments: {}, // Default empty comments
                },
            });
        }

        // Create or update the share link
        await prisma.sharedReview.upsert({
            where: { reviewOwnerId_sharedWithId_weekKey: { reviewOwnerId: currentUserId, sharedWithId: targetUserId, weekKey } },
            update: {}, // No fields to update if it exists, just ensure it's there
            create: {
                weekKey: weekKey,
                reviewOwnerId: currentUserId,
                sharedWithId: targetUserId,
            },
        });

        // Create a notification for the recipient
        await prisma.notification.create({
            data: {
                userId: targetUserId,
                type: 'collaboration',
                title: 'Review Shared With You',
                message: `${currentUsername} shared their weekly review (${weekKey}) with you.`,
                link: '/weekly-review', // Link to the general weekly review page
            }
        });

        logInfo(`[ShareActions] shareReviewApi: Review ${weekKey} owned by ${currentUserId} shared with ${targetUserId}. Notification created.`, { currentUserId, targetUserId, weekKey });
    } catch (error: any) {
        if (error.code === 'P2002') { // Unique constraint violation (already shared)
            logWarn(`[ShareActions] shareReviewApi: Review ${weekKey} by ${currentUserId} already effectively shared with ${targetUserId}. Ensuring notification.`, { currentUserId, targetUserId, weekKey });
            // Attempt to create notification again in case it failed or wasn't created before
            try {
                await prisma.notification.create({
                    data: {
                        userId: targetUserId,
                        type: 'collaboration',
                        title: 'Review Shared With You',
                        message: `${currentUsername} shared their weekly review (${weekKey}) with you.`,
                        link: '/weekly-review',
                    },
                    // No `skipDuplicates` in Prisma create, so this might error if notification also exists.
                    // For robustness, one might check for an existing unread notification of this type first.
                });
            } catch (notifError: any) {
                if (notifError.code !== 'P2002') { // If it's not a unique constraint error for notification
                    logError('[ShareActions] Error creating notification for already shared review', { error: notifError, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
                }
            }
            return; 
        }
        logError('[ShareActions] Error sharing review or creating notification', { error, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
        throw new Error(`Failed to share review: ${error.message}`);
    }
}

export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const user = await currentUser();
    const currentUserId = user?.id;
    if (!currentUserId) {
        logWarn('[ShareActions] revokeShareApi: Unauthenticated attempt.', { apiAction: 'revokeShareApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = RevokeShareInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('[ShareActions] Invalid input for revokeShareApi', { errors, apiAction: 'revokeShareApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId, currentUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }

    try {
        const deleteResult = await prisma.sharedReview.deleteMany({
            where: {
                weekKey: weekKey,
                reviewOwnerId: currentUserId, 
                sharedWithId: targetUserId,
            },
        });
        if (deleteResult.count > 0) {
            logInfo(`[ShareActions] revokeShareApi: Share for review ${weekKey} owned by ${currentUserId} revoked from ${targetUserId}. Count: ${deleteResult.count}`, { currentUserId, targetUserId, weekKey });
        } else {
            logWarn(`[ShareActions] revokeShareApi: No share found to revoke for review ${weekKey} owned by ${currentUserId} from ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
        }
    } catch (error: any) {
        logError('[ShareActions] Error revoking share in DB', { error, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
        throw new Error(`Failed to revoke share: ${error.message}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const user = await currentUser();
    const currentUserId = user?.id;
    if (!currentUserId) {
        logWarn('[ShareActions] getSharedWithUsersApi: Unauthenticated attempt.', { apiAction: 'getSharedWithUsersApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = GetSharedWithUsersInputSchema.safeParse({ weekKey });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('[ShareActions] Invalid input for getSharedWithUsersApi', { errors, apiAction: 'getSharedWithUsersApi', receivedWeekKey: weekKey, currentUserId });
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
        logInfo(`[ShareActions] getSharedWithUsersApi: Fetched ${userShareInfoList.length} users shared with for review ${weekKey} by ${currentUserId}.`, { currentUserId, weekKey });
        return userShareInfoList;
    } catch (error: any) {
        logError('[ShareActions] Error fetching shared users list', { error, weekKey, reviewOwnerId: currentUserId });
        throw new Error(`Failed to fetch shared users: ${error.message}`);
    }
}

export async function ensureUserInDb(userId: string, email: string, name?: string | null) {
    if (!userId || !email) {
        logError('[ShareActions] ensureUserInDb: Missing userId or email.', { userId, email });
        throw new Error('User ID and email are required to ensure user in DB.');
    }
    try {
        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            logInfo(`[ShareActions] User ${userId} not found in DB. Creating...`, { userId, email, name });
            user = await prisma.user.create({
                data: {
                    id: userId,
                    email: email,
                    name: name,
                },
            });
        } else if (user.email !== email || (name && user.name !== name)) {
            logInfo(`[ShareActions] User ${userId} found. Updating details...`, { userId, newEmail: email, oldEmail: user.email, newName: name, oldName: user.name });
            user = await prisma.user.update({
                where: { id: userId },
                data: {
                    email: email,
                    name: name ?? user.name,
                },
            });
        }
        return user;
    } catch (error: any) {
        logError('[ShareActions] Error ensuring user in DB', { error, userId, email, name });
        throw new Error('Failed to ensure user record in database.');
    }
}
    
