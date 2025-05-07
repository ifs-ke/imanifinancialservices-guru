// src/lib/logger.ts
// SERVER-SIDE ONLY LOGGER using Winston

import winston, { format, Logger as WinstonLogger, transports } from 'winston';
// To re-enable Logtail for server logs, uncomment the line below and ensure @logtail/winston is installed
// import { WinstonLogtail } from '@logtail/winston';

// const LOGTAIL_SOURCE_TOKEN = process.env.LOGTAIL_SOURCE_TOKEN; // For server-side Logtail integration if needed
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug'; // Default log level
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y'; // Use the consistent placeholder

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

let loggerInstance: WinstonLogger | null = null;

// Centralized format for consistency
const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }), // Include stack traces for Error objects
    format.splat(),
    format.json() // Structured JSON format is good for log aggregators
);

function initializeLogger(): WinstonLogger {
    if (loggerInstance) {
        return loggerInstance;
    }

    // Ensure this runs ONLY on the server
    if (typeof window !== 'undefined') {
         console.warn("Winston logger initialization attempted on client-side. Skipping.");
         // Return a dummy logger or throw error if needed
         return winston.createLogger({ silent: true }); // Or create a no-op logger
    }

    const configuredTransports: winston.transport[] = [];

    // Always add Console transport for server environments
    configuredTransports.push(new transports.Console({
        format: format.combine(
            format.colorize(), // Make console output colorful
            format.simple() // Simple format for readability in console
        ),
        level: LOG_LEVEL, // Respect configured level for console output
    }));

    // Example: Add Logtail transport if configured (SERVER-SIDE ONLY)
    // if (LOGTAIL_SOURCE_TOKEN) { // No need for typeof window check here, as we already checked above
    //     try {
    //         configuredTransports.push(new WinstonLogtail({
    //             sourceToken: LOGTAIL_SOURCE_TOKEN,
    //             format: logFormat, // Use the base JSON format
    //         }));
    //         console.log("Logtail transport configured for Winston (server-side).");
    //     } catch (e) {
    //         console.error("Failed to configure Logtail transport for Winston:", e);
    //     }
    // }

    loggerInstance = winston.createLogger({
        level: LOG_LEVEL, // Base logging level for the instance
        format: logFormat, // Default format for all transports unless overridden
        transports: configuredTransports,
        exitOnError: false, // Prevent crashing on logging errors
    });

    // Log initialization details (only runs once)
    loggerInstance.info(`Server Winston Logger initialized. Level: ${LOG_LEVEL}. NODE_ENV: ${process.env.NODE_ENV}.`);

    return loggerInstance;
}

// Get the logger instance (creates if it doesn't exist)
const getLogger = (): WinstonLogger => {
    // Ensure logger is initialized (safe to call multiple times)
    return loggerInstance || initializeLogger();
};

// Helper to get base context, including potential user ID (primarily for server requests)
const getBaseContext = (userIdOverride?: string) => {
  // In a real server context (API route, Server Action), you might get userId differently if Clerk was enabled
  const userId = userIdOverride || CLERK_DISABLED_PLACEHOLDER_USER_ID;
  return {
    userId: userId,
    environment: process.env.NODE_ENV || 'development',
    source: 'server', // Indicate log source is server-side
    // Add other common context fields if needed
  };
};

// Internal function to handle logging with Winston
const logWithWinston = (level: LogLevel, message: string, context: Record<string, any> = {}, userIdForContext?: string) => {
    const logger = getLogger();
    // Ensure logger wasn't skipped on client-side attempt
    if (logger.silent) return;

    const fullContext = { ...getBaseContext(userIdForContext), ...context };
    logger.log(level, message, fullContext);
};

// --- Exported Server-Side Logging Functions ---

export const logInfo = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('info', message, context, userIdForContext);
};

export const logWarn = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('warn', message, context, userIdForContext);
};

// Updated logError to better handle the error object for Winston
export const logError = (message: string, error?: unknown, context?: Record<string, any>, userIdForContext?: string) => {
    const logger = getLogger();
     // Ensure logger wasn't skipped on client-side attempt
    if (logger.silent) return;

    const fullContext = { ...getBaseContext(userIdForContext), ...context };

    // Pass the error object directly to Winston if it's an Error instance
    if (error instanceof Error) {
        logger.error(message, { ...fullContext, error: error }); // Winston handles the Error object correctly
    } else if (error !== undefined && error !== null) {
        // Log non-Error types as part of the context
        logger.error(message, { ...fullContext, errorDetails: String(error) });
    } else {
        // Log only the message and context if no error object provided
        logger.error(message, fullContext);
    }
};

export const logDebug = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('debug', message, context, userIdForContext);
};

export const logVerbose = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('verbose', message, context, userIdForContext);
};

// Export the Winston instance itself only if absolutely necessary for advanced configuration elsewhere
// export { getLogger as getServerLoggerInstance };
