// src/lib/logger.ts
// Logger implementation removed as requested.
// All log calls will now default to console logs within their respective files.

// Placeholder functions if strict typing requires them elsewhere,
// but they won't perform any specific logging actions.
export const logInfo = (message: string, context?: Record<string, any>, userId?: string) => {
    // console.log("[INFO]", message, { ...(context || {}), userId }); // Commented out
};

export const logWarn = (message: string, context?: Record<string, any>, userId?: string) => {
     // console.warn("[WARN]", message, { ...(context || {}), userId }); // Commented out
};

export const logError = (message: string, error?: any, context?: Record<string, any>, userId?: string) => {
    const errorContext = error instanceof Error ? { errorMessage: error.message, stack: error.stack } : { error: error };
    // console.error("[ERROR]", message, { ...(context || {}), ...errorContext, userId }); // Commented out
};

export const logDebug = (message: string, context?: Record<string, any>, userId?: string) => {
     // console.debug("[DEBUG]", message, { ...(context || {}), userId }); // Commented out
};

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose';

// Removed Logtail client export
export const logtailClient = null;
