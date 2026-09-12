// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  setLogLevel,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import defaultAppletConfig from '../../firebase-applet-config.json';

// Silence verbose internal transport retry noise while preserving critical error reporting
if (typeof window !== 'undefined') {
  try {
    setLogLevel('error');
  } catch {
    // Ignore if setLogLevel is already configured
  }
}

// Support both environment variable declarations and embedded fallback config
const resolvedFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || defaultAppletConfig.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || defaultAppletConfig.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || defaultAppletConfig.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || defaultAppletConfig.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || defaultAppletConfig.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || defaultAppletConfig.appId,
  firestoreDatabaseId:
    process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID ||
    process.env.FIRESTORE_DATABASE_ID ||
    defaultAppletConfig.firestoreDatabaseId,
};

const app = !getApps().length ? initializeApp(resolvedFirebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Initialize Firestore instance with auto-detect long polling and multi-tab local caching.
 * Resolves custom databaseId required by the platform environment and fallback.
 */
function createFirestoreInstance() {
  const databaseId = resolvedFirebaseConfig.firestoreDatabaseId || undefined;
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: typeof window !== 'undefined'
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : undefined,
      },
      databaseId
    );
  } catch {
    // Return existing or default instance if initializeFirestore has already been executed for this app
    return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }
}

// Initialize Firestore with custom databaseId as required by Firebase skill
export const db = createFirestoreInstance();

/**
 * Validates initial connection to Firestore backend as prescribed in the Firebase skill.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firestore] Operating in offline mode with local encrypted cache.');
    }
    return false;
  }
}

// Run connection validation in browser environment
if (typeof window !== 'undefined') {
  testFirestoreConnection().catch(() => {
    // Non-blocking offline fallback
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { resolvedFirebaseConfig };
export default app;
