// src/app/(dashboard)/layout.tsx
'use client'; // Make layout client-side to use hooks

import React, { useState, useEffect } from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { useAuth } from '@clerk/nextjs'; // Import useAuth hook for client-side check
import { redirect } from 'next/navigation';
import { useSyncManager } from '@/hooks/useSyncManager'; // Import the refactored sync manager hook
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton for loading state
import FloatingChatButton from '@/components/layout/FloatingChatButton'; // Import the new component
import { useBudgetNotifications } from '@/services/notificationService'; // Import the budget notification hook

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Client-side auth check
  const { userId, isLoaded } = useAuth();
  // Initialize sync manager - This hook now manages its own state and effects
  const {
      syncStatus,
      retrySync,
      hashMismatch, // <-- Get hashMismatch state
      forceSaveLocal, // <-- Get forceSaveLocal action
      forceFetchServer, // <-- Get forceFetchServer action
      gettingStartedDismissed,
      setGettingStartedDismissed
  } = useSyncManager();

  // Initialize budget notifications (this hook runs the checks)
  useBudgetNotifications();


  // Handle loading state from Clerk
  if (!isLoaded) {
    // More robust loading state using Skeleton components
    return (
        <div className="flex min-h-screen">
            {/* Skeleton Sidebar */}
             <div className="hidden md:flex flex-col w-16 border-r border-border p-2 space-y-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                 <Skeleton className="h-6 w-full" />
                 <Skeleton className="h-6 w-full mt-auto" />
                 <Skeleton className="h-6 w-full" />
                 <Skeleton className="h-6 w-full" />
            </div>
             {/* Skeleton Main Content Area */}
             <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
                 <Skeleton className="h-8 w-1/3" />
                 <Skeleton className="h-4 w-2/3" />
                 <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                     <Skeleton className="h-24" />
                     <Skeleton className="h-24" />
                     <Skeleton className="h-24" />
                 </div>
                 <Skeleton className="h-64" />
             </div>
        </div>
     );
  }

  // Redirect if not logged in after Clerk is loaded
  if (isClient && !userId) { // Ensure isClient check to prevent server-side redirect during hydration
    redirect('/sign-in');
  }

  // Render layout only if user is logged in or Clerk is still loading (handled above)
  if (!userId) {
     // This case should ideally not be reached due to the redirect above,
     // but serves as a fallback during initial render phases.
     return null; // Or a minimal loading state if preferred
  }


  return (
    <>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        {/* Pass syncStatus, retrySync, and mismatch state/actions to AppSidebar */}
        <AppSidebar
            syncStatus={syncStatus}
            retrySync={retrySync}
            hashMismatch={hashMismatch}
            forceSaveLocal={forceSaveLocal} // Pass the function
            forceFetchServer={forceFetchServer} // Pass the function
        />
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {children}
        <FloatingChatButton />
      </SidebarInset>
    </>
  );
}
