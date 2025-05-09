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
     // Log context always includes operation for better traceability
    const logContext = { currentUserId: currentUserId || 'unauthenticated_search_attempt', targetEmail: email, operation: 'searchUserByEmailApi' };


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
            // Prevent sharing with self at the point of sharing, not search.
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
        return null; // Return null on error to indicate search failure.
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth();
    const logContext = { currentUserId, targetUserId, weekKey, operation: 'shareReviewApi' };


    if (!currentUserId) {
        logError('Unauthorized: Cannot share review. User not logged in.', undefined, logContext);
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

        // Ensure the review exists and is owned by the current user, or create it if it's the owner trying to share
        let review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            logInfo(`Review ${weekKey} not found for owner ${currentUserId}. Creating new review shell for sharing.`, logContext);
            const newReviewShell: WeeklyReviewData = {
                 ownerId: currentUserId,
                 journal: '', // Default empty journal
                 transactionComments: {}, // Default empty comments
                 sharedWith: [targetUserId].sort(), // Initialize sharedWith with target user
             };
             await reviewsCollection.insertOne({ // Use insertOne for a new document
                 weekKey,
                 ...newReviewShell,
             });
             logInfo(`Created new review shell ${weekKey} and shared with ${targetUserId}.`, logContext);
             return; // Successfully created and shared
        }

        // If review exists, update its sharedWith list
        const currentSharedWith = review.sharedWith || [];
        if (!currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = [...currentSharedWith, targetUserId].sort();

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId }, // Filter by ownerId
                { $set: { sharedWith: updatedSharedWith } }
            );

            if (updateResult.modifiedCount === 1) {
                 logInfo(`Successfully shared review ${weekKey} with user ${targetUserId}.`, logContext);
             } else {
                 logWarn(`Share update did not modify document for review ${weekKey}. This might happen if the review was already shared or if a concurrent update occurred.`, { ...logContext, updateResult });
                 // Potentially re-fetch and check if already shared to avoid throwing an unnecessary error.
                 const updatedReview = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });
                 if (!updatedReview?.sharedWith?.includes(targetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing.');
                 }
                 logInfo(`Review ${weekKey} was likely already shared with user ${targetUserId} (concurrent update or no change needed).`, logContext);
             }
        } else {
            logInfo(`Review ${weekKey} already shared with user ${targetUserId}. No action taken.`, logContext);
        }
    } catch (error) {
        logError(`Error sharing review ${weekKey} with user ${targetUserId}:`, error, logContext);
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth();
    const logContext = { currentUserId, targetUserId, weekKey, operation: 'revokeShareApi' };

    if (!currentUserId) {
        logError('Unauthorized: Cannot revoke share. User not logged in.', undefined, logContext);
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    logInfo(`Attempting to revoke share for review ${weekKey} from ${targetUserId}.`, logContext);

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        // Find the review owned by the current user
        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            logWarn(`Revoke failed: Review ${weekKey} not found or not owned by user ${currentUserId}.`, logContext);
            throw new Error(`Review ${weekKey} not found or not owned by you.`);
        }

        const currentSharedWith = review.sharedWith || [];
        if (currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = currentSharedWith.filter(id => id !== targetUserId);

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId }, // Filter by ownerId
                // If updatedSharedWith is empty, MongoDB can remove the field if $unset is used, or set to empty array.
                // Setting to an empty array is simpler and usually fine.
                { $set: { sharedWith: updatedSharedWith } }
            );

            if (updateResult.modifiedCount === 1) {
                 logInfo(`Successfully revoked share for review ${weekKey} from user ${targetUserId}.`, logContext);
             } else {
                 logWarn(`Revoke update did not modify document for review ${weekKey}. This might happen if sharing was already revoked or due to a concurrent update.`, { ...logContext, updateResult });
                 // Potentially re-fetch and check to confirm.
                 const updatedReview = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });
                 if (updatedReview?.sharedWith?.includes(targetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing and user was in sharedWith.');
                 }
                 logInfo(`Review ${weekKey} share was likely already revoked for user ${targetUserId} (concurrent update or no change needed).`, logContext);
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
    const logContext = { currentUserId, weekKey, operation: 'getSharedWithUsersApi' };


     if (!currentUserId) {
        logError('Unauthorized: Cannot get shared list. User not logged in.', undefined, logContext);
        throw new Error('Unauthorized: Cannot get shared list.');
    }

     logInfo(`Fetching shared user list for review ${weekKey}.`, logContext);

     try {
         const client = await connectToDatabase();
         const db = client.db();
         const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

         const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId }, { projection: { sharedWith: 1 } });

         if (!review || !review.sharedWith || review.sharedWith.length === 0) {
             logInfo(`Review ${weekKey} not found, not owned by ${currentUserId}, or not shared with anyone.`, logContext);
             return [];
         }

         const sharedUserIds = review.sharedWith;

         if (sharedUserIds.length === 0) {
             logInfo(`Review ${weekKey} has an empty sharedWith list.`, logContext);
             return [];
         }
         
         const users = await clerkClient.users.getUserList({ userId: sharedUserIds });

          const userInfos = users.map(user => {
             const primaryEmail = user.emailAddresses.find((em: any) => em.id === user.primaryEmailAddressId)?.emailAddress;
             return {
                 userId: user.id,
                 email: primaryEmail || 'No Primary Email',
                 name: user.fullName || primaryEmail || 'Unnamed User' // Use fullName if available
             };
         });

         logInfo(`Fetched details for ${userInfos.length} shared users for review ${weekKey}.`, logContext);
         return userInfos;

     } catch (error) {
         logError(`Error fetching shared user list for review ${weekKey}:`, error, logContext);
         throw new Error(`Failed to fetch shared users: ${error instanceof Error ? error.message : String(error)}`);
     }
}