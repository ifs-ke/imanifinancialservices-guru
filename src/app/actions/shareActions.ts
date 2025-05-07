// src/app/actions/shareActions.ts
'use server';

// import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled
import connectToDatabase from '@/lib/mongodb';
import type { UserShareInfo } from '@/lib/types';
import { Collection } from 'mongodb';
import { logInfo, logWarn, logError } from '@/lib/logger';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL = 'local-user@example.com';


export async function searchUserByEmailApi(email: string): Promise<UserShareInfo | null> {
    // const { userId: currentUserId } = auth(); // Clerk disabled
    const currentUserId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
    const logContext = { currentUserId, targetEmail: email, operation: 'searchUserByEmailApi' };

    // if (!currentUserId) { // Clerk disabled
    //     logError('Unauthorized search: User not logged in.', undefined, logContext);
    //     throw new Error('Unauthorized: User not logged in.');
    // }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        logWarn('Invalid email input for search.', logContext);
        return null;
    }

    logInfo(`Searching for user by email (Clerk Disabled - Mocking).`, logContext);
    // Mocking Clerk behavior when disabled
    if (email.trim().toLowerCase() === CLERK_DISABLED_PLACEHOLDER_CURRENT_USER_EMAIL) {
        logInfo("User tried to search for themselves (mocked).", logContext);
        return null;
    }
    if (email.trim().toLowerCase() === "found@example.com") {
        return {
            userId: "found-user-id",
            email: "found@example.com",
            name: "Found User",
        };
    }
    logInfo("User not found (mocked).", logContext);
    return null;
}

