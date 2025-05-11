// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClientLogPayloadSchema } from '@/lib/schemas'; 
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';


export async function POST(request: Request) {
  let effectiveUserId: string | null = null;
  let logContextBase: Record<string, any> = {};

  try {
    const { userId: clerkUserId } = auth();
    effectiveUserId = clerkUserId; // Assign clerkUserId first
    
    let rawPayload;
    try {
        rawPayload = await request.clone().json(); 
    } catch (jsonError: any) {
        // Log this critical parsing failure using the server's own logger
        logError('CRITICAL: Failed to parse client log payload as JSON in /api/client-log', jsonError, { 
            endpoint: '/api/client-log', 
            apiRoute: '/api/client-log',
            userId: effectiveUserId || 'unknown_due_to_parse_failure' // Use effectiveUserId if available
        });
        return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Now try to get userId from payload context if clerkUserId was null
    if (!effectiveUserId && rawPayload?.context?.userId) {
        effectiveUserId = rawPayload.context.userId;
    }
    // If still no userId, default to anonymous
    effectiveUserId = effectiveUserId || 'anonymous-api-user';
    
    logContextBase = { userId: effectiveUserId, source: 'client-log-api', apiRoute: '/api/client-log' };


    // Validate payload with Zod
    const validationResult = ClientLogPayloadSchema.safeParse(rawPayload);
    if (!validationResult.success) {
        logWarn('Invalid client log payload received in /api/client-log', { 
            ...logContextBase,
            errors: validationResult.error.flatten(), 
            receivedPayload: rawPayload, // Log the problematic payload for debugging
        });
        return NextResponse.json({ success: false, error: 'Invalid log payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const payload = validationResult.data; 

    const contextForLog = {
      ...logContextBase,
      ...(payload.context || {}), // Merge client-provided context
    };

    const serverLevel = payload.level === 'log' ? 'info' : payload.level;
    const logMessage = `[Client ${payload.level.toUpperCase()}] ${payload.message}`;

    switch (serverLevel) {
      case 'info':
        logInfo(logMessage, contextForLog);
        break;
      case 'warn':
        logWarn(logMessage, contextForLog);
        break;
      case 'error':
        let clientErrorDetails = payload.context?.error || payload.context?.errorMessage || payload.context?.stack;
        if (typeof clientErrorDetails === 'object') clientErrorDetails = JSON.stringify(clientErrorDetails);
        logError(logMessage, payload.context?.error, { ...contextForLog, clientErrorDetails: clientErrorDetails || 'No specific client error details provided.' });
        break;
      case 'debug':
        // Server-side debug logs can be controlled via env var for production if needed
        if (process.env.NODE_ENV === 'development' || process.env.SERVER_DEBUG_LOGS === 'true') {
            logDebug(logMessage, contextForLog);
        }
        break;
      default:
        logInfo(logMessage, contextForLog); // Default to info for unknown client levels
    }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error: any) {
    // This catch block is for unexpected errors within the POST handler itself
    const criticalErrorContext = {
        ...(Object.keys(logContextBase).length > 0 ? logContextBase : { userId: effectiveUserId || 'unknown_due_to_handler_error', source: 'client-log-api-critical-error', apiRoute: '/api/client-log' }),
        endpoint: '/api/client-log',
    };
    logError('CRITICAL: Error processing client log in /api/client-log', error, criticalErrorContext);

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
