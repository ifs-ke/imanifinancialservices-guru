// src/lib/logger.ts

import winston, { format, Logger as WinstonLogger } from 'winston';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

// Define log levels type
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

let logger: WinstonLogger | null = null;

const logFormat = format.combine(
    format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }), // This will automatically include stack traces for Error objects
    format.splat(),
    format.json()
);

if (!logger) {
    const transports = [];

    // Console transport for all environments
    transports.push(new winston.transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple() // More readable console output
        ),
        level: LOG_LEVEL, // Respect configured log level for console
    }));

    logger = winston.createLogger({
        level: LOG_LEVEL, // Set the base logging level for the logger instance
        format: logFormat, // Default format for the logger
        transports: transports,
        exitOnError: false, // Do not exit on handled exceptions
    });

    logger.info(`Logger initialized. Level: ${LOG_LEVEL}. NODE_ENV: ${process.env.NODE_ENV}.`);
}

const getBaseContext = () => {
  // Mock Clerk data when disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
  // Add other general context if needed (e.g., application version)
  return {
    userId: userId,
    environment: process.env.NODE_ENV,
    // Consider adding application name/version here
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


const logWithContext = (level: LogLevel, message: string, context: Record<string, any> = {}) => {
    if (!logger) {
        // Fallback if logger somehow isn't initialized (should not happen with the above structure)
        const fallbackMessage = `[${level.toUpperCase()}] ${message}`;
        if (level === 'error') console.error(fallbackMessage, context);
        else if (level === 'warn') console.warn(fallbackMessage, context);
        else console.log(fallbackMessage, context);
        return;
    }

    const fullContext = { ...getBaseContext(), ...context };
    logger.log(level, message, fullContext);
};

export const logInfo = (message: string, context?: Record<string, any>) => {
    logWithContext('info', message, context);
};

export const logWarn = (message: string, context?: Record<string, any>) => {
    logWithContext('warn', message, context);
};

export const logError = (message: string, error?: unknown, context?: Record<string, any>) => {
    let errorDetails: Record<string, any> = {};
    if (error instanceof Error) {
        errorDetails = {
            errorMessage: error.message,
            errorName: error.name, // Include error name
            // Winston's format.errors({ stack: true }) should handle stack
        };
    } else if (error !== undefined && error !== null) {
        errorDetails = { error: String(error) }; // Convert unknown error to string
    }

    const fullContext = { ...context, ...errorDetails };
    logWithContext('error', message, fullContext);
};

export const logDebug = (message: string, context?: Record<string, any>) => {
    logWithContext('debug', message, context);
};

export const logVerbose = (message: string, context?: Record<string, any>) => {
    logWithContext('verbose', message, context);
};


export { logger as winstonLogger }; // Export the winston instance if direct access is needed
