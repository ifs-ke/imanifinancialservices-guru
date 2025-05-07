
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
  // Menu, // No longer directly used here
  // PanelLeft, // No longer directly used here
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
// import { UserButton } from '@clerk/nextjs'; // Clerk disabled
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { useSyncManager } from '@/hooks/useSyncManager'; // Corrected import type
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
        case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local'; persistenceTooltipText = "Data local. Sync to cloud."; iconColor = 'text-muted-foreground'; isClickable = true; break; // Make local clickable to attempt sync
     }


     const handleStatusClick = () => {
         if (hashMismatch) {
             openMismatchDialog();
         } else if (isClickable && retrySync) { // Removed syncStatus === 'error' check to allow retry from 'local'
             retrySync();
         }
     }


  return (
    <>
      <SidebarHeader>
         <Link href="/dashboard" className="flex flex-shrink-0 items-center gap-2 overflow-hidden" aria-label="Go to dashboard">
            <Landmark className="h-6 w-6 flex-shrink-0 text-primary" />
             <span
                className={cn(
                    "whitespace-nowrap text-lg font-semibold text-sidebar-foreground",
                    "group-data-[state=expanded]/sidebar-wrapper:inline",
                    "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                )}
             >
                IFC - Guru
             </span>
         </Link>
          <SidebarTrigger className={cn("h-8 w-8", isMobile && "hidden")} />
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

       <SidebarFooter className="mt-auto space-y-2 border-t border-sidebar-border p-2">
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

            {/* User Account Button - Clerk Disabled */}
            {/*
            <div className={cn("flex w-full items-center", state === 'collapsed' ? 'justify-center' : 'justify-start pl-1')}>
              <UserButton afterSignOutUrl="/sign-in" appearance={{ elements: { userButtonAvatarBox: "w-7 h-7" }}} />
              <span className={cn(
                  "ml-2 text-xs text-muted-foreground",
                  "group-data-[state=expanded]/sidebar-wrapper:inline",
                  "group-data-[state=collapsed]/sidebar-wrapper:hidden"
                  )}>
                  Account
              </span>
            </div>
            <Separator className="my-1"/>
            */}


           <ThemeToggle />

           <TooltipProvider delayDuration={100}>
             <Tooltip>
                 <TooltipTrigger asChild>
                     <SidebarMenuButton
                         variant="ghost"
                         className={cn(
                             "flex w-full items-center",
                             state === 'expanded' ? 'justify-start' : 'justify-center',
                             !isClickable && !hashMismatch && "cursor-default"
                         )}
                         onClick={handleStatusClick}
                         disabled={syncStatus === 'syncing'}
                         aria-label={`Data Sync Status: ${persistenceStatusText}`}
                     >
                         <PersistenceIcon className={cn("h-[1.1rem] w-[1.1rem] flex-shrink-0", iconColor)} />
                         <span className={cn(
                             "ml-2 text-xs",
                             "group-data-[state=expanded]/sidebar-wrapper:inline",
                             "group-data-[state=collapsed]/sidebar-wrapper:hidden",
                             syncStatus === 'error' && !hashMismatch && 'text-destructive',
                             syncStatus === 'error' && hashMismatch && 'text-destructive',
                             syncStatus === 'synced' && 'text-accent',
                             syncStatus === 'local' && 'text-muted-foreground' // Added local status color
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
