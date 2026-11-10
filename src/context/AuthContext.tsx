// src/context/AuthContext.tsx
/**
 * @file AuthContext.tsx
 * @description Enhanced Authentication and Role Context fully integrating Firebase Auth with Firestore.
 * Supports 3 distinct platform roles: 'admin', 'auditor', and 'client'.
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { AppRole, normalizeRole } from '@/lib/roles';
import { auth, googleProvider, db } from '@/lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { recordAuditLog } from '@/services/adminLogService';
import { trackUserUsage } from '@/lib/payPerUse';

export interface AuthUser {
  id: string;
  uid: string;
  email: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl?: string;
  role: AppRole;
  status: 'active' | 'suspended';
  spendingLimitKes?: number;
  incurredCostKes?: number;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: Array<{ emailAddress: string }>;
  privateMetadata?: { role?: AppRole };
  publicMetadata?: { role?: AppRole };
  isGuest?: boolean;
  isAnonymous?: boolean;
}

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  isGuest: boolean;
  isAnonymous: boolean;
  userId: string | null;
  sessionId: string | null;
  user: AuthUser | null;
  role: AppRole;
  isAdmin: boolean;
  isAuditor: boolean;
  isClient: boolean;
  isFireAuthDisabled: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  continueAsGuest: () => void;
  exitGuestMode: (clearData?: boolean) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function setAuthCookies(uid: string | null, token: string | null) {
  if (typeof document === 'undefined') return;
  if (uid) {
    document.cookie = `uid=${encodeURIComponent(uid)}; path=/; max-age=604800; SameSite=Lax`;
  } else {
    document.cookie = `uid=; path=/; max-age=0`;
  }
  if (token) {
    document.cookie = `__session=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
  } else {
    document.cookie = `__session=; path=/; max-age=0`;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isFireAuthDisabled = false;

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync user profile from Firestore users/{uid}
  const syncProfile = useCallback(async (uid: string, email: string, displayName?: string | null, photoURL?: string | null) => {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);

      const isBootstrapAdmin =
        email.toLowerCase() === 'seanwambua@gmail.com' ||
        email.toLowerCase() === 'rashmore2020@gmail.com' ||
        uid === 'admin-seanwambua-uid';

      let resolvedRole: AppRole = isBootstrapAdmin ? 'admin' : 'client';
      let resolvedStatus: 'active' | 'suspended' = 'active';
      let spendingLimitKes = 1500;
      let incurredCostKes = 0;

      if (snap.exists()) {
        const data = snap.data();
        resolvedRole = isBootstrapAdmin ? 'admin' : normalizeRole(data.role);
        resolvedStatus = (data.status === 'suspended' ? 'suspended' : 'active');
        spendingLimitKes = data.spendingLimitKes ?? (resolvedRole === 'admin' ? 50000 : 1500);
        incurredCostKes = data.incurredCostKes ?? 0;

        // Keep lastLogin updated
        await setDoc(userRef, {
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          role: resolvedRole,
        }, { merge: true });
      } else {
        // First-time profile initialization
        await setDoc(userRef, {
          uid,
          email,
          displayName: displayName || email.split('@')[0] || 'Member',
          role: resolvedRole,
          status: 'active',
          spendingLimitKes: isBootstrapAdmin ? 50000 : 1500,
          incurredCostKes: 0,
          totalReads: 1,
          totalWrites: 1,
          totalStorageKb: 64,
          totalApiCalls: 1,
          totalAiForecasts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          permissions: {
            canExportData: true,
            canShareReviews: true,
            canRunAiProjections: true,
          }
        }, { merge: true });

        // If admin, ensure admins registry entry exists
        if (resolvedRole === 'admin') {
          await setDoc(doc(db, 'admins', uid), {
            uid,
            assignedAt: new Date().toISOString(),
          }, { merge: true });
        }
      }

      // Track usage read
      trackUserUsage(uid, 'read', 1);

      const resolvedName = displayName || email.split('@')[0] || 'User';
      const activeAuthUser: AuthUser = {
        id: uid,
        uid: uid,
        email: email,
        fullName: resolvedName,
        firstName: resolvedName.split(' ')[0] || 'User',
        lastName: resolvedName.split(' ').slice(1).join(' ') || '',
        imageUrl: photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email || uid)}`,
        role: resolvedRole,
        status: resolvedStatus,
        spendingLimitKes,
        incurredCostKes,
        primaryEmailAddress: email ? { emailAddress: email } : null,
        emailAddresses: email ? [{ emailAddress: email }] : [],
        privateMetadata: { role: resolvedRole },
        publicMetadata: { role: resolvedRole },
      };

      setCurrentUser(activeAuthUser);
    } catch (err) {
      console.warn('Failed to sync Firestore user profile, using fallback:', err);
      const isBootstrapAdmin = email.toLowerCase() === 'seanwambua@gmail.com';
      const fallbackRole: AppRole = isBootstrapAdmin ? 'admin' : 'client';
      const resolvedName = displayName || email.split('@')[0] || 'User';

      setCurrentUser({
        id: uid,
        uid: uid,
        email: email,
        fullName: resolvedName,
        firstName: resolvedName.split(' ')[0] || 'User',
        lastName: resolvedName.split(' ').slice(1).join(' ') || '',
        imageUrl: photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email || uid)}`,
        role: fallbackRole,
        status: 'active',
        spendingLimitKes: 1500,
        incurredCostKes: 0,
        primaryEmailAddress: email ? { emailAddress: email } : null,
        emailAddresses: email ? [{ emailAddress: email }] : [],
      });
    }
  }, []);

  // Synchronize with Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('imf_guest_session');
        }
        const email = firebaseUser.email || '';
        await syncProfile(
          firebaseUser.uid, 
          email, 
          firebaseUser.displayName, 
          firebaseUser.photoURL
        );

        try {
          const token = await firebaseUser.getIdToken();
          setAuthCookies(firebaseUser.uid, token);
        } catch {
          setAuthCookies(firebaseUser.uid, 'firebase-session');
        }
      } else {
        // Check for local guest session persistence (offline/anonymous fallback)
        let restoredGuest: AuthUser | null = null;
        if (typeof window !== 'undefined') {
          try {
            const rawGuest = window.localStorage.getItem('imf_guest_session');
            if (rawGuest) {
              const parsed = JSON.parse(rawGuest);
              if (parsed && parsed.uid) {
                restoredGuest = {
                  id: parsed.uid,
                  uid: parsed.uid,
                  email: null,
                  fullName: parsed.fullName || 'Guest User',
                  firstName: 'Guest',
                  lastName: 'User',
                  imageUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(parsed.uid)}`,
                  role: 'client',
                  status: 'active',
                  spendingLimitKes: 1500,
                  incurredCostKes: 0,
                  primaryEmailAddress: null,
                  emailAddresses: [],
                  isGuest: true,
                  isAnonymous: true,
                };
                setAuthCookies(parsed.uid, 'guest-session');
              }
            }
          } catch (err) {
            console.warn('Failed to parse guest session from localStorage:', err);
          }
        }

        if (restoredGuest) {
          setCurrentUser(restoredGuest);
        } else {
          setCurrentUser(null);
          setAuthCookies(null, null);
        }
      }
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [syncProfile]);

  const continueAsGuest = useCallback(() => {
    let guestUid = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    let guestName = 'Guest User';
    if (typeof window !== 'undefined') {
      const existing = window.localStorage.getItem('imf_guest_session');
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (parsed.uid) {
            guestUid = parsed.uid;
            guestName = parsed.fullName || guestName;
          }
        } catch {}
      } else {
        window.localStorage.setItem(
          'imf_guest_session',
          JSON.stringify({
            uid: guestUid,
            fullName: guestName,
            createdAt: new Date().toISOString(),
          })
        );
      }
    }

    const guestUser: AuthUser = {
      id: guestUid,
      uid: guestUid,
      email: null,
      fullName: guestName,
      firstName: 'Guest',
      lastName: 'User',
      imageUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(guestUid)}`,
      role: 'client',
      status: 'active',
      spendingLimitKes: 1500,
      incurredCostKes: 0,
      primaryEmailAddress: null,
      emailAddresses: [],
      isGuest: true,
      isAnonymous: true,
    };

    setCurrentUser(guestUser);
    setAuthCookies(guestUid, 'guest-session');
    setIsLoaded(true);
  }, []);

  const exitGuestMode = useCallback(async (clearData = true) => {
    const guestUid = currentUser?.uid;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('imf_guest_session');
      if (clearData && guestUid) {
        try {
          window.localStorage.removeItem(`imf_offline_snapshot_${guestUid}`);
          window.localStorage.removeItem(`imf_offline_queue_${guestUid}`);
        } catch {}
      }
      try {
        window.sessionStorage.clear();
      } catch {}
    }
    setCurrentUser(null);
    setAuthCookies(null, null);
  }, [currentUser]);

  const refreshUserProfile = async () => {
    if (currentUser?.isGuest) return;
    if (auth.currentUser && auth.currentUser.email) {
      await syncProfile(
        auth.currentUser.uid,
        auth.currentUser.email,
        auth.currentUser.displayName,
        auth.currentUser.photoURL
      );
    }
  };

  const signInWithGoogle = async () => {
    const res = await signInWithPopup(auth, googleProvider);
    if (res.user?.email) {
      await recordAuditLog(
        `AUTH_SIGNIN: Google login for ${res.user.email}`,
        'AUTH',
        'INFO',
        { userId: res.user.uid, userEmail: res.user.email }
      );
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    if (res.user?.email) {
      await recordAuditLog(
        `AUTH_SIGNIN: Email login for ${res.user.email}`,
        'AUTH',
        'INFO',
        { userId: res.user.uid, userEmail: res.user.email }
      );
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      await updateProfile(cred.user, { displayName: name });
      await recordAuditLog(
        `AUTH_SIGNUP: New user registered ${email}`,
        'AUTH',
        'INFO',
        { userId: cred.user.uid, userEmail: email }
      );
    }
  };

  const signOut = async () => {
    if (currentUser?.isGuest) {
      await exitGuestMode(true);
      return;
    }

    const email = currentUser?.email;
    const uid = currentUser?.uid;

    if (email) {
      await recordAuditLog(
        `AUTH_SIGNOUT: User logged out ${email}`,
        'AUTH',
        'INFO',
        { userId: uid, userEmail: email }
      ).catch(() => {});
    }

    try {
      await firebaseSignOut(auth);
    } catch {}

    setCurrentUser(null);
    setAuthCookies(null, null);
    
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.clear();
      }
    } catch (e) {}
  };

  const getToken = React.useCallback(async (): Promise<string | null> => {
    if (currentUser?.isGuest) {
      return 'guest-token';
    }
    if (auth.currentUser) {
      try {
        return await auth.currentUser.getIdToken();
      } catch {
        return 'firebase-token';
      }
    }
    return null;
  }, [currentUser]);

  const role = currentUser?.role || 'client';
  const isAdmin = role === 'admin';
  const isAuditor = role === 'auditor';
  const isClient = role === 'client';
  const isGuest = currentUser?.isGuest === true;
  const isAnonymous = currentUser?.isAnonymous === true;

  const value = useMemo(
    () => ({
      isLoaded,
      isSignedIn: !!currentUser,
      isGuest,
      isAnonymous,
      userId: currentUser?.id || null,
      sessionId: currentUser ? `session-${currentUser.id}` : null,
      user: currentUser,
      role,
      isAdmin,
      isAuditor,
      isClient,
      isFireAuthDisabled,
      getToken,
      signOut,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      continueAsGuest,
      exitGuestMode,
      refreshUserProfile,
    }),
    [currentUser, isLoaded, isGuest, isAnonymous, role, isAdmin, isAuditor, isClient, getToken, continueAsGuest, exitGuestMode]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useUser = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useUser must be used within an AuthProvider');
  }
  return {
    isLoaded: context.isLoaded,
    isSignedIn: context.isSignedIn,
    user: context.user,
    isGuest: context.isGuest,
    isAnonymous: context.isAnonymous,
  };
};

export default AuthContext;
