// src/app/(dashboard)/logger/page.tsx
'use client';

import React from 'react';
import { useAuth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListTree, Info } from 'lucide-react'; // Import ListTree and Info
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

export default function LoggerPage() {
  const { isLoaded, userId } = useAuth(); // Check for userId instead of claims

  // Loading state while Clerk initializes
  if (!isLoaded) {
      return (
          <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-[400px] w-full" />
          </div>
      );
  }

  // Redirect if user is not logged in after Clerk is loaded
  if (!userId) {
      redirect('/sign-in');
  }

  // Render logger content for any authenticated user
  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
        <header>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <ListTree className="h-6 w-6 text-primary" /> Application Logger
            </h1>
            <p className="text-muted-foreground text-sm">
                View client-side and server-side application logs (requires integration).
            </p>
        </header>

        <main className="flex-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Client-Side Logs</CardTitle>
                    <CardDescription>Logs captured from the browser.</CardDescription>
                </CardHeader>
                <CardContent>
                     {/* Explanation Alert */}
                     <Alert variant="default" className="mb-4">
                         <Info className="h-4 w-4" />
                         <AlertTitle>Client Log Integration</AlertTitle>
                         <AlertDescription>
                            Displaying live client-side logs requires integrating a dedicated logging library (e.g., Logtail, Sentry RUM, Axiom) or building a custom solution to capture and forward browser console output.
                         </AlertDescription>
                     </Alert>
                    {/* Placeholder for log display */}
                    <div className="p-4 border rounded h-64 overflow-auto bg-muted/50 text-xs font-mono text-muted-foreground italic">
                       [Client logs would appear here after integration...]
                       <br />
                       Example: [Timestamp] INFO: Application initialized...
                       <br />
                       Example: [Timestamp] WARN: Sync process started...
                       <br />
                       Example: [Timestamp] ERROR: Failed to save data locally...
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Server-Side Logs</CardTitle>
                    <CardDescription>Logs captured from API routes and server actions.</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Explanation Alert */}
                    <Alert variant="default" className="mb-4">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Server Log Integration</AlertTitle>
                        <AlertDescription>
                           Displaying server-side logs requires fetching them from your deployment platform (e.g., Vercel Log Drains) or a dedicated logging service (e.g., Logtail, Datadog, Axiom). Configure your hosting provider or chosen service to forward logs.
                        </AlertDescription>
                    </Alert>
                    {/* Placeholder for log display */}
                     <div className="p-4 border rounded h-64 overflow-auto bg-muted/50 text-xs font-mono text-muted-foreground italic">
                         [Server logs would appear here after integration...]
                         <br />
                         Example: [Timestamp] INFO: API route /api/sync called by user: user_xyz...
                         <br />
                         Example: [Timestamp] INFO: Database connection established...
                         <br />
                         Example: [Timestamp] ERROR: Failed to save data for user: user_abc... MongoDB Error: ...
                     </div>
                </CardContent>
            </Card>
        </main>
    </div>
  );
}
