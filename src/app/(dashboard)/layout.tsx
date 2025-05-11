// src/app/(dashboard)/layout.tsx - Refactored for Next.js 14 and performance
 'use client'; 

 import React, { useEffect } from 'react';
 import { useAuth } from '@clerk/nextjs';
 import { useBudgetNotifications } from '@/services/notificationService';
 import {
   Sidebar,
   SidebarInset,
 } from "@/components/ui/sidebar";
 import { useSyncManager } from '@/hooks/useSyncManager';
 import FloatingChatButton from '@/components/layout/FloatingChatButton';
 import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
 import { Toaster } from '@/components/ui/toaster'; 
 import { logDebug } from '@/lib/logger';
 import { LoadingSpinner } from '@/components/ui/loading-spinner'; 


 export default function DashboardLayout({
   children,
 }: {
   children: React.ReactNode;
 }) {
   const { userId, isSignedIn, isLoaded: isClerkLoaded } = useAuth(); 

   const syncManager = useSyncManager();
   const { 
     isMismatchDialogOpen, 
     setIsMismatchDialogOpen, 
     forceFetchServer, 
     forceSaveLocal,
     hashMismatch // Make sure to get hashMismatch from the hook
   } = syncManager;
 
   useBudgetNotifications();


   useEffect(() => {
       // This effect ensures the dialog is opened if a hash mismatch is detected
       // and the dialog isn't already considered open by the syncManager's state.
       if (hashMismatch && !isMismatchDialogOpen) {
           logDebug("DashboardLayout: Hash mismatch detected, ensuring dialog is open.", { userId });
           setIsMismatchDialogOpen(true);
       }
   }, [hashMismatch, isMismatchDialogOpen, setIsMismatchDialogOpen, userId]);

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
       <SidebarInset>
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
