// src/app/actions/shareActions.ts
'use server';

// import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo, WeeklyReviewData } from '@/lib/types';
import { Collection } from 'mongodb';
import { 
    SearchUserByEmailInputSchema, 
    ShareReviewInputSchema,
    RevokeShareInputSchema,
    GetSharedWithUsersInputSchema
} from '@/lib/schemas'; 
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';

// Mock implementation for user search when Clerk is disabled
async function mockSearchUserByEmail(email: string): Promise<UserShareInfo | null> {
    // In a real non-Clerk scenario, you'd query your user database here.
    // For this mock, we'll return a predictable user if the email matches a pattern,
    // or null otherwise. This allows testing the sharing flow.
    if (email.startsWith('shared_user_')) {
        const mockId = `mock_user_id_for_${email.replace('@example.com', '')}`;
        return {
            userId: mockId,
            email: email,
            name: email.split('@')[0].replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), // e.g., "Shared User 1"
        };
    }
    if (email === process.env.NEXT_PUBLIC_MOCK_USER_EMAIL) { // If you have a mock email for the main user
        return {
            userId: process.env.NEXT_PUBLIC_MOCK_USER_ID!,
            email: process.env.NEXT_PUBLIC_MOCK_USER_EMAIL!,
            name: "Mock User (Self)"
        }
    }
    return null;
}

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const validationResult = SearchUserByEmailInputSchema.safeParse({ email });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for searchUserByEmailApi', { errors, apiAction: 'searchUserByEmailApi', receivedEmail: email });
        throw new Error(`Invalid input: ${errors.fieldErrors.email?.[0] || 'Invalid email'}`);
    }
    const validatedEmail = validationResult.data.email;

    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
    const logContext = { currentUserId, targetEmail: validatedEmail, operation: 'searchUserByEmailApi', apiAction: 'searchUserByEmailApi' };

    if (!currentUserId) {
        logError('Unauthorized search: Mock user ID not set.', undefined, { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: Mock user ID not set.');
    }

    logDebug(`Searching for user by email (mock).`, logContext);

    try {
        // Replace Clerk call with mock implementation
        const userResult = await mockSearchUserByEmail(validatedEmail.trim().toLowerCase());

        if (userResult) {
            logInfo(`User found by email (mock).`, { ...logContext, foundUserId: userResult.userId });
            return userResult;
        }
        logInfo("User not found by email (mock).", logContext);
        return null;
    } catch (error: any) {
        logError("Mock search user by email error", error, logContext); // Should not happen with current mock
        return null; 
    }
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const validationResult = ShareReviewInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for shareReviewApi', { errors, apiAction: 'shareReviewApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }
    const { weekKey: validatedWeekKey, targetUserId: validatedTargetUserId } = validationResult.data;


    // const { userId: currentUserId, user: currentUser } = auth(); // Clerk disabled
    const currentUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
    const currentUser = { // Simulate current user object
        username: 'Mock User',
        fullName: 'Mock User FullName',
        primaryEmailAddress: { emailAddress: process.env.NEXT_PUBLIC_MOCK_USER_EMAIL || 'mock@example.com' }
    };

    const logContext = { currentUserId, targetUserId: validatedTargetUserId, weekKey: validatedWeekKey, operation: 'shareReviewApi', apiAction: 'shareReviewApi' };

    if (!currentUserId) {
        logError('Unauthorized: Cannot share review. Mock user ID not set.', undefined, { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: Cannot share review.');
    }
    if (currentUserId === validatedTargetUserId) {
        logWarn('Attempted to share review with self.', logContext);
        throw new Error('Cannot share review with yourself.');
    }

    logDebug(`Attempting to share review ${validatedWeekKey} with ${validatedTargetUserId}.`, logContext);

    const client = await connectToDatabase();
    try {
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        let review = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });
        const sharerUsername = currentUser?.username || currentUser?.fullName || currentUser?.primaryEmailAddress?.emailAddress || currentUserId;

        if (!review) {
            logInfo(`Review ${validatedWeekKey} not found for owner ${currentUserId}. Creating new review shell for sharing.`, logContext);
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
            logInfo(`Created new review shell ${validatedWeekKey} and shared with ${validatedTargetUserId}.`, logContext);
            return;
        }
        
        if (!review.ownerUsername) {
            await reviewsCollection.updateOne(
                { weekKey: validatedWeekKey, ownerId: currentUserId },
                { $set: { ownerUsername: sharerUsername } }
            );
            logInfo(`Updated ownerUsername for review ${validatedWeekKey}.`, logContext);
        }

        const currentSharedWith = review.sharedWith || [];
        if (!currentSharedWith.includes(validatedTargetUserId)) {
            const updatedSharedWith = [...currentSharedWith, validatedTargetUserId].sort();

            const updateResult = await reviewsCollection.updateOne(
                { weekKey: validatedWeekKey, ownerId: currentUserId }, 
                { $set: { sharedWith: updatedSharedWith, ownerUsername: sharerUsername } }
            );

            if (updateResult.modifiedCount === 1) {
                logInfo(`Successfully shared review ${validatedWeekKey} with user ${validatedTargetUserId}.`, logContext);
            } else {
                logWarn(`Share update did not modify document for review ${validatedWeekKey}.`, { ...logContext, updateResult: updateResult.matchedCount });
                const updatedReview = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });
                if (!updatedReview?.sharedWith?.includes(validatedTargetUserId)) {
                    logError('Failed to update sharing status despite review existing.', undefined, logContext);
                    throw new Error('Failed to update sharing status despite review existing.');
                }
                logInfo(`Review ${validatedWeekKey} was likely already shared with user ${validatedTargetUserId}.`, logContext);
            }
        } else {
            logInfo(`Review ${validatedWeekKey} already shared with user ${validatedTargetUserId}. No action taken.`, logContext);
        }
    } catch (error: any) {
        logError(`DB Error sharing review ${validatedWeekKey} with user ${validatedTargetUserId}`, error, logContext);
        throw new Error(`Failed to share review: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const validationResult = RevokeShareInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for revokeShareApi', { errors, apiAction: 'revokeShareApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }
    const { weekKey: validatedWeekKey, targetUserId: validatedTargetUserId } = validationResult.data;

    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
    const logContext = { currentUserId, targetUserId: validatedTargetUserId, weekKey: validatedWeekKey, operation: 'revokeShareApi', apiAction: 'revokeShareApi' };

    if (!currentUserId) {
        logError('Unauthorized: Cannot revoke share. Mock user ID not set.', undefined, { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: Cannot revoke share.');
    }

    logDebug(`Attempting to revoke share for review ${validatedWeekKey} from ${validatedTargetUserId}.`, logContext);

    const client = await connectToDatabase();
    try {
        const db = client.db();
        const reviewsCollection: Collection<WeeklyReviewData> = db.collection('weeklyReviews');

        const review = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });

        if (!review) {
            logWarn(`Revoke failed: Review ${validatedWeekKey} not found or not owned by user ${currentUserId}.`, logContext);
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
                logInfo(`Successfully revoked share for review ${validatedWeekKey} from user ${validatedTargetUserId}.`, logContext);
            } else {
                logWarn(`Revoke update did not modify document for review ${validatedWeekKey}.`, { ...logContext, updateResult: updateResult.matchedCount });
                const updatedReview = await reviewsCollection.findOne({ weekKey: validatedWeekKey, ownerId: currentUserId });
                 if (updatedReview?.sharedWith?.includes(validatedTargetUserId)) {
                     logError('Failed to update sharing status despite review existing and user was in sharedWith.', undefined, logContext);
                     throw new Error('Failed to update sharing status despite review existing and user was in sharedWith.');
                 }
                logInfo(`Review ${validatedWeekKey} share was likely already revoked for user ${validatedTargetUserId}.`, logContext);
            }
        } else {
            logInfo(`Review ${validatedWeekKey} was not shared with user ${validatedTargetUserId}. No revoke needed.`, logContext);
        }
    } catch (error: any) {
        logError(`DB Error revoking share for review ${validatedWeekKey} from user ${validatedTargetUserId}`, error, logContext);
        throw new Error(`Failed to revoke share: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const validationResult = GetSharedWithUsersInputSchema.safeParse({ weekKey });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for getSharedWithUsersApi', { errors, apiAction: 'getSharedWithUsersApi', receivedWeekKey: weekKey });
        throw new Error(`Invalid input: ${errors.fieldErrors.weekKey?.[0] || 'Invalid weekKey'}`);
    }
    const validatedWeekKey = validationResult.data.weekKey;

    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
    const logContext = { currentUserId, weekKey: validatedWeekKey, operation: 'getSharedWithUsersApi', apiAction: 'getSharedWithUsersApi' };

    if (!currentUserId) {
        logError('Unauthorized: Cannot get shared list. Mock user ID not set.', undefined, { ...logContext, errorType: 'Unauthorized' });
        throw new Error('Unauthorized: Cannot get shared list.');
    }

    logDebug(`Fetching shared user list for review ${validatedWeekKey}.`, logContext);

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
            logInfo(`Review ${validatedWeekKey} not found, not owned by ${currentUserId}, or not shared with anyone.`, logContext);
            return [];
        }

        const sharedUserIds = review.sharedWith;
        if (sharedUserIds.length === 0) {
            logInfo(`Review ${validatedWeekKey} has an empty sharedWith list.`, logContext);
            return [];
        }
        
        // Since Clerk is disabled, we can't fetch user details from Clerk.
        // We'll mock this part or return minimal info based on IDs.
        // For a better mock, you might have a predefined list of mock users.
        const userInfos: UserShareInfo[] = await Promise.all(sharedUserIds.map(async (id) => {
            const mockUserInfo = await mockSearchUserByEmail(`shared_user_${id.substring(0,5)}@example.com`); // Create a dummy email to search
            return mockUserInfo || { userId: id, email: `user_${id.substring(0,5)}@example.com`, name: `User ${id.substring(0,5)}` };
        }));

        logInfo(`Fetched details for ${userInfos.length} shared users for review ${validatedWeekKey} (mocked).`, logContext);
        return userInfos;
    } catch (error: any) {
        logError(`DB/Mock Error fetching shared user list for review ${validatedWeekKey}`, error, logContext);
        return [];
    }
}
