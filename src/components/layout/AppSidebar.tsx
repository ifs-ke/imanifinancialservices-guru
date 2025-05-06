// src/components/layout/AppSidebar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ReceiptText,
  FileText,
  Coins,
  TrendingUp,
  Menu,
  PanelLeft,
  Landmark,
  PieChart,
  CloudOff, Cloud,
  CalendarCheck,
  RefreshCw,
  AlertTriangle,
  ListTree,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UserButton } from '@clerk/nextjs';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SyncStatus } from '@/hooks/useSyncManager';
import { useNotificationStore } from '@/store/notificationStore';
// Removed DataSyncMismatchDialog import, as it's now managed in the layout

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/income-expenses', label: 'Income/Expenses', icon: TrendingUp },
  { href: '/debt', label: 'Debts', icon: Coins },
  { href: '/statements', label: 'Statements', icon: FileText },
  { href: '/budget', label: 'Budget', icon: PieChart },
  { href: '/weekly-review', label: 'Weekly Review', icon: CalendarCheck },
];

const loggerItem = { href: '/logger', label: 'Logger', icon: ListTree };

interface AppSidebarProps {
    syncStatus: SyncStatus;
    retrySync?: () => void;
    hashMismatch: boolean; // Receive mismatch status
    openMismatchDialog: () => void; // Function to open the dialog in the parent
}

