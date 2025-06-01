
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
   }, [syncManager, isClerkLoaded, isSignedIn, userId]); // syncManager itself is stable, specific props cause re-run


   if (!isClerkLoaded || !syncManager || (syncManager.syncStatus === 'idle' && isSignedIn) || (syncManager.syncStatus === 'syncing' && isSignedIn && !syncManager.lastSyncTime) || (syncManager.syncStatus === 'loading_local')) {
     return (
       <div className="flex items-center justify-center min-h-screen w-full bg-background">
         <LoadingSpinner size={48} text={
             !isClerkLoaded ? "Authenticating..." :
             syncManager?.syncStatus === 'syncing' ? "Syncing data..." :
             syncManager?.syncStatus === 'loading_local' ? "Loading local data..." :
             "Initializing..."
         } />
       </div>
     );
   }

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

        {isSignedIn && syncManager.hashMismatch && syncManager.isMismatchDialogOpen && (
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

