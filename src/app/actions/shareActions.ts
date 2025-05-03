// src/app/actions/shareActions.ts
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo } from '@/lib/types'; // Assuming UserShareInfo is defined in types
import { Collection, ObjectId } from 'mongodb'; // Import ObjectId if needed for _id

/**
 * Searches for a user by their primary email address.
 * Security: Ensures only authenticated users can perform searches.
 * @param email The email address to search for.
 * @returns UserShareInfo object if found, otherwise null.
 */
export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const { userId: currentUserId } = auth();
    if (!currentUserId) {
        throw new Error('Unauthorized: User not logged in.');
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        return null; // Invalid email input
    }

    try {
        const users = await clerkClient.users.getUserList({
            emailAddress: [email.trim().toLowerCase()],
            limit: 1, // We only need one match
        });

        if (users.data.length > 0) {
            const user = users.data[0];
            // Ensure the found user is not the current user trying to share with themselves
            if (user.id === currentUserId) {
                console.log("User tried to search for themselves.");
                return null;
            }
             // Extract primary email correctly
            const primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress;

            if (!primaryEmail) {
                 console.warn(`User ${user.id} found but has no primary email address.`);
                 return null;
            }


            return {
                userId: user.id,
                email: primaryEmail,
                name: user.firstName ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}` : primaryEmail, // Construct name or default to email
            };
        }

        return null; // User not found
    } catch (error) {
        console.error('Error searching for user by email:', error);
        throw new Error('Failed to search for user.'); // Or return null based on desired error handling
    }
}

/**
 * Shares a specific weekly review with another user.
 * Security: Ensures the caller owns the review being shared.
 * @param weekKey The key of the weekly review (e.g., '2024-30').
 * @param targetUserId The ID of the user to share with.
 */
export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: ownerId } = auth();
    if (!ownerId) {
        throw new Error('Unauthorized: User not logged in.');
    }
    if (ownerId === targetUserId) {
        throw new Error('Cannot share a review with yourself.');
    }

    if (!weekKey || !targetUserId) {
        throw new Error('Missing weekKey or targetUserId.');
    }

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const collection: Collection = db.collection('weeklyReviews');

        // Find the specific review document owned by the current user
        const result = await collection.updateOne(
            { userId: ownerId, weekKey: weekKey }, // Ensure the user owns this review
            { $addToSet: { sharedWith: targetUserId } } // Add targetUserId to the sharedWith array if not already present
        );

        if (result.matchedCount === 0) {
            throw new Error(`Review for week ${weekKey} not found or you do not own it.`);
        }
        if (result.modifiedCount > 0) {
             console.log(`Successfully shared review ${weekKey} from user ${ownerId} with user ${targetUserId}`);
        } else {
             console.log(`User ${targetUserId} was already in the sharedWith list for review ${weekKey}.`);
        }

    } catch (error) {
        console.error(`Error sharing review ${weekKey} with user ${targetUserId}:`, error);
        throw new Error('Failed to share weekly review.');
    }
}

/**
 * Revokes access to a specific weekly review from a user.
 * Security: Ensures the caller owns the review being revoked.
 * @param weekKey The key of the weekly review (e.g., '2024-30').
 * @param targetUserId The ID of the user to revoke access from.
 */
export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: ownerId } = auth();
    if (!ownerId) {
        throw new Error('Unauthorized: User not logged in.');
    }
     if (ownerId === targetUserId) {
        // Should not happen via UI, but good validation
        throw new Error('Cannot revoke share from yourself.');
    }

    if (!weekKey || !targetUserId) {
        throw new Error('Missing weekKey or targetUserId.');
    }

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const collection: Collection = db.collection('weeklyReviews');

        // Find the specific review document owned by the current user
        const result = await collection.updateOne(
            { userId: ownerId, weekKey: weekKey }, // Ensure the user owns this review
            { $pull: { sharedWith: targetUserId } } // Remove targetUserId from the sharedWith array
        );

         if (result.matchedCount === 0) {
            throw new Error(`Review for week ${weekKey} not found or you do not own it.`);
        }
        if (result.modifiedCount > 0) {
             console.log(`Successfully revoked access to review ${weekKey} from user ${targetUserId} by owner ${ownerId}`);
        } else {
            console.log(`User ${targetUserId} was not found in the sharedWith list for review ${weekKey}. No changes made.`);
        }

    } catch (error) {
        console.error(`Error revoking share for review ${weekKey} from user ${targetUserId}:`, error);
        throw new Error('Failed to revoke share for weekly review.');
    }
}

/**
 * Fetches basic information (ID, name, email) for users a review is shared with.
 * Security: Ensures the caller owns the review.
 * @param weekKey The key of the weekly review.
 * @returns Array of UserShareInfo objects.
 */
export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
     const { userId: ownerId } = auth();
    if (!ownerId) {
        throw new Error('Unauthorized: User not logged in.');
    }

    if (!weekKey) {
        throw new Error('Missing weekKey.');
    }

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const collection: Collection = db.collection('weeklyReviews');

        const review = await collection.findOne(
            { userId: ownerId, weekKey: weekKey },
            { projection: { sharedWith: 1, _id: 0 } } // Only fetch the sharedWith field
        );

        if (!review || !review.sharedWith || review.sharedWith.length === 0) {
            return []; // No one shared with or review not found
        }

        const sharedUserIds = review.sharedWith as string[];

         // Fetch user details from Clerk for the shared IDs
         const users = await clerkClient.users.getUserList({
             userId: sharedUserIds,
             limit: sharedUserIds.length, // Fetch all specified users
         });

        // Map Clerk user data to UserShareInfo
         const userInfos: UserShareInfo[] = users.data.map(user => {
             const primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress || 'No primary email';
             return {
                 userId: user.id,
                 email: primaryEmail,
                 name: user.firstName ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}` : primaryEmail,
             };
         });

        return userInfos;

    } catch (error) {
        console.error(`Error fetching shared users for review ${weekKey}:`, error);
        throw new Error('Failed to fetch shared user list.');
    }
}
