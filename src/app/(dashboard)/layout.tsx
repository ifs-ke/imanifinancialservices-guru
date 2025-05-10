// src/app/(dashboard)/layout.tsx - Refactored for Next.js 14 and performance
 'use client'; 

 import React, { useEffect } from 'react';
 import { useAuth } from '@clerk/nextjs';
 import { useBudgetNotifications } from '@/services/notificationService';
 import {
   SidebarProvider, // Already in RootLayout, but keep for context if direct child needs it. Consider removal if not directly used.
   Sidebar,
   SidebarRail,
   SidebarInset,
 } from "@/components/ui/sidebar";
 import { useSyncManager } from '@/hooks/useSyncManager';
 import FloatingChatButton from '@/components/layout/FloatingChatButton';
 import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
 import { Toaster } from '@/components/ui/toaster'; 
 import { logDebug } from '@/lib/logger';
 import { LoadingSpinner } from '@/components/ui/loading-spinner'; // Import LoadingSpinner


 export default function DashboardLayout({
   children,
 }: {
   children: React.ReactNode;
 }) {
   const { userId, isSignedIn, isLoaded: isClerkLoaded } = useAuth(); 

   const syncManager = useSyncManager();
   const { isMismatchDialogOpen, setIsMismatchDialogOpen, forceFetchServer, forceSaveLocal } = syncManager;
 
   useBudgetNotifications();


   useEffect(() => {
       if (syncManager.hashMismatch) {
           logDebug("DashboardLayout: Hash mismatch detected, opening dialog.", { userId });
           setIsMismatchDialogOpen(true);
       }
   }, [syncManager.hashMismatch, setIsMismatchDialogOpen, userId]);

   // If Clerk is not loaded yet, show a loading state for the entire dashboard area
   if (!isClerkLoaded) {
     return (
       <div className="flex items-center justify-center min-h-screen bg-background">
         <LoadingSpinner size={48} text="Authenticating..." />
       </div>
     );
   }

   return (
     <div className="flex min-h-screen bg-background">
       <Sidebar />
       <SidebarRail />
       <SidebarInset>
         {/* Only render children (page content) if Clerk is loaded */}
         {isClerkLoaded ? children : null}
       </SidebarInset>
       <FloatingChatButton />
       <Toaster />

        <DataSyncMismatchDialog
           isOpen={isMismatchDialogOpen}
           onClose={() => setIsMismatchDialogOpen(false)}
           onForceSave={forceSaveLocal}
           onForceFetch={forceFetchServer}
        />
     </div>
   );
 }
