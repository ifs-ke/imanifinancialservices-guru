// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ClientLogPayloadSchema } from '@/lib/schemas'; // Import Zod schema

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
    } catch (jsonError: any) {
        console.error('CRITICAL: Failed to parse client log payload as JSON in /api/client-log', { 
            endpoint: '/api/client-log', 
            errorMessage: jsonError.message,
            stack: jsonError.stack
        });
        return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Validate payload with Zod
    const validationResult = ClientLogPayloadSchema.safeParse(rawPayload);
    if (!validationResult.success) {
        console.warn('Invalid client log payload received in /api/client-log', { 
            errors: validationResult.error.flatten(), 
            receivedPayload: rawPayload, 
            endpoint: '/api/client-log',
            apiRoute: '/api/client-log'
        });
        return NextResponse.json({ success: false, error: 'Invalid log payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const payload = validationResult.data; 

    effectiveUserId = clerkUserId || payload.context?.userId || 'anonymous-api-user';
    logContextBase = { userId: effectiveUserId, source: 'client-log-api', apiRoute: '/api/client-log' };

    const contextForLog = {
      ...logContextBase,
      ...(payload.context || {}),
    };

    const serverLevel = payload.level === 'log' ? 'info' : payload.level;
    const logMessage = `[Client ${payload.level.toUpperCase()}] ${payload.message}`;

    switch (serverLevel) {
      case 'info':
        console.log(logMessage, contextForLog); // Use console.log for info
        break;
      case 'warn':
        console.warn(logMessage, contextForLog);
        break;
      case 'error':
        let clientErrorDetails = payload.context?.error || payload.context?.errorMessage || payload.context?.stack;
        if (typeof clientErrorDetails === 'object') clientErrorDetails = JSON.stringify(clientErrorDetails);
        console.error(logMessage, { ...contextForLog, clientError: clientErrorDetails || 'No specific client error details provided.' });
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development' || process.env.SERVER_DEBUG_LOGS === 'true') {
            console.debug(logMessage, contextForLog);
        }
        break;
      default:
        console.log(logMessage, contextForLog); 
    }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error: any) {
    const criticalErrorContext = {
        ...(Object.keys(logContextBase).length > 0 ? logContextBase : { userId: 'unknown', source: 'client-log-api-critical-error', apiRoute: '/api/client-log' }),
        endpoint: '/api/client-log',
        errorMessage: error.message,
        stack: error.stack,
    };
    console.error('CRITICAL: Error processing client log in /api/client-log', criticalErrorContext);

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}