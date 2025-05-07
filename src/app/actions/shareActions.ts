// src/app/actions/shareActions.ts
'use server';

// import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
// import { logInfo, logWarn, logError } from '@/lib/logger'; // Logger removed

// Consistent placeholder ID
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL = 'local-user@example.com';


export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder
    const logContext = { currentUserId, targetEmail: email, operation: 'searchUserByEmailApi' };


    if (!currentUserId) { // Check placeholder
        // console.error('Unauthorized search: User not logged in.', logContext); // Replaced logError with console.error
        throw new Error('Unauthorized: User not logged in.');
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        // console.warn('Invalid email input for search.', logContext); // Replaced logWarn with console.warn
        return null;
    }

    // console.log(`Searching for user by email.`, logContext); // Replaced logInfo with console.log

    try {
        // Mock Clerk API response when disabled
        if (email.trim() === CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL) {
             // Simulate finding the placeholder user if they search their own mock email
             // But prevent sharing with self later
             return {
                 userId: CLERK_DISABLED_PLACEHOLDER_USER_ID,
                 email: CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL,
                 name: 'Mock User (You)', // Indicate it's the mock self
             };
        } else if (email.trim() === 'other-user@example.com') {
             // Simulate finding another mock user
             return {
                 userId: 'mock-other-user-id',
                 email: 'other-user@example.com',
                 name: 'Other Mock User',
             };
         } else {
             // Simulate user not found
             // console.log("User not found (mocked).", logContext); // Replaced logInfo with console.log
             return null;
         }

        // --- Original Clerk logic (commented out) ---
        // const users = await clerkClient.users.getUserList({ emailAddress: [email.trim()] });
        // if (users.length === 0) {
        //     logInfo("User not found.", logContext);
        //     return null;
        // }
        // const targetUser = users[0];
        // if (targetUser.id === currentUserId) {
        //     logInfo("User tried to search for themselves.", logContext);
        //     return null;
        // }
        // const primaryEmail = targetUser.emailAddresses.find(em => em.id === targetUser.primaryEmailAddressId)?.emailAddress;
        // if (!primaryEmail) {
        //      logWarn("User found but has no primary email address.", { ...logContext, targetUserId: targetUser.id });
        //      return null;
        // }
        // logInfo(`User found: ${targetUser.id}`, logContext);
        // return {
        //     userId: targetUser.id,
        //     email: primaryEmail,
        //     name: targetUser.fullName || primaryEmail,
        // };
    } catch (error) {
        // console.error(`Error searching for user by email:`, { error, ...logContext }); // Replaced logError with console.error
        return null; // Return null on error to indicate failure
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

    if (!currentUserId) {
        throw new Error('Unauthorized: Cannot share review.');
    }
    if (currentUserId === targetUserId) {
        throw new Error('Cannot share review with yourself.');
    }

    const logContext = { currentUserId, targetUserId, weekKey, operation: 'shareReviewApi' };
    // console.log(`Attempting to share review ${weekKey} with ${targetUserId}.`, logContext); // Replaced logInfo with console.log

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        // Find the review owned by the current user
        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            // console.warn(`Share failed: Review ${weekKey} not found or not owned by user ${currentUserId}. Creating new review shell.`, logContext); // Replaced logWarn with console.warn
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
             // console.log(`Created new review shell ${weekKey} for sharing.`, logContext); // Replaced logInfo with console.log
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
                 // console.log(`Successfully shared review ${weekKey} with user ${targetUserId}.`, logContext); // Replaced logInfo with console.log
             } else {
                 // console.warn(`Share update did not modify document for review ${weekKey}.`, { ...logContext, updateResult }); // Replaced logWarn with console.warn
                 // Might happen if the document was modified between findOne and updateOne
                 throw new Error('Failed to update sharing status.');
             }
        } else {
            // console.log(`Review ${weekKey} already shared with user ${targetUserId}.`, logContext); // Replaced logInfo with console.log
        }
    } catch (error) {
        // console.error(`Error sharing review ${weekKey} with user ${targetUserId}:`, { error, ...logContext }); // Replaced logError with console.error
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    }
}


export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

    if (!currentUserId) {
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    const logContext = { currentUserId, targetUserId, weekKey, operation: 'revokeShareApi' };
    // console.log(`Attempting to revoke share for review ${weekKey} from ${targetUserId}.`, logContext); // Replaced logInfo with console.log

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        // Find the review owned by the current user
        const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });

        if (!review) {
            // console.warn(`Revoke failed: Review ${weekKey} not found or not owned by user ${currentUserId}.`, logContext); // Replaced logWarn with console.warn
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
                 // console.log(`Successfully revoked share for review ${weekKey} from user ${targetUserId}.`, logContext); // Replaced logInfo with console.log
             } else {
                 // console.warn(`Revoke update did not modify document for review ${weekKey}.`, { ...logContext, updateResult }); // Replaced logWarn with console.warn
                 // Might happen if the document was modified or user wasn't in sharedWith anymore
                 throw new Error('Failed to update sharing status.');
             }
        } else {
            // console.log(`Review ${weekKey} was not shared with user ${targetUserId}. No revoke needed.`, logContext); // Replaced logInfo with console.log
        }
    } catch (error) {
        // console.error(`Error revoking share for review ${weekKey} from user ${targetUserId}:`, { error, ...logContext }); // Replaced logError with console.error
        throw new Error(`Failed to revoke share: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

     if (!currentUserId) {
        throw new Error('Unauthorized: Cannot get shared list.');
    }

     const logContext = { currentUserId, weekKey, operation: 'getSharedWithUsersApi' };
     // console.log(`Fetching shared user list for review ${weekKey}.`, logContext); // Replaced logInfo with console.log

     try {
         const client = await connectToDatabase();
         const db = client.db();
         const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

         // Find the review owned by the current user
         const review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId }, { projection: { sharedWith: 1 } });

         if (!review || !review.sharedWith || review.sharedWith.length === 0) {
             // console.log(`Review ${weekKey} not found, not owned, or not shared with anyone.`, logContext); // Replaced logInfo with console.log
             return []; // Not shared or doesn't exist/not owned
         }

         const sharedUserIds = review.sharedWith;

         // Fetch user details from Clerk for the shared IDs
         // --- Mock Clerk API response when disabled ---
         const mockUsers = sharedUserIds.map(id => {
             if (id === 'mock-other-user-id') {
                 return { id: 'mock-other-user-id', emailAddresses: [{ id: 'em_1', emailAddress: 'other-user@example.com' }], primaryEmailAddressId: 'em_1', fullName: 'Other Mock User' };
             }
             // Return a generic mock for other IDs if needed, or filter them out
             return null;
         }).filter(user => user !== null) as any[]; // Filter out nulls and assert type


          // --- Original Clerk logic (commented out) ---
         // const users = await clerkClient.users.getUserList({ userId: sharedUserIds });

          const userInfos = mockUsers.map(user => {
             const primaryEmail = user.emailAddresses.find((em: any) => em.id === user.primaryEmailAddressId)?.emailAddress;
             return {
                 userId: user.id,
                 email: primaryEmail || 'No Primary Email',
                 name: user.fullName || primaryEmail || 'Unnamed User'
             };
         });

         // console.log(`Fetched details for ${userInfos.length} shared users for review ${weekKey}.`, logContext); // Replaced logInfo with console.log
         return userInfos;

     } catch (error) {
         // console.error(`Error fetching shared user list for review ${weekKey}:`, { error, ...logContext }); // Replaced logError with console.error
         throw new Error(`Failed to fetch shared users: ${error instanceof Error ? error.message : String(error)}`);
     }
}
