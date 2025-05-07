// src/app/(dashboard)/layout.tsx
'use client'; // This layout needs to be a client component for hooks

import React from 'react';
// import { usePathname } from 'next/navigation'; // Not currently used
import {
  SidebarProvider, // Keep provider at a higher level if possible, but here is fine too
  useSidebar, // Import useSidebar hook
  Sidebar, // Import Sidebar (handles mobile/desktop rendering)
  SidebarRail, // Pushes content on desktop
  SidebarInset // Manages main content margin based on sidebar state
} from '@/components/ui/sidebar';
// import { AppSidebar } from '@/components/layout/AppSidebar'; // AppSidebar is now integrated into Sidebar
import { useSyncManager } from '@/hooks/useSyncManager'; // Import the sync manager hook
import { useBudgetNotifications } from '@/services/notificationService'; // Import the budget notification hook
import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
// import ClientLogCaptureProvider from '@/components/providers/ClientLogCaptureProvider'; // Removed Log provider import
import FloatingChatButton from '@/components/layout/FloatingChatButton'; // Import the chat button
import { useAuth } from "@clerk/nextjs";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use actual Clerk state
  const { isLoaded: isClerkLoaded, isSignedIn, userId } = useAuth();

  const syncManager = useSyncManager();

  useBudgetNotifications(); // Activate budget notification checks

  // Get sidebar state using the hook (though not directly used for rendering layout structure here)
  // const { state: sidebarState } = useSidebar();


  return (
     // ClientLogCaptureProvider removed
     // <ClientLogCaptureProvider>
          // <SidebarProvider> // Provider is usually at a higher level, but fine here too
              <div className="flex min-h-screen">
                  {/* Sidebar component handles rendering itself and the SheetTrigger for mobile */}
                  <Sidebar />
                  {/* SidebarRail ensures content starts after the sidebar area on desktop */}
                  <SidebarRail />
                  {/* SidebarInset applies the correct left margin to the main content */}
                  <SidebarInset>
                      <main className="flex-1">
                          {children}
                      </main>
                       <FloatingChatButton /> {/* Add floating chat button */}
                  </SidebarInset>

                  {/* Dialog for handling sync conflicts (can stay outside main layout structure) */}
                  <DataSyncMismatchDialog
                    isOpen={syncManager.isMismatchDialogOpen}
                    onClose={() => syncManager.setIsMismatchDialogOpen(false)}
                    onForceSave={syncManager.forceSaveLocal}
                    onForceFetch={syncManager.forceFetchServer}
                  />
              </div>
          // </SidebarProvider>
     // </ClientLogCaptureProvider>
  );
}
