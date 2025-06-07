
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
// Removed client-side logger imports: import { logInfo, logWarn, logError } from '@/lib/logger';

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const user = await currentUser();
    const currentUserId = user?.id;
    if (!currentUserId) {
        console.warn('[ShareActions] searchUserByEmailApi: Unauthenticated attempt.', { apiAction: 'searchUserByEmailApi' });
        throw new Error('User not authenticated.');
    }

    const validationResult = SearchUserByEmailInputSchema.safeParse({ email });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        console.warn('[ShareActions] Invalid input for searchUserByEmailApi', { errors, apiAction: 'searchUserByEmailApi', receivedEmail: email, currentUserId });
        throw new Error(`Invalid input: ${errors.fieldErrors.email?.[0] || 'Invalid email'}`);
    }

    try {
        const users = await clerkClient.users.getUserList({ emailAddress: [email.trim().toLowerCase()] });
        if (users && users.data.length > 0) {
            const foundUser = users.data[0];
            // It's okay for a user to search for themselves; the dialog should prevent sharing with self.
            console.info(`[ShareActions] searchUserByEmailApi: Found user ${foundUser.id} for email ${email}. CurrentUser: ${currentUserId}`, { targetUserId: foundUser.id, currentUserId });
            return {
                userId: foundUser.id,
                email: foundUser.primaryEmailAddress?.emailAddress || email,
                name: foundUser.fullName || foundUser.firstName || foundUser.username || 'Clerk User',
            };
        }
        console.info(`[ShareActions] searchUserByEmailApi: No user found for email ${email}. CurrentUser: ${currentUserId}`);
        return null;
    } catch (error: any) {
        console.error('[ShareActions] Error searching Clerk users by email', { error: error.message, stack: error.stack, emailToSearch: email, currentUserId, apiAction: 'searchUserByEmailApi' });
        throw new Error(`Failed to search for user: ${error.message}.`);
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const user = await currentUser();
    const currentUserId = user?.id;
    const currentUsername = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'A user';

    if (!currentUserId) {
        console.warn('[ShareActions] shareReviewApi: Unauthenticated attempt.', { apiAction: 'shareReviewApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = ShareReviewInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        console.warn('[ShareActions] Invalid input for shareReviewApi', { errors, apiAction: 'shareReviewApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId, currentUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }

    if (currentUserId === targetUserId) {
        console.warn(`[ShareActions] shareReviewApi: User attempted to share a review with themselves. User: ${currentUserId}`, { weekKey, targetUserId, currentUserId });
        throw new Error('You cannot share a review with yourself.');
    }

    try {
        // Ensure the sharer exists in our User table
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
            console.info(`[ShareActions] shareReviewApi: WeeklyReview for ${currentUserId} week ${weekKey} not found. Creating shell.`, { currentUserId, weekKey, targetUserId });
            review = await prisma.weeklyReview.create({
                data: {
                    userId: currentUserId,
                    weekKey: weekKey,
                    journal: "", 
                    transactionComments: {}, 
                },
            });
        }

        // Create or update the share link
        await prisma.sharedReview.upsert({
            where: { reviewOwnerId_sharedWithId_weekKey: { reviewOwnerId: currentUserId, sharedWithId: targetUserId, weekKey } },
            update: {}, 
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
                link: '/weekly-review', 
            }
        });

        console.info(`[ShareActions] shareReviewApi: Review ${weekKey} owned by ${currentUserId} shared with ${targetUserId}. Notification created.`, { currentUserId, targetUserId, weekKey });
    } catch (error: any) {
        if (error.code === 'P2002') { 
            console.warn(`[ShareActions] shareReviewApi: Review ${weekKey} by ${currentUserId} already effectively shared with ${targetUserId}. Ensuring notification.`, { currentUserId, targetUserId, weekKey });
            try {
                await prisma.notification.upsert({ // Use upsert to avoid duplicate notification errors
                    where: { 
                        userId_type_title_message_link: { // Assuming this combination is unique enough or define a better unique key
                            userId: targetUserId,
                            type: 'collaboration',
                            title: 'Review Shared With You',
                            message: `${currentUsername} shared their weekly review (${weekKey}) with you.`,
                            link: '/weekly-review',
                        }
                    },
                    update: { timestamp: new Date() }, // Update timestamp if it exists
                    create: {
                        userId: targetUserId,
                        type: 'collaboration',
                        title: 'Review Shared With You',
                        message: `${currentUsername} shared their weekly review (${weekKey}) with you.`,
                        link: '/weekly-review',
                    },
                });
            } catch (notifError: any) {
                 console.error('[ShareActions] Error creating/upserting notification for already shared review', { error: notifError, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
            }
            return; 
        }
        console.error('[ShareActions] Error sharing review or creating notification', { error: error.message, stack: error.stack, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
        throw new Error(`Failed to share review: ${error.message}`);
    }
}

export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const user = await currentUser();
    const currentUserId = user?.id;
    if (!currentUserId) {
        console.warn('[ShareActions] revokeShareApi: Unauthenticated attempt.', { apiAction: 'revokeShareApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = RevokeShareInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        console.warn('[ShareActions] Invalid input for revokeShareApi', { errors, apiAction: 'revokeShareApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId, currentUserId });
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
            console.info(`[ShareActions] revokeShareApi: Share for review ${weekKey} owned by ${currentUserId} revoked from ${targetUserId}. Count: ${deleteResult.count}`, { currentUserId, targetUserId, weekKey });
        } else {
            console.warn(`[ShareActions] revokeShareApi: No share found to revoke for review ${weekKey} owned by ${currentUserId} from ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
        }
    } catch (error: any) {
        console.error('[ShareActions] Error revoking share in DB', { error: error.message, stack: error.stack, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
        throw new Error(`Failed to revoke share: ${error.message}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const user = await currentUser();
    const currentUserId = user?.id;
    if (!currentUserId) {
        console.warn('[ShareActions] getSharedWithUsersApi: Unauthenticated attempt.', { apiAction: 'getSharedWithUsersApi' });
        throw new Error('User not authenticated.');
    }
    const validationResult = GetSharedWithUsersInputSchema.safeParse({ weekKey });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        console.warn('[ShareActions] Invalid input for getSharedWithUsersApi', { errors, apiAction: 'getSharedWithUsersApi', receivedWeekKey: weekKey, currentUserId });
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
        console.info(`[ShareActions] getSharedWithUsersApi: Fetched ${userShareInfoList.length} users shared with for review ${weekKey} by ${currentUserId}.`, { currentUserId, weekKey });
        return userShareInfoList;
    } catch (error: any) {
        console.error('[ShareActions] Error fetching shared users list', { error: error.message, stack: error.stack, weekKey, reviewOwnerId: currentUserId });
        throw new Error(`Failed to fetch shared users: ${error.message}`);
    }
}

export async function ensureUserInDb(userId: string, email: string, name?: string | null) {
    if (!userId || !email) {
        console.error('[ShareActions] ensureUserInDb: Missing userId or email.', { userId, email });
        throw new Error('User ID and email are required to ensure user in DB.');
    }
    try {
        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            console.info(`[ShareActions] User ${userId} not found in DB. Creating...`, { userId, email, name });
            user = await prisma.user.create({
                data: {
                    id: userId,
                    email: email,
                    name: name,
                },
            });
        } else if (user.email !== email || (name && user.name !== name)) {
            console.info(`[ShareActions] User ${userId} found. Updating details...`, { userId, newEmail: email, oldEmail: user.email, newName: name, oldName: user.name });
            user = await prisma.user.update({
                where: { id: userId },
                data: {
                    email: email,
                    name: name ?? user.name, // Only update name if provided
                },
            });
        }
        return user;
    } catch (error: any) {
        console.error('[ShareActions] Error ensuring user in DB', { error: error.message, stack: error.stack, userId, email, name });
        throw new Error('Failed to ensure user record in database.');
    }
}

    
