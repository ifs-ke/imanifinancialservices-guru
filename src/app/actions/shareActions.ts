
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
            if (foundUser.id === currentUserId) {
                console.info(`[ShareActions] searchUserByEmailApi: User attempted to search for themselves. User: ${currentUserId}`, { email, currentUserId });
                return null;
            }
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
        console.error('[ShareActions] Error searching Clerk users by email', { error, emailToSearch: email, currentUserId, apiAction: 'searchUserByEmailApi' });
        throw new Error(`Failed to search for user: ${error.message}.`);
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const user = await currentUser();
    const currentUserId = user?.id;
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
                },
            });
        }

        await prisma.sharedReview.create({
            data: {
                weekKey: weekKey,
                reviewOwnerId: currentUserId,
                sharedWithId: targetUserId,
            },
        });
        console.info(`[ShareActions] shareReviewApi: Review ${weekKey} owned by ${currentUserId} shared with ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
    } catch (error: any) {
        if (error.code === 'P2002') { // Unique constraint violation
            console.warn(`[ShareActions] shareReviewApi: Review ${weekKey} by ${currentUserId} already shared with ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
            return; // Or throw a specific error if preferred
        }
        console.error('[ShareActions] Error sharing review in DB', { error, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
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
        await prisma.sharedReview.deleteMany({
            where: {
                weekKey: weekKey,
                reviewOwnerId: currentUserId, // Only the owner can revoke their shares
                sharedWithId: targetUserId,
            },
        });
        console.info(`[ShareActions] revokeShareApi: Share for review ${weekKey} owned by ${currentUserId} revoked from ${targetUserId}.`, { currentUserId, targetUserId, weekKey });
    } catch (error: any) {
        console.error('[ShareActions] Error revoking share in DB', { error, weekKey, reviewOwnerId: currentUserId, sharedWithId: targetUserId });
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
                reviewOwnerId: currentUserId, // Assuming only the owner sees who they shared with
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
        console.error('[ShareActions] Error fetching shared users list', { error, weekKey, reviewOwnerId: currentUserId });
        throw new Error(`Failed to fetch shared users: ${error.message}`);
    }
}

export async function ensureUserInDb(userId: string, email: string, name?: string | null) {
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
            // Optionally update email or name if they've changed in Clerk
            console.info(`[ShareActions] User ${userId} found. Updating details...`, { userId, newEmail: email, oldEmail: user.email, newName: name, oldName: user.name });
            user = await prisma.user.update({
                where: { id: userId },
                data: {
                    email: email,
                    name: name ?? user.name, // Keep old name if new one is null
                },
            });
        }
        return user;
    } catch (error: any) {
        console.error('[ShareActions] Error ensuring user in DB', { error, userId, email, name });
        // Re-throw the error to be handled by the caller, or handle more specifically
        throw new Error('Failed to ensure user record in database.');
    }
}
    