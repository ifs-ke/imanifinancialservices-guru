'use client';

import { Logtail } from '@logtail/browser';
// import { auth } from '@clerk/nextjs/client'; // Clerk disabled

const LOGTAIL_SOURCE_TOKEN = process.env.NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN;
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y'; // Placeholder

let log: Logtail | null = null;

if (typeof window !== 'undefined' && LOGTAIL_SOURCE_TOKEN) {
  try {
    log = new Logtail(LOGTAIL_SOURCE_TOKEN);
    console.info('Logtail client initialized.');
  } catch (error) {
    console.error('Failed to initialize Logtail client:', error);
  }
} else if (typeof window !== 'undefined' && !LOGTAIL_SOURCE_TOKEN) {
  console.warn('Logtail source token is not configured. Logging to Logtail is disabled.');
}

const getContext = () => {

  // Mock Clerk data when disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
  const sessionId = 'mock-session-id';
  const orgId = undefined; // Or 'mock-org-id' if needed
  const actor = undefined;

  return {
    clerk: {
      userId: userId || undefined,
      sessionId: sessionId || undefined,
      orgId: orgId || undefined,
      actor: actor || undefined,
    },
    environment: process.env.NODE_ENV,
    // Add any other relevant context you want to include with every log
  };
};

export const logInfo = (message: string, context?: Record<string, any>) => {
  if (log) {
    log.info(message, { ...getContext(), ...context });
  } else {
    console.info(`[Logtail Disabled] INFO: ${message}`, context || '');
  }
};

export const logWarn = (message: string, context?: Record<string, any>) => {
  if (log) {
    log.warn(message, { ...getContext(), ...context });
  } else {
    console.warn(`[Logtail Disabled] WARN: ${message}`, context || '');
  }
};

export const logError = (message: string, error?: any, context?: Record<string, any>) => {
  if (log) {
    log.error(message, error, { ...getContext(), ...context });
  } else {
    console.error(`[Logtail Disabled] ERROR: ${message}`, error, context || '');
  }
};

export const logDebug = (message: string, context?: Record<string, any>) => {
  if (log) {
    log.debug(message, { ...getContext(), ...context });
  } else {
    console.debug(`[Logtail Disabled] DEBUG: ${message}`, context || '');
  }
};

export { log as logtailClient };
