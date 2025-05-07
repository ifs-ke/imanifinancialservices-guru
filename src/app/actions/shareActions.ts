// src/app/actions/shareActions.ts
'use server';

// import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
import { logInfo, logWarn, logError } from '@/lib/logger'; // Use server logger

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL = 'local-user@example.com';


export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { currentUserId, targetEmail: email, operation: 'searchUserByEmailApi' };


    if (!currentUserId) { // Keep check, though it's now mocked
        logError('Unauthorized search: User not available.', undefined, logContext);
        throw new Error('Unauthorized: User not available.');
    }


    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        logWarn('Invalid email input for search.', logContext);
        return null;
    }

    logInfo(`Searching for user by email (mocked - Clerk disabled).`, logContext);


    // --- Mocked Search Logic ---
    if (email.trim().toLowerCase() === CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL) {
        logInfo("User tried to search for themselves (mocked).", logContext);
        return null; // Prevent sharing with self
    }
    // Simulate finding a user for a specific test email
    if (email.trim().toLowerCase() === 'share-test@example.com') {
        logInfo(`Mock user found: share-test@example.com`, logContext);
        return {
            userId: 'user_mock_share_target', // A distinct mock ID
            email: 'share-test@example.com',
            name: 'Share Test User',
        };
    }
     // --- End Mocked Logic ---

    logInfo("User not found (mocked).", logContext);
    return null; // Default to not found

    /*
    // --- Original Clerk Logic ---
    try {
        const users = await clerkClient.users.getUserList({ emailAddress: [email.trim()] });

        if (users.length === 0) {
            logInfo("User not found.", logContext);
            return null;
        }

        const targetUser = users[0];

        // Prevent sharing with self
        if (targetUser.id === currentUserId) {
            logInfo("User tried to search for themselves.", logContext);
            return null;
        }

        const primaryEmail = targetUser.emailAddresses.find(em => em.id === targetUser.primaryEmailAddressId)?.emailAddress;

        if (!primaryEmail) {
             logWarn("User found but has no primary email address.", { ...logContext, targetUserId: targetUser.id });
             return null; // Cannot share if no email is verifiable
        }


        logInfo(`User found: ${targetUser.id}`, logContext);
        return {
            userId: targetUser.id,
            email: primaryEmail,
            name: targetUser.fullName || primaryEmail, // Use full name if available, otherwise email
        };
    } catch (error) {
        logError(`Error searching for user by email:`, error, logContext);
        return null; // Return null on error to indicate failure
    }
    */
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;

    if (!currentUserId) {
        throw new Error('Unauthorized: Cannot share review.');
    }
    if (currentUserId === targetUserId) {
        throw new Error('Cannot share review with yourself.');
    }

    const logContext = { currentUserId, targetUserId, weekKey, operation: 'shareReviewApi' };
    logInfo(`Attempting to share review ${weekKey} with ${targetUserId}.`, logContext);


    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        // Find the review owned by the current user
        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            logWarn(`Share failed: Review ${weekKey} not found or not owned by user ${currentUserId}. Creating new review shell.`, logContext);
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
             logInfo(`Created new review shell ${weekKey} for sharing.`, logContext);
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
                 logInfo(`Successfully shared review ${weekKey} with user ${targetUserId}.`, logContext);
             } else {
                 logWarn(`Share update did not modify document for review ${weekKey}.`, { ...logContext, updateResult });
                 // Might happen if the document was modified between findOne and updateOne
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
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;

    if (!currentUserId) {
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    const logContext = { currentUserId, targetUserId, weekKey, operation: 'revokeShareApi' };
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
                 logInfo(`Successfully revoked share for review ${weekKey} from user ${targetUserId}.`, logContext);
             } else {
                 logWarn(`Revoke update did not modify document for review ${weekKey}.`, { ...logContext, updateResult });
                 // Might happen if the document was modified or user wasn't in sharedWith anymore
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
    // const { userId: currentUserId } = auth(); // Clerk disabled
     const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;

     if (!currentUserId) {
        throw new Error('Unauthorized: Cannot get shared list.');
    }

     const logContext = { currentUserId, weekKey, operation: 'getSharedWithUsersApi' };
     logInfo(`Fetching shared user list for review ${weekKey}.`, logContext);


     try {
         const client = await connectToDatabase();
         const db = client.db();
         const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

         // Find the review owned by the current user
         const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId }, { projection: { sharedWith: 1 } });

         if (!review || !review.sharedWith || review.sharedWith.length === 0) {
             logInfo(`Review ${weekKey} not found, not owned, or not shared with anyone.`, logContext);
             return []; // Not shared or doesn't exist/not owned
         }

         const sharedUserIds = review.sharedWith;

         // --- Mocked User Fetching ---
         const userInfos = sharedUserIds.map(userId => ({
             userId: userId,
             email: `${userId.substring(0, 5)}@mock.example`, // Generate mock email
             name: `Mock User ${userId.substring(userId.length - 4)}`, // Generate mock name
         }));
         // --- End Mocked Logic ---


         /*
         // --- Original Clerk Logic ---
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
         */

         logInfo(`Fetched details for ${userInfos.length} shared users for review ${weekKey}.`, logContext);
         return userInfos;


     } catch (error) {
         logError(`Error fetching shared user list for review ${weekKey}:`, error, logContext);
         throw new Error(`Failed to fetch shared users: ${error instanceof Error ? error.message : String(error)}`);
     }
}