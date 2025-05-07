// src/app/actions/shareActions.ts
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server'; // Re-enabled Clerk
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
// import { logInfo, logWarn, logError } from '@/lib/logger'; // Logger removed


export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const { userId: currentUserId } = auth(); // Re-enabled Clerk
    const logContext = { currentUserId, targetEmail: email, operation: 'searchUserByEmailApi' };

    if (!currentUserId) {
        console.error('Unauthorized search: User not logged in.', logContext); // Replaced logError
        throw new Error('Unauthorized: User not logged in.');
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        console.warn('Invalid email input for search.', logContext); // Replaced logWarn
        return null;
    }

    console.log(`Searching for user by email.`, logContext); // Replaced logInfo

    try {
        const users = await clerkClient.users.getUserList({ emailAddress: [email.trim()] });

        if (users.length === 0) {
            console.log("User not found.", logContext); // Replaced logInfo
            return null;
        }

        const targetUser = users[0];

        // Prevent sharing with self
        if (targetUser.id === currentUserId) {
            console.log("User tried to search for themselves.", logContext); // Replaced logInfo
            return null;
        }

        const primaryEmail = targetUser.emailAddresses.find(em => em.id === targetUser.primaryEmailAddressId)?.emailAddress;

        if (!primaryEmail) {
             console.warn("User found but has no primary email address.", { ...logContext, targetUserId: targetUser.id }); // Replaced logWarn
             return null; // Cannot share if no email is verifiable
        }


        console.log(`User found: ${targetUser.id}`, logContext); // Replaced logInfo
        return {
            userId: targetUser.id,
            email: primaryEmail,
            name: targetUser.fullName || primaryEmail, // Use full name if available, otherwise email
        };
    } catch (error) {
        console.error(`Error searching for user by email:`, { error, ...logContext }); // Replaced logError
        return null; // Return null on error to indicate failure
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth(); // Re-enabled Clerk

    if (!currentUserId) {
        throw new Error('Unauthorized: Cannot share review.');
    }
    if (currentUserId === targetUserId) {
        throw new Error('Cannot share review with yourself.');
    }

    const logContext = { currentUserId, targetUserId, weekKey, operation: 'shareReviewApi' };
    console.log(`Attempting to share review ${weekKey} with ${targetUserId}.`, logContext); // Replaced logInfo


    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        // Find the review owned by the current user
        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            console.warn(`Share failed: Review ${weekKey} not found or not owned by user ${currentUserId}. Creating new review shell.`, logContext); // Replaced logWarn
            // Create the review shell if it doesn't exist - crucial for sharing to work
             const newReviewShell: WeeklyReviewData = {
                 ownerId: currentUserId,
                 journal: '', // Start with empty journal
                 sharedWith: [targetUserId].sort(), // Add target user
                 // transactionComments: undefined // Initialize as undefined
             };
             await reviewsCollection.insertOne({
                 weekKey,
                 ...newReviewShell,
             });
             console.log(`Created new review shell ${weekKey} for sharing.`, logContext); // Replaced logInfo
             return; // Exit after creating
        }


        // Add targetUserId to the sharedWith array if not already present
        const currentSharedWith = review.sharedWith || [];
        if (!currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = [...currentSharedWith, targetUserId].sort(); // Keep sorted

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId },
                { $set: { sharedWith: updatedSharedWith } }
            );

            if (updateResult.modifiedCount === 1) {
                 console.log(`Successfully shared review ${weekKey} with user ${targetUserId}.`, logContext); // Replaced logInfo
             } else {
                 console.warn(`Share update did not modify document for review ${weekKey}.`, { ...logContext, updateResult }); // Replaced logWarn
                 // Might happen if the document was modified between findOne and updateOne
                 throw new Error('Failed to update sharing status.');
             }
        } else {
            console.log(`Review ${weekKey} already shared with user ${targetUserId}.`, logContext); // Replaced logInfo
        }
    } catch (error) {
        console.error(`Error sharing review ${weekKey} with user ${targetUserId}:`, { error, ...logContext }); // Replaced logError
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId } = auth(); // Re-enabled Clerk

    if (!currentUserId) {
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    const logContext = { currentUserId, targetUserId, weekKey, operation: 'revokeShareApi' };
    console.log(`Attempting to revoke share for review ${weekKey} from ${targetUserId}.`, logContext); // Replaced logInfo


    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        // Find the review owned by the current user
        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            console.warn(`Revoke failed: Review ${weekKey} not found or not owned by user ${currentUserId}.`, logContext); // Replaced logWarn
            throw new Error(`Review ${weekKey} not found or not owned by you.`);
        }

        // Remove targetUserId from the sharedWith array
        const currentSharedWith = review.sharedWith || [];
        if (currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = currentSharedWith.filter(id => id !== targetUserId);

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId },
                 // Set to the new array, or unset if the array becomes empty
                { $set: { sharedWith: updatedSharedWith.length > 0 ? updatedSharedWith : undefined } }
            );

            if (updateResult.modifiedCount === 1) {
                 console.log(`Successfully revoked share for review ${weekKey} from user ${targetUserId}.`, logContext); // Replaced logInfo
             } else {
                 console.warn(`Revoke update did not modify document for review ${weekKey}.`, { ...logContext, updateResult }); // Replaced logWarn
                 // Might happen if the document was modified or user wasn't in sharedWith anymore
                 throw new Error('Failed to update sharing status.');
             }
        } else {
            console.log(`Review ${weekKey} was not shared with user ${targetUserId}. No revoke needed.`, logContext); // Replaced logInfo
        }
    } catch (error) {
        console.error(`Error revoking share for review ${weekKey} from user ${targetUserId}:`, { error, ...logContext }); // Replaced logError
        throw new Error(`Failed to revoke share: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const { userId: currentUserId } = auth(); // Re-enabled Clerk

     if (!currentUserId) {
        throw new Error('Unauthorized: Cannot get shared list.');
    }

     const logContext = { currentUserId, weekKey, operation: 'getSharedWithUsersApi' };
     console.log(`Fetching shared user list for review ${weekKey}.`, logContext); // Replaced logInfo


     try {
         const client = await connectToDatabase();
         const db = client.db();
         const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

         // Find the review owned by the current user
         const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId }, { projection: { sharedWith: 1 } });

         if (!review || !review.sharedWith || review.sharedWith.length === 0) {
             console.log(`Review ${weekKey} not found, not owned, or not shared with anyone.`, logContext); // Replaced logInfo
             return []; // Not shared or doesn't exist/not owned
         }

         const sharedUserIds = review.sharedWith;

         // Fetch user details from Clerk for the shared IDs
         const users = await clerkClient.users.getUserList({ userId: sharedUserIds });

          const userInfos = users.map(user => {
             const primaryEmail = user.emailAddresses.find(em => em.id === user.primaryEmailAddressId)?.emailAddress;
             return {
                 userId: user.id,
                 email: primaryEmail || 'No Primary Email',
                 name: user.fullName || primaryEmail || 'Unnamed User'
             };
         });

         console.log(`Fetched details for ${userInfos.length} shared users for review ${weekKey}.`, logContext); // Replaced logInfo
         return userInfos;


     } catch (error) {
         console.error(`Error fetching shared user list for review ${weekKey}:`, { error, ...logContext }); // Replaced logError
         throw new Error(`Failed to fetch shared users: ${error instanceof Error ? error.message : String(error)}`);
     }
}
