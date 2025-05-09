// src/app/actions/shareActions.ts
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
import { logInfo, logWarn, logError } from '@/lib/logger';

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const { userId: currentUserId } = auth();
    const logContext = { currentUserId, targetEmail: email, operation: 'searchUserByEmailApi' };

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
        const users = await clerkClient.users.getUserList({
            emailAddress: [email.trim().toLowerCase()],
        });

        if (users && users.length > 0) {
            const foundUser = users[0];
            logInfo(`User found by email.`, { ...logContext, foundUserId: foundUser.id });
            return {
                userId: foundUser.id,
                email: foundUser.primaryEmailAddress?.emailAddress || email.trim().toLowerCase(),
                name: foundUser.fullName || foundUser.firstName || foundUser.primaryEmailAddress?.emailAddress,
            };
        }
        logInfo("User not found by email.", logContext);
        return null;
    } catch (error) {
        logError("Clerk API error searching user by email", error, logContext);
        return null;
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const { userId: currentUserId, user: currentUser } = auth();
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

    const client = await connectToDatabase();
    try {
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        let review = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });
        const sharerUsername = currentUser?.username || currentUser?.fullName || currentUser?.primaryEmailAddress?.emailAddress || currentUserId;

        if (!review) {
            logInfo(`Review ${weekKey} not found for owner ${currentUserId}. Creating new review shell for sharing.`, logContext);
            const newReviewShell: WeeklyReviewData = {
                ownerId: currentUserId,
                ownerUsername: sharerUsername,
                journal: '', 
                transactionComments: {}, 
                sharedWith: [targetUserId].sort(), 
            };
            await reviewsCollection.insertOne({ 
                weekKey,
                ...newReviewShell,
            });
            logInfo(`Created new review shell ${weekKey} and shared with ${targetUserId}.`, logContext);
            return;
        }
        
        if (!review.ownerUsername) {
            await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId },
                { $set: { ownerUsername: sharerUsername } }
            );
            logInfo(`Updated ownerUsername for review ${weekKey}.`, logContext);
        }

        const currentSharedWith = review.sharedWith || [];
        if (!currentSharedWith.includes(targetUserId)) {
            const updatedSharedWith = [...currentSharedWith, targetUserId].sort();

            const updateResult = await reviewsCollection.updateOne(
                { weekKey, ownerId: currentUserId }, 
                { $set: { sharedWith: updatedSharedWith, ownerUsername: sharerUsername } }
            );

            if (updateResult.modifiedCount === 1) {
                logInfo(`Successfully shared review ${weekKey} with user ${targetUserId}.`, logContext);
            } else {
                logWarn(`Share update did not modify document for review ${weekKey}.`, { ...logContext, updateResult });
                const updatedReview = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });
                if (!updatedReview?.sharedWith?.includes(targetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing.');
                }
                logInfo(`Review ${weekKey} was likely already shared with user ${targetUserId}.`, logContext);
            }
        } else {
            logInfo(`Review ${weekKey} already shared with user ${targetUserId}. No action taken.`, logContext);
        }
    } catch (error) {
        logError(`Error sharing review ${weekKey} with user ${targetUserId}:`, error, logContext);
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await client.close();
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

    const client = await connectToDatabase();
    try {
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
                { $set: { sharedWith: updatedSharedWith } }
            );

            if (updateResult.modifiedCount === 1) {
                logInfo(`Successfully revoked share for review ${weekKey} from user ${targetUserId}.`, logContext);
            } else {
                logWarn(`Revoke update did not modify document for review ${weekKey}.`, { ...logContext, updateResult });
                const updatedReview = await reviewsCollection.findOne({ weekKey, ownerId: currentUserId });
                if (updatedReview?.sharedWith?.includes(targetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing and user was in sharedWith.');
                }
                logInfo(`Review ${weekKey} share was likely already revoked for user ${targetUserId}.`, logContext);
            }
        } else {
            logInfo(`Review ${weekKey} was not shared with user ${targetUserId}. No revoke needed.`, logContext);
        }
    } catch (error) {
        logError(`Error revoking share for review ${weekKey} from user ${targetUserId}:`, error, logContext);
        throw new Error(`Failed to revoke share: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await client.close();
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

    const client = await connectToDatabase();
    try {
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        const review = await reviewsCollection.findOne({ 
            weekKey, 
            ownerId: currentUserId 
        }, { 
            projection: { sharedWith: 1 } 
        });

        if (!review || !review.sharedWith || review.sharedWith.length === 0) {
            logInfo(`Review ${weekKey} not found, not owned by ${currentUserId}, or not shared with anyone.`, logContext);
            return [];
        }

        const sharedUserIds = review.sharedWith;
        if (sharedUserIds.length === 0) {
            logInfo(`Review ${weekKey} has an empty sharedWith list.`, logContext);
            return [];
        }
        
        const users = await clerkClient.users.getUserList({
            userId: sharedUserIds,
        });

        const userInfos: UserShareInfo[] = users.map((user: { id: any; primaryEmailAddress: { emailAddress: any; }; fullName: any; firstName: any; }) => ({
            userId: user.id,
            email: user.primaryEmailAddress?.emailAddress || 'No email',
            name: user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress,
        }));

        logInfo(`Fetched details for ${userInfos.length} shared users for review ${weekKey}.`, logContext);
        return userInfos;
    } catch (error) {
        logError(`Error fetching shared user list for review ${weekKey}:`, error, logContext);
        throw new Error(`Failed to fetch shared users: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await client.close();
    }
}