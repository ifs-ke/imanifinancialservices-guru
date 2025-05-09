// src/lib/roles.ts
 import type { User } from '@clerk/nextjs/server'; // Ensure type is available
 import { auth, clerkClient } from '@clerk/nextjs/server'; // Re-enable Clerk server-side
 import { logInfo, logWarn, logError } from '@/lib/logger'; // Import logger

 export type AppRole = 'admin' | 'user';

 // No longer need placeholders
 // const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
 // const CLERK_DISABLED_DEFAULT_ROLE = 'user' as AppRole;


 export const hasRole = (role: AppRole): boolean => {
   const { sessionClaims, userId } = auth(); // Use actual Clerk auth
   const userRole = sessionClaims?.publicMetadata?.role as AppRole | undefined; // Get role from Clerk metadata
   logInfo(`Role check for user ${userId || 'unauthenticated'}: requested role '${role}', actual role '${userRole || 'none'}'`, { userId, requestedRole: role, actualRole: userRole });
   return userRole === role;
 };


 export const setUserRole = async (userIdToUpdate: string, role: AppRole) => {
     // Authorization check MUST be done by the caller context
     // Example: Only allow admins to call this function (e.g., check if auth().userId is an admin)
     const { userId: currentAdminId } = auth();
     const logContext = { currentAdminId, targetUserId: userIdToUpdate, newRole: role, operation: 'setUserRole' };

     if (!currentAdminId) {
        logError("Unauthorized attempt to set user role: No admin session found.", undefined, logContext);
        throw new Error("Unauthorized: Admin privileges required.");
     }
     
     const isAdmin = (await getUserRole(currentAdminId)) === 'admin';
     if (!isAdmin) {
        logError(`User ${currentAdminId} attempted to set role for ${userIdToUpdate} without admin privileges.`, undefined, logContext);
        throw new Error("Forbidden: Admin privileges required.");
     }


     try {
         logInfo(`Admin ${currentAdminId} attempting to set role for user ${userIdToUpdate} to ${role}.`, logContext);
         await clerkClient.users.updateUserMetadata(userIdToUpdate, {
             publicMetadata: { role: role }
         });
         logInfo(`Successfully set role for user ${userIdToUpdate} to ${role}.`, logContext);
         return Promise.resolve();
     } catch (error) {
         logError(`Error setting user role for ${userIdToUpdate}:`, error, logContext);
         throw new Error('Failed to set user role.');
     }
 };


 export const getUserRole = async (userIdToQuery: string): Promise<AppRole | undefined> => {
     const { userId: currentUserId } = auth(); // For logging context primarily
     const logContext = { currentUserId: currentUserId || 'system_or_unauthenticated_query', targetUserId: userIdToQuery, operation: 'getUserRole' };

     // Authorization check by caller context if needed (e.g., only admins can query roles of others)
     logInfo(`Fetching role for user ${userIdToQuery}.`, logContext);
     try {
         const user = await clerkClient.users.getUser(userIdToQuery);
         const userRole = user?.publicMetadata?.role as AppRole | undefined;
         logInfo(`Fetched role for user ${userIdToQuery}: ${userRole || 'none'}. Defaulting to 'user' if undefined.`, { ...logContext, fetchedRole: userRole });
         return userRole || 'user'; // Default to 'user' if no role found in metadata or user not found (Clerk might throw before this for not found)
     } catch (error: any) {
         if (error.status === 404) { // Clerk API might return 404 if user doesn't exist
            logWarn(`User ${userIdToQuery} not found when trying to get role. Defaulting to 'user'.`, { ...logContext, clerkErrorStatus: error.status });
            return 'user'; // Default to 'user' if user doesn't exist
         }
         logError(`Error getting user role for ${userIdToQuery}:`, error, logContext);
         // Decide how to handle other errors - return undefined or default 'user'?
         // Returning 'user' might be safer for non-critical role checks.
         return 'user';
     }
 };
