// src/context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { AppRole } from '@/lib/roles';
import { auth, googleProvider } from '@/lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';

export interface AuthUser {
  id: string;
  uid: string;
  email: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl?: string;
  role: AppRole;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: Array<{ emailAddress: string }>;
  privateMetadata?: { role?: AppRole };
  publicMetadata?: { role?: AppRole };
  isDemo?: boolean;
}

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  sessionId: string | null;
  user: AuthUser | null;
  role: AppRole;
  isFireAuthDisabled: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  signInDemo: (asAdmin?: boolean) => Promise<void>;
  switchUserRole: (role: AppRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_USER: AuthUser = {
  id: 'admin-seanwambua-uid',
  uid: 'admin-seanwambua-uid',
  email: 'seanwambua@gmail.com',
  fullName: 'Sean Wambua (Admin)',
  firstName: 'Sean',
  lastName: 'Wambua',
  imageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=SeanWambua',
  role: 'admin',
  primaryEmailAddress: { emailAddress: 'seanwambua@gmail.com' },
  emailAddresses: [{ emailAddress: 'seanwambua@gmail.com' }],
  privateMetadata: { role: 'admin' },
  publicMetadata: { role: 'admin' },
  isDemo: true,
};

const MEMBER_USER: AuthUser = {
  id: 'demo-user-alex-uid',
  uid: 'demo-user-alex-uid',
  email: 'demo.member@imanifinancial.com',
  fullName: 'Alex Morgan',
  firstName: 'Alex',
  lastName: 'Morgan',
  imageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AlexMorgan',
  role: 'user',
  primaryEmailAddress: { emailAddress: 'demo.member@imanifinancial.com' },
  emailAddresses: [{ emailAddress: 'demo.member@imanifinancial.com' }],
  privateMetadata: { role: 'user' },
  publicMetadata: { role: 'user' },
  isDemo: true,
};

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

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('ifc_active_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          return parsed;
        }
      } catch {}
    }
    return ADMIN_USER;
  });

  const [isLoaded, setIsLoaded] = useState(true);

  // Synchronize with Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || '';
        const isAdmin =
          email.toLowerCase() === 'seanwambua@gmail.com' ||
          email.toLowerCase() === 'rashmore2020@gmail.com' ||
          email.toLowerCase().includes('admin');

        const activeAuthUser: AuthUser = {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          fullName: firebaseUser.displayName || email.split('@')[0] || 'User',
          firstName: firebaseUser.displayName?.split(' ')[0] || email.split('@')[0] || 'User',
          lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ') || '',
          imageUrl: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email || firebaseUser.uid)}`,
          role: isAdmin ? 'admin' : 'user',
          primaryEmailAddress: email ? { emailAddress: email } : null,
          emailAddresses: email ? [{ emailAddress: email }] : [],
          isDemo: false,
        };

        setCurrentUser(activeAuthUser);
        setAuthCookies(firebaseUser.uid, 'firebase-session');
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setAuthCookies(currentUser.id, 'mock-auth-token');
      try {
        localStorage.setItem('ifc_active_user', JSON.stringify(currentUser));
      } catch {}
    } else {
      setAuthCookies(null, null);
      try {
        localStorage.removeItem('ifc_active_user');
      } catch {}
    }
    setIsLoaded(true);
  }, [currentUser]);

  const signInWithGoogle = async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) return;
    } catch {
      setCurrentUser(ADMIN_USER);
    }
    setIsLoaded(true);
  };

  const signInWithEmail = async (email: string, _pass: string) => {
    const isAdmin =
      email.toLowerCase().includes('admin') ||
      email.toLowerCase() === 'seanwambua@gmail.com' ||
      email.toLowerCase() === 'rashmore2020@gmail.com';

    const uid = auth.currentUser?.uid || (isAdmin ? 'admin-seanwambua-uid' : `user-${email.split('@')[0]}`);
    const newUser: AuthUser = {
      id: uid,
      uid: uid,
      email,
      fullName: email.split('@')[0],
      firstName: email.split('@')[0],
      lastName: '',
      imageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
      role: isAdmin ? 'admin' : 'user',
      primaryEmailAddress: { emailAddress: email },
      emailAddresses: [{ emailAddress: email }],
      privateMetadata: { role: isAdmin ? 'admin' : 'user' },
      publicMetadata: { role: isAdmin ? 'admin' : 'user' },
      isDemo: !auth.currentUser,
    };
    setCurrentUser(newUser);
    setIsLoaded(true);
  };

  const signUpWithEmail = async (email: string, pass: string, name: string) => {
    await signInWithEmail(email, pass);
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, fullName: name, firstName: name } : null));
    }
  };

  const signInDemo = async (asAdmin = true) => {
    setCurrentUser(asAdmin ? ADMIN_USER : MEMBER_USER);
    setIsLoaded(true);
  };

  const switchUserRole = (role: AppRole) => {
    if (role === 'admin') {
      setCurrentUser(ADMIN_USER);
    } else {
      setCurrentUser(MEMBER_USER);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch {}
    setCurrentUser(null);
    setAuthCookies(null, null);
    try {
      localStorage.removeItem('ifc_active_user');
    } catch {}
  };

  const getToken = React.useCallback(async (): Promise<string | null> => {
    return 'mock-auth-token';
  }, []);

  const value = useMemo(
    () => ({
      isLoaded,
      isSignedIn: !!currentUser,
      userId: currentUser?.id || null,
      sessionId: currentUser ? `session-${currentUser.id}` : null,
      user: currentUser,
      role: currentUser?.role || 'user',
      isFireAuthDisabled,
      getToken,
      signOut,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signInDemo,
      switchUserRole,
    }),
    [currentUser, isLoaded, getToken]
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
  };
};

export default AuthContext;
