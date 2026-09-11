// src/lib/roles.ts
import { logInfo, logWarn, logError } from '@/lib/logger';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export type AppRole = 'admin' | 'user';

export interface RoleUser {
  id: string;
  role?: AppRole;
  privateMetadata?: { role?: AppRole };
  publicMetadata?: { role?: AppRole };
}

function getActiveClientUserId(): string | null {
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('ifc_active_user');
      if (stored) {
        const user = JSON.parse(stored);
        return user.id || null;
      }
    } catch {}
  }
  return 'admin-seanwambua-uid';
}

/**
 * Checks if the given user has the specified role.
 */
export const hasRole = (roleToCheck: AppRole, user: RoleUser | null): boolean => {
  const userRole = user?.role || user?.privateMetadata?.role || user?.publicMetadata?.role;
  logInfo(`Role check for user: requested '${roleToCheck}', actual '${userRole || 'none'}'`, {
    userId: user?.id || 'unauthenticated_or_null_user',
    requestedRole: roleToCheck,
    actualRole: userRole,
  });
  return userRole === roleToCheck;
};

/**
 * Sets a user's role in Firestore.
 */
export const setUserRole = async (userIdToUpdate: string, role: AppRole): Promise<void> => {
  const adminUserId = getActiveClientUserId();

  try {
    const userRef = doc(db, 'users', userIdToUpdate);
    await setDoc(userRef, { role, updatedAt: new Date().toISOString() }, { merge: true });

    if (role === 'admin') {
      await setDoc(doc(db, 'admins', userIdToUpdate), {
        uid: userIdToUpdate,
        assignedAt: new Date().toISOString(),
      }, { merge: true });
    }

    logInfo(`Role updated for ${userIdToUpdate} to ${role} by admin ${adminUserId}`, {
      adminUser: adminUserId,
      targetUser: userIdToUpdate,
      newRole: role,
    });
  } catch (error) {
    logError("Failed to update user role in Firestore", error, {
      adminUser: adminUserId,
      targetUser: userIdToUpdate,
      newRole: role,
    });
  }
};

/**
 * Gets a user's role from Firestore.
 */
export const getUserRole = async (userIdToQuery: string): Promise<AppRole | undefined> => {
  const requestorId = getActiveClientUserId();
  try {
    const userRef = doc(db, 'users', userIdToQuery);
    const snap = await getDoc(userRef);
    const role = (snap.data()?.role as AppRole) || (userIdToQuery === 'admin-seanwambua-uid' ? 'admin' : 'user');

    logInfo(`Retrieved role for ${userIdToQuery}`, {
      role,
      requestorId: requestorId || 'system_or_unauthenticated_requestor',
    });

    return role;
  } catch (error) {
    logWarn("Failed to fetch user role from Firestore, defaulting based on ID", {
      targetUser: userIdToQuery,
      requestorId: requestorId || 'system_or_unauthenticated_requestor',
    });
    return userIdToQuery === 'admin-seanwambua-uid' ? 'admin' : 'user';
  }
};
