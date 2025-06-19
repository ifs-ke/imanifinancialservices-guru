
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
 import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
 import { Toaster } from '@/components/ui/toaster';
 import { logInfo } from '@/lib/logger';
 import { LoadingSpinner } from '@/components/ui/loading-spinner';
 import { useAuth } from '@clerk/nextjs';


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

       if (syncManager.hashMismatch && !syncManager.isMismatchDialogOpen) {
           logInfo("DashboardLayout: Hash mismatch detected. Opening dialog.", { userId });
           syncManager.setIsMismatchDialogOpen(true);
       }
   }, [syncManager, isClerkLoaded, isSignedIn, userId]);


   // isLoading now primarily depends on Clerk's loading state.
   // The syncManager's status (like isInitialClientSyncPending or 'syncing')
   // will be reflected in the sidebar sync indicator, not block the main layout.
   const isLoading = !isClerkLoaded;
    
   const spinnerMessage = !isClerkLoaded ? "Authenticating..." : "Loading application...";


   if (isLoading) {
     return (
       <div className="flex items-center justify-center min-h-screen w-full bg-background">
         <LoadingSpinner size={48} text={spinnerMessage} />
       </div>
     );
   }

   // If Clerk is loaded but user is not signed in, Clerk's middleware should handle redirection.
   // If we reach here and isSignedIn is false, it's an unexpected state for a protected layout.
   // However, the content rendering is typically for signed-in users.
   // ClerkProvider and auth().protect() in middleware are the primary guards.

   return (
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
     </div>
   );
 }
