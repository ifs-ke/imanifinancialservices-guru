// src/app/(dashboard)/logger/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import type { AppRole } from '@/lib/roles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal, ListTree } from 'lucide-react'; // Import Terminal for Alert
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

export default function LoggerPage() {
  const { isLoaded, sessionClaims } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // Use null for initial loading state

  useEffect(() => {
    if (isLoaded) {
        const role = sessionClaims?.publicMetadata?.role as AppRole | undefined;
        setIsAdmin(role === 'admin');
        if (role !== 'admin') {
            console.warn("Access Denied: User is not an admin. Redirecting...");
            redirect('/dashboard'); // Redirect non-admins
        }
    }
  }, [isLoaded, sessionClaims]);

   // Loading state while Clerk initializes or role is checked
   if (!isLoaded || isAdmin === null) {
       return (
           <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-4">
               <Skeleton className="h-8 w-48" />
               <Skeleton className="h-4 w-64" />
               <Skeleton className="h-[400px] w-full" />
           </div>
       );
   }

   // Render content if user is confirmed admin
   return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
        <header>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <ListTree className="h-6 w-6 text-primary" /> Application Logger
            </h1>
            <p className="text-muted-foreground text-sm">
                View client-side and server-side application logs (Admin only).
            </p>
        </header>

        <main className="flex-1 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Client-Side Logs</CardTitle>
                    <CardDescription>Logs captured from the browser.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Alert>
                        <Terminal className="h-4 w-4" />
                        <AlertTitle>Feature Not Implemented</AlertTitle>
                        <AlertDescription>
                             Displaying live client-side logs requires integrating a dedicated logging library (e.g., Logtail, Sentry RUM) or building a custom solution.
                        </AlertDescription>
                    </Alert>
                    {/* Placeholder for future log display component */}
                    <div className="mt-4 p-4 border rounded h-64 overflow-auto bg-muted/50 text-xs font-mono">
                        [Timestamp] INFO: Application initialized...<br />
                        [Timestamp] WARN: User tried accessing restricted area...<br />
                        [Timestamp] ERROR: Failed to fetch data...<br />
                        {/* Log entries would appear here */}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Server-Side Logs</CardTitle>
                    <CardDescription>Logs captured from API routes and server actions.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Alert>
                        <Terminal className="h-4 w-4" />
                        <AlertTitle>Requires Backend Integration</AlertTitle>
                        <AlertDescription>
                             Displaying server-side logs requires fetching them from your deployment platform (e.g., Vercel Logs) or a dedicated logging service.
                        </AlertDescription>
                    </Alert>
                    {/* Placeholder for future log display component */}
                     <div className="mt-4 p-4 border rounded h-64 overflow-auto bg-muted/50 text-xs font-mono">
                        [Timestamp] INFO: API route /api/sync called by user: user_xyz...<br />
                        [Timestamp] INFO: Database connection established...<br />
                        [Timestamp] ERROR: Failed to save data for user: user_abc...<br />
                        {/* Log entries would appear here */}
                    </div>
                </CardContent>
            </Card>
        </main>
    </div>
  );
}
