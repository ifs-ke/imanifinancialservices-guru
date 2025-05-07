// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
// Import the SERVER-SIDE logger functions from the refactored logger.ts
import { logInfo, logWarn, logError, logDebug, type LogLevel as ServerLogLevel } from '@/lib/logger';
// Clerk is disabled, so we won't import auth

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

    // Prepare context for the server-side Winston logger
    const contextForServerLog = {
        ...(payload.context || {}), // Include context sent from client
        source: 'client-log-api', // Explicitly mark source as this API endpoint
    };

    // Map client log level to server log level ('log' maps to 'info')
    const serverLevel: ServerLogLevel = payload.level === 'log' ? 'info' : payload.level;

    // Use the appropriate server-side logger function based on the level
    switch (serverLevel) {
      case 'info':
        logInfo(payload.message, contextForServerLog, effectiveUserId);
        break;
      case 'warn':
        logWarn(payload.message, contextForServerLog, effectiveUserId);
        break;
      case 'error':
        // Pass the pre-formatted message string directly.
        // Winston's format.errors({ stack: true }) will handle stack if present in the string.
        // We pass 'undefined' for the error object parameter as the client already formatted it.
        logError(payload.message, undefined, contextForServerLog, effectiveUserId);
        break;
      case 'debug':
        logDebug(payload.message, contextForServerLog, effectiveUserId);
        break;
      case 'verbose': // Add verbose if you plan to use it from client
        logDebug(payload.message, contextForServerLog, effectiveUserId); // Defaulting client verbose to server debug for now
        break;
      default:
        // Fallback for unexpected levels, log as info
        logInfo(`[Client ${payload.level.toUpperCase()}] ${payload.message}`, contextForServerLog, effectiveUserId);
    }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error) {
    // Use console.error for critical errors within the API route itself
    console.error('CRITICAL: Error processing client log in /api/client-log:', error);

    // Attempt to log the error using the server logger *if* it's likely available
    // Avoid if the logger itself might be the cause of the error.
    try {
        logError('Failed to process client log via API', error, { endpoint: '/api/client-log' });
    } catch (loggingError) {
        console.error("CRITICAL: Failed to log error using Winston as well:", loggingError);
    }

    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
