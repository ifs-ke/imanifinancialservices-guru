// src/lib/logger.ts
// SERVER-SIDE ONLY LOGGER using standard console

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y'; // Use the consistent placeholder

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

// Helper to get base context, including potential user ID (primarily for server requests)
const getBaseContext = (userIdOverride?: string) => {
  // In a real server context (API route, Server Action), you might get userId differently if Clerk was enabled
  const userId = userIdOverride || CLERK_DISABLED_PLACEHOLDER_USER_ID;
  return {
    userId: userId,
    environment: process.env.NODE_ENV || 'development',
    source: 'server', // Indicate log source is server-side
    timestamp: new Date().toISOString(),
    // Add other common context fields if needed
  };
};

// Internal function to handle logging with console
const logWithConsole = (
  level: LogLevel,
  message: string,
  context: Record<string, any> = {},
  userIdForContext?: string,
  error?: unknown
) => {
  // Ensure this runs ONLY on the server
  if (typeof window !== 'undefined') {
    console.warn("Server logger functions (logInfo, etc.) should not be called on the client.");
    return;
  }

  const fullContext = { ...getBaseContext(userIdForContext), ...context };
  const logEntry = { level, message, ...fullContext };

  // Format the error nicely if it exists
  if (error) {
    if (error instanceof Error) {
      logEntry.errorMessage = error.message;
      logEntry.stack = error.stack;
    } else {
      logEntry.errorDetails = String(error);
    }
  }

  // Map log level to console method
  switch (level) {
    case 'error':
      console.error(JSON.stringify(logEntry, null, 2));
      break;
    case 'warn':
      console.warn(JSON.stringify(logEntry, null, 2));
      break;
    case 'info':
    case 'verbose': // Treat verbose as info for console
      console.info(JSON.stringify(logEntry, null, 2));
      break;
    case 'debug':
      // Only log debug messages if LOG_LEVEL is set to debug or verbose
      const logLevel = process.env.LOG_LEVEL || 'debug';
      if (logLevel === 'debug' || logLevel === 'verbose') {
        console.debug(JSON.stringify(logEntry, null, 2));
      }
      break;
    default:
      console.log(JSON.stringify(logEntry, null, 2));
  }
};

// --- Exported Server-Side Logging Functions ---

export const logInfo = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
  logWithConsole('info', message, context, userIdForContext);
};

export const logWarn = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
  logWithConsole('warn', message, context, userIdForContext);
};

export const logError = (message: string, error?: unknown, context?: Record<string, any>, userIdForContext?: string) => {
  logWithConsole('error', message, context, userIdForContext, error);
};

export const logDebug = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
  logWithConsole('debug', message, context, userIdForContext);
};

export const logVerbose = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
  logWithConsole('verbose', message, context, userIdForContext);
};
