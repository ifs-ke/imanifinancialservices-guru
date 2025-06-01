// src/lib/logger.ts
'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

// Types
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log';
type LogContext = Record<string, unknown>;

interface LoggerOptions {
  enableServerLogging?: boolean;
  maxErrorStackLength?: number;
  debugLogsInProduction?: boolean;
}

// Default configuration
const DEFAULT_OPTIONS: LoggerOptions = {
  enableServerLogging: process.env.NEXT_PUBLIC_LOG_TO_SERVER === 'true',
  maxErrorStackLength: 2000,
  debugLogsInProduction: process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true',
};

// Client-side logger implementation
class ClientLogger {
  private options: LoggerOptions;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // This method is not used directly but serves as a pattern for using auth data
  // in React components. The actual auth data is accessed within the React Hook
  // `useLogger` and passed down to the logger instance's methods when needed.
  // private async initializeAuthData() {
  //   if (typeof window === 'undefined') return;

  //   try {
  //     const { userId, sessionId, orgId } = useAuth();

  //   } catch (error) {
  //     console.warn('Failed to initialize auth data for logger:', error);
  //   }
  }

  private getBaseContext(userIdOverride?: string | null): LogContext {
    const effectiveUserId = userIdOverride ?? this.authData.userId ?? 'anonymous';
    
    return {
      userId: effectiveUserId,
      // sessionId: this.authData.sessionId, // SessionId not needed for basic logging
      // orgId: this.authData.orgId, // OrgId not needed for basic logging
      // environment: process.env.NODE_ENV || 'development', // Environment is standard log context
      clientTimestamp: new Date().toISOString(),
      source: typeof window !== 'undefined' ? window.location.pathname : 'server',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };
  }

  private prepareErrorContext(error?: unknown): LogContext {
    if (!error) return {};

    if (error instanceof Error) {
      return {
        errorMessage: error.message,
        errorStack: error.stack?.substring(0, this.options.maxErrorStackLength),
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
  }

  private async sendToServer(level: LogLevel, message: string, context: LogContext) {
    if (!this.options.enableServerLogging || typeof window === 'undefined') return;

    try {
      await fetch('/api/client-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, context }),
      });
    } catch (error) {
      console.warn('Failed to send log to server:', { level, message, context });
    }
  }

  private logToConsole(level: LogLevel, message: string, context: LogContext) {
    const consoleArgs: (string | LogContext)[] = [`[${level.toUpperCase()}] ${message}`];
    
    // Include all context for console logs for now
    consoleArgs.push(context);

    switch (level) {
      case 'error': console.error(...consoleArgs); break;
      case 'warn': console.warn(...consoleArgs); break;
      case 'info': console.info(...consoleArgs); break;
      case 'debug': console.debug(...consoleArgs); break;
      default: console.log(...consoleArgs); break;
    }
  }

  public async log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown,
    userIdOverride?: string | null
  ) {
    const baseContext = this.getBaseContext(userIdOverride); // Auth data will be added in useLogger hook
    const errorContext = this.prepareErrorContext(error);
    const fullContext = { ...baseContext, ...errorContext, ...(context || {}) };

    // Always log to console
    this.logToConsole(level, message, fullContext);

    // Conditionally send to server
    if (this.options.enableServerLogging) {
      await this.sendToServer(level, message, fullContext);
    }
  }
}

// Singleton logger instance
const logger = new ClientLogger();

// React hook for component-specific logging
export const useLogger = () => {
  const { userId, sessionId, orgId } = useAuth();
  const { user } = useUser(); // Get user details if needed for richer context

  const authContext = {
    userId: userId ?? null,
    sessionId: sessionId ?? null,
    orgId: orgId ?? null,
    // Add other user details if necessary, e.g., user?.fullName, user?.emailAddresses[0]?.emailAddress
  };

  const [componentLogger] = useState(() => ({
    info: (message: string, context?: LogContext) => logger.log('info', message, { ...authContext, ...context }),
    warn: (message: string, context?: LogContext) => logger.log('warn', message, { ...authContext, ...context }),
    error: (message: string, error?: unknown, context?: LogContext) => logger.log('error', message, { ...authContext, ...context }, error),
    debug: (message: string, context?: LogContext) => {
      // Only log debug messages in development or if specifically enabled
      // Adding authContext to debug logs as well

      if (logger.options.debugLogsInProduction || process.env.NODE_ENV === 'development') {
        logger.log('debug', message, context);
      }
    },
  }));

  return componentLogger;
};

// Direct export functions for non-component usage
export const logInfo = (message: string, context?: LogContext, userId?: string | null) => {
  logger.log('info', message, context, undefined, userId); // userIdOverride takes precedence
};

export const logWarn = (message: string, context?: LogContext, userId?: string | null) => {
  logger.log('warn', message, context, undefined, userId); // userIdOverride takes precedence
};

export const logError = (message: string, error?: unknown, context?: LogContext, userId?: string | null) => {
  logger.log('error', message, context, error, userId); // userIdOverride takes precedence
};

export const logDebug = (message: string, context?: LogContext, userId?: string | null) => {
  if (logger.options.debugLogsInProduction || process.env.NODE_ENV === 'development') { // Check debug setting
    logger.log('debug', message, context, undefined, userId);
  }
};