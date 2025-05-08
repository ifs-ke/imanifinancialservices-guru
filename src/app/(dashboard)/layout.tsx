// src/app/(dashboard)/layout.tsx - Refactored for Next.js 14 and performance
 'use client'; // This layout needs to be a client component for hooks

 import React, { useEffect } from 'react';
 import { useAuth } from '@clerk/nextjs'; // Re-enable Clerk hook
 import { useBudgetNotifications } from '@/services/notificationService';
 import {
   SidebarProvider, // Import SidebarProvider
   Sidebar,
   SidebarRail,
   SidebarInset,
 } from "@/components/ui/sidebar"; // Adjust path as needed
 import { useSyncManager } from '@/hooks/useSyncManager'; // Hook to manage sync
 import FloatingChatButton from '@/components/layout/FloatingChatButton'; // Import floating chat button
 import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog'; // Import mismatch dialog

 // No longer need placeholder
 // const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';


 export default function DashboardLayout({
   children,
 }: {
   children: React.ReactNode;
 }) {
   const { userId } = useAuth(); // Use Clerk's useAuth hook
   // No longer need placeholder
   // const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID;

   const syncManager = useSyncManager();
   const { isMismatchDialogOpen, setIsMismatchDialogOpen, forceFetchServer, forceSaveLocal } = syncManager;


   useBudgetNotifications(); // Activate budget notification checks

   // Open mismatch dialog when hashMismatch becomes true
   useEffect(() => {
       if (syncManager.hashMismatch) {
           setIsMismatchDialogOpen(true);
       }
   }, [syncManager.hashMismatch, setIsMismatchDialogOpen]);

   return (
     <div className="flex min-h-screen bg-background">
       <Sidebar /> {/* Render Sidebar (handles mobile sheet / desktop fixed) */}
       <SidebarRail /> {/* Spacer for desktop */}
       <SidebarInset> {/* Main content area with dynamic margin */}
         {children}
       </SidebarInset>
       <FloatingChatButton /> {/* Add floating chat button */}

        {/* Data Sync Mismatch Resolution Dialog */}
        <DataSyncMismatchDialog
           isOpen={isMismatchDialogOpen}
           onClose={() => setIsMismatchDialogOpen(false)}
           onForceSave={forceSaveLocal}
           onForceFetch={forceFetchServer}
        />
     </div>
   );
 }
