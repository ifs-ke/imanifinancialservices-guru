// src/app/actions/shareActions.ts
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
import { logInfo, logWarn, logError } from '@/lib/logger';

// Removed CLERK_DISABLED_PLACEHOLDER_USER_ID and CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const { userId: currentUserId } = auth();
    const logContext = { currentUserId: currentUserId || 'unknown-unauthenticated', targetEmail: email, operation: 'searchUserByEmailApi' };

    if (!currentUserId) {
        logError('Unauthorized search: User not logged in.', undefined, logContext);
        throw new Error('Unauthorized: User not logged in.');
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        logWarn('Invalid email input for search.', logContext);
        return null;
    }

    logInfo(`Searching for user by email.`, logContext);

    try {
        const users = await clerkClient.users.getUserList({ emailAddress: [email.trim()] });

        if (users.length === 0) {
            logInfo("User not found.", logContext);
            return null;
        }

        const targetUser = users[0];

        if (targetUser.id === currentUserId) {
            logInfo("User tried to search for themselves.", logContext);
            // It's generally not an error to search for oneself, but sharing with self is prevented later.
            // Returning the user info might be fine, or null if self-sharing isn't desired at search stage.
            // For now, let's return the info.
        }

        const primaryEmail = targetUser.emailAddresses.find(em => em.id === targetUser.primaryEmailAddressId)?.emailAddress;

        if (!primaryEmail) {
            logWarn("User found but has no primary email address.", { ...logContext, targetUserId: targetUser.id });
            return null;
        }

        logInfo(`User found: ${targetUser.id}`, logContext);
        return {
            userId: targetUser.id,
            email: primaryEmail,
            name: targetUser.fullName || primaryEmail,
        };

    } catch (error) {
        logError(`Error searching for user by email:`, error, logContext);
        return null;
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth();
     const logContext = { currentUserId: currentUserId || 'unknown-unauthenticated', targetUserId, weekKey, operation: 'shareReviewApi' };


    if (!currentUserId) {
        logError('Unauthorized: Cannot share review.', undefined, logContext);
        throw new Error('Unauthorized: Cannot share review.');
    }
    if (currentUserId === targetUserId) {
        logWarn('Attempted to share review with self.', logContext);
        throw new Error('Cannot share review with yourself.');
    }

    logInfo(`Attempting to share review ${weekKey} with ${targetUserId}.`, logContext);

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            logWarn(`Share failed: Review ${weekKey} not found or not owned by user ${currentUserId}. Creating new review shell.`, logContext);
            const newReviewShell: WeeklyReviewData = {
                 ownerId: currentUserId, // Ensure ownerId is set
                 journal: '',
                 sharedWith: [targetUserId].sort(), // Initialize sharedWith with target user
             };
             await reviewsCollection.insertOne({
                 weekKey,
                 ...newReviewShell,
             });
             logInfo(`Created new review shell ${weekKey} for sharing.`, logContext);
             return;
        }

        const currentSharedWith = review.sharedWith || [];
        if (!currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = [...currentSharedWith, targetUserId].sort();

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId },
                { $set: { sharedWith: updatedSharedWith } }
            );

            if (updateResult.modifiedCount === 1) {
                 logInfo(`Successfully shared review ${weekKey} with user ${targetUserId}.`, logContext);
             } else {
                 logWarn(`Share update did not modify document for review ${weekKey}.`, { ...logContext, updateResult });
                 throw new Error('Failed to update sharing status.');
             }
        } else {
            logInfo(`Review ${weekKey} already shared with user ${targetUserId}.`, logContext);
        }
    } catch (error) {
        logError(`Error sharing review ${weekKey} with user ${targetUserId}:`, error, logContext);
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth();
    const logContext = { currentUserId: currentUserId || 'unknown-unauthenticated', targetUserId, weekKey, operation: 'revokeShareApi' };

    if (!currentUserId) {
        logError('Unauthorized: Cannot revoke share.', undefined, logContext);
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    logInfo(`Attempting to revoke share for review ${weekKey} from ${targetUserId}.`, logContext);

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            logWarn(`Revoke failed: Review ${weekKey} not found or not owned by user ${currentUserId}.`, logContext);
            throw new Error(`Review ${weekKey} not found or not owned by you.`);
        }

        const currentSharedWith = review.sharedWith || [];
        if (currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = currentSharedWith.filter(id => id !== targetUserId);

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId },
                { $set: { sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined } } // Set to undefined if array becomes empty
            );

            if (updateResult.modifiedCount === 1) {
                 logInfo(`Successfully revoked share for review ${weekKey} from user ${targetUserId}.`, logContext);
             } else {
                 logWarn(`Revoke update did not modify document for review ${weekKey}.`, { ...logContext, updateResult });
                 throw new Error('Failed to update sharing status.');
             }
        } else {
            logInfo(`Review ${weekKey} was not shared with user ${targetUserId}. No revoke needed.`, logContext);
        }
    } catch (error) {
        logError(`Error revoking share for review ${weekKey} from user ${targetUserId}:`, error, logContext);
        throw new Error(`Failed to revoke share: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const { userId: currentUserId } = auth();
    const logContext = { currentUserId: currentUserId || 'unknown-unauthenticated', weekKey, operation: 'getSharedWithUsersApi' };


     if (!currentUserId) {
        logError('Unauthorized: Cannot get shared list.', undefined, logContext);
        throw new Error('Unauthorized: Cannot get shared list.');
    }

     logInfo(`Fetching shared user list for review ${weekKey}.`, logContext);

     try {
         const client = await connectToDatabase();
         const db = client.db();
         const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

         // Find the review owned by the current user to get its sharedWith list
         const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId }, { projection: { sharedWith: 1 } });

         if (!review || !review.sharedWith || review.sharedWith.length === 0) {
             logInfo(`Review ${weekKey} not found, not owned, or not shared with anyone.`, logContext);
             return [];
         }

         const sharedUserIds = review.sharedWith;

         // Fetch user details from Clerk for the shared IDs
         const users = await clerkClient.users.getUserList({ userId: sharedUserIds });

          const userInfos = users.map(user => {
             const primaryEmail = user.emailAddresses.find((em: any) => em.id === user.primaryEmailAddressId)?.emailAddress;
             return {
                 userId: user.id,
                 email: primaryEmail || 'No Primary Email',
                 name: user.fullName || primaryEmail || 'Unnamed User'
             };
         });

         logInfo(`Fetched details for ${userInfos.length} shared users for review ${weekKey}.`, logContext);
         return userInfos;

     } catch (error) {
         logError(`Error fetching shared user list for review ${weekKey}:`, error, logContext);
         throw new Error(`Failed to fetch shared users: ${error instanceof Error ? error.message : String(error)}`);
     }
}
