
// src/lib/roles.ts
import { currentUser, clerkClient, type User } from '@clerk/nextjs/server'; // Added User type
import { logInfo, logWarn, logError } from '@/lib/logger';

export type AppRole = 'admin' | 'user';

/**
 * Checks if the given user has the specified role.
 * This is a synchronous check performed on a User object.
 * @param roleToCheck The role to check for.
 * @param user The Clerk User object (or null if not authenticated).
 * @returns boolean indicating if user has the role.
 */
export const hasRole = (roleToCheck: AppRole, user: User | null): boolean => {
  const userRole = user?.privateMetadata?.role as AppRole | undefined;
  logInfo(`Role check for user: requested '${roleToCheck}', actual '${userRole || 'none'}'`, {
    userId: user?.id || 'unauthenticated_or_null_user',
    requestedRole: roleToCheck,
    actualRole: userRole
  });
  return userRole === roleToCheck;
};

/**
 * Sets a user's role using Clerk.
 * Requires the calling user (admin) to have the 'admin' role.
 * @param userIdToUpdate The user ID to update.
 * @param role The role to assign.
 * @throws Error if unauthorized or Clerk operation fails.
 */
export const setUserRole = async (userIdToUpdate: string, role: AppRole): Promise<void> => {
  const adminUser = await currentUser(); // User attempting the action
  const adminUserId = adminUser?.id;

  // Authorization - only admins can assign roles
  if (!hasRole('admin', adminUser)) {
    logError("Unauthorized role modification attempt", {
      adminUser: adminUserId || 'unauthenticated_admin_attempt',
      targetUser: userIdToUpdate,
      attemptedRole: role
    });
    throw new Error("Admin privileges required to set user roles.");
  }

  if (!adminUserId) { // Should be caught by hasRole, but good for clarity
      logError("Admin user ID missing during role modification attempt.", {
        targetUser: userIdToUpdate,
        attemptedRole: role
      });
      throw new Error("Authenticated admin user ID is required.");
  }

  try {
    // Update user metadata through Clerk
    await clerkClient.users.updateUser(userIdToUpdate, {
      privateMetadata: { role }
    });

    logInfo(`Role updated for ${userIdToUpdate} to ${role} by admin ${adminUserId}`, {
      adminUser: adminUserId,
      targetUser: userIdToUpdate,
      newRole: role
    });
  } catch (error) {
    logError("Failed to update user role via Clerk", error, {
      adminUser: adminUserId,
      targetUser: userIdToUpdate,
      newRole: role
    });
    throw new Error("Failed to update user role with Clerk.");
  }
};

/**
 * Gets a user's role using Clerk.
 * @param userIdToQuery The user ID to query.
 * @returns Promise resolving to the user's role or undefined if not set.
 */
export const getUserRole = async (userIdToQuery: string): Promise<AppRole | undefined> => {
  const requestor = await currentUser(); // User making this request (for logging)
  try {
    // Fetch user from Clerk
    const user = await clerkClient.users.getUser(userIdToQuery);
    const role = user.privateMetadata?.role as AppRole | undefined;

    logInfo(`Retrieved role for ${userIdToQuery}`, {
      role,
      requestorId: requestor?.id || 'system_or_unauthenticated_requestor'
    });

    return role;
  } catch (error) {
    logError("Failed to fetch user role via Clerk", error, {
      targetUser: userIdToQuery,
      requestorId: requestor?.id || 'system_or_unauthenticated_requestor'
    });
    throw new Error("Failed to fetch user role from Clerk.");
  }
};
    