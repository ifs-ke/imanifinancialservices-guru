--- a/src/app/(dashboard)/layout.tsx
+++ b/src/app/(dashboard)/layout.tsx
@@ -4,6 +4,7 @@
 import {
   Sidebar,
   SidebarInset,
+
   SidebarRail,
 } from '@/components/ui/sidebar';
 import { AppSidebar } from '@/components/layout/AppSidebar';
@@ -13,7 +14,7 @@
 import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
 import { logInfo, logWarn, logError } from '@/lib/logger';
 
-const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
+const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';
 
 export default function DashboardLayout({
   children,
+