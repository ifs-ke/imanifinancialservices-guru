// src/app/(dashboard)/logger/page.tsx
'use client';

import React from 'react';
import { useAuth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListTree, Info, Terminal, Trash2, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientLogStore, type CapturedLog } from '@/store/clientLogStore'; // Import log store
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const formatLogMessage = (messages: any[]): string => {
  return messages
    .map(msg => {
      if (typeof msg === 'string') return msg;
      if (msg instanceof Error) return `${msg.name}: ${msg.message}${msg.stack ? `\n${msg.stack}` : ''}`;
      try {
        return JSON.stringify(msg, null, 2);
      } catch {
        return String(msg);
      }
    })
    .join(' ');
};

const getLogLevelColor = (level: CapturedLog['level']): string => {
  switch (level) {
    case 'error': return 'text-destructive';
    case 'warn': return 'text-yellow-500 dark:text-yellow-400';
    case 'info': return 'text-blue-500 dark:text-blue-400';
    case 'debug': return 'text-purple-500 dark:text-purple-400';
    default: return 'text-muted-foreground';
  }
};

export default function LoggerPage() {
  const { isLoaded, userId } = useAuth();
  const { logs: clientLogs, clearLogs: clearClientLogs } = useClientLogStore();

  if (!isLoaded) {
    return (
      <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ListTree className="h-6 w-6 text-primary" /> Application Logger
        </h1>
        <p className="text-muted-foreground text-sm">
          View client-side console activity and instructions for server-side log integration.
        </p>
      </header>

      <main className="flex-1 space-y-6">
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5"/>Client-Side Logs</CardTitle>
              <CardDescription>Logs captured from your browser's console. These are also sent to Logtail if configured.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={clearClientLogs} disabled={clientLogs.length === 0}>
              <Trash2 className="mr-1 h-4 w-4" /> Clear Client Logs
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96 w-full border rounded-md bg-muted/30">
              {clientLogs.length > 0 ? (
                clientLogs.map((logEntry) => (
                  <div key={logEntry.id} className="p-2 border-b text-xs font-mono flex gap-2 items-start last:border-b-0">
                    <span className="text-muted-foreground whitespace-nowrap">
                      [{format(logEntry.timestamp, 'HH:mm:ss.SSS')}]
                    </span>
                    <span className={cn("font-semibold uppercase w-12 flex-shrink-0", getLogLevelColor(logEntry.level))}>
                      [{logEntry.level}]
                    </span>
                    <pre className="whitespace-pre-wrap break-all flex-grow">{formatLogMessage(logEntry.messages)}</pre>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground italic">
                  No client-side logs captured yet. Interact with the app to see logs here.
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Server-Side Logs (Integration Guide)</CardTitle>
            <CardDescription>Instructions for viewing server-side logs from API routes and server actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="default" className="mb-4">
              <Info className="h-4 w-4" />
              <AlertTitle>Accessing Server Logs</AlertTitle>
              <AlertDescription>
                Server-side logs (from API routes, server actions) are typically managed by your hosting provider or a dedicated logging service.
                <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                  <li>
                    <strong>Vercel:</strong> Access logs via the Vercel Dashboard under your project's "Logs" tab. You can set up Log Drains to forward these to services like Logtail.
                    <Button variant="link" size="sm" asChild className="p-0 h-auto ml-1 text-xs">
                        <a href="https://vercel.com/docs/observability/log-drains" target="_blank" rel="noopener noreferrer">Vercel Log Drains <ExternalLink size={12} className="inline ml-0.5"/></a>
                    </Button>
                  </li>
                  <li>
                    <strong>Logtail (BetterStack):</strong> If you've configured Vercel Log Drains to Logtail (or use Logtail directly in server-side code), view aggregated logs in your Logtail dashboard.
                    <Button variant="link" size="sm" asChild className="p-0 h-auto ml-1 text-xs">
                        <a href="https://betterstack.com/logtail" target="_blank" rel="noopener noreferrer">Logtail Docs <ExternalLink size={12} className="inline ml-0.5"/></a>
                    </Button>
                  </li>
                  <li>
                    <strong>Other Providers:</strong> Consult your hosting/logging provider's documentation for instructions on accessing and managing server logs.
                  </li>
                </ul>
                 <p className="mt-2 text-xs">Displaying live server logs directly here would require building a custom API endpoint to securely fetch and stream them, which is beyond the current scope.</p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
