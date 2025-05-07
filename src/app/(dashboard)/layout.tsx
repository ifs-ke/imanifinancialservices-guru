// src/app/(dashboard)/layout.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { useAuth } from '@clerk/nextjs/client'; // Use client-side auth
import { redirect } from 'next/navigation';
import { useSyncManager } from '@/hooks/useSyncManager';
import { Skeleton } from '@/components/ui/skeleton';
import FloatingChatButton from '@/components/layout/FloatingChatButton';
import { useBudgetNotifications } from '@/services/notificationService';
import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
import { logInfo, logError } from '@/lib/logger'; // Import logger

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isClient, setIsClient] = useState(false);
  const [isMismatchDialogOpen, setIsMismatchDialogOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
    logInfo('DashboardLayout mounted', { component: 'DashboardLayout' });
  }, []);

  const { userId, isLoaded: isClerkLoaded } = useAuth();
  const syncManager = useSyncManager();

  useBudgetNotifications();

  useEffect(() => {
    if (syncManager.hashMismatch) {
      setIsMismatchDialogOpen(true);
      logWarn('Hash mismatch detected, opening dialog.', { component: 'DashboardLayout', userId });
    } else {
      setIsMismatchDialogOpen(false);
    }
  }, [syncManager.hashMismatch, userId]); // Added userId to context if needed

  if (!isClerkLoaded) {
    return (
      <div className="flex min-h-screen">
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

  if (isClient && !userId) {
    logInfo('User not signed in, redirecting to /sign-in', { component: 'DashboardLayout' });
    redirect('/sign-in');
  }

  if (!userId) {
    return null;
  }

  return (
    <>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        <AppSidebar
          syncManager={syncManager}
          openMismatchDialog={() => setIsMismatchDialogOpen(true)}
        />
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {children}
        <FloatingChatButton />
      </SidebarInset>
      <DataSyncMismatchDialog
        isOpen={isMismatchDialogOpen}
        onClose={() => {
          setIsMismatchDialogOpen(false);
          logInfo('Mismatch dialog closed by user.', { component: 'DashboardLayout', userId });
        }}
        onForceSave={async () => {
          logWarn('User initiated Force Save from mismatch dialog.', { component: 'DashboardLayout', userId });
          const success = await syncManager.forceSaveLocal();
          if (success) setIsMismatchDialogOpen(false); // Close on success
          return success;
        }}
        onForceFetch={async () => {
          logWarn('User initiated Force Fetch from mismatch dialog.', { component: 'DashboardLayout', userId });
          const success = await syncManager.forceFetchServer();
          if (success) setIsMismatchDialogOpen(false); // Close on success
          return success;
        }}
      />
    </>
  );
}
