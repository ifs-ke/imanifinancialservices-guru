// src/lib/roles.ts
 import type { User } from '@clerk/nextjs/server'; // Ensure type is available
 import { auth, clerkClient } from '@clerk/nextjs/server'; // Re-enable Clerk server-side

 export type AppRole = 'admin' | 'user';

 // No longer need placeholders
 // const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
 // const CLERK_DISABLED_DEFAULT_ROLE = 'user' as AppRole;


 export const hasRole = (role: AppRole): boolean => {
   const { sessionClaims } = auth(); // Use actual Clerk auth
   const userRole = sessionClaims?.publicMetadata?.role as AppRole | undefined; // Get role from Clerk metadata

   // No longer mocking
   // const userRole = CLERK_DISABLED_DEFAULT_ROLE;
   // console.warn("Clerk is disabled: hasRole check returning mocked value:", userRole === role);

   return userRole === role;
 };


 export const setUserRole = async (userId: string, role: AppRole) => {
     // Authorization check MUST be done by the caller context
     // Example: Only allow admins to call this function

     // Use Clerk client to update user metadata
     try {
         await clerkClient.users.updateUserMetadata(userId, {
             publicMetadata: { role: role }
         });
         // console.log(`Successfully set role for user ${userId} to ${role}.`); // Console log commented out
         return Promise.resolve();
     } catch (error) {
         // console.error(`Error setting user role for ${userId}:`, error); // Console log commented out
         throw new Error('Failed to set user role.');
     }

     // Removed mock logic
     // console.warn(`Clerk is disabled: Mocking setUserRole for user ${userId} to role ${role}. No actual change persisted.`);
     // return Promise.resolve();
 };


 export const getUserRole = async (userId: string): Promise<AppRole | undefined> => {
     // Authorization check MUST be done by the caller context if needed

     // Fetch user data from Clerk to get the role
     try {
         const user = await clerkClient.users.getUser(userId);
         const userRole = user?.publicMetadata?.role as AppRole | undefined;
         // console.log(`Fetched role for user ${userId}: ${userRole}`); // Console log commented out
         return userRole || 'user'; // Default to 'user' if no role found in metadata
     } catch (error) {
         // console.error(`Error getting user role for ${userId}:`, error); // Console log commented out
         // Decide how to handle errors - return undefined or default 'user'?
         return undefined; // Indicate role couldn't be fetched
     }

     // Removed mock logic
     // console.warn(`Clerk is disabled: Mocking getUserRole for user ${userId}. Returning default role.`);
     // if (userId === CLERK_DISABLED_PLACEHOLDER_USER_ID) {
     //    return CLERK_DISABLED_DEFAULT_ROLE;
     // }
     // return undefined;
 };
