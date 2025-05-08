// src/app/api/client-log/route.ts
import { NextResponse } from 'next/server';
// Logger removed
// Removed Clerk import
// import { auth } from '@clerk/nextjs/server';

// Consistent placeholder ID if context doesn't provide one
const DEFAULT_USER_ID = 'unknown-client-user';

interface ClientLogPayload {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, any>; // Client might pass userId here
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ClientLogPayload;

    // Get userId from payload context if available, otherwise use default
    const effectiveUserId = payload.context?.userId || DEFAULT_USER_ID;

    // Prepare context for logging (can add more server-side info here)
    const contextForLog = {
        ...(payload.context || {}),
        userId: effectiveUserId, // Ensure userId is consistently set
        source: 'client-log-api',
    };

    // Log using console since Winston/Logtail is removed
     const serverLevel: string = payload.level === 'log' ? 'info' : payload.level;
     const logMessage = `[${serverLevel.toUpperCase()}] ${payload.message}`;
     switch (serverLevel) {
         case 'info':
             // console.info(logMessage, contextForLog); // Console log commented out
             break;
         case 'warn':
             // console.warn(logMessage, contextForLog); // Console log commented out
             break;
         case 'error':
             // console.error(logMessage, contextForLog); // Console log commented out
             break;
         case 'debug':
             // console.debug(logMessage, contextForLog); // Console log commented out
             break;
         default:
             // console.log(`[Client ${payload.level.toUpperCase()}] ${payload.message}`, contextForLog); // Console log commented out
     }

    return NextResponse.json({ success: true, message: 'Log received by server' }, { status: 200 });

  } catch (error) {
    // console.error('CRITICAL: Error processing client log in /api/client-log:', error); // Console log commented out
    return NextResponse.json({ success: false, error: 'Failed to process client log on server' }, { status: 500 });
  }
}
