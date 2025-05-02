
import type { User } from '@clerk/nextjs/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export type AppRole = 'admin' | 'user'; // Define available roles

/**
 * Checks if the currently authenticated user has the specified role.
 * Relies on publicMetadata stored in Clerk.
 *
 * @param role The role to check for.
 * @returns True if the user has the role, false otherwise.
 */
export const hasRole = (role: AppRole): boolean => {
  const { sessionClaims } = auth();

  // Access publicMetadata from session claims
  const userRole = sessionClaims?.publicMetadata?.role as AppRole | undefined;

  return userRole === role;
};

/**
 * Checks if the currently authenticated user is an admin.
 *
 * @returns True if the user is an admin, false otherwise.
 */
export const isAdmin = (): boolean => {
    return hasRole('admin');
};


/**
 * Sets the role for a specific user.
 * !! IMPORTANT: This function modifies user data and should only be callable
 * !! by authorized administrators in a secure server-side context (e.g., an admin panel).
 * !! DO NOT expose this directly to client-side requests without proper authorization checks.
 *
 * @param userId The ID of the user to modify.
 * @param role The new role to assign.
 */
export const setUserRole = async (userId: string, role: AppRole) => {
    // Perform authorization check here to ensure the caller is an admin
    // For example:
     if (!isAdmin()) {
         throw new Error("Unauthorized: Only admins can set user roles.");
     }

    try {
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
 * @param userId The ID of the user.
 * @returns The user's role or undefined if not set or user not found.
 */
export const getUserRole = async (userId: string): Promise<AppRole | undefined> => {
    try {
        const user = await clerkClient.users.getUser(userId);
        return user.publicMetadata?.role as AppRole | undefined;
    } catch (error) {
        console.error(`Error fetching role for user ${userId}:`, error);
        return undefined;
    }
};


// Example Usage (in a server component or API route protected by admin check):
/*
import { setUserRole, isAdmin } from '@/lib/roles';
import { auth } from '@clerk/nextjs/server';

export default async function AdminActionExample(formData: FormData) {
    'use server';
    const { userId: currentUserId } = auth();
    if (!currentUserId || !isAdmin()) { // Check if current user is admin
        return { success: false, message: 'Unauthorized' };
    }

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
import { isAdmin } from '@/lib/roles';

export default function MyServerComponent() {
    const showAdminContent = isAdmin();

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
