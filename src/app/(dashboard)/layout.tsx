// src/app/(dashboard)/layout.tsx
'use client'; // Make layout client-side to use hooks

import React from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { useAuth } from '@clerk/nextjs'; // Import useAuth hook for client-side check
import { redirect } from 'next/navigation';
import { useSyncManager } from '@/hooks/useSyncManager'; // Import the sync manager hook

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
   // Client-side auth check
   const { userId, isLoaded } = useAuth();
   // Initialize sync manager - This will trigger initial fetch on load if user is signed in
   const { syncStatus, retrySync } = useSyncManager(); // Get sync status AND retry function

   // Handle loading state from Clerk
   if (!isLoaded) {
     // You can return a loading spinner or skeleton here
     // Adding a simple loading text for now
     return (
        <div className="flex justify-center items-center min-h-screen">
          Loading authentication...
        </div>
     );
   }

   // Redirect if not logged in after Clerk is loaded
   if (!userId) {
     redirect('/sign-in');
   }

  return (
    <>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        {/* Pass syncStatus and retrySync to AppSidebar */}
        <AppSidebar syncStatus={syncStatus} retrySync={retrySync}/>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {children}
      </SidebarInset>
    </>
  );
}
