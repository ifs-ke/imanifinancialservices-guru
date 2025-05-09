// src/lib/logger.ts
'use client'; // This module can be used client-side for capturing logs.

// Logtail and Winston have been removed. Logging will use console.
// Client-side logs can be sent to a server endpoint if needed for centralized logging.

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const ANONYMOUS_USER_FOR_LOGGING = 'anonymous_or_unauthenticated_user';

// Base context for all logs from this client instance
const getBaseClientContext = () => {
  return {
    environment: process.env.NODE_ENV || 'unknown_env',
    clientTimestamp: new Date().toISOString(),
    source_client_component: typeof window !== 'undefined' ? window.location.pathname : 'unknown_path',
  };
};

// Generic log function (client-side)
const clientLog = (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, any>,
    errorDetails?: any,
    userIdForLog?: string // Allow explicit userId passing
) => {
    const finalUserId = userIdForLog || CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder if no Clerk
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
            Object.keys(errorDetails).forEach(key => {
                logContext[`error_${key}`] = errorDetails[key];
            });
        } else {
            logContext.errorDetails = String(errorDetails);
        }
    }

    // Output to browser console
    const consoleArgs = [`[Client - ${level.toUpperCase()}] ${message}`];
    if (Object.keys(logContext).length > 0) consoleArgs.push(logContext);

    switch (level) {
        case 'error': console.error(...consoleArgs); break;
        case 'warn':  console.warn(...consoleArgs); break;
        case 'info':  console.info(...consoleArgs); break;
        case 'debug': console.debug(...consoleArgs); break;
        default:      console.log(...consoleArgs); break;
    }

    // Send log to the server-side API endpoint for centralized logging
    // This allows server to persist or forward logs (e.g., to a file or another service)
    if (typeof window !== 'undefined') { // Ensure this runs only in browser
        fetch('/api/client-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: level === 'debug' && process.env.NODE_ENV !== 'development' ? 'info' : level, // Adjust level for server if needed
                message: message, // Send original message
                context: logContext, // Send full context including userId
            }),
        }).catch(fetchError => {
            console.warn('Failed to send client log to server:', fetchError);
        });
    }
};

export const logInfo = (message: string, context?: Record<string, any>, userId?: string) => {
    clientLog('info', message, context, undefined, userId);
};

export const logWarn = (message: string, context?: Record<string, any>, userId?: string) => {
    clientLog('warn', message, context, undefined, userId);
};

export const logError = (message: string, error?: any, context?: Record<string, any>, userId?: string) => {
    clientLog('error', message, context, error, userId);
};

export const logDebug = (message: string, context?: Record<string, any>, userId?: string) => {
    // Debug logs are often conditional on NODE_ENV for client-side
    if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true') {
        clientLog('debug', message, context, undefined, userId);
    }
};

// Note: Server-side logging (in API routes, server actions) should use console directly
// or a dedicated server-side logging setup if needed (which is now just console.* via this setup).
