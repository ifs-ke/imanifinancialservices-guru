
// src/app/(dashboard)/notifications/page.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function NotificationsPage() {
  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
        <header>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Bell className="h-6 w-6 text-primary" /> Notifications
            </h1>
            <p className="text-muted-foreground text-sm">
                View application updates and alerts here.
            </p>
        </header>

        <main className="flex-1">
             <Card>
                <CardHeader>
                    <CardTitle>Your Notifications</CardTitle>
                    <CardDescription>Updates related to your account and application activity.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <Alert>
                        <Bell className="h-4 w-4" />
                        <AlertTitle>Feature Not Implemented</AlertTitle>
                        <AlertDescription>
                             The notification system is not yet fully implemented. Check back later for updates!
                        </AlertDescription>
                    </Alert>
                    {/* Placeholder for future notification list */}
                     <div className="mt-4 space-y-3">
                         {/* Example Notification Item (Structure) */}
                         <div className="p-3 border rounded bg-muted/50 text-sm">
                           <p className="font-medium">Welcome to IFC - Guru!</p>
                           <p className="text-xs text-muted-foreground">Explore the features and start managing your finances.</p>
                           <p className="text-xs text-muted-foreground mt-1">Just now</p>
                         </div>
                         <div className="p-3 border rounded text-sm">
                           <p className="font-medium text-primary">Reminder: Weekly Review</p>
                           <p className="text-xs text-muted-foreground">Don't forget to complete your review for this week.</p>
                            <p className="text-xs text-muted-foreground mt-1">2 days ago</p>
                         </div>
                     </div>
                 </CardContent>
             </Card>
        </main>
    </div>
  );
}
