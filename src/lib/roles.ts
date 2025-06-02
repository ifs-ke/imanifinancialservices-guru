// src/lib/roles.ts
import { auth, clerkClient } from '@clerk/nextjs/server';
import { logInfo, logWarn, logError } from '@/lib/logger'; 

export type AppRole = 'admin' | 'user';

/**
 * Checks if current user has the specified role
 * @param role The role to check for
 * @returns boolean indicating if user has the role
 */
export const hasRole = (role: AppRole): boolean => {
  const { sessionClaims } = auth();
  
  // Extract role from Clerk session claims
  const userRole = sessionClaims?.privateMetadata?.role as AppRole | undefined;
  
  logInfo(`Role check for user: requested '${role}', actual '${userRole || 'none'}'`, {
    userId: sessionClaims?.sub || 'unauthenticated',
    requestedRole: role,
    actualRole: userRole
  });
  
  return userRole === role;
};

/**
 * Sets a user's role using Clerk
 * @param userIdToUpdate The user ID to update
 * @param role The role to assign
 * @throws Error if unauthorized or Clerk operation fails
 */
export const setUserRole = async (userIdToUpdate: string, role: AppRole): Promise<void> => {
  const { userId } = auth();
  
  // Authorization - only admins can assign roles
  if (!hasRole('admin')) {
    logError("Unauthorized role modification attempt", {
      currentUser: userId,
      targetUser: userIdToUpdate,
      attemptedRole: role
    });
    throw new Error("Admin privileges required");
  }

  try {
    // Update user metadata through Clerk
    await clerkClient.users.updateUser(userIdToUpdate, {
      privateMetadata: { role }
    });
    
    logInfo(`Role updated for ${userIdToUpdate} to ${role}`, {
      adminUser: userId,
      targetUser: userIdToUpdate,
      newRole: role
    });
  } catch (error) {
    logError("Failed to update user role via Clerk", error, {
      adminUser: userId,
      targetUser: userIdToUpdate,
      newRole: role
    });
    throw new Error("Failed to update user role");
  }
};

/**
 * Gets a user's role using Clerk
 * @param userIdToQuery The user ID to query
 * @returns Promise resolving to the user's role or undefined if not set
 */
export const getUserRole = async (userIdToQuery: string): Promise<AppRole | undefined> => {
  try {
    // Fetch user from Clerk
    const user = await clerkClient.users.getUser(userIdToQuery);
    const role = user.privateMetadata?.role as AppRole | undefined;
    
    logInfo(`Retrieved role for ${userIdToQuery}`, { 
      role,
      requestor: auth().userId || 'system'
    });
    
    return role;
  } catch (error) {
    logError("Failed to fetch user role via Clerk", error, {
      targetUser: userIdToQuery,
      requestor: auth().userId || 'system'
    });
    throw new Error("Failed to fetch user role");
  }
};