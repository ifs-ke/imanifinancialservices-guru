// src/lib/logger.ts
'use client';

// import { Logtail } from '@logtail/browser'; // Logtail browser client removed for now
// import { auth } from '@clerk/nextjs'; // Clerk re-enabled

// Placeholder for when Clerk is disabled or user not signed in, for client-side context.
// The actual userId from Clerk will be used when available (passed into logging functions).
const CLERK_ANONYMOUS_USER_ID = 'anonymous_client_user';
const CLERK_SESSION_ID_PLACEHOLDER = 'no_session_id_client';
const CLERK_ORG_ID_PLACEHOLDER = 'no_org_id_client';


const getBaseClientContext = (userIdForLog?: string | null) => {
  let effectiveUserId = CLERK_ANONYMOUS_USER_ID;
  let effectiveSessionId = CLERK_SESSION_ID_PLACEHOLDER;
  let effectiveOrgId = CLERK_ORG_ID_PLACEHOLDER;
  
  // if (typeof window !== 'undefined') { // Check if in browser
  //   const { userId, sessionId, orgId } = auth(); // Clerk re-enabled
  //   if (userId) effectiveUserId = userId;
  //   if (sessionId) effectiveSessionId = sessionId;
  //   if (orgId) effectiveOrgId = orgId;
  // }
  // If a specific userId is passed for the log (e.g. from useSyncManager), prioritize it.
  if (userIdForLog) {
    effectiveUserId = userIdForLog;
  }


  return {
    userId: effectiveUserId,
    // sessionId: effectiveSessionId, // Temporarily removed as auth() is server-side here
    // orgId: effectiveOrgId,         // Temporarily removed
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
        ...getBaseClientContext(userIdForLog), // Pass userIdForLog to getBaseClientContext
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
      // Filter out the base client context before logging to console to reduce noise,
      // but it will still be sent to the server if server-side logging is enabled.
      const displayContext = { ...logContext };
      delete displayContext.environment;
      delete displayContext.clientTimestamp;
      delete displayContext.source_client_component;
      // We keep userId in console for easier debugging if it's set.
      if(Object.keys(displayContext).length > 0) consoleArgs.push(displayContext);
    }


    switch (level) {
        case 'error': console.error(...consoleArgs); break;
        case 'warn':  console.warn(...consoleArgs); break;
        case 'info':  console.info(...consoleArgs); break;
        case 'debug': console.debug(...consoleArgs); break;
        case 'log':   console.log(...consoleArgs); break;
        default:      console.log(...consoleArgs); break;
    }

    // Send log to the server-side API endpoint for centralized logging
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_LOG_TO_SERVER === 'true') {
        fetch('/api/client-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: level, // Send the original level
                message: message,
                context: logContext, // Send the full context including baseClientContext
            }),
        }).catch(fetchError => {
            // Use original console.warn to avoid loop if logger itself fails to send
            console.warn('Failed to send client log to server:', fetchError, { originalMessage: message, originalContext: logContext });
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

// No direct export of a Logtail client instance from here anymore.
// If Logtail (or another third-party logger) is needed application-wide,
// it should be initialized in a provider or a global setup file.
// For now, this logger focuses on console output and optional server-side forwarding.
export { /* logtailClient removed */ };
