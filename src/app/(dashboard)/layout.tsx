// src/app/(dashboard)/layout.tsx
'use client'; // This layout needs to be a client component for hooks

import React from 'react';
import { usePathname } from 'next/navigation'; // Keep if used for active state, otherwise remove
import {
  SidebarProvider,
  useSidebar // Import useSidebar hook
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarRail, SidebarInset } from '@/components/ui/sidebar'; // Import SidebarRail and SidebarInset
import { useSyncManager } from '@/hooks/useSyncManager'; // Import the sync manager hook
import { useBudgetNotifications } from '@/services/notificationService'; // Import the budget notification hook
import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
import ClientLogCaptureProvider from '@/components/providers/ClientLogCaptureProvider'; // Import the log provider

// Placeholder for Clerk data when disabled
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mock Clerk state when disabled
  const isClerkLoaded = true; // Assume loaded
  const isSignedIn = true; // Assume signed in
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

  const syncManager = useSyncManager();

  useBudgetNotifications(); // Activate budget notification checks

  // Get sidebar state using the hook
  const { state: sidebarState } = useSidebar();


  return (
     // ClientLogCaptureProvider should wrap the part of the app where logs need capturing
     // Placing it here wraps the entire dashboard layout
      <ClientLogCaptureProvider>
          <div className="flex min-h-screen">
              {/* Sidebar Rail pushes content when sidebar is present */}
              <SidebarRail />
              {/* The actual Sidebar component (handles mobile Sheet internally) */}
              <AppSidebar syncStatus={syncManager.syncStatus} retrySync={syncManager.retrySync} hashMismatch={syncManager.hashMismatch} />
              {/* Sidebar Inset manages margin based on sidebar state */}
              <SidebarInset>
                  <main className="flex-1">
                      {children}
                  </main>
              </SidebarInset>

              {/* Dialog for handling sync conflicts */}
              <DataSyncMismatchDialog
                isOpen={syncManager.isMismatchDialogOpen}
                onClose={() => syncManager.setIsMismatchDialogOpen(false)}
                onForceSave={syncManager.forceSaveLocal}
                onForceFetch={syncManager.forceFetchServer}
              />
          </div>
      </ClientLogCaptureProvider>
  );
}
