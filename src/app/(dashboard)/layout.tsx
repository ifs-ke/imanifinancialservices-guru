// src/app/(dashboard)/layout.tsx
'use client';

import React, { useEffect } from 'react';
import { useBudgetNotifications } from '@/services/notificationService';
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useSyncManager } from '@/hooks/useSyncManager';
import FloatingChatButton from '@/components/layout/FloatingChatButton';
import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
import LocalChangesPreviewDialog from '@/components/layout/LocalChangesPreviewDialog';
import { Toaster } from '@/components/ui/toaster';
import { logInfo } from '@/lib/logger';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/context/AuthContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded: isClerkLoaded, isSignedIn, userId } = useAuth();
  const syncManager = useSyncManager();

  useBudgetNotifications();

  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !syncManager) return;

    if (syncManager.hashMismatch && !syncManager.isMismatchDialogOpen && !syncManager.isPreviewingLocalChanges) {
      logInfo("DashboardLayout: Hash mismatch detected. Opening dialog.", { userId });
      syncManager.setIsMismatchDialogOpen(true);
    }
  }, [syncManager, isClerkLoaded, isSignedIn, userId]);

  const isLoading = !isClerkLoaded;

  let spinnerMessage = "Authenticating...";
  if (isClerkLoaded) {
    if (syncManager.isInitialClientSyncPending && isSignedIn) {
      spinnerMessage = "Preparing your data...";
    } else if (syncManager.syncStatus === 'syncing') {
      spinnerMessage = "Syncing data...";
    } else if (syncManager.syncStatus === 'loading_local') {
      spinnerMessage = "Loading local data...";
    } else {
      spinnerMessage = "Loading application...";
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full bg-background">
        <LoadingSpinner size={48} text={spinnerMessage} />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar />
        <SidebarInset className="flex flex-col bg-background">
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </SidebarInset>
        <FloatingChatButton />
        <Toaster />

        {isSignedIn && syncManager.isMismatchDialogOpen && (
          <DataSyncMismatchDialog
            isOpen={syncManager.isMismatchDialogOpen}
            onClose={() => syncManager.setIsMismatchDialogOpen(false)}
            onForceSave={async () => {
              const success = await syncManager.forceSave();
              return success;
            }}
            onForceFetch={async () => {
              const success = await syncManager.forceFetch();
              return success;
            }}
            localDataPreview={syncManager.conflictingLocalDataString}
            serverDataPreview={syncManager.conflictingServerDataString}
          />
        )}

        {isSignedIn && syncManager.isPreviewingLocalChanges && (
          <LocalChangesPreviewDialog
            isOpen={syncManager.isPreviewingLocalChanges}
            payloadPreview={syncManager.localChangesPayloadPreview}
            onConfirm={syncManager.confirmAndProceedWithSave}
            onCancel={syncManager.cancelLocalChangesPreview}
          />
        )}
      </div>
    </SidebarProvider>
  );
}
