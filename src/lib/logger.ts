// src/lib/logger.ts
'use client'; // This file will be used by client components

import { Logtail } from '@logtail/browser';
import { auth } from '@clerk/nextjs/client'; // Use client-side auth

const LOGTAIL_SOURCE_TOKEN = process.env.NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN;

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
  const { userId, sessionId, orgId, actor } = auth();
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
export const captureLog = (level: 'log' | 'info' | 'warn' | 'error', messages: any[]) => {
    const messageString = messages.map(msg => typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)).join(' ');
    const logContext = getContext();

    if (log) {
        switch (level) {
            case 'info':
            case 'log':
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
         console.log(`[Logtail Disabled] CAPTURED ${level.toUpperCase()}:`, ...messages);
    }
};

// Export the raw log instance if needed for direct use (e.g., in Logtail specific features)
export { log as logtailClient };