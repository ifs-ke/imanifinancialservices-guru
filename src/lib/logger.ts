// src/lib/logger.ts
'use client'; // Keep 'use client' if this module *might* be used client-side, but auth is removed

// Removed Logtail import
// import { Logtail } from '@logtail/browser';

// Removed Clerk import
// import { auth } from '@clerk/nextjs/client'; // Clerk disabled

// Remove Logtail token usage
// const LOGTAIL_SOURCE_TOKEN = process.env.NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN;

// Placeholder used only if userId isn't passed explicitly
const DEFAULT_USER_ID = 'unknown-user';

// Remove Logtail instance
// let log: Logtail | null = null;
// if (typeof window !== 'undefined' && LOGTAIL_SOURCE_TOKEN) {
//   log = new Logtail(LOGTAIL_SOURCE_TOKEN);
// }


// Simplified context function without Clerk dependency
const getBaseContext = () => {
  return {
    environment: process.env.NODE_ENV,
    // Add other relevant non-user context if needed (e.g., app version)
  };
};


// Logging functions now accept userId optionally, defaulting if not provided
export const logInfo = (message: string, context?: Record<string, any>, userId?: string) => {
    const fullContext = { ...getBaseContext(), userId: userId || DEFAULT_USER_ID, ...context };
    // console.info(`[INFO] ${message}`, fullContext); // Console log commented out
};

export const logWarn = (message: string, context?: Record<string, any>, userId?: string) => {
    const fullContext = { ...getBaseContext(), userId: userId || DEFAULT_USER_ID, ...context };
    // console.warn(`[WARN] ${message}`, fullContext); // Console log commented out
};

export const logError = (message: string, error?: any, context?: Record<string, any>, userId?: string) => {
    const errorContext = error instanceof Error ? { errorMessage: error.message, stack: error.stack } : { error: String(error) };
    const fullContext = { ...getBaseContext(), userId: userId || DEFAULT_USER_ID, ...context, ...errorContext };
    // console.error(`[ERROR] ${message}`, fullContext); // Console log commented out
};

export const logDebug = (message: string, context?: Record<string, any>, userId?: string) => {
    const fullContext = { ...getBaseContext(), userId: userId || DEFAULT_USER_ID, ...context };
     // console.debug(`[DEBUG] ${message}`, fullContext); // Console log commented out
};

// Removed Logtail client export
export const logtailClient = null;
