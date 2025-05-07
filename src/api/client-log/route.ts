// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
// No longer importing server-side logger functions
// Clerk is disabled

// Consistent placeholder ID
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

// Interface matching the payload sent from client-logger.ts
interface ClientLogPayload {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'; // Match ClientLogLevel from client-logger
  message: string; // Formatted message string
  context?: Record<string, any>; // Additional context from client
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ClientLogPayload;
    // Since Clerk is disabled, we primarily rely on the userId sent in the context
    const effectiveUserId = payload.context?.userId || CLERK_DISABLED_PLACEHOLDER_USER_ID;

    // Prepare context for standard console logging on the server
    const contextForServerLog = {
      ...(payload.context || {}), // Include context sent from client
      source: 'client-log-api', // Explicitly mark source as this API endpoint
      clientLevel: payload.level, // Keep track of the original client level
      effectiveUserId: effectiveUserId,
      timestamp: new Date().toISOString(),
    };

    // Use standard console logging on the server
    const logMessage = `[CLIENT ${payload.level.toUpperCase()}] ${payload.message}`;

    switch (payload.level) {
      case 'info':
      case 'log': // Treat client 'log' as 'info' on server console
        console.info(logMessage, contextForServerLog);
        break;
      case 'warn':
        console.warn(logMessage, contextForServerLog);
        break;
      case 'error':
        console.error(logMessage, contextForServerLog);
        break;
      case 'debug':
        // Respect NODE_ENV or LOG_LEVEL for debug messages if needed
        if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
            console.debug(logMessage, contextForServerLog);
        }
        break;
      default:
        // Fallback for unexpected levels
        console.log(`[CLIENT UNKNOWN LEVEL - ${payload.level.toUpperCase()}] ${payload.message}`, contextForServerLog);
    }

    return NextResponse.json({ success: true, message: 'Log received by server console' }, { status: 200 });

  } catch (error) {
    // Use console.error for critical errors within the API route itself
    console.error('CRITICAL: Error processing client log in /api/client-log:', error);

    // Attempt to log the error using console.error (server-side)
    try {
        console.error('Failed to process client log via API', { endpoint: '/api/client-log', error: error instanceof Error ? { message: error.message, stack: error.stack } : error });
    } catch (loggingError) {
        console.error("CRITICAL: Failed to log error to console as well:", loggingError);
    }

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
