// src/app/(dashboard)/layout.tsx - Refactored for Next.js 14 and performance
 'use client'; 

 import React, { useEffect } from 'react';
 // import { useAuth } from '@clerk/nextjs'; // Clerk disabled
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
   // Clerk disabled: Simulate auth state
   const isClerkLoaded = true; // Assume loaded
   const isSignedIn = !!process.env.NEXT_PUBLIC_MOCK_USER_ID; // Signed in if mock user ID is set
   const userId = process.env.NEXT_PUBLIC_MOCK_USER_ID;

   const syncManager = useSyncManager();
   const { 
     isMismatchDialogOpen, 
     setIsMismatchDialogOpen, 
     forceFetchServer, 
     forceSaveLocal,
     hashMismatch 
   } = syncManager;
 
   useBudgetNotifications();


   useEffect(() => {
       if (hashMismatch && !isMismatchDialogOpen) {
           logDebug("DashboardLayout: Hash mismatch detected, ensuring dialog is open.", { userId });
           setIsMismatchDialogOpen(true);
       }
   }, [hashMismatch, isMismatchDialogOpen, setIsMismatchDialogOpen, userId]);

   // If using mock auth, we can consider it "loaded" immediately
   // Original Clerk loading state check is commented out
   // if (!isClerkLoaded) {
   //   return (
   //     <div className="flex items-center justify-center min-h-screen bg-background">
   //       <LoadingSpinner size={48} text="Authenticating..." />
   //     </div>
   //   );
   // }

   return (
     <div className="flex min-h-screen bg-background">
       <Sidebar />
       <SidebarInset>
         {children} 
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
