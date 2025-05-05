// src/lib/roles.ts
import type { User } from '@clerk/nextjs/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export type AppRole = 'admin' | 'user'; // Define available roles

/**
 * Checks if the currently authenticated user has the specified role.
 * Relies on publicMetadata stored in Clerk.
 *
 * Security: This function relies on Clerk's `auth()` helper, which securely
 * retrieves session claims verified server-side. It does not expose sensitive
 * information client-side and correctly checks against the roles defined in Clerk.
 *
 * @param role The role to check for.
 * @returns True if the user has the role, false otherwise.
 */
export const hasRole = (role: AppRole): boolean => {
  const { sessionClaims } = auth(); // Securely gets claims for the current session

  // Access publicMetadata from session claims (assumed to be securely set via Clerk)
  const userRole = sessionClaims?.publicMetadata?.role as AppRole | undefined;

  return userRole === role;
};


/**
 * Sets the role for a specific user.
 * !! IMPORTANT: This function modifies user data and should ONLY be callable
 * !! by authorized administrators in a secure SERVER-SIDE context (e.g., an admin panel API route).
 * !! DO NOT expose this directly to client-side requests without proper authorization checks.
 *
 * Security: Removed the internal isAdmin() check. Authorization must be handled by the caller.
 * Uses `clerkClient` which requires server-side execution and appropriate Clerk secret keys.
 *
 * @param userId The ID of the user to modify.
 * @param role The new role to assign.
 * @throws Error if the Clerk API call fails.
 */
export const setUserRole = async (userId: string, role: AppRole) => {
    // Authorization check removed - must be done by the caller context (e.g., API route or server action)
    // if (!isAdmin()) { // REMOVED
    //      throw new Error("Unauthorized: Only admins can set user roles.");
    //  }

    try {
        // Use the secure Clerk server-side client to update metadata
        await clerkClient.users.updateUserMetadata(userId, {
            publicMetadata: {
                role: role,
            },
        });
        console.log(`Successfully set role '${role}' for user ${userId}`);
    } catch (error) {
        console.error(`Error setting role for user ${userId}:`, error);
        throw new Error("Failed to set user role.");
    }
};

/**
 * Retrieves the role of a specific user.
 * This might be useful in server-side scenarios or admin panels.
 *
 * Security: Uses the secure `clerkClient` which requires server-side execution.
 * Access should still be controlled (e.g., only allow admins to call this for other users).
 * Authorization check removed - must be performed by the caller if necessary.
 *
 * @param userId The ID of the user.
 * @returns The user's role or undefined if not set or user not found.
 */
export const getUserRole = async (userId: string): Promise<AppRole | undefined> => {
    // Authorization check removed - must be performed by the caller context.
    // Example: if (!isAdmin() && auth().userId !== userId) { throw new Error("Unauthorized"); }

    try {
        const user = await clerkClient.users.getUser(userId);
        return user.publicMetadata?.role as AppRole | undefined;
    } catch (error) {
        console.error(`Error fetching role for user ${userId}:`, error);
        return undefined; // Return undefined on error/user not found
    }
};


// Example Usage (in a server component or API route - *requires* external authorization check):
/*
import { setUserRole } from '@/lib/roles';
import { auth } from '@clerk/nextjs/server';

// --- THIS IS AN EXAMPLE - DO NOT USE WITHOUT PROPER AUTHORIZATION ---
async function someAdminAction(formData: FormData) {
    'use server';
    const { userId: currentUserId } = auth();

    // !!! CRITICAL: Perform admin authorization check here !!!
    // This check is essential because the role check was removed from setUserRole
    const currentUser = currentUserId ? await clerkClient.users.getUser(currentUserId) : null;
    const isAdmin = currentUser?.publicMetadata?.role === 'admin';

    if (!isAdmin) {
        return { success: false, message: 'Unauthorized' };
    }
    // --- End Authorization Check ---


    const targetUserId = formData.get('userId') as string;
    const targetRole = formData.get('role') as AppRole;

    if (!targetUserId || !targetRole) {
        return { success: false, message: 'Missing user ID or role.' };
    }

    try {
        await setUserRole(targetUserId, targetRole);
        return { success: true, message: 'Role updated successfully.' };
    } catch (error) {
        return { success: false, message: 'Failed to update role.' };
    }
}
*/

// Example Usage (in a server component to conditionally render content):
/*
import { hasRole } from '@/lib/roles';

export default function MyServerComponent() {
    // hasRole still works as before, relying on the authenticated user's claims
    const showAdminContent = hasRole('admin');

    return (
        <div>
            <p>This is visible to everyone.</p>
            {showAdminContent && (
                <div className="admin-only">
                    <p>This content is only visible to admins.</p>
                    {/* Admin-specific controls/forms */}
                </div>
            )}
        </div>
    );
}
*/
