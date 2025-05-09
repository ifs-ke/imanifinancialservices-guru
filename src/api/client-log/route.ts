// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
// Clerk auth is disabled, so we'll use a placeholder or client-provided ID.

// Consistent placeholder for when no user context can be determined server-side
// or if Clerk is disabled and client doesn't send one.
const ANONYMOUS_USER_ID = 'anonymous-client-user';
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';


interface ClientLogPayload {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, any>;
}

export async function POST(request: Request) {
  let effectiveUserId: string;
  let logContextBase: Record<string, any> = {};

  try {
    // Since Clerk is disabled, we directly use the placeholder or context-provided ID.
    const tempPayloadForUserIdCheck = await request.clone().json(); // Clone to read body once for userId
    effectiveUserId = tempPayloadForUserIdCheck.context?.userId || CLERK_DISABLED_PLACEHOLDER_USER_ID; // Fallback to general placeholder

    logContextBase = { userId: effectiveUserId, source: 'client-log-api' };

    const payload = await request.json() as ClientLogPayload;

    const contextForLog = {
      ...logContextBase,
      ...(payload.context || {}),
    };

    const serverLevel: string = payload.level === 'log' ? 'info' : payload.level;
    // Prefix to distinguish client logs in server console
    const logMessage = `[Client ${payload.level.toUpperCase()}] ${payload.message}`;

    // Log using console on the server
    switch (serverLevel) {
      case 'info':
        console.info(logMessage, contextForLog);
        break;
      case 'warn':
        console.warn(logMessage, contextForLog);
        break;
      case 'error':
        let clientErrorDetails = payload.context?.error || payload.context?.errorMessage || payload.context?.stack;
        if (typeof clientErrorDetails === 'object') clientErrorDetails = JSON.stringify(clientErrorDetails);
        console.error(logMessage, clientErrorDetails || '', contextForLog);
        break;
      case 'debug':
        // Server-side debug logs can be verbose, consider environment flag if needed
        if (process.env.NODE_ENV === 'development' || process.env.SERVER_DEBUG_LOGS === 'true') {
            console.debug(logMessage, contextForLog);
        }
        break;
      default:
        console.log(logMessage, contextForLog); // Default to console.log for unknown 'log' level
    }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error: any) {
    const criticalErrorContext = {
        ...logContextBase, // Use base context which might have a determined userId or anonymous
        endpoint: '/api/client-log',
        errorMessage: error.message,
        stack: error.stack,
    };
    console.error('CRITICAL: Error processing client log in /api/client-log:', criticalErrorContext);

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
