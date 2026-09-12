// src/lib/roles.ts
/**
 * @file roles.ts
 * @description Role-Based Access Control (RBAC) definition and Firestore synchronization.
 * Supports three first-class roles: 'admin', 'auditor', and 'client'.
 */

import { logInfo, logWarn, logError } from '@/lib/logger';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

export type AppRole = 'admin' | 'auditor' | 'client';

export interface RoleUser {
  id: string;
  role?: AppRole | 'user';
  privateMetadata?: { role?: AppRole | 'user' };
  publicMetadata?: { role?: AppRole | 'user' };
}

export interface AppUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: 'active' | 'suspended';
  spendingLimitKes?: number;
  incurredCostKes?: number;
  totalReads?: number;
  totalWrites?: number;
  totalStorageKb?: number;
  totalApiCalls?: number;
  totalAiForecasts?: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  permissions?: {
    canExportData?: boolean;
    canShareReviews?: boolean;
    canRunAiProjections?: boolean;
  };
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
 * Normalizes any legacy 'user' string to modern 'client' role.
 */
export const normalizeRole = (role?: string | null): AppRole => {
  if (!role) return 'client';
  if (role === 'admin') return 'admin';
  if (role === 'auditor') return 'auditor';
  return 'client';
};

/**
 * Checks if the given user has the specified role.
 */
export const hasRole = (roleToCheck: AppRole, user: RoleUser | null): boolean => {
  const rawRole = user?.role || user?.privateMetadata?.role || user?.publicMetadata?.role;
  const normalized = normalizeRole(rawRole);
  
  return normalized === roleToCheck;
};

/**
 * Sets a user's role in Firestore and updates registry documents.
 */
export const setUserRole = async (userIdToUpdate: string, role: AppRole): Promise<void> => {
  const adminUserId = getActiveClientUserId();

  try {
    const userRef = doc(db, 'users', userIdToUpdate);
    await setDoc(userRef, { role, updatedAt: new Date().toISOString() }, { merge: true });

    // Synchronize admin registry
    const adminRef = doc(db, 'admins', userIdToUpdate);
    if (role === 'admin') {
      await setDoc(adminRef, {
        uid: userIdToUpdate,
        assignedAt: new Date().toISOString(),
      }, { merge: true });
    } else {
      try {
        await deleteDoc(adminRef);
      } catch {}
    }

    // Synchronize auditor registry
    const auditorRef = doc(db, 'auditors', userIdToUpdate);
    if (role === 'auditor') {
      await setDoc(auditorRef, {
        uid: userIdToUpdate,
        assignedAt: new Date().toISOString(),
      }, { merge: true });
    } else {
      try {
        await deleteDoc(auditorRef);
      } catch {}
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
    throw error;
  }
};

/**
 * Gets a user's role from Firestore.
 */
export const getUserRole = async (userIdToQuery: string): Promise<AppRole> => {
  try {
    const userRef = doc(db, 'users', userIdToQuery);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return normalizeRole(data?.role);
    }

    // Check bootstrap admin
    if (
      userIdToQuery === 'admin-seanwambua-uid' ||
      auth.currentUser?.email?.toLowerCase() === 'seanwambua@gmail.com'
    ) {
      return 'admin';
    }

    return 'client';
  } catch (error) {
    logWarn("Failed to fetch user role from Firestore, applying fallback role", {
      targetUser: userIdToQuery,
    });
    return (auth.currentUser?.email?.toLowerCase() === 'seanwambua@gmail.com') ? 'admin' : 'client';
  }
};
