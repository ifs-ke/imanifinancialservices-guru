// src/app/(dashboard)/layout.tsx - Refactored for Next.js 14 and performance
 'use client'; // This layout needs to be a client component for hooks

 import React, { useEffect } from 'react';
 import { useAuth } from '@clerk/nextjs';
 import { useBudgetNotifications } from '@/services/notificationService';
 import {
   SidebarProvider,
   Sidebar,
   SidebarRail,
   SidebarInset,
 } from "@/components/ui/sidebar";
 import { useSyncManager } from '@/hooks/useSyncManager';
 import FloatingChatButton from '@/components/layout/FloatingChatButton';
 import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
 import { Toaster } from '@/components/ui/toaster'; // Ensure Toaster is here for notifications from sync
 import { logDebug } from '@/lib/logger';


 export default function DashboardLayout({
   children,
 }: {
   children: React.ReactNode;
 }) {
   const { userId, isSignedIn, isLoaded: isClerkLoaded } = useAuth(); // Get full auth state

   // useSyncManager should be called unconditionally at the top level of the component.
   const syncManager = useSyncManager();
   const { isMismatchDialogOpen, setIsMismatchDialogOpen, forceFetchServer, forceSaveLocal, syncStatus } = syncManager;

   // Activate budget notification checks, only if user is signed in
    useBudgetNotifications();


   // Open mismatch dialog when hashMismatch becomes true
   useEffect(() => {
       if (syncManager.hashMismatch) {
           logDebug("DashboardLayout: Hash mismatch detected, opening dialog.", { userId });
           setIsMismatchDialogOpen(true);
       }
   }, [syncManager.hashMismatch, setIsMismatchDialogOpen, userId]);


   return (
     <div className="flex min-h-screen bg-background">
       <Sidebar />
       <SidebarRail />
       <SidebarInset>
         {children}
       </SidebarInset>
       <FloatingChatButton />
       <Toaster /> {/* Ensure Toaster is rendered */}

        <DataSyncMismatchDialog
           isOpen={isMismatchDialogOpen}
           onClose={() => setIsMismatchDialogOpen(false)}
           onForceSave={forceSaveLocal}
           onForceFetch={forceFetchServer}
        />
     </div>
   );
 }
