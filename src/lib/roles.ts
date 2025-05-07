
// src/lib/roles.ts
// import type { User } from '@clerk/nextjs/server'; // Clerk disabled
// import { auth, clerkClient } from '@clerk/nextjs/server'; // Clerk disabled

export type AppRole = 'admin' | 'user';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';
const CLERK_DISABLED_DEFAULT_ROLE = 'user' as AppRole; // Default role when Clerk is disabled


export const hasRole = (role: AppRole): boolean => {
  // const { sessionClaims } = auth(); // Clerk disabled
  // const userRole = sessionClaims?.publicMetadata?.role as AppRole | undefined; // Clerk disabled

  // Mock behavior when Clerk is disabled
  const userRole = CLERK_DISABLED_DEFAULT_ROLE; // Assume 'user' role
  console.warn("Clerk is disabled: hasRole check returning mocked value:", userRole === role);

  return userRole === role;
};


export const setUserRole = async (userId: string, role: AppRole) => {
    // Authorization check MUST be done by the caller context

    // Mock behavior when Clerk is disabled
    console.warn(`Clerk is disabled: Mocking setUserRole for user ${userId} to role ${role}. No actual change persisted.`);
    // In a real scenario without Clerk, you'd update your own user database here.
    // await yourDb.collection('users').updateOne({ _id: userId }, { $set: { role: role } });
    return Promise.resolve(); // Simulate success
};


export const getUserRole = async (userId: string): Promise<AppRole | undefined> => {
    // Authorization check MUST be done by the caller context

    // Mock behavior when Clerk is disabled
    console.warn(`Clerk is disabled: Mocking getUserRole for user ${userId}. Returning default role.`);
     if (userId === CLERK_DISABLED_PLACEHOLDER_USER_ID) {
        return CLERK_DISABLED_DEFAULT_ROLE;
    }
    // In a real scenario without Clerk, you'd fetch from your own user database.
    // const user = await yourDb.collection('users').findOne({ _id: userId });
    // return user?.role;
    return undefined; // Return undefined for unknown users in mock
};
