// src/lib/logger.ts
// This logger is primarily for server-side. Client logs are sent via API.

import winston, { format, Logger as WinstonLogger } from 'winston';
// To re-enable Logtail for server logs, uncomment and install @logtail/winston
// import { WinstonLogtail } from '@logtail/winston';

// const LOGTAIL_SOURCE_TOKEN = process.env.LOGTAIL_SOURCE_TOKEN; // For server-side Logtail
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

let logger: WinstonLogger | null = null;

const logFormat = format.combine(
    format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }), // This will automatically include stack traces for Error objects
    format.splat(),
    format.json() // Use JSON format for structured logging
);

if (!logger) {
    const transports: winston.transport[] = [];

    // Console transport for all environments
    transports.push(new winston.transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple() // More readable console output
        ),
        level: LOG_LEVEL, // Respect configured log level for console
    }));

    // Example: Add Logtail transport for server logs (if token is provided)
    // if (LOGTAIL_SOURCE_TOKEN && typeof window === 'undefined') { // Ensure it runs only on server
    //     try {
    //         transports.push(new WinstonLogtail({
    //             sourceToken: LOGTAIL_SOURCE_TOKEN,
    //             format: logFormat, // Apply the base JSON format
    //         }));
    //         console.log("Logtail transport configured for Winston (server-side).");
    //     } catch (e) {
    //         console.error("Failed to configure Logtail transport for Winston:", e);
    //     }
    // }

    logger = winston.createLogger({
        level: LOG_LEVEL, // Set the base logging level for the logger instance
        format: logFormat, // Default format for the logger
        transports: transports,
        exitOnError: false, // Do not exit on handled exceptions
    });

    logger.info(`Winston Logger initialized. Level: ${LOG_LEVEL}. NODE_ENV: ${process.env.NODE_ENV}.`);
}

// Base context, potentially including user ID if available server-side
const getBaseContext = (userIdOverride?: string) => {
  // For server-side calls (e.g., from API routes), auth() would be available if Clerk is used.
  // For client-side logs forwarded via API, userIdOverride will be used.
  const userId = userIdOverride || CLERK_DISABLED_PLACEHOLDER_USER_ID; // Fallback or placeholder
  return {
    userId: userId,
    environment: process.env.NODE_ENV,
    // appName: 'IFC-Guru',
    // appVersion: process.env.npm_package_version, // If available
  };
};

// Helper to add request context (primarily for server-side API routes/actions)
export const withRequestContext = (req: Request, context: Record<string, any> = {}): Record<string, any> => {
    const headersObject: Record<string, string> = {};
    req.headers.forEach((value, key) => {
        headersObject[key] = value;
    });

    return {
        ...context,
        requestId: headersObject['x-request-id'] || headersObject['x-vercel-id'], // Common request ID headers
        path: req.url ? new URL(req.url).pathname : undefined,
        method: req.method,
        userAgent: headersObject['user-agent'],
        ip: headersObject['x-forwarded-for'] || headersObject['x-real-ip'], // Common IP headers
    };
};

// Internal logging function using Winston
const logWithWinston = (level: LogLevel, message: string, context: Record<string, any> = {}, userIdForContext?: string) => {
    if (!logger) {
        // Fallback if logger somehow isn't initialized
        const fallbackMessage = `[WINSTON FALLBACK - ${level.toUpperCase()}] ${message}`;
        if (level === 'error') console.error(fallbackMessage, context);
        else if (level === 'warn') console.warn(fallbackMessage, context);
        else console.log(fallbackMessage, context);
        return;
    }

    const fullContext = { ...getBaseContext(userIdForContext), ...context };
    logger.log(level, message, fullContext);
};

// Exported logging functions
export const logInfo = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('info', message, context, userIdForContext);
};

export const logWarn = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('warn', message, context, userIdForContext);
};

export const logError = (message: string, error?: unknown, context?: Record<string, any>, userIdForContext?: string) => {
    let errorDetails: Record<string, any> = {};
    if (error instanceof Error) {
        errorDetails = {
            errorMessage: error.message,
            errorName: error.name,
            // Winston's format.errors({ stack: true }) should handle stack
        };
    } else if (error !== undefined && error !== null) {
        errorDetails = { error: String(error) }; // Convert unknown error to string
    }

    const fullContext = { ...context, ...errorDetails };
    logWithWinston('error', message, fullContext, userIdForContext);
};

export const logDebug = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('debug', message, context, userIdForContext);
};

export const logVerbose = (message: string, context?: Record<string, any>, userIdForContext?: string) => {
    logWithWinston('verbose', message, context, userIdForContext);
};

export { logger as winstonLogger }; // Export the winston instance if direct access is needed
