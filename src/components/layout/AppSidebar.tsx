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
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ReceiptText,
  FileText,
  FileUp,
  Coins,
  TrendingUp, // Icon for Income/Expenses combined view
  Menu,
  Settings,
  Landmark,
  PieChart, // Budget icon
  CloudOff, Cloud, // Use CloudOff icon for local persistence indication
  CalendarCheck, // Icon for Weekly Review
  RefreshCw, // Icon for syncing/error
  AlertTriangle // Icon for error
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UserButton } from '@clerk/nextjs'; // Import UserButton
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components
import type { SyncStatus } from '@/hooks/useSyncManager'; // Import the type

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText, secondaryIcon: FileUp },
  { href: '/income-expenses', label: 'Income/Expenses', icon: TrendingUp },
  { href: '/debt', label: 'Debts', icon: Coins },
  { href: '/statements', label: 'Statements', icon: FileText },
  { href: '/budget', label: 'Budget', icon: PieChart },
  { href: '/weekly-review', label: 'Weekly Review', icon: CalendarCheck }, // Added Weekly Review
];

// Define props for AppSidebar to accept syncStatus and retry function
interface AppSidebarProps {
    syncStatus: SyncStatus; // Use the imported type
    retrySync?: () => void; // Optional retry function
}

export function AppSidebar({ syncStatus, retrySync }: AppSidebarProps) { // Receive syncStatus and retrySync as props
  const pathname = usePathname();
  const { isMobile, state } = useSidebar(); // Get sidebar state

  // Determine persistence status icon, text, color, and tooltip based on syncStatus
    let PersistenceIcon = CloudOff;
    let persistenceStatusText = 'Data Saved Locally';
    let persistenceTooltipText = "Data is saved in your browser's local storage. Sign in to sync.";
    let iconColor = 'text-muted-foreground'; // Default color
    let isClickable = false; // Should the icon be clickable for retry?

    switch (syncStatus) {
        case 'syncing':
            PersistenceIcon = RefreshCw;
            persistenceStatusText = 'Syncing...';
            persistenceTooltipText = 'Attempting to sync data with the cloud.';
            iconColor = 'text-primary animate-spin'; // Spinning blue icon
            break;
        case 'synced':
            PersistenceIcon = Cloud;
            persistenceStatusText = 'Data Synced';
            persistenceTooltipText = 'Data is successfully synced with the cloud.';
            iconColor = 'text-accent'; // Green cloud for synced
            break;
        case 'error':
            PersistenceIcon = AlertTriangle;
            persistenceStatusText = 'Sync Error';
            persistenceTooltipText = 'Failed to sync data. Click to retry.'; // Updated tooltip
            iconColor = 'text-destructive'; // Red triangle for error
            isClickable = true; // Enable click to retry
            break;
        case 'local': // Explicitly handle 'local' status
        default:
            PersistenceIcon = CloudOff;
            persistenceStatusText = 'Data Saved Locally';
            persistenceTooltipText = "Data is saved in your browser's local storage. Sign in to sync.";
            iconColor = 'text-muted-foreground'; // Muted cloud-off for local
            break;
     }


  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-2 border-b border-sidebar-border">
         {/* Wrap Link and span for better control */}
        <div className={cn("flex items-center gap-2 flex-shrink-0 overflow-hidden", state === 'collapsed' && 'justify-center w-full')}>
            <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
              <Landmark className="w-6 h-6 text-primary flex-shrink-0" />
               {/* Conditionally render text based on state */}
               <span className={cn(
                   "font-semibold text-lg text-sidebar-foreground whitespace-nowrap",
                   state === 'collapsed' && "hidden" // Hide text when collapsed
               )}>
                   IFC - Guru
              </span>
            </Link>
         </div>

        {/* Hamburger menu trigger */}
         <SidebarTrigger asChild>
             <Button variant="ghost" size="icon" className={cn("h-7 w-7", state === 'expanded' ? 'md:hidden' : 'hidden')}> {/* Show only on mobile when expanded */}
                 <Menu className="h-5 w-5" />
             </Button>
         </SidebarTrigger>
         <SidebarTrigger asChild>
              <Button variant="ghost" size="icon" className={cn("h-7 w-7 hidden", state === 'expanded' ? 'md:flex ml-auto' : 'md:hidden')}> {/* Show only on desktop when expanded */}
                  <Menu className="h-5 w-5" />
              </Button>
         </SidebarTrigger>
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-y-auto p-2">
        <SidebarMenu>
          {menuItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
             return (
                <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.label}
                    variant={isActive ? "active" : "ghost"}
                >
                    <Link href={item.href}>
                    <item.icon className="h-4 w-4" />
                     <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                    {item.secondaryIcon && (
                        <item.secondaryIcon className="ml-auto h-3 w-3 text-muted-foreground group-data-[state=collapsed]:hidden" />
                    )}
                    </Link>
                </SidebarMenuButton>
                </SidebarMenuItem>
            );
         })}
        </SidebarMenu>
      </SidebarContent>
       <SidebarFooter className="p-2 mt-auto border-t border-sidebar-border space-y-2">
          {/* User Button */}
          <div className={cn(
               "flex items-center w-full",
               state === 'collapsed' ? 'justify-center' : 'justify-start pl-1' // Adjust justification and padding
             )}>
             <UserButton afterSignOutUrl="/sign-in" appearance={{
                 elements: {
                    userButtonAvatarBox: "w-7 h-7", // Adjust size if needed
                 }
             }} />
             {state === 'expanded' && (
                 <span className="text-xs text-muted-foreground ml-2">Account</span>
             )}
         </div>
          <Separator className="my-1"/>
          <ThemeToggle />
          {/* Save Status Indicator - Now dynamic and potentially clickable */}
           <Tooltip>
               <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                        "flex items-center w-full justify-start px-2 py-1 h-10",
                        !isClickable && "cursor-default pointer-events-none" // Make non-clickable if not error
                    )}
                    onClick={isClickable ? retrySync : undefined} // Call retrySync only if clickable
                    disabled={!isClickable && syncStatus !== 'error'} // Disable explicitly if not clickable error
                 >
                       {/* Dynamic Icon */}
                       <PersistenceIcon className={cn("h-[1.2rem] w-[1.2rem] flex-shrink-0", iconColor)} />
                       <span className="ml-2 text-xs text-muted-foreground group-data-[state=collapsed]:hidden">
                           {persistenceStatusText} {/* Dynamic text */}
                       </span>
                       <span className="sr-only">Data Save Status</span>
                   </Button>
               </TooltipTrigger>
               <TooltipContent side="right" align="center" sideOffset={10}>
                   <p className="text-xs">
                        {persistenceTooltipText}
                    </p>
               </TooltipContent>
           </Tooltip>
      </SidebarFooter>
    </>
  );
}
