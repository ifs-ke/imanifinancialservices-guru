
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
        logError('CRITICAL: Failed to parse client log payload as JSON in /api/client-log', jsonError, {
            endpoint: '/api/client-log',
            apiRoute: '/api/client-log',
            userId: effectiveUserId || 'unknown_due_to_parse_failure'
        }, effectiveUserId || 'unknown_due_to_parse_failure'); // Pass effectiveUserId to logger
        return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    // If Clerk didn't provide a userId (e.g., unauthenticated API access by client),
    // try to get it from the payload if the client explicitly sent it.
    if (!effectiveUserId && rawPayload?.context?.userId) {
        effectiveUserId = rawPayload.context.userId;
    }
    // Final fallback
    effectiveUserId = effectiveUserId || 'anonymous-api-user';

    logContextBase = { userId: effectiveUserId, source: 'client-log-api', apiRoute: '/api/client-log' };


    const validationResult = ClientLogPayloadSchema.safeParse(rawPayload);
    if (!validationResult.success) {
        logWarn('Invalid client log payload received in /api/client-log', {
            ...logContextBase,
            errors: validationResult.error.flatten(),
            receivedPayload: rawPayload,
        }, effectiveUserId); // Pass effectiveUserId to logger
        return NextResponse.json({ success: false, error: 'Invalid log payload structure or data types.', details: validationResult.error.flatten() }, { status: 400 });
    }

    const payload = validationResult.data;

    const contextForLog = {
      ...logContextBase,
      ...(payload.context || {}),
    };

    const serverLevel = payload.level === 'log' ? 'info' : payload.level;
    const logMessage = `[Client ${payload.level.toUpperCase()}] ${payload.message}`;

    switch (serverLevel) {
      case 'info':
        logInfo(logMessage, contextForLog, effectiveUserId);
        break;
      case 'warn':
        logWarn(logMessage, contextForLog, effectiveUserId);
        break;
      case 'error':
        let clientErrorDetails = payload.context?.error || payload.context?.errorMessage || payload.context?.stack;
        if (typeof clientErrorDetails === 'object') clientErrorDetails = JSON.stringify(clientErrorDetails);
        logError(logMessage, payload.context?.error, { ...contextForLog, clientErrorDetails: clientErrorDetails || 'No specific client error details provided.' }, effectiveUserId);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development' || process.env.SERVER_DEBUG_LOGS === 'true') {
            logDebug(logMessage, contextForLog, effectiveUserId);
        }
        break;
      default:
        logInfo(logMessage, contextForLog, effectiveUserId);
    }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error: any) {
    const criticalErrorContext = {
        ...(Object.keys(logContextBase).length > 0 ? logContextBase : { userId: effectiveUserId || 'unknown_due_to_handler_error', source: 'client-log-api-critical-error', apiRoute: '/api/client-log' }),
        endpoint: '/api/client-log',
    };
    logError('CRITICAL: Error processing client log in /api/client-log', error, criticalErrorContext, effectiveUserId || 'unknown_due_to_handler_error');

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
