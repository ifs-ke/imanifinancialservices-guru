
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
 // DataSyncMismatchDialog is no longer needed in local-only mode
 import { Toaster } from '@/components/ui/toaster';
 import { logDebug } from '@/lib/logger';
 import { LoadingSpinner } from '@/components/ui/loading-spinner';
 import { useAuth } from '@clerk/nextjs';


 export default function DashboardLayout({
   children,
 }: {
   children: React.ReactNode;
 }) {
   const { isLoaded: isClerkLoaded, isSignedIn, userId } = useAuth();
   const syncManager = useSyncManager(); // Still used for local state management like 'gettingStartedDismissed'

   useBudgetNotifications(); // Can still run for local budget alerts

   useEffect(() => {
       // This effect might be simplified or removed if hashMismatch is fully gone
       // For now, it's harmless as hashMismatch should always be false in local-only mode.
       if (syncManager.hashMismatch && !syncManager.isMismatchDialogOpen) {
           logDebug("DashboardLayout: Hash mismatch detected (should not occur in local-only mode).", { userId });
           // syncManager.setIsMismatchDialogOpen(true); // Dialog removed
       }
   }, [syncManager.hashMismatch, syncManager.isMismatchDialogOpen, userId]);

   if (!isClerkLoaded || syncManager.syncStatus === 'idle' || syncManager.syncStatus === 'loading_local') {
     return (
       <div className="flex items-center justify-center min-h-screen bg-background">
         <LoadingSpinner size={48} text={!isClerkLoaded ? "Authenticating..." : "Loading local data..."} />
       </div>
     );
   }

   return (
     <div className="flex min-h-screen bg-background">
       <Sidebar />
       <SidebarInset>
         {children}
       </SidebarInset>
       <FloatingChatButton />
       <Toaster />

       {/* DataSyncMismatchDialog removed as it's not applicable in local-only mode */}
     </div>
   );
 }
