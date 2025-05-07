
// src/app/actions/shareActions.ts
'use server';

// import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo } from '@/lib/types';
import { Collection } from 'mongodb';
import { logInfo, logWarn, logError } from '@/lib/logger';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';
const CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL = 'local-user@example.com';


export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { currentUserId, targetEmail: email, operation: 'searchUserByEmailApi' };

    // if (!currentUserId) { // Clerk disabled
    //     logError('Unauthorized search: User not logged in.', undefined, logContext);
    //     throw new Error('Unauthorized: User not logged in.');
    // }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        logWarn('Invalid email input for search.', logContext);
        return null;
    }

    logInfo(`Searching for user by email (Clerk Disabled - Mocking).`, logContext);
    // Mocking Clerk behavior when disabled
    if (email.trim().toLowerCase() === CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL) {
        logInfo("User tried to search for themselves (mocked).", logContext);
        return null;
    }
    if (email.trim().toLowerCase() === "found@example.com") {
        return {
            userId: "found-user-id",
            email: "found@example.com",
            name: "Found User",
        };
    }
    logInfo("User not found (mocked).", logContext);
    return null;
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    // const { userId: ownerId } = auth(); // Clerk disabled
    const ownerId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { ownerId, weekKey, targetUserId, operation: 'shareReviewApi' };


    // if (!ownerId) { // Clerk disabled
    //     logError('Unauthorized share: User not logged in.', undefined, logContext);
    //     throw new Error('Unauthorized: User not logged in.');
    // }
    if (ownerId === targetUserId) {
        logWarn('Attempted to share review with self.', logContext);
        throw new Error('Cannot share a review with yourself.');
    }
    if (!weekKey || !targetUserId) {
        logError('Missing weekKey or targetUserId for share.', undefined, logContext);
        throw new Error('Missing weekKey or targetUserId.');
    }

    logInfo(`Attempting to share review ${weekKey} with ${targetUserId}.`, logContext);
    try {
        const client = await connectToDatabase();
        const db = client.db();
        const collection: Collection = db.collection('weeklyReviews');

        const result = await collection.updateOne(
            { userId: ownerId, weekKey: weekKey },
            { $addToSet: { sharedWith: targetUserId } }
        );

        if (result.matchedCount === 0) {
            logWarn(`Review ${weekKey} not found or not owned by user.`, logContext);
            throw new Error(`Review for week ${weekKey} not found or you do not own it.`);
        }
        if (result.modifiedCount > 0) {
             logInfo(`Successfully shared review.`, logContext);
        } else {
             logInfo(`User ${targetUserId} was already in the sharedWith list.`, logContext);
        }
    } catch (error) {
        logError(`Error sharing review.`, error, logContext);
        throw new Error('Failed to share weekly review.');
    }
}

export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    // const { userId: ownerId } = auth(); // Clerk disabled
    const ownerId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { ownerId, weekKey, targetUserId, operation: 'revokeShareApi' };

    // if (!ownerId) { // Clerk disabled
    //     logError('Unauthorized revoke: User not logged in.', undefined, logContext);
    //     throw new Error('Unauthorized: User not logged in.');
    // }
     if (ownerId === targetUserId) {
        logWarn('Attempted to revoke share from self.', logContext);
        throw new Error('Cannot revoke share from yourself.');
    }
    if (!weekKey || !targetUserId) {
        logError('Missing weekKey or targetUserId for revoke.', undefined, logContext);
        throw new Error('Missing weekKey or targetUserId.');
    }

    logInfo(`Attempting to revoke share for review ${weekKey} from ${targetUserId}.`, logContext);
    try {
        const client = await connectToDatabase();
        const db = client.db();
        const collection: Collection = db.collection('weeklyReviews');

        const result = await collection.updateOne(
            { userId: ownerId, weekKey: weekKey },
            { $pull: { sharedWith: targetUserId } }
        );

         if (result.matchedCount === 0) {
            logWarn(`Review ${weekKey} not found or not owned by user for revoke.`, logContext);
            throw new Error(`Review for week ${weekKey} not found or you do not own it.`);
        }
        if (result.modifiedCount > 0) {
             logInfo(`Successfully revoked access.`, logContext);
        } else {
            logInfo(`User ${targetUserId} was not in the sharedWith list. No changes made.`, logContext);
        }
    } catch (error) {
        logError(`Error revoking share.`, error, logContext);
        throw new Error('Failed to revoke share for weekly review.');
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    // const { userId: ownerId } = auth(); // Clerk disabled
    const ownerId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { ownerId, weekKey, operation: 'getSharedWithUsersApi' };

    // if (!ownerId) { // Clerk disabled
    //     logError('Unauthorized: User not logged in.', undefined, logContext);
    //     throw new Error('Unauthorized: User not logged in.');
    // }
    if (!weekKey) {
        logError('Missing weekKey.', undefined, logContext);
        throw new Error('Missing weekKey.');
    }

    logInfo(`Fetching shared users for review ${weekKey}.`, logContext);
    try {
        const client = await connectToDatabase();
        const db = client.db();
        const collection: Collection = db.collection('weeklyReviews');

        const review = await collection.findOne(
            { userId: ownerId, weekKey: weekKey },
            { projection: { sharedWith: 1, _id: 0 } }
        );

        if (!review || !review.sharedWith || review.sharedWith.length === 0) {
            logInfo('Review not found or not shared with anyone.', logContext);
            return [];
        }

        const sharedUserIds = review.sharedWith as string[];
        logInfo(`Found ${sharedUserIds.length} shared user IDs. Fetching details (Clerk Disabled - Mocking).`, { ...logContext, sharedUserIds });

        // Mocking Clerk user fetching when disabled
        const userInfos: UserShareInfo[] = sharedUserIds.map(id => ({
            userId: id,
            email: `${id.substring(0, 5)}@example.com`, // Mock email
            name: `Mock User ${id.substring(0, 5)}` // Mock name
        }));

        logInfo(`Returning ${userInfos.length} mock user info objects.`, logContext);
        return userInfos;

    } catch (error) {
        logError(`Error fetching shared users.`, error, logContext);
        throw new Error('Failed to fetch shared user list.');
    }
}
