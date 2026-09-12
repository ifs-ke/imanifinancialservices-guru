// src/services/adminUserService.ts
/**
 * @file adminUserService.ts
 * @description Administrative service for User CRUD operations, status toggling, and role assignments.
 */

import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { AppRole, setUserRole, AppUserProfile, normalizeRole } from '@/lib/roles';
import { recordAuditLog } from '@/services/adminLogService';
import { logInfo, logError } from '@/lib/logger';

export interface CreateUserData {
  email: string;
  displayName: string;
  role: AppRole;
  status: 'active' | 'suspended';
  spendingLimitKes?: number;
  permissions?: {
    canExportData?: boolean;
    canShareReviews?: boolean;
    canRunAiProjections?: boolean;
  };
}

export interface UpdateUserData {
  displayName?: string;
  email?: string;
  role?: AppRole;
  status?: 'active' | 'suspended';
  spendingLimitKes?: number;
  permissions?: {
    canExportData?: boolean;
    canShareReviews?: boolean;
    canRunAiProjections?: boolean;
  };
}

/**
 * Retrieves all registered users from Firestore with fallback for initial deployment.
 */
export async function getAllUsers(): Promise<AppUserProfile[]> {
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);

    const users: AppUserProfile[] = snap.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        email: data.email || 'unknown@domain.com',
        displayName: data.displayName || 'Unnamed User',
        role: normalizeRole(data.role),
        status: (data.status === 'suspended' ? 'suspended' : 'active') as 'active' | 'suspended',
        spendingLimitKes: data.spendingLimitKes ?? 1000,
        incurredCostKes: data.incurredCostKes ?? 0,
        totalReads: data.totalReads ?? 0,
        totalWrites: data.totalWrites ?? 0,
        totalStorageKb: data.totalStorageKb ?? 128,
        totalApiCalls: data.totalApiCalls ?? 0,
        totalAiForecasts: data.totalAiForecasts ?? 0,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        lastLoginAt: data.lastLoginAt,
        permissions: {
          canExportData: data.permissions?.canExportData ?? true,
          canShareReviews: data.permissions?.canShareReviews ?? true,
          canRunAiProjections: data.permissions?.canRunAiProjections ?? true,
        },
      };
    });

    // Ensure the system admin Sean Wambua exists in list
    const hasSean = users.some(u => u.email.toLowerCase() === 'seanwambua@gmail.com');
    if (!hasSean) {
      users.unshift({
        uid: 'admin-seanwambua-uid',
        email: 'seanwambua@gmail.com',
        displayName: 'Sean Wambua (Super Admin)',
        role: 'admin',
        status: 'active',
        spendingLimitKes: 50000,
        incurredCostKes: 12.45,
        totalReads: 412,
        totalWrites: 89,
        totalStorageKb: 1024,
        totalApiCalls: 54,
        totalAiForecasts: 12,
        createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
        permissions: {
          canExportData: true,
          canShareReviews: true,
          canRunAiProjections: true,
        },
      });
    }

    return users;
  } catch (error) {
    logError('Failed to fetch users from Firestore', error);
    return [];
  }
}

/**
 * Creates a new user profile record with specified role and limits.
 */
export async function createNewUser(
  data: CreateUserData,
  adminUserEmail?: string
): Promise<AppUserProfile> {
  const newUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newUser: AppUserProfile = {
    uid: newUid,
    email: data.email.trim().toLowerCase(),
    displayName: data.displayName.trim(),
    role: data.role,
    status: data.status,
    spendingLimitKes: data.spendingLimitKes ?? 1500,
    incurredCostKes: 0,
    totalReads: 0,
    totalWrites: 0,
    totalStorageKb: 64,
    totalApiCalls: 0,
    totalAiForecasts: 0,
    createdAt: now,
    updatedAt: now,
    permissions: data.permissions || {
      canExportData: true,
      canShareReviews: true,
      canRunAiProjections: true,
    },
  };

  const userRef = doc(db, 'users', newUid);
  await setDoc(userRef, newUser);

  // Sync role registry
  await setUserRole(newUid, data.role);

  await recordAuditLog(
    `USER_CREATED: ${data.email} with role '${data.role}'`,
    'USER_MANAGEMENT',
    'INFO',
    {
      userEmail: adminUserEmail || 'admin',
      details: { createdUser: newUser },
    }
  );

  return newUser;
}

/**
 * Updates an existing user's details, permissions, or role assignment.
 */
export async function updateExistingUser(
  uid: string,
  updates: UpdateUserData,
  adminUserEmail?: string
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const patch: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.displayName !== undefined) patch.displayName = updates.displayName;
  if (updates.email !== undefined) patch.email = updates.email.trim().toLowerCase();
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.spendingLimitKes !== undefined) patch.spendingLimitKes = updates.spendingLimitKes;
  if (updates.permissions !== undefined) patch.permissions = updates.permissions;

  if (updates.role !== undefined) {
    patch.role = updates.role;
    await setUserRole(uid, updates.role);
  }

  await updateDoc(userRef, patch);

  await recordAuditLog(
    `USER_UPDATED: ${uid} (Role: ${updates.role || 'unchanged'}, Status: ${updates.status || 'unchanged'})`,
    'USER_MANAGEMENT',
    'INFO',
    {
      userEmail: adminUserEmail || 'admin',
      details: { targetUid: uid, appliedUpdates: updates },
    }
  );
}

/**
 * Deletes a user profile and purges their authorization references.
 */
export async function deleteUserAccount(
  uid: string,
  adminUserEmail?: string
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  await deleteDoc(userRef);

  try {
    await deleteDoc(doc(db, 'admins', uid));
    await deleteDoc(doc(db, 'auditors', uid));
  } catch {}

  await recordAuditLog(
    `USER_DELETED: User ${uid} removed by administrator`,
    'USER_MANAGEMENT',
    'WARN',
    {
      userEmail: adminUserEmail || 'admin',
      details: { deletedUid: uid },
    }
  );
}
