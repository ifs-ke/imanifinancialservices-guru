// src/lib/roles.ts
 // import type { User } from '@clerk/nextjs/server'; // Clerk disabled
 // import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled
 import { logInfo, logWarn, logError } from '@/lib/logger'; 

 export type AppRole = 'admin' | 'user';

 // When Clerk is disabled, role checking becomes simplified or relies on mock data.
 // For this example, we'll assume a mock admin user ID or a very basic check.
 const MOCK_ADMIN_USER_ID = process.env.NEXT_PUBLIC_MOCK_ADMIN_USER_ID || 'mock-admin-user';


 export const hasRole = (role: AppRole): boolean => {
   // const { sessionClaims, userId } = auth(); // Clerk disabled
   // const userRole = sessionClaims?.privateMetadata?.role as AppRole | undefined; // Clerk disabled

   const currentMockUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
   let userRole: AppRole | undefined = 'user'; // Default to 'user'

   if (currentMockUserId === MOCK_ADMIN_USER_ID) {
     userRole = 'admin';
   }
   
   logInfo(`Role check for user ${currentMockUserId || 'unauthenticated'}: requested role '${role}', actual role '${userRole || 'none'}'`, { userId: currentUserIdToLog(), requestedRole: role, actualRole: userRole });
   return userRole === role;
 };

 const currentUserIdToLog = () => process.env.NEXT_PUBLIC_MOCK_USER_ID || 'unauthenticated';


 export const setUserRole = async (userIdToUpdate: string, role: AppRole): Promise<void> => {
     // Authorization check MUST be done by the caller context
     // Since Clerk is disabled, this function would need a different mechanism for authorization
     // For now, it will log a warning and not perform any action.
     const currentAdminId = process.env.NEXT_PUBLIC_MOCK_USER_ID; // Simulate admin
     const logContext = { currentAdminId, targetUserId: userIdToUpdate, newRole: role, operation: 'setUserRole' };

     if (currentAdminId !== MOCK_ADMIN_USER_ID) { // Simplified admin check
        logError("Unauthorized attempt to set user role: Mock admin privileges required.", undefined, logContext);
        throw new Error("Unauthorized: Admin privileges required (mock).");
     }

     logWarn(`setUserRole called but Clerk is disabled. Role for ${userIdToUpdate} to ${role} not set via Clerk.`, logContext);
     // In a real non-Clerk setup, you would update your database here.
     // For now, this function is effectively a no-op for actual role persistence
     // without an alternative backend system.
     return Promise.resolve();
 };


 export const getUserRole = async (userIdToQuery: string): Promise<AppRole | undefined> => {
     const logContext = { currentUserId: currentUserIdToLog(), targetUserId: userIdToQuery, operation: 'getUserRole' };
     logInfo(`Fetching role for user ${userIdToQuery} (Clerk disabled).`, logContext);

     // Simplified role determination based on mock admin ID
     if (userIdToQuery === MOCK_ADMIN_USER_ID) {
         logInfo(`User ${userIdToQuery} is mock admin.`, logContext);
         return 'admin';
     }
     // Default to 'user' for any other ID when Clerk is disabled
     logInfo(`User ${userIdToQuery} is not mock admin, defaulting to 'user'.`, logContext);
     return 'user'; 
 };