export function AppSidebar({
    syncStatus,
    retrySync,
    hashMismatch,
    openMismatchDialog, // Receive function to open dialog
}: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar();
  const unreadCount = useNotificationStore(state => state.unreadCount());
  // Removed isMismatchDialogOpen state, managed by parent layout now

    let PersistenceIcon = CloudOff;
    let persistenceStatusText = 'Local Data';
    let persistenceTooltipText = "Data saved locally in browser.";
    let iconColor = 'text-muted-foreground';
    let isClickable = false;

    switch (syncStatus) {
        case 'syncing': PersistenceIcon = RefreshCw; persistenceStatusText = 'Syncing...'; persistenceTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary animate-spin'; break;
        case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; break;
        case 'error': PersistenceIcon = AlertTriangle; persistenceStatusText = hashMismatch ? 'Conflict' : 'Sync Error'; persistenceTooltipText = hashMismatch ? 'Data mismatch detected. Click to resolve.' : 'Sync failed. Click to retry.'; iconColor = 'text-destructive'; isClickable = true; break; // Update text for error
        case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local Data'; persistenceTooltipText = "Data saved locally. Sign in to sync."; iconColor = 'text-muted-foreground'; break;
     }

     // Removed effect related to dialog visibility, parent handles it

     const handleStatusClick = () => {
         console.log("AppSidebar: Status icon clicked. Mismatch:", hashMismatch, "Clickable:", isClickable);
         if (hashMismatch) {
             openMismatchDialog(); // Call the function passed from the parent to open the dialog
         } else if (isClickable && retrySync && syncStatus === 'error') { // Only retry if in error state and no mismatch
             console.log("AppSidebar: Retrying sync...");
             retrySync();
         }
     }


  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-2 border-b border-sidebar-border h-14">
        <div className={cn("flex items-center gap-2 flex-shrink-0 overflow-hidden", state === 'collapsed' && 'justify-center w-full')}>
            <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
              <Landmark className="w-6 h-6 text-primary flex-shrink-0" />
               <span className={cn(
                   "font-semibold text-lg text-sidebar-foreground whitespace-nowrap",
                   "group-data-[state=expanded]/sidebar-wrapper:inline",
                   "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                   )}>
                   IFC - Guru
              </span>
            </Link>
         </div>
          <SidebarTrigger className={cn("h-8 w-8", isMobile && "hidden")}>
             {/* Icon changes based on state, ensured via useSidebar hook */}
             {/* No need to pass children here, default icon logic in SidebarTrigger */}
          </SidebarTrigger>
      </SidebarHeader>

      <SidebarContent className="flex-1 overflow-y-auto p-2">
        <SidebarMenu>
           {menuItems.map((item) => {
             const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
             return (
                 <SidebarMenuItem key={item.href}>
                     <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} variant={isActive ? "active" : "ghost"}>
                        <Link href={item.href} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 flex-shrink-0" />
                             <span className={cn(
                                "group-data-[state=expanded]/sidebar-wrapper:inline",
                                "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                             )}>
                                {item.label}
                             </span>
                         </Link>
                    </SidebarMenuButton>
                 </SidebarMenuItem>
             );
          })}
        </SidebarMenu>
      </SidebarContent>

       <SidebarFooter className="p-2 mt-auto border-t border-sidebar-border space-y-2">
            <SidebarMenuItem>
                <SidebarMenuButton
                    asChild
                    isActive={pathname === loggerItem.href}
                    tooltip={loggerItem.label}
                    variant={pathname === loggerItem.href ? "active" : "ghost"}
                >
                    <Link href={loggerItem.href} className="flex items-center gap-2 w-full justify-start p-2 h-9">
                        <loggerItem.icon className="h-4 w-4 flex-shrink-0" />
                         <span className={cn(
                            "group-data-[state=expanded]/sidebar-wrapper:inline",
                            "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                         )}>
                            {loggerItem.label}
                         </span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
           <SidebarMenuItem>
             <SidebarMenuButton asChild tooltip="Notifications" variant={pathname === '/notifications' ? "active" : "ghost"}>
                <Link href="/notifications" className="flex items-center gap-2 w-full justify-start p-2 h-9 relative">
                    <Bell className="h-4 w-4 flex-shrink-0" />
                    <span className={cn(
                        "group-data-[state=expanded]/sidebar-wrapper:inline",
                        "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                    )}>
                        Notifications
                    </span>
                     {unreadCount > 0 && (
                         <SidebarMenuBadge
                           className={cn(
                             "absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] rounded-full",
                             state === 'collapsed' && "right-1 top-1 h-3 w-3 p-0 text-[8px]"
                           )}
                         >
                           {unreadCount > 9 ? '9+' : unreadCount}
                         </SidebarMenuBadge>
                     )}
                 </Link>
             </SidebarMenuButton>
           </SidebarMenuItem>
           <Separator className="my-1"/>
          <div className={cn("flex items-center w-full", state === 'collapsed' ? 'justify-center' : 'justify-start pl-1')}>
             <UserButton afterSignOutUrl="/sign-in" appearance={{ elements: { userButtonAvatarBox: "w-7 h-7" }}} />
             <span className={cn(
                 "text-xs text-muted-foreground ml-2",
                 "group-data-[state=expanded]/sidebar-wrapper:inline",
                 "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                 )}>
                 Account
             </span>
         </div>
          <Separator className="my-1"/>
          <ThemeToggle />
           <TooltipProvider delayDuration={100}>
             <Tooltip>
                 <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn(
                            "flex items-center w-full justify-start px-2 py-1 h-9",
                            state === 'collapsed' && 'justify-center',
                            !isClickable && !hashMismatch && "cursor-default" // Only make clickable if error or mismatch
                        )}
                        onClick={handleStatusClick} // Use updated handler
                        // Disable only if syncing
                        disabled={syncStatus === 'syncing'}
                     >
                         <PersistenceIcon className={cn("h-[1.1rem] w-[1.1rem] flex-shrink-0", iconColor)} />
                         <span className={cn(
                             "ml-2 text-xs text-muted-foreground",
                             "group-data-[state=expanded]/sidebar-wrapper:inline",
                             "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                            )}>
                             {persistenceStatusText}
                         </span>
                         <span className="sr-only">Data Sync Status</span>
                     </Button>
                 </TooltipTrigger>
                 <TooltipContent side="right" align="center" sideOffset={state === 'collapsed' ? 10 : 4} className="text-xs max-w-[150px]">
                     <p>{persistenceTooltipText}</p>
                 </TooltipContent>
             </Tooltip>
           </TooltipProvider>

           {/* Removed Data Sync Mismatch Dialog - Managed in layout */}

      </SidebarFooter>
    </>
  );
}
