// src/app/actions/shareActions.ts
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
import { 
    SearchUserByEmailInputSchema, 
    ShareReviewInputSchema,
    RevokeShareInputSchema,
    GetSharedWithUsersInputSchema
} from '@/lib/schemas'; 

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const validationResult = SearchUserByEmailInputSchema.safeParse({ email });
    if (!validationResult.success) {
        console.warn('Invalid input for searchUserByEmailApi', { errors: validationResult.error.flatten(), apiAction: 'searchUserByEmailApi' });
        throw new Error(`Invalid input: ${validationResult.error.flatten().fieldErrors.email?.[0] || 'Invalid email'}`);
    }
    const validatedEmail = validationResult.data.email;

    const { userId: currentUserId } = auth();
    const logContext = { currentUserId, targetEmail: validatedEmail, operation: 'searchUserByEmailApi', apiAction: 'searchUserByEmailApi' };

    if (!currentUserId) {
        console.error('Unauthorized search: User not logged in.', { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: User not logged in.');
    }

    console.log(`Searching for user by email.`, logContext);

    try {
        const users = await clerkClient.users.getUserList({
            emailAddress: [validatedEmail.trim().toLowerCase()],
        });

        if (users && users.length > 0) {
            const foundUser = users[0];
            console.log(`User found by email.`, { ...logContext, foundUserId: foundUser.id });
            return {
                userId: foundUser.id,
                email: foundUser.primaryEmailAddress?.emailAddress || validatedEmail.trim().toLowerCase(),
                name: foundUser.fullName || foundUser.firstName || foundUser.primaryEmailAddress?.emailAddress,
            };
        }
        console.log("User not found by email.", logContext);
        return null;
    } catch (error: any) {
        console.error("Clerk API error searching user by email", { ...logContext, errorMessage: error.message, stack: error.stack });
        return null; 
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const validationResult = ShareReviewInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        console.warn('Invalid input for shareReviewApi', { errors: validationResult.error.flatten(), apiAction: 'shareReviewApi' });
        throw new Error(`Invalid input: ${Object.values(validationResult.error.flatten().fieldErrors).flat().join(', ')}`);
    }
    const { weekKey: validatedWeekKey, targetUserId: validatedTargetUserId } = validationResult.data;


    const { userId: currentUserId, user: currentUser } = auth();
    const logContext = { currentUserId, targetUserId: validatedTargetUserId, weekKey: validatedWeekKey, operation: 'shareReviewApi', apiAction: 'shareReviewApi' };

    if (!currentUserId) {
        console.error('Unauthorized: Cannot share review. User not logged in.', { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: Cannot share review.');
    }
    if (currentUserId === validatedTargetUserId) {
        console.warn('Attempted to share review with self.', logContext);
        throw new Error('Cannot share review with yourself.');
    }

    console.log(`Attempting to share review ${validatedWeekKey} with ${validatedTargetUserId}.`, logContext);

    const client = await connectToDatabase();
    try {
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        let review = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });
        const sharerUsername = currentUser?.username || currentUser?.fullName || currentUser?.primaryEmailAddress?.emailAddress || currentUserId;

        if (!review) {
            console.log(`Review ${validatedWeekKey} not found for owner ${currentUserId}. Creating new review shell for sharing.`, logContext);
            const newReviewShell: WeeklyReviewData = {
                ownerId: currentUserId,
                ownerUsername: sharerUsername,
                journal: '', 
                transactionComments: {}, 
                sharedWith: [validatedTargetUserId].sort(), 
            };
            await reviewsCollection.insertOne({ 
                weekKey: validatedWeekKey,
                ...newReviewShell,
            });
            console.log(`Created new review shell ${validatedWeekKey} and shared with ${validatedTargetUserId}.`, logContext);
            return;
        }
        
        if (!review.ownerUsername) {
            await reviewsCollection.updateOne(
                { weekKey: validatedWeekKey, ownerId: currentUserId },
                { $set: { ownerUsername: sharerUsername } }
            );
            console.log(`Updated ownerUsername for review ${validatedWeekKey}.`, logContext);
        }

        const currentSharedWith = review.sharedWith || [];
        if (!currentSharedWith.includes(validatedTargetUserId)) {
            const updatedSharedWith = [...currentSharedWith, validatedTargetUserId].sort();

            const updateResult = await reviewsCollection.updateOne(
                { weekKey: validatedWeekKey, ownerId: currentUserId }, 
                { $set: { sharedWith: updatedSharedWith, ownerUsername: sharerUsername } }
            );

            if (updateResult.modifiedCount === 1) {
                console.log(`Successfully shared review ${validatedWeekKey} with user ${validatedTargetUserId}.`, logContext);
            } else {
                console.warn(`Share update did not modify document for review ${validatedWeekKey}.`, { ...logContext, updateResult });
                const updatedReview = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });
                if (!updatedReview?.sharedWith?.includes(validatedTargetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing.');
                }
                console.log(`Review ${validatedWeekKey} was likely already shared with user ${validatedTargetUserId}.`, logContext);
            }
        } else {
            console.log(`Review ${validatedWeekKey} already shared with user ${validatedTargetUserId}. No action taken.`, logContext);
        }
    } catch (error: any) {
        console.error(`Error sharing review ${validatedWeekKey} with user ${validatedTargetUserId}:`, { ...logContext, errorMessage: error.message, stack: error.stack });
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        if (client) await client.close();
    }
}

export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const validationResult = RevokeShareInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        console.warn('Invalid input for revokeShareApi', { errors: validationResult.error.flatten(), apiAction: 'revokeShareApi' });
        throw new Error(`Invalid input: ${Object.values(validationResult.error.flatten().fieldErrors).flat().join(', ')}`);
    }
    const { weekKey: validatedWeekKey, targetUserId: validatedTargetUserId } = validationResult.data;

    const { userId: currentUserId } = auth();
    const logContext = { currentUserId, targetUserId: validatedTargetUserId, weekKey: validatedWeekKey, operation: 'revokeShareApi', apiAction: 'revokeShareApi' };

    if (!currentUserId) {
        console.error('Unauthorized: Cannot revoke share. User not logged in.', { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    console.log(`Attempting to revoke share for review ${validatedWeekKey} from ${validatedTargetUserId}.`, logContext);

    const client = await connectToDatabase();
    try {
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        const review = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });

        if (!review) {
            console.warn(`Revoke failed: Review ${validatedWeekKey} not found or not owned by user ${currentUserId}.`, logContext);
            throw new Error(`Review ${validatedWeekKey} not found or not owned by you.`);
        }

        const currentSharedWith = review.sharedWith || [];
        if (currentSharedWith.includes(validatedTargetUserId)) {
            const updatedSharedWith = currentSharedWith.filter(id => id !== validatedTargetUserId);

            const updateResult = await reviewsCollection.updateOne(
                { weekKey: validatedWeekKey, ownerId: currentUserId }, 
                { $set: { sharedWith: updatedSharedWith } }
            );

            if (updateResult.modifiedCount === 1) {
                console.log(`Successfully revoked share for review ${validatedWeekKey} from user ${validatedTargetUserId}.`, logContext);
            } else {
                console.warn(`Revoke update did not modify document for review ${validatedWeekKey}.`, { ...logContext, updateResult });
                const updatedReview = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });
                if (updatedReview?.sharedWith?.includes(validatedTargetUserId)) {
                    throw new Error('Failed to update sharing status despite review existing and user was in sharedWith.');
                }
                console.log(`Review ${validatedWeekKey} share was likely already revoked for user ${validatedTargetUserId}.`, logContext);
            }
        } else {
            console.log(`Review ${validatedWeekKey} was not shared with user ${validatedTargetUserId}. No revoke needed.`, logContext);
        }
    } catch (error: any) {
        console.error(`Error revoking share for review ${validatedWeekKey} from user ${validatedTargetUserId}:`, { ...logContext, errorMessage: error.message, stack: error.stack });
        throw new Error(`Failed to revoke share: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        if (client) await client.close();
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const validationResult = GetSharedWithUsersInputSchema.safeParse({ weekKey });
    if (!validationResult.success) {
        console.warn('Invalid input for getSharedWithUsersApi', { errors: validationResult.error.flatten(), apiAction: 'getSharedWithUsersApi' });
        throw new Error(`Invalid input: ${validationResult.error.flatten().fieldErrors.weekKey?.[0] || 'Invalid weekKey'}`);
    }
    const validatedWeekKey = validationResult.data.weekKey;

    const { userId: currentUserId } = auth();
    const logContext = { currentUserId, weekKey: validatedWeekKey, operation: 'getSharedWithUsersApi', apiAction: 'getSharedWithUsersApi' };

    if (!currentUserId) {
        console.error('Unauthorized: Cannot get shared list. User not logged in.', { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: Cannot get shared list.');
    }

    console.log(`Fetching shared user list for review ${validatedWeekKey}.`, logContext);

    const client = await connectToDatabase();
    try {
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        const review = await reviewsCollection.findOne({ 
            weekKey: validatedWeekKey, 
            ownerId: currentUserId 
        }, { 
            projection: { sharedWith: 1 } 
        });

        if (!review || !review.sharedWith || review.sharedWith.length === 0) {
            console.log(`Review ${validatedWeekKey} not found, not owned by ${currentUserId}, or not shared with anyone.`, logContext);
            return [];
        }

        const sharedUserIds = review.sharedWith;
        if (sharedUserIds.length === 0) {
            console.log(`Review ${validatedWeekKey} has an empty sharedWith list.`, logContext);
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

        console.log(`Fetched details for ${userInfos.length} shared users for review ${validatedWeekKey}.`, logContext);
        return userInfos;
    } catch (error: any) {
        console.error(`Error fetching shared user list for review ${validatedWeekKey}:`, { ...logContext, errorMessage: error.message, stack: error.stack });
        return [];
    } finally {
        if (client) await client.close();
    }
}