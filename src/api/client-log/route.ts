// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClientLogPayloadSchema } from '@/lib/schemas'; // Import Zod schema
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; // Import server-side logger

interface ClientLogPayload {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, any>;
}

export async function POST(request: Request) {
  let effectiveUserId: string;
  let logContextBase: Record<string, any> = {};

  try {
    const { userId: clerkUserId } = auth();
    
    let rawPayload;
    try {
        rawPayload = await request.clone().json(); // Clone to read body for userId and then full parse
    } catch (jsonError) {
        logError('CRITICAL: Failed to parse client log payload as JSON in /api/client-log', jsonError, { endpoint: '/api/client-log' });
        return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Validate payload with Zod
    const validationResult = ClientLogPayloadSchema.safeParse(rawPayload);
    if (!validationResult.success) {
        logWarn('Invalid client log payload received in /api/client-log', { 
            errors: validationResult.error.flatten(), 
            receivedPayload: rawPayload, // Log the raw payload for debugging
            endpoint: '/api/client-log' 
        });
        return NextResponse.json({ success: false, error: 'Invalid log payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const payload = validationResult.data; // Use validated data

    effectiveUserId = clerkUserId || payload.context?.userId || 'anonymous-api-user';
    logContextBase = { userId: effectiveUserId, source: 'client-log-api' };

    const contextForLog = {
      ...logContextBase,
      ...(payload.context || {}),
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
        logError(logMessage, clientErrorDetails || '', contextForLog);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development' || process.env.SERVER_DEBUG_LOGS === 'true') {
            logDebug(logMessage, contextForLog);
        }
        break;
      default:
        logInfo(logMessage, contextForLog); // Default to info for unknown 'log' level
    }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error: any) {
    // Use the base logger context if determination failed earlier, otherwise, this error is pre-payload processing
    const criticalErrorContext = {
        ...(Object.keys(logContextBase).length > 0 ? logContextBase : { userId: 'unknown', source: 'client-log-api-critical-error' }),
        endpoint: '/api/client-log',
        errorMessage: error.message,
        stack: error.stack,
    };
    logError('CRITICAL: Error processing client log in /api/client-log', error, criticalErrorContext);

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
