// src/lib/logger.ts
'use client'; // This module can be used client-side for capturing logs.

// Console is used directly as Winston and Logtail were removed.
// Client-side logs can be sent to a server endpoint if needed for centralized logging.

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y'; // Placeholder for when Clerk is disabled
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
    userIdForLog?: string | null // Allow explicit userId passing (can be null)
) => {
    // Determine effective user ID for the log entry
    // When Clerk is disabled, this will use the placeholder or anonymous.
    // When Clerk is enabled, useSyncManager should ideally pass the actual userId.
    const effectiveUserId = userIdForLog || (typeof window !== 'undefined' ? CLERK_DISABLED_PLACEHOLDER_USER_ID : ANONYMOUS_USER_FOR_LOGGING);

    const logContext: Record<string, any> = {
        ...getBaseClientContext(),
        userId: effectiveUserId,
        ...(context || {}),
    };

    if (errorDetails) {
        if (errorDetails instanceof Error) {
            logContext.errorMessage = errorDetails.message;
            // Ensure stack is a string and truncate if too long to prevent issues
            const stackString = typeof errorDetails.stack === 'string' ? errorDetails.stack : String(errorDetails.stack);
            logContext.stack = stackString.substring(0, 2000); // Truncate stack to 2000 chars
        } else if (typeof errorDetails === 'object' && errorDetails !== null) {
            // Iterate over errorDetails properties and add them to logContext
            // Be cautious about deeply nested objects or very large properties
            Object.keys(errorDetails).forEach(key => {
                const value = errorDetails[key];
                if (typeof value !== 'function' && (typeof value !== 'object' || value === null || key === 'status' || key === 'statusText')) {
                     // Include primitives, nulls, or specific object properties like status/statusText
                    logContext[`error_${key}`] = value;
                } else if (typeof value === 'object' && value !== null) {
                    // For other objects, stringify them but truncate if too long
                    try {
                        logContext[`error_${key}`] = JSON.stringify(value).substring(0, 500);
                    } catch {
                        logContext[`error_${key}`] = '[Unserializable Object]';
                    }
                }
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
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_LOG_TO_SERVER === 'true') {
        // Prepare a cleaner context for server-side logging if necessary
        const serverLogContext = { ...logContext };
        // Remove potentially problematic large fields like full stack if preferred for server logs
        // For now, sending the truncated stack from logContext.stack

        fetch('/api/client-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: level,
                message: message, // Send original message
                context: serverLogContext, // Send potentially modified/cleaned context
            }),
        }).catch(fetchError => {
            console.warn('Failed to send client log to server:', fetchError, { originalMessage: message, originalContext: context });
        });
    }
};

export const logInfo = (message: string, context?: Record<string, any>, userId?: string | null) => {
    clientLog('info', message, context, undefined, userId);
};

export const logWarn = (message: string, context?: Record<string, any>, userId?: string | null) => {
    clientLog('warn', message, context, undefined, userId);
};

export const logError = (message: string, error?: any, context?: Record<string, any>, userId?: string | null) => {
    clientLog('error', message, context, error, userId);
};

export const logDebug = (message: string, context?: Record<string, any>, userId?: string | null) => {
    // Debug logs are often conditional on NODE_ENV for client-side
    if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true') {
        clientLog('debug', message, context, undefined, userId);
    }
};
