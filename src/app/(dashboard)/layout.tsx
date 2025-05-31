
// src/app/(dashboard)/layout.tsx
 'use client';

 import React, { useEffect } from 'react';
 import { useBudgetNotifications } from '@/services/notificationService';
 import {
   Sidebar,
   SidebarInset,
 } from "@/components/ui/sidebar";
 import { useSyncManager } from '@/hooks/useSyncManager';
 import FloatingChatButton from '@/components/layout/FloatingChatButton';
 import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog'; // Re-added for server sync
 import { Toaster } from '@/components/ui/toaster';
 import { logDebug, logInfo } from '@/lib/logger';
 import { LoadingSpinner } from '@/components/ui/loading-spinner';
 import { useAuth } from '@clerk/nextjs';
 import { AppMenubar } from '@/components/layout/AppMenubar'; // New import


 export default function DashboardLayout({
   children,
 }: {
   children: React.ReactNode;
 }) {
   const { isLoaded: isClerkLoaded, isSignedIn, userId } = useAuth();
   const syncManager = useSyncManager();

   useBudgetNotifications();

   useEffect(() => {
       if (!isClerkLoaded || !isSignedIn) return; // Only proceed if Clerk is loaded and user is signed in

       if (syncManager.hashMismatch && !syncManager.isMismatchDialogOpen) {
           logInfo("DashboardLayout: Hash mismatch detected. Opening dialog.", { userId });
           syncManager.setIsMismatchDialogOpen(true);
       }
   }, [syncManager.hashMismatch, syncManager.isMismatchDialogOpen, syncManager.setIsMismatchDialogOpen, isClerkLoaded, isSignedIn, userId]);


   // Updated loading condition for server sync
   if (!isClerkLoaded || (syncManager.syncStatus === 'idle' && isSignedIn) || (syncManager.syncStatus === 'syncing' && isSignedIn) || (syncManager.syncStatus === 'loading_local' && isSignedIn)) {
     return (
       <div className="flex items-center justify-center min-h-screen bg-background">
         <LoadingSpinner size={48} text={
             !isClerkLoaded ? "Authenticating..." :
             syncManager.syncStatus === 'syncing' ? "Syncing data..." :
             "Loading data..."
         } />
       </div>
     );
   }

   return (
     <div className="flex min-h-screen w-full bg-background">
       <Sidebar />
       <SidebarInset className="flex flex-col bg-background"> {/* Added flex flex-col */}
         <AppMenubar /> {/* Added AppMenubar */}
         <main className="flex-1 overflow-y-auto"> {/* Added main wrapper for children with scroll */}
           {children}
         </main>
       </SidebarInset>
       <FloatingChatButton />
       <Toaster />

       {isSignedIn && syncManager.hashMismatch && ( // Only show dialog if signed in and mismatch occurs
          <DataSyncMismatchDialog
            isOpen={syncManager.isMismatchDialogOpen}
            onClose={() => syncManager.setIsMismatchDialogOpen(false)}
            onForceSave={async () => {
              const success = await syncManager.forceSave();
              if (success) syncManager.setIsMismatchDialogOpen(false);
              return success;
            }}
            onForceFetch={async () => {
              const success = await syncManager.forceFetch();
              if (success) syncManager.setIsMismatchDialogOpen(false);
              return success;
            }}
          />
        )}
     </div>
   );
 }
