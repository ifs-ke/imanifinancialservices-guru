
// src/app/actions/shareActions.ts
'use server';

import type { UserShareInfo } from '@/lib/types';
import { 
    SearchUserByEmailInputSchema, 
    ShareReviewInputSchema,
    RevokeShareInputSchema,
    GetSharedWithUsersInputSchema
} from '@/lib/schemas'; 
import { logWarn, logError } from '@/lib/logger';

const MOCK_USER_ID = process.env.NEXT_PUBLIC_MOCK_USER_ID;

export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    const validationResult = SearchUserByEmailInputSchema.safeParse({ email });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for searchUserByEmailApi (MongoDB removed)', { errors, apiAction: 'searchUserByEmailApi', receivedEmail: email });
        throw new Error(`Invalid input: ${errors.fieldErrors.email?.[0] || 'Invalid email'}`);
    }
    logWarn('searchUserByEmailApi: MongoDB has been removed. This feature is disabled.', { targetEmail: email, apiAction: 'searchUserByEmailApi' });
    return null; // No database to search users
}

export async function shareReviewApi(weekKey: string, targetUserId: string): Promise<void> {
    const validationResult = ShareReviewInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for shareReviewApi (MongoDB removed)', { errors, apiAction: 'shareReviewApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }
    logWarn(`shareReviewApi: MongoDB has been removed. Cannot share review ${weekKey} with ${targetUserId}.`, { currentUserId: MOCK_USER_ID, targetUserId, weekKey, apiAction: 'shareReviewApi' });
    throw new Error('Sharing functionality is disabled as MongoDB has been removed.');
}

export async function revokeShareApi(weekKey: string, targetUserId: string): Promise<void> {
    const validationResult = RevokeShareInputSchema.safeParse({ weekKey, targetUserId });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for revokeShareApi (MongoDB removed)', { errors, apiAction: 'revokeShareApi', receivedWeekKey: weekKey, receivedTargetUserId: targetUserId });
        throw new Error(`Invalid input: ${Object.values(errors.fieldErrors).flat().join(', ')}`);
    }
    logWarn(`revokeShareApi: MongoDB has been removed. Cannot revoke share for review ${weekKey} from ${targetUserId}.`, { currentUserId: MOCK_USER_ID, targetUserId, weekKey, apiAction: 'revokeShareApi' });
    throw new Error('Revoking share functionality is disabled as MongoDB has been removed.');
}

export async function getSharedWithUsersApi(weekKey: string): Promise<UserShareInfo[]> {
    const validationResult = GetSharedWithUsersInputSchema.safeParse({ weekKey });
    if (!validationResult.success) {
        const errors = validationResult.error.flatten();
        logWarn('Invalid input for getSharedWithUsersApi (MongoDB removed)', { errors, apiAction: 'getSharedWithUsersApi', receivedWeekKey: weekKey });
        throw new Error(`Invalid input: ${errors.fieldErrors.weekKey?.[0] || 'Invalid weekKey'}`);
    }
    logWarn(`getSharedWithUsersApi: MongoDB has been removed. Cannot fetch shared users for review ${weekKey}.`, { currentUserId: MOCK_USER_ID, weekKey, apiAction: 'getSharedWithUsersApi' });
    return []; // No database to fetch from
}
