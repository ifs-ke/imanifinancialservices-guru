
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ReceiptText,
  FileText,
  FileUp,
  Coins,
  TrendingUp,
  Menu, // Use Menu for mobile/collapsed
  PanelLeft, // Use PanelLeft for expanded desktop
  Settings,
  Landmark,
  PieChart,
  CloudOff, Cloud,
  CalendarCheck,
  RefreshCw,
  AlertTriangle,
  ListTree
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UserButton, useAuth } from '@clerk/nextjs';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SyncStatus } from '@/hooks/useSyncManager';
import type { AppRole } from '@/lib/roles';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText }, // Removed secondaryIcon logic for simplicity here, added back below.
  { href: '/income-expenses', label: 'Income/Expenses', icon: TrendingUp },
  { href: '/debt', label: 'Debts', icon: Coins },
  { href: '/statements', label: 'Statements', icon: FileText },
  { href: '/budget', label: 'Budget', icon: PieChart },
  { href: '/weekly-review', label: 'Weekly Review', icon: CalendarCheck },
];

const adminMenuItems = [
    { href: '/logger', label: 'Logger', icon: ListTree },
];

interface AppSidebarProps {
    syncStatus: SyncStatus;
    retrySync?: () => void;
}

export function AppSidebar({ syncStatus, retrySync }: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar(); // Get state ('expanded' or 'collapsed')
  const { sessionClaims } = useAuth();
  const [userRole, setUserRole] = useState<AppRole | null>(null);

   useEffect(() => {
       setUserRole(sessionClaims?.publicMetadata?.role as AppRole || null);
   }, [sessionClaims]);

    let PersistenceIcon = CloudOff;
    let persistenceStatusText = 'Local Data'; // Simplified text
    let persistenceTooltipText = "Data saved locally in browser.";
    let iconColor = 'text-muted-foreground';
    let isClickable = false;

    switch (syncStatus) {
        case 'syncing': PersistenceIcon = RefreshCw; persistenceStatusText = 'Syncing...'; persistenceTooltipText = 'Syncing data with cloud.'; iconColor = 'text-primary animate-spin'; break;
        case 'synced': PersistenceIcon = Cloud; persistenceStatusText = 'Synced'; persistenceTooltipText = 'Data synced with cloud.'; iconColor = 'text-accent'; break;
        case 'error': PersistenceIcon = AlertTriangle; persistenceStatusText = 'Sync Error'; persistenceTooltipText = 'Sync failed. Click to retry.'; iconColor = 'text-destructive'; isClickable = true; break;
        case 'local': default: PersistenceIcon = CloudOff; persistenceStatusText = 'Local Data'; persistenceTooltipText = "Data saved locally. Sign in to sync."; iconColor = 'text-muted-foreground'; break;
     }


  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-2 border-b border-sidebar-border h-14">
        {/* Title and logo link */}
        <div className={cn("flex items-center gap-2 flex-shrink-0 overflow-hidden", state === 'collapsed' && 'justify-center w-full')}>
            <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
              <Landmark className="w-6 h-6 text-primary flex-shrink-0" />
               {/* Title hidden when collapsed using group-data */}
               <span className={cn(
                   "font-semibold text-lg text-sidebar-foreground whitespace-nowrap",
                   "group-data-[state=collapsed]/sidebar-wrapper:hidden" // Use group-data for hiding
                   )}>
                   IFC - Guru
              </span>
            </Link>
         </div>
         {/* Sidebar Trigger Button */}
         {/* Hide trigger on mobile as Sheet handles its own trigger/close */}
         <SidebarTrigger className={cn("h-8 w-8", isMobile && "hidden")} />
      </SidebarHeader>

      <SidebarContent className="flex-1 overflow-y-auto p-2">
        <SidebarMenu>
           {menuItems.map((item) => {
             const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
             return (
                 <SidebarMenuItem key={item.href}>
                     {/* Pass tooltip content directly */}
                     <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} variant={isActive ? "active" : "ghost"}>
                        <Link href={item.href} className="flex items-center gap-2"> {/* Added flex and gap */}
                            <item.icon className="h-4 w-4 flex-shrink-0" />
                            {/* Label hidden when collapsed using group-data */}
                             <span className="group-data-[state=collapsed]/sidebar-wrapper:hidden">{item.label}</span>
                         </Link>
                    </SidebarMenuButton>
                 </SidebarMenuItem>
             );
          })}
           {userRole === 'admin' && (
               <>
                  <Separator className="my-2" />
                   {adminMenuItems.map((item) => {
                       const isActive = pathname === item.href || pathname.startsWith(item.href);
                       return (
                           <SidebarMenuItem key={item.href}>
                               <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} variant={isActive ? "active" : "ghost"}>
                                   <Link href={item.href} className="flex items-center gap-2"> {/* Added flex and gap */}
                                       <item.icon className="h-4 w-4 flex-shrink-0" />
                                       {/* Label hidden when collapsed */}
                                       <span className="group-data-[state=collapsed]/sidebar-wrapper:hidden">{item.label}</span>
                                   </Link>
                               </SidebarMenuButton>
                           </SidebarMenuItem>
                       );
                    })}
               </>
           )}
        </SidebarMenu>
      </SidebarContent>

       <SidebarFooter className="p-2 mt-auto border-t border-sidebar-border space-y-2">
          {/* User Button and Account Text */}
          <div className={cn("flex items-center w-full", state === 'collapsed' ? 'justify-center' : 'justify-start pl-1')}>
             <UserButton afterSignOutUrl="/sign-in" appearance={{ elements: { userButtonAvatarBox: "w-7 h-7" }}} />
              {/* Account text hidden when collapsed */}
             <span className={cn(
                 "text-xs text-muted-foreground ml-2",
                 "group-data-[state=collapsed]/sidebar-wrapper:hidden" // Use group-data for hiding
                 )}>
                 Account
             </span>
         </div>
          <Separator className="my-1"/>
          {/* Theme Toggle */}
          <ThemeToggle />
           {/* Sync Status with Tooltip */}
           <TooltipProvider delayDuration={100}>
             <Tooltip>
                 <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn(
                            "flex items-center w-full justify-start px-2 py-1 h-9",
                            state === 'collapsed' && 'justify-center', // Center content when collapsed
                            !isClickable && "cursor-default pointer-events-none"
                        )}
                        onClick={isClickable ? retrySync : undefined}
                        disabled={!isClickable && syncStatus !== 'error'}
                     >
                         <PersistenceIcon className={cn("h-[1.1rem] w-[1.1rem] flex-shrink-0", iconColor)} />
                         {/* Status text hidden when collapsed */}
                         <span className={cn(
                             "ml-2 text-xs text-muted-foreground",
                             "group-data-[state=collapsed]/sidebar-wrapper:hidden" // Use group-data for hiding
                            )}>
                             {persistenceStatusText}
                         </span>
                         <span className="sr-only">Data Sync Status</span>
                     </Button>
                 </TooltipTrigger>
                  {/* Tooltip always shows, content differs */}
                 <TooltipContent side="right" align="center" sideOffset={state === 'collapsed' ? 10 : 4} className="text-xs max-w-[150px]">
                     <p>{persistenceTooltipText}</p>
                 </TooltipContent>
             </Tooltip>
           </TooltipProvider>
      </SidebarFooter>
    </>
  );
}
