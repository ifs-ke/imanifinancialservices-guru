// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server'; // Import Clerk server-side auth
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; // Import your logger

// Consistent placeholder for when no user context can be determined server-side
const ANONYMOUS_USER_ID = 'anonymous-client-user';

interface ClientLogPayload {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, any>;
}

export async function POST(request: Request) {
  let effectiveUserId: string;
  let logContextBase: Record<string, any> = {};

  try {
    const { userId: authenticatedUserId } = auth(); // Get authenticated user ID if available
    
    // Determine the user ID to use for logging
    // Prioritize authenticated user ID, then client-provided, then anonymous
    if (authenticatedUserId) {
        effectiveUserId = authenticatedUserId;
    } else {
        // If no server-side authenticated user, check if client sent one (less secure)
        // This path is less ideal; client-sent IDs should be treated with caution.
        // However, for logging non-sensitive client events, it might be acceptable.
        const tempPayloadForUserIdCheck = await request.clone().json(); // Clone to read body once for userId
        effectiveUserId = tempPayloadForUserIdCheck.context?.userId || ANONYMOUS_USER_ID;
        if (tempPayloadForUserIdCheck.context?.userId && !authenticatedUserId) {
            logWarn('Client-log API: Using client-provided userId for unauthenticated session.', { clientUserId: tempPayloadForUserIdCheck.context.userId });
        }
    }
    logContextBase = { userId: effectiveUserId, source: 'client-log-api' };


    const payload = await request.json() as ClientLogPayload;

    // Merge base context with payload context
    const contextForLog = {
      ...logContextBase, // Includes effectiveUserId and source
      ...(payload.context || {}), // Client context (might override userId if client sent it, but logContextBase.userId is already set)
    };

    const serverLevel: string = payload.level === 'log' ? 'info' : payload.level;
    const logMessage = `[Client ${payload.level.toUpperCase()}] ${payload.message}`; // Prefix to distinguish client logs

    switch (serverLevel) {
      case 'info':
        logInfo(logMessage, contextForLog);
        break;
      case 'warn':
        logWarn(logMessage, contextForLog);
        break;
      case 'error':
        // For client errors, the 'error' object might be in context.message or context.error
        let clientErrorDetails = payload.context?.error || payload.context?.errorMessage;
        if (typeof clientErrorDetails === 'object') clientErrorDetails = JSON.stringify(clientErrorDetails);
        logError(logMessage, clientErrorDetails, contextForLog);
        break;
      case 'debug':
        logDebug(logMessage, contextForLog);
        break;
      default:
        logInfo(logMessage, contextForLog); // Default to info for unknown 'log' level
    }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error: any) {
    // Log critical errors within the API route itself
    const criticalErrorContext = {
        ...logContextBase, // Use base context which might have a determined userId or anonymous
        endpoint: '/api/client-log',
        errorMessage: error.message,
        stack: error.stack,
    };
    // Use console.error as a fallback if logger itself fails or for very early errors
    console.error('CRITICAL: Error processing client log in /api/client-log:', criticalErrorContext);
    // Attempt to use your structured logger if the error is not from it
    logError('CRITICAL: Failed to process client log via API', error, criticalErrorContext);

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
