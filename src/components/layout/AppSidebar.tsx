--- a/src/components/layout/AppSidebar.tsx
+++ b/src/components/layout/AppSidebar.tsx
@@ -15,7 +15,7 @@
 import {
   LayoutDashboard,
   ReceiptText,
-  FileText,
+  FileText, 
   Coins,
   TrendingUp,
   // Menu, // No longer directly used here
@@ -49,7 +49,7 @@
 }: AppSidebarProps) {
   const pathname = usePathname();
   const { isMobile, state } = useSidebar();
-  const unreadCount = useNotificationStore(state => state.unreadCount());
+  const unreadCount = useNotificationStore(state => state.unreadCount()); 
 
     const { syncStatus, retrySync, hashMismatch } = syncManager;
 
@@ -61,7 +61,7 @@
 
     switch (syncStatus) {
         case 'syncing': PersistenceIcon = RefreshCw; persistenceStatusText = 'Syncing...'; persistenceTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary animate-spin'; break;
-        case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; break;
+        case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; break; 
         case 'error': PersistenceIcon = AlertTriangle; persistenceStatusText = hashMismatch ? 'Conflict' : 'Sync Error'; persistenceTooltipText = hashMismatch ? 'Data mismatch detected. Click to resolve.' : 'Sync failed. Click to retry.'; iconColor = 'text-destructive'; isClickable = true; break;
         case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local'; persistenceTooltipText = "Data local. Sync to cloud."; iconColor = 'text-muted-foreground'; isClickable = true; break; // Make local clickable to attempt sync
      }
@@ -82,7 +82,7 @@
        <header className="mb-6 flex justify-between items-start">
             {/* Left-aligned Title and Description */}
            <div>
-                <h1 className="text-2xl font-bold tracking-tight text-foreground">
+                <h1 className="text-2xl font-bold tracking-tight text-foreground">Imani Financial Consultancies - Guru
                     Executive Summary
                 </h1>
                 <p className="text-sm text-muted-foreground">
+