// src/lib/logger.ts
'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

const getBaseClientContext = (userIdForLog?: string | null) => {
  const [authData, setAuthData] = useState<{
    userId: string | null;
    sessionId: string | null;
    orgId: string | null;
  }>({ userId: null, sessionId: null, orgId: null });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { userId, sessionId, orgId } = useAuth();
      setAuthData({ userId, sessionId, orgId });
    }
  }, []);

  return {
    userId: userIdForLog ?? authData.userId ?? 'anonymous',
    sessionId: authData.sessionId,
    orgId: authData.orgId,
    environment: process.env.NODE_ENV || 'unknown_env',
    clientTimestamp: new Date().toISOString(),
    source_client_component: typeof window !== 'undefined' ? window.location.pathname : 'unknown_path',
  };
};

const clientLog = (
  level: 'debug' | 'info' | 'warn' | 'error' | 'log',
  message: string,
  context?: Record<string, any>,
  errorDetails?: any,
  userIdForLog?: string | null
) => {
  const logContext: Record<string, any> = {
    ...getBaseClientContext(userIdForLog),
    ...(context || {}),
  };

  if (errorDetails) {
    if (errorDetails instanceof Error) {
      logContext.errorMessage = errorDetails.message;
      const stackString = typeof errorDetails.stack === 'string' ? errorDetails.stack : String(errorDetails.stack);
      logContext.stack = stackString.substring(0, 2000);
    } else if (typeof errorDetails === 'object' && errorDetails !== null) {
      Object.keys(errorDetails).forEach(key => {
        const value = errorDetails[key];
        if (typeof value !== 'function' && (typeof value !== 'object' || value === null || key === 'status' || key === 'statusText')) {
          logContext[`error_${key}`] = value;
        } else if (typeof value === 'object' && value !== null) {
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

  const consoleArgs: any[] = [`[${level.toUpperCase()}] ${message}`];
  if (Object.keys(logContext).length > 0) {
    const displayContext = { ...logContext };
    delete displayContext.environment;
    delete displayContext.clientTimestamp;
    delete displayContext.source_client_component;
    if (Object.keys(displayContext).length > 0) consoleArgs.push(displayContext);
  }

  switch (level) {
    case 'error': console.error(...consoleArgs); break;
    case 'warn': console.warn(...consoleArgs); break;
    case 'info': console.info(...consoleArgs); break;
    case 'debug': console.debug(...consoleArgs); break;
    case 'log': console.log(...consoleArgs); break;
    default: console.log(...consoleArgs); break;
  }

  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_LOG_TO_SERVER === 'true') {
    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: level,
        message: message,
        context: logContext,
      }),
    }).catch(fetchError => {
      console.warn('Failed to send client log to server:', fetchError, { 
        originalMessage: message, 
        originalContext: logContext 
      });
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
  if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS === 'true') {
    clientLog('debug', message, context, undefined, userId);
  }
};