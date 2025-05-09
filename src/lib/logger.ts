// src/lib/logger.ts
'use client'; // This module is used client-side for capturing logs.

import { Logtail } from '@logtail/browser';
// Clerk client-side auth is not used here directly for getting userId,
// as logger functions now accept userId as an optional parameter.

const LOGTAIL_SOURCE_TOKEN = process.env.NEXT_PUBLIC_LOGTAIL_SOURCE_TOKEN;
const ANONYMOUS_USER_FOR_LOGGING = 'anonymous_or_unauthenticated_user';

let logtailInstance: Logtail | null = null;

if (typeof window !== 'undefined' && LOGTAIL_SOURCE_TOKEN) {
  try {
    logtailInstance = new Logtail(LOGTAIL_SOURCE_TOKEN);
    // console.info("Logtail initialized for browser."); // Initial log to confirm
  } catch (error) {
    console.error("Failed to initialize Logtail:", error);
  }
} else if (typeof window !== 'undefined' && !LOGTAIL_SOURCE_TOKEN) {
  // console.warn("Logtail source token not found. Logs will be sent to console only.");
}

// Base context for all logs from this client instance
const getBaseClientContext = () => {
  return {
    environment: process.env.NODE_ENV || 'unknown_env',
    clientTimestamp: new Date().toISOString(),
    // Potentially add session ID from a non-Clerk source if available, or a generated one
    // clientSessionId: getClientSessionId(), // Example placeholder
    source_client_component: typeof window !== 'undefined' ? window.location.pathname : 'unknown_path',
  };
};

// Generic log function
const sendLog = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>,
    errorDetails?: any,
    userIdForLog?: string // Allow explicit userId passing
) => {
    const finalUserId = userIdForLog || ANONYMOUS_USER_FOR_LOGGING;
    const logContext = {
        ...getBaseClientContext(),
        userId: finalUserId,
        ...(context || {}),
    };

    if (errorDetails) {
        if (errorDetails instanceof Error) {
            logContext.errorMessage = errorDetails.message;
            logContext.stack = errorDetails.stack;
        } else if (typeof errorDetails === 'object' && errorDetails !== null) {
            // Merge error object properties, prefixing to avoid clashes
            Object.keys(errorDetails).forEach(key => {
                logContext[`error_${key}`] = errorDetails[key];
            });
        } else {
            logContext.errorDetails = String(errorDetails);
        }
    }

    if (logtailInstance) {
        logtailInstance[level](message, logContext);
    } else {
        // Fallback to console if Logtail is not initialized
        const consoleArgs = [`[Client - ${level.toUpperCase()}] ${message}`];
        if (Object.keys(logContext).length > 0) consoleArgs.push(logContext);
        switch (level) {
            case 'error': console.error(...consoleArgs); break;
            case 'warn':  console.warn(...consoleArgs); break;
            case 'info':  console.info(...consoleArgs); break;
            case 'debug': console.debug(...consoleArgs); break;
            default:      console.log(...consoleArgs); break;
        }
    }
};


export const logInfo = (message: string, context?: Record<string, any>, userId?: string) => {
    sendLog('info', message, context, undefined, userId);
};

export const logWarn = (message: string, context?: Record<string, any>, userId?: string) => {
    sendLog('warn', message, context, undefined, userId);
};

export const logError = (message: string, error?: any, context?: Record<string, any>, userId?: string) => {
    sendLog('error', message, context, error, userId);
};

export const logDebug = (message: string, context?: Record<string, any>, userId?: string) => {
    // Debug logs are often conditional on NODE_ENV
    if (process.env.NODE_ENV === 'development') {
        sendLog('debug', message, context, undefined, userId);
    }
};

// Expose the Logtail client instance if needed, but direct use should be rare
export { logtailInstance as logtailClient };