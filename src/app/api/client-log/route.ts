
// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { ClientLogPayloadSchema } from '@/lib/schemas';

export async function POST(request: Request) {
  let effectiveUserId: string | null = null;
  let logContextBase: Record<string, any> = {};

  try {
    const user = await currentUser();
    effectiveUserId = user?.id || null;

    let rawPayload;
    try {
        rawPayload = await request.clone().json();
    } catch (jsonError: any) {
        console.error(`[API /api/client-log] CRITICAL: Failed to parse client log payload as JSON. User: ${effectiveUserId || 'unknown_due_to_parse_failure'}`, {
            endpoint: '/api/client-log',
            apiRoute: '/api/client-log',
            error: jsonError,
            userId: effectiveUserId || 'unknown_due_to_parse_failure'
        });
        return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!effectiveUserId && rawPayload?.context?.userId) {
        effectiveUserId = rawPayload.context.userId;
    }
    effectiveUserId = effectiveUserId || 'anonymous-api-user';

    logContextBase = { userId: effectiveUserId, source: 'client-log-api', apiRoute: '/api/client-log' };

    const validationResult = ClientLogPayloadSchema.safeParse(rawPayload);
    if (!validationResult.success) {
        console.warn(`[API /api/client-log] Invalid client log payload received. User: ${effectiveUserId}`, {
            ...logContextBase,
            errors: validationResult.error.flatten(),
            receivedPayload: rawPayload,
        });
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
        console.log(logMessage, contextForLog);
        break;
      case 'warn':
        console.warn(logMessage, contextForLog);
        break;
      case 'error':
        let clientErrorDetails = payload.context?.error || payload.context?.errorMessage || payload.context?.stack;
        if (typeof clientErrorDetails === 'object') clientErrorDetails = JSON.stringify(clientErrorDetails);
        console.error(logMessage, { ...contextForLog, clientErrorDetails: clientErrorDetails || 'No specific client error details provided.' });
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
        ...(Object.keys(logContextBase).length > 0 ? logContextBase : { userId: effectiveUserId || 'unknown_due_to_handler_error', source: 'client-log-api-critical-error', apiRoute: '/api/client-log' }),
        endpoint: '/api/client-log',
    };
    console.error(`[API /api/client-log] CRITICAL: Error processing client log. User: ${effectiveUserId || 'unknown_due_to_handler_error'}`, { error, ...criticalErrorContext });

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
    