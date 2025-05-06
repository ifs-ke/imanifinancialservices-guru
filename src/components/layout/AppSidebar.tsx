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
  SidebarTrigger,
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
import type { SyncStatus, useSyncManager } from '@/hooks/useSyncManager';
import { useNotificationStore } from '@/store/notificationStore';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/income-expenses', label: 'Income/Expenses', icon: TrendingUp },
  { href: '/debt', label: 'Debts', icon: Coins },
  { href: '/statements', label: 'Statements', icon: FileText },
  { href: '/budget', label: 'Budget', icon: PieChart },
  { href: '/weekly-review', label: 'Weekly Review', icon: CalendarCheck },
  { href: '/logger', label: 'Logger', icon: ListTree },
];

interface AppSidebarProps {
    syncManager: ReturnType<typeof useSyncManager>;
    openMismatchDialog: () => void;
}

export function AppSidebar({
    syncManager,
    openMismatchDialog,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar();
  const unreadCount = useNotificationStore(state => state.unreadCount());

    const { syncStatus, retrySync, hashMismatch } = syncManager;

    let PersistenceIcon = CloudOff;
    let persistenceStatusText = 'Local Data';
    let persistenceTooltipText = "Data saved locally in browser.";
    let iconColor = 'text-muted-foreground';
    let isClickable = false;

    switch (syncStatus) {
        case 'syncing': PersistenceIcon = RefreshCw; persistenceStatusText = 'Syncing...'; persistenceTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary animate-spin'; break;
        case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; break;
        case 'error': PersistenceIcon = AlertTriangle; persistenceStatusText = hashMismatch ? 'Conflict' : 'Sync Error'; persistenceTooltipText = hashMismatch ? 'Data mismatch detected. Click to resolve.' : 'Sync failed. Click to retry.'; iconColor = 'text-destructive'; isClickable = true; break;
        case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local Data'; persistenceTooltipText = "Data saved locally. Sign in to sync."; iconColor = 'text-muted-foreground'; break;
     }


     const handleStatusClick = () => {
         if (hashMismatch) {
             openMismatchDialog();
         } else if (isClickable && retrySync && syncStatus === 'error') {
             retrySync();
         }
     }


  return (
    <>
      {/* Header: App Name and Toggle Button */}
      <SidebarHeader className="flex h-14 items-center justify-between border-b border-sidebar-border p-2">
         {/* Logo and App Name Link */}
         <Link href="/dashboard" className="flex flex-shrink-0 items-center gap-2 overflow-hidden" aria-label="Go to dashboard">
            <Landmark className="h-6 w-6 flex-shrink-0 text-primary" />
             {/* App Name - Hides when collapsed */}
             <span
                className={cn(
                    "whitespace-nowrap text-lg font-semibold text-sidebar-foreground",
                    "group-data-[state=expanded]/sidebar-wrapper:inline", // Use group-data for hiding
                    "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                )}
             >
                IFC - Guru
             </span>
         </Link>
          {/* Sidebar Toggle Button */}
          <SidebarTrigger className={cn("h-8 w-8", isMobile && "hidden")} />
      </SidebarHeader>

      {/* Main Navigation Menu */}
      <SidebarContent className="flex-1 overflow-y-auto p-2">
        <SidebarMenu>
           {menuItems.map((item) => {
             const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
             return (
                 <SidebarMenuItem key={item.href}>
                     {/* Use SidebarMenuButton for consistent styling and tooltip */}
                     <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} variant={isActive ? "active" : "ghost"}>
                        <Link href={item.href} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 flex-shrink-0" />
                             {/* Menu Item Label - Hides when collapsed */}
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

       {/* Footer Section */}
       <SidebarFooter className="mt-auto space-y-2 border-t border-sidebar-border p-2">
           {/* Notifications Link */}
           <SidebarMenuItem>
             <SidebarMenuButton asChild tooltip="Notifications" variant={pathname === '/notifications' ? "active" : "ghost"}>
                <Link href="/notifications" className="relative flex h-9 w-full items-center justify-start gap-2 p-2">
                    <Bell className="h-4 w-4 flex-shrink-0" />
                    <span className={cn(
                        "group-data-[state=expanded]/sidebar-wrapper:inline",
                        "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                    )}>
                        Notifications
                    </span>
                     {/* Unread Count Badge */}
                     {unreadCount > 0 && (
                         <SidebarMenuBadge
                           className={cn(
                             "absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground",
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

           {/* User Account Button */}
           <div className={cn("flex w-full items-center", state === 'collapsed' ? 'justify-center' : 'justify-start pl-1')}>
              <UserButton afterSignOutUrl="/sign-in" appearance={{ elements: { userButtonAvatarBox: "w-7 h-7" }}} />
              {/* Hidden text for accessibility/tooltip when collapsed */}
              <span className={cn(
                  "ml-2 text-xs text-muted-foreground",
                  "group-data-[state=expanded]/sidebar-wrapper:inline",
                  "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                  )}>
                  Account
              </span>
          </div>

           <Separator className="my-1"/>

           {/* Theme Toggle */}
           <ThemeToggle />

           {/* Sync Status Indicator */}
           <TooltipProvider delayDuration={100}>
             <Tooltip>
                 <TooltipTrigger asChild>
                     {/* Use SidebarMenuButton for styling consistency */}
                     <SidebarMenuButton
                         variant="ghost"
                         className={cn(
                             "flex w-full items-center",
                             state === 'expanded' ? 'justify-start' : 'justify-center', // Adjust alignment based on state
                             !isClickable && !hashMismatch && "cursor-default"
                         )}
                         onClick={handleStatusClick}
                         disabled={syncStatus === 'syncing'}
                         aria-label={`Data Sync Status: ${persistenceStatusText}`}
                     >
                         <PersistenceIcon className={cn("h-[1.1rem] w-[1.1rem] flex-shrink-0", iconColor)} />
                         <span className={cn(
                             "ml-2 text-xs", // Adjusted margin and removed text-muted-foreground
                             "group-data-[state=expanded]/sidebar-wrapper:inline",
                             "group-data-[state=collapsed]/sidebar-wrapper:hidden",
                             syncStatus === 'error' && !hashMismatch && 'text-destructive', // Error text color
                             syncStatus === 'error' && hashMismatch && 'text-destructive', // Conflict text color
                             syncStatus === 'synced' && 'text-accent' // Synced text color
                            )}>
                             {persistenceStatusText}
                         </span>
                     </SidebarMenuButton>
                 </TooltipTrigger>
                 <TooltipContent side="right" align="center" sideOffset={state === 'collapsed' ? 10 : 4} className="max-w-[150px] text-xs">
                     <p>{persistenceTooltipText}</p>
                 </TooltipContent>
             </Tooltip>
           </TooltipProvider>
      </SidebarFooter>
    </>
  );
}