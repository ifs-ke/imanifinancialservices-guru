// src/lib/client-logger.ts
'use client';

// Define the log levels expected by the client logger
export type ClientLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

// Placeholder User ID for when Clerk is disabled
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

/**
 * Asynchronously sends log data to the backend API endpoint.
 * This function is intended ONLY for client-side use.
 *
 * @param level The severity level of the log ('log', 'info', 'warn', 'error', 'debug').
 * @param messages An array of messages/objects to log.
 * @param context Optional additional context to include with the log.
 */
async function sendLogToBackendApi(level: ClientLogLevel, messages: any[], context: Record<string, any> = {}): Promise<void> {
    // IMPORTANT: This function relies on fetch being available (browser environment).

    try {
        // Get user ID (using placeholder as Clerk is disabled)
        const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID;

        // Prepare the message string, handling different types
        const messageString = messages.map(arg => {
            if (arg instanceof Error) {
                // Include stack trace for errors
                return `${arg.name}: ${arg.message}${arg.stack ? `\nStack: ${arg.stack}` : ''}`;
            }
            try {
                // Attempt to stringify objects, fallback to String()
                return typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg);
            } catch (stringifyError) {
                return '[Unserializable Object]'; // Handle potential circular references or other stringify issues
            }
        }).join(' '); // Join multiple arguments with a space

        const payload = {
            level: level,
            message: messageString,
            context: {
                ...context, // Include any passed context
                source: 'client', // Identify the source as client-side
                userId: userId, // Include the user ID
                url: typeof window !== 'undefined' ? window.location.href : undefined,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
        };

        // Use fetch to send the log data to the backend API route
        await fetch('/api/client-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true, // Suggest browser keep connection alive for reliability on page unload
        });

    } catch (error) {
        // Fallback to console.error if sending fails - avoid infinite loops!
        console.error('CLIENT LOGGER FALLBACK: Failed to send log to backend:', { level, messages, context, error });
    }
}

// --- Exported Client-Side Logging Functions ---
// These functions will be used by client components.

export const logInfo = (message: any, ...optionalParams: any[]) => {
    console.info(message, ...optionalParams); // Keep original console behavior
    sendLogToBackendApi('info', [message, ...optionalParams]);
};

export const logWarn = (message: any, ...optionalParams: any[]) => {
    console.warn(message, ...optionalParams); // Keep original console behavior
    sendLogToBackendApi('warn', [message, ...optionalParams]);
};

export const logError = (message: any, ...optionalParams: any[]) => {
    console.error(message, ...optionalParams); // Keep original console behavior
    sendLogToBackendApi('error', [message, ...optionalParams]);
};

export const logDebug = (message: any, ...optionalParams: any[]) => {
    console.debug(message, ...optionalParams); // Keep original console behavior
    sendLogToBackendApi('debug', [message, ...optionalParams]);
};

// A general 'log' function that maps to 'info' on the backend for simplicity
export const log = (message: any, ...optionalParams: any[]) => {
    console.log(message, ...optionalParams); // Keep original console behavior
    sendLogToBackendApi('info', [message, ...optionalParams]); // Send as 'info' level
};
