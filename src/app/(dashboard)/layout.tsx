'use client'; // This layout needs to be a client component for hooks
 
 import React from 'react';
-import { useAuth } from '@clerk/nextjs';
 import { useBudgetNotifications } from '@/services/notificationService';
 import {
   useSidebar, // Import useSidebar hook
@@ -24,7 +24,6 @@
 }: {
   children: React.ReactNode;
 }) {
-  // Use actual Clerk state
   const syncManager = useSyncManager();
 
   useBudgetNotifications(); // Activate budget notification checks
@@ -52,4 +52,4 @@
     </div>
   );
 }
+