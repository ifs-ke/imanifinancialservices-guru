// src/lib/logger.ts
'use client';

// import { useAuth } from '@clerk/nextjs'; // Clerk disabled
import { useCallback, useState } from 'react';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log';
type LogContext = Record<string, unknown>;

interface LoggerOptions {
  enableServerLogging?: boolean;
  maxErrorStackLength?: number;
  debugLogsInProduction?: boolean;
}

const DEFAULT_OPTIONS: LoggerOptions = {
  enableServerLogging: process.env.NEXT_PUBLIC_LOG_TO_SERVER === 'true',
  maxErrorStackLength: 2000,
  debugLogsInProduction: process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true',
};

const getBaseContextForDirectLog = (userIdForLog?: string | null): LogContext => {
  // When Clerk is disabled, always use the mock user ID from env if available
  const effectiveUserId = userIdForLog ?? process.env.NEXT_PUBLIC_MOCK_USER_ID ?? 'anonymous_or_server';
  
  return {
    userId: effectiveUserId,
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
        if (typeof value === 'function') continue; 
        
        try {
          errorContext[`error_${key}`] = typeof value === 'object' 
            ? JSON.stringify(value).substring(0, 500)
            : value;
        } catch {
          errorContext[`error_${key}`] = '[Unserializable Data]';
        }
      }
      return errorContext;
    }

    return { errorDetails: String(error) };
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
      console.warn('Failed to send log to server API:', { 
        originalLevel: level, 
        originalMessage: message, 
        originalContext: context,
        sendError: error
      });
    }
};

const logToConsole = (level: LogLevel, message: string, context: LogContext) => {
    const consoleArgs: any[] = [`[Client - ${level.toUpperCase()}] ${message}`]; 
    
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

const directLog = (
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown,
    userIdOverride?: string | null // Allow explicitly passing userId
) => {
    // Use userIdOverride if provided, otherwise let getBaseContextForDirectLog handle mock/anonymous
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


export const useLogger = (componentName?: string) => {
  // const { userId, sessionId, orgId } = useAuth(); // Clerk disabled
  const mockUserId = process.env.NEXT_PUBLIC_MOCK_USER_ID;
  const userId = mockUserId; // Use mock user ID
  const sessionId = mockUserId ? 'mock-session-id' : null; // Mock session if user exists
  const orgId = mockUserId ? 'mock-org-id' : null; // Mock org if user exists

  const [options] = useState<LoggerOptions>(DEFAULT_OPTIONS);

  const getBaseContextWithAuth = useCallback((): LogContext => {
    return {
      userId: userId ?? 'anonymous_hook_user',
      sessionId: sessionId,
      orgId: orgId,
      componentName: componentName,
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
