// src/lib/logger.ts
'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

// Types
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log'; // 'log' for generic console.log
type LogContext = Record<string, unknown>;

interface LoggerOptions {
  enableServerLogging?: boolean;
  maxErrorStackLength?: number;
  debugLogsInProduction?: boolean;
}

// Default configuration
const DEFAULT_OPTIONS: LoggerOptions = {
  enableServerLogging: process.env.NEXT_PUBLIC_LOG_TO_SERVER === 'true',
  maxErrorStackLength: 2000, // Max length for error stack strings
  debugLogsInProduction: process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true',
};

// Helper to get base context without hooks, for direct log functions
const getBaseContextForDirectLog = (userIdForLog?: string | null): LogContext => {
  return {
    userId: userIdForLog ?? 'anonymous_or_server', // Default if no specific userId passed
    environment: process.env.NODE_ENV || 'unknown_env',
    clientTimestamp: new Date().toISOString(),
    source_client_component: typeof window !== 'undefined' ? window.location.pathname : 'server_or_unknown_path',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
};

const prepareErrorContextForLog = (error?: unknown, maxStackLength: number = DEFAULT_OPTIONS.maxErrorStackLength!): LogContext => {
    if (!error) return {};

    if (error instanceof Error) {
      return {
        errorMessage: error.message,
        errorStack: error.stack?.substring(0, maxStackLength),
        errorName: error.name,
      };
    }

    if (typeof error === 'object' && error !== null) {
      const errorContext: LogContext = {};
      for (const [key, value] of Object.entries(error)) {
        if (typeof value === 'function') continue; // Skip functions
        
        try {
          // Attempt to stringify objects, limit length for very large objects
          errorContext[`error_${key}`] = typeof value === 'object' 
            ? JSON.stringify(value).substring(0, 500) // Limit stringified object length
            : value;
        } catch {
          // Handle potential circular references or unstringifiable objects
          errorContext[`error_${key}`] = '[Unserializable Data]';
        }
      }
      return errorContext;
    }

    return { errorDetails: String(error) }; // Fallback for other error types
};


const sendLogToServer = async (level: LogLevel, message: string, context: LogContext) => {
    if (process.env.NEXT_PUBLIC_LOG_TO_SERVER !== 'true' || typeof window === 'undefined') return;

    try {
      await fetch('/api/client-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, context }),
      });
    } catch (error) {
      // Fallback to console if server logging fails
      console.warn('Failed to send log to server API:', { 
        originalLevel: level, 
        originalMessage: message, 
        originalContext: context,
        sendError: error
      });
    }
};

const logToConsole = (level: LogLevel, message: string, context: LogContext) => {
    const consoleArgs: any[] = [`[${level.toUpperCase()}] ${message}`];
    
    // Filter out some noisy context fields for cleaner console output
    const { environment, clientTimestamp, source_client_component, userAgent, ...filteredContext } = context;
    if (Object.keys(filteredContext).length > 0) {
      consoleArgs.push(filteredContext);
    }

    switch (level) {
      case 'error': console.error(...consoleArgs); break;
      case 'warn': console.warn(...consoleArgs); break;
      case 'info': console.info(...consoleArgs); break;
      case 'debug': console.debug(...consoleArgs); break;
      case 'log': default: console.log(...consoleArgs); break;
    }
};

// Direct logging functions (callable from anywhere, client or server if adapted)
// These do not use React hooks directly.
const directLog = (
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown,
    userIdOverride?: string | null
) => {
    const baseContext = getBaseContextForDirectLog(userIdOverride);
    const errorContext = prepareErrorContextForLog(error);
    const fullContext = { ...baseContext, ...errorContext, ...(context || {}) };

    logToConsole(level, message, fullContext);
    if (DEFAULT_OPTIONS.enableServerLogging) {
        sendLogToServer(level, message, fullContext);
    }
};

export const logInfo = (message: string, context?: LogContext, userId?: string | null) => {
  directLog('info', message, context, undefined, userId);
};

export const logWarn = (message: string, context?: LogContext, userId?: string | null) => {
  directLog('warn', message, context, undefined, userId);
};

export const logError = (message: string, error?: unknown, context?: LogContext, userId?: string | null) => {
  directLog('error', message, context, error, userId);
};

export const logDebug = (message: string, context?: LogContext, userId?: string | null) => {
  if (process.env.NODE_ENV === 'development' || DEFAULT_OPTIONS.debugLogsInProduction) {
    directLog('debug', message, context, undefined, userId);
  }
};


// React hook for component-specific logging, uses useAuth
export const useLogger = (componentName?: string) => {
  const { userId, sessionId, orgId } = useAuth();
  const [options] = useState<LoggerOptions>(DEFAULT_OPTIONS); // Options can be made dynamic if needed

  const getBaseContextWithAuth = useCallback((): LogContext => {
    return {
      userId: userId ?? 'anonymous_hook_user',
      sessionId: sessionId,
      orgId: orgId,
      componentName: componentName, // Add component name if provided
      environment: process.env.NODE_ENV || 'unknown_env',
      clientTimestamp: new Date().toISOString(),
      source_client_component: typeof window !== 'undefined' ? window.location.pathname : 'server_or_unknown_path',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };
  }, [userId, sessionId, orgId, componentName]);

  const componentLog = useCallback(async (
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ) => {
    const baseContext = getBaseContextWithAuth();
    const errorContext = prepareErrorContextForLog(error, options.maxErrorStackLength);
    const fullContext = { ...baseContext, ...errorContext, ...(context || {}) };

    logToConsole(level, message, fullContext);
    if (options.enableServerLogging) {
      await sendLogToServer(level, message, fullContext);
    }
  }, [getBaseContextWithAuth, options.maxErrorStackLength, options.enableServerLogging]);


  return {
    info: (message: string, context?: LogContext) => componentLog('info', message, context),
    warn: (message: string, context?: LogContext) => componentLog('warn', message, context),
    error: (message: string, error?: unknown, context?: LogContext) => componentLog('error', message, context, error),
    debug: (message: string, context?: LogContext) => {
      if (options.debugLogsInProduction || process.env.NODE_ENV === 'development') {
        componentLog('debug', message, context);
      }
    },
  };
};
