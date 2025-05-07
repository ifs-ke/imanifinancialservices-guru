'use client';

import { Logtail } from '@logtail/browser';
// import { auth } from '@clerk/nextjs/client'; // Clerk disabled

const LOGTAIL_SOURCE_TOKEN = process.env.NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN;
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk'; // Placeholder

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

export const logError = (message: string, error?: Error | any, context?: Record<string, any>) => {
  const errorContext = error instanceof Error ? { error: { message: error.message, stack: error.stack } } : { error: error };
  if (log) {
    log.error(message, { ...getContext(), ...errorContext, ...context });
  } else {
    console.error(`[Logtail Disabled] ERROR: ${message}`, error || '', context || '');
  }
};

// Generic log function for console overrides
export const captureLog = (level: 'log' | 'info' | 'warn' | 'error' | 'debug', messages: any[]) => {
    const messageString = messages.map(msg => typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)).join(' ');
    const logContext = getContext();

    if (log) {
        switch (level) {
            case 'info':
            case 'log':
            case 'debug': // Log debug messages as info to Logtail
                log.info(messageString, logContext);
                break;
            case 'warn':
                log.warn(messageString, logContext);
                break;
            case 'error':
                log.error(messageString, logContext);
                break;
        }
    } else {
         // Keep original console behavior when Logtail is disabled
         const originalMethod = console[level] || console.log;
         originalMethod(`[Logtail Disabled] CAPTURED ${level.toUpperCase()}:`, ...messages);
    }
};

export { log as logtailClient };
