// src/app/actions/shareActions.ts
'use server';

// import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
import { logInfo, logWarn, logError } from '@/lib/logger'; // Use console-based logger

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL = 'local-user@example.com';


export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { currentUserId, targetEmail: email, operation: 'searchUserByEmailApi' };


    if (!currentUserId) {
        logError('Unauthorized search: User not logged in.', undefined, logContext, currentUserId);
        throw new Error('Unauthorized: User not logged in.');
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        logWarn('Invalid email input for search.', logContext, currentUserId);
        return null;
    }

    logInfo(`Searching for user by email.`, logContext, currentUserId);

    // Mocking Clerk client behavior when disabled
    if (email.trim().toLowerCase() === CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL.toLowerCase()) {
        const mockUser = {
            id: CLERK_DISABLED_PLACEHOLDER_USER_ID, // Can be a different mock ID for the searched user
            emailAddresses: [{ id: 'eml_mock', emailAddress: CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL }],
            primaryEmailAddressId: 'eml_mock',
            fullName: 'Mock Searched User',
        };
        logInfo("Mock user found (Clerk disabled).", logContext, currentUserId);
         return {
            userId: mockUser.id,
            email: mockUser.emailAddresses[0].emailAddress,
            name: mockUser.fullName || mockUser.emailAddresses[0].emailAddress,
        };
    }


    logInfo("User not found (Clerk disabled or no match).", logContext, currentUserId);
    return null;
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { currentUserId, targetUserId, weekKey, operation: 'shareReviewApi' };


    if (!currentUserId) {
        logError('Unauthorized: Cannot share review. User not logged in.', undefined, logContext, currentUserId);
        throw new Error('Unauthorized: Cannot share review.');
    }
    if (currentUserId === targetUserId) {
        logWarn('Attempted to share review with self.', logContext, currentUserId);
        throw new Error('Cannot share review with yourself.');
    }

    logInfo(`Attempting to share review ${weekKey} with ${targetUserId}.`, logContext, currentUserId);

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        let review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            logInfo(`Review ${weekKey} not found for owner ${currentUserId}. Creating new review shell for sharing.`, logContext, currentUserId);
            const newReviewShell: WeeklyReviewData = {
                 ownerId: currentUserId,
                 journal: '', 
                 transactionComments: {}, 
                 sharedWith: [targetUserId].sort(), 
             };
             await reviewsCollection.insertOne({ 
                 weekKey,
                 ...newReviewShell,
             });
             logInfo(`Created new review shell ${weekKey} and shared with ${targetUserId}.`, logContext, currentUserId);
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
                 logInfo(`Successfully shared review ${weekKey} with user ${targetUserId}.`, logContext, currentUserId);
             } else {
                 logWarn(`Share update did not modify document for review ${weekKey}. This might happen if the review was already shared or if a concurrent update occurred.`, { ...logContext, updateResult }, currentUserId);
                 const updatedReview = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });
                 if (!updatedReview?.sharedWith?.includes(targetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing.');
                 }
                 logInfo(`Review ${weekKey} was likely already shared with user ${targetUserId} (concurrent update or no change needed).`, logContext, currentUserId);
             }
        } else {
            logInfo(`Review ${weekKey} already shared with user ${targetUserId}. No action taken.`, logContext, currentUserId);
        }
    } catch (error) {
        logError(`Error sharing review ${weekKey} with user ${targetUserId}:`, error, logContext, currentUserId);
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { currentUserId, targetUserId, weekKey, operation: 'revokeShareApi' };

    if (!currentUserId) {
        logError('Unauthorized: Cannot revoke share. User not logged in.', undefined, logContext, currentUserId);
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    logInfo(`Attempting to revoke share for review ${weekKey} from ${targetUserId}.`, logContext, currentUserId);

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            logWarn(`Revoke failed: Review ${weekKey} not found or not owned by user ${currentUserId}.`, logContext, currentUserId);
            throw new Error(`Review ${weekKey} not found or not owned by you.`);
        }

        const currentSharedWith = review.sharedWith || [];
        if (currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = currentSharedWith.filter(id => id !== targetUserId);

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId }, 
                { $set: { sharedWith: updatedSharedWith } }
            );

            if (updateResult.modifiedCount === 1) {
                 logInfo(`Successfully revoked share for review ${weekKey} from user ${targetUserId}.`, logContext, currentUserId);
             } else {
                 logWarn(`Revoke update did not modify document for review ${weekKey}. This might happen if sharing was already revoked or due to a concurrent update.`, { ...logContext, updateResult }, currentUserId);
                 const updatedReview = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });
                 if (updatedReview?.sharedWith?.includes(targetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing and user was in sharedWith.');
                 }
                 logInfo(`Review ${weekKey} share was likely already revoked for user ${targetUserId} (concurrent update or no change needed).`, logContext, currentUserId);
             }
        } else {
            logInfo(`Review ${weekKey} was not shared with user ${targetUserId}. No revoke needed.`, logContext, currentUserId);
        }
    } catch (error) {
        logError(`Error revoking share for review ${weekKey} from user ${targetUserId}:`, error, logContext, currentUserId);
        throw new Error(`Failed to revoke share: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { currentUserId, weekKey, operation: 'getSharedWithUsersApi' };


     if (!currentUserId) {
        logError('Unauthorized: Cannot get shared list. User not logged in.', undefined, logContext, currentUserId);
        throw new Error('Unauthorized: Cannot get shared list.');
    }

     logInfo(`Fetching shared user list for review ${weekKey}.`, logContext, currentUserId);

     try {
         const client = await connectToDatabase();
         const db = client.db();
         const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

         const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId }, { projection: { sharedWith: 1 } });

         if (!review || !review.sharedWith || review.sharedWith.length === 0) {
             logInfo(`Review ${weekKey} not found, not owned by ${currentUserId}, or not shared with anyone.`, logContext, currentUserId);
             return [];
         }

         const sharedUserIds = review.sharedWith;

         if (sharedUserIds.length === 0) {
             logInfo(`Review ${weekKey} has an empty sharedWith list.`, logContext, currentUserId);
             return [];
         }
         
         // Mocking Clerk client behavior when disabled
         const userInfos: UserShareInfo[] = sharedUserIds.map(id => ({
             userId: id,
             email: `mock-user-${id.substring(0,5)}@example.com`,
             name: `Mock User ${id.substring(0,5)}`
         }));


         logInfo(`Fetched details for ${userInfos.length} shared users for review ${weekKey}.`, logContext, currentUserId);
         return userInfos;

     } catch (error) {
         logError(`Error fetching shared user list for review ${weekKey}:`, error, logContext, currentUserId);
         throw new Error(`Failed to fetch shared users: ${error instanceof Error ? error.message : String(error)}`);
     }
}
