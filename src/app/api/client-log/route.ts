// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
import { logInfo, logWarn, logError, logDebug, type LogLevel as ServerLogLevel } from '@/lib/logger'; // Import server logger
// import { auth } from '@clerk/nextjs/server'; // Clerk disabled

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';


interface ClientLogPayload {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'; // Match ClientLogLevel from clientLogStore
  message: string;
  context?: Record<string, any>;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ClientLogPayload;
    // const { userId: serverAuthUserId } = auth(); // Clerk disabled

    // Use userId from payload.context if available (sent by client), otherwise placeholder
    const effectiveUserId = payload.context?.userId || CLERK_DISABLED_PLACEHOLDER_USER_ID;

    const contextForServerLog = {
        ...(payload.context || {}),
        // serverAuthenticatedUserId: serverAuthUserId, // Would be from Clerk if enabled
        source: 'client-log-api', // Indicate the log came via this API
    };

    // Map client log level to server log level if needed
    const serverLevel: ServerLogLevel = payload.level === 'log' ? 'info' : payload.level;

    switch (serverLevel) {
      case 'info':
        logInfo(payload.message, contextForServerLog, effectiveUserId);
        break;
      case 'warn':
        logWarn(payload.message, contextForServerLog, effectiveUserId);
        break;
      case 'error':
        // For errors, Winston's format.errors({ stack: true }) will handle stack if message contains it.
        // We pass undefined for the 'error' object here as the client already formatted it into the message string.
        logError(payload.message, undefined, contextForServerLog, effectiveUserId);
        break;
      case 'debug':
        logDebug(payload.message, contextForServerLog, effectiveUserId);
        break;
      case 'verbose': // Add verbose if you plan to use it from client
        logDebug(payload.message, contextForServerLog, effectiveUserId); // Defaulting verbose to debug for now
        break;
      default:
        logInfo(`[Client ${payload.level.toUpperCase()}] ${payload.message}`, contextForServerLog, effectiveUserId);
    }

    return NextResponse.json({ success: true, message: 'Log received' }, { status: 200 });
  } catch (error) {
    // Use console.error directly here to avoid potential loops if logger itself is broken
    // And to ensure this critical error is logged somewhere if Winston fails.
    console.error('CRITICAL: Error in /api/client-log endpoint itself:', error);
    // Optionally, try to log with Winston if it's not the source of the error
    // logError('Error processing client log via API', error, { endpoint: '/api/client-log' });
    return NextResponse.json({ success: false, error: 'Failed to process client log' }, { status: 500 });
  }
}
