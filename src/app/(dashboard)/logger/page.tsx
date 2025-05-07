// src/app/(dashboard)/logger/page.tsx
'use client';

import React from 'react';
// Clerk imports commented out as it's disabled
// import { useAuth } from '@clerk/nextjs';
// import { redirect } from 'next/navigation';
// import { hasRole } from '@/lib/roles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListTree, Info, Terminal, Trash2, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientLogStore, type CapturedLog } from '@/store/clientLogStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
// Import client-side logger for logging actions on this page
import { logInfo, logWarn } from '@/lib/client-logger';

// Placeholder for Clerk data when disabled
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
const CLERK_DISABLED_IS_LOADED = true;
const CLERK_DISABLED_HAS_ROLE = false; // Assume not admin when Clerk is disabled

const getLogLevelColor = (level: CapturedLog['level']): string => {
  switch (level) {
    case 'error': return 'text-destructive';
    case 'warn': return 'text-yellow-500 dark:text-yellow-400';
    case 'info': return 'text-blue-500 dark:text-blue-400';
    case 'debug': return 'text-purple-500 dark:text-purple-400';
    default: return 'text-muted-foreground';
  }
};

// Helper to format log messages, handling circular references
const formatLogMessage = (messages: any[]): string => {
  const seen = new Set(); // Use a new Set for each message formatting call
  return messages
    .map(msg => {
      seen.clear(); // Ensure clear set for each top-level argument
      if (typeof msg === 'string') return msg;
      if (msg instanceof Error) return `${msg.name}: ${msg.message}${msg.stack ? `\nStack: ${msg.stack.split('\n').slice(1).join('\n')}` : ''}`;
      try {
        return JSON.stringify(msg, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) { return '[Circular]'; }
            seen.add(value);
          }
          return value;
        }, 2);
      } catch {
        try { return String(msg); }
        catch { return '[Unstringifiable Object]'; }
      }
    })
    .join(' ');
};


export default function LoggerPage() {
  // Mock Clerk state
  const isLoaded = CLERK_DISABLED_IS_LOADED;
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID;
  const isAdmin = CLERK_DISABLED_HAS_ROLE;

  const { logs: clientLogs, clearLogs: clearClientLogsStore } = useClientLogStore();

  const handleClearClientLogs = () => {
      logInfo('User cleared client-side logs display from Logger page.'); // Use client logger
      clearClientLogsStore();
  };

  // Basic loading state check (might be redundant if Clerk is fully disabled)
  if (!isLoaded) {
    return (
      <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Redirect logic (commented out as Clerk is disabled)
  // if (!userId) {
  //   redirect('/sign-in');
  // }

  // Admin role check (commented out as Clerk is disabled)
  // if (!isAdmin) {
  //    logWarn('Unauthorized access attempt to Logger page.', { attemptedUserId: userId });
  //    return (
  //        <div className="p-4 md:p-6 lg:p-8">
  //           <Alert variant="destructive">
  //               <AlertTriangle className="h-4 w-4" />
  //               <AlertTitle>Access Denied</AlertTitle>
  //               <AlertDescription>
  //                   This page is restricted to administrators only.
  //               </AlertDescription>
  //           </Alert>
  //        </div>
  //    );
  // }

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ListTree className="h-6 w-6 text-primary" /> Application Logger
        </h1>
        <p className="text-muted-foreground text-sm">
          View client-side console activity captured in your browser session. Server logs are viewed via hosting provider (e.g., Vercel).
        </p>
      </header>

      <main className="flex-1 space-y-6">
        {/* Client-Side Logs Display */}
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5"/>Client-Side Logs (This Session)</CardTitle>
              <CardDescription>Logs captured from your browser's console. These are also sent to the backend logger.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleClearClientLogs} disabled={clientLogs.length === 0}>
              <Trash2 className="mr-1 h-4 w-4" /> Clear Display
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96 w-full border rounded-md bg-muted/30">
              <div className="p-2 space-y-1">
              {clientLogs.length > 0 ? (
                clientLogs.map((logEntry) => (
                  <div key={logEntry.id} className="p-1.5 border-b text-xs font-mono flex gap-2 items-start last:border-b-0 hover:bg-muted/50">
                    <span className="text-muted-foreground whitespace-nowrap pt-px">
                      [{format(logEntry.timestamp, 'HH:mm:ss.SSS')}]
                    </span>
                    <span className={cn("font-semibold uppercase w-12 flex-shrink-0 pt-px", getLogLevelColor(logEntry.level))}>
                      [{logEntry.level}]
                    </span>
                    {/* Use pre-wrap to preserve formatting including newlines from stack traces */}
                    <pre className="whitespace-pre-wrap break-words flex-grow pt-px">{formatLogMessage(logEntry.messages)}</pre>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground italic p-4">
                  No client-side logs captured in this session yet. Interact with the app to see logs here.
                </div>
              )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Server-Side Logs Information */}
        <Card>
          <CardHeader>
            <CardTitle>Server-Side Logs (Access Guide)</CardTitle>
            <CardDescription>Instructions for viewing logs generated by API routes and server actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="default" className="mb-4">
              <Info className="h-4 w-4" />
              <AlertTitle>Accessing Server Logs</AlertTitle>
              <AlertDescription>
                Server-side logs are managed by your hosting provider or viewed in the server console during local development.
                <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                  <li>
                    <strong>Vercel:</strong> Access logs via the Vercel Dashboard under your project's "Logs" tab (Runtime Logs). These include output from `console.log`, `console.warn`, and logs sent via the Winston server logger (`logInfo`, `logError`, etc. in API routes/server actions).
                    <Button variant="link" size="sm" asChild className="p-0 h-auto ml-1 text-xs">
                        <a href="https://vercel.com/docs/observability/runtime-logs" target="_blank" rel="noopener noreferrer">Vercel Runtime Logs <ExternalLink size={12} className="inline ml-0.5"/></a>
                    </Button>
                  </li>
                  <li>
                    <strong>Local Development (`pnpm dev`):</strong> Server logs (Winston output) will appear directly in the terminal where you started the development server.
                  </li>
                  <li>
                    <strong>Other Providers:</strong> Refer to your hosting provider's documentation for log access instructions.
                  </li>
                </ul>
                 <p className="mt-2 text-xs">Streaming live server logs to this page requires a complex setup (like WebSockets or Server-Sent Events) and is currently not implemented.</p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
