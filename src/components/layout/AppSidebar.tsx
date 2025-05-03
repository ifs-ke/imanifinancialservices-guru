
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
  CalendarCheck // Icon for Weekly Review
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UserButton } from '@clerk/nextjs'; // Import UserButton
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Import Tooltip components

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText, secondaryIcon: FileUp },
  { href: '/income-expenses', label: 'Income/Expenses', icon: TrendingUp },
  { href: '/debt', label: 'Debts', icon: Coins },
  { href: '/statements', label: 'Statements', icon: FileText },
  { href: '/budget', label: 'Budget', icon: PieChart },
  { href: '/weekly-review', label: 'Weekly Review', icon: CalendarCheck }, // Added Weekly Review
];

// Indicate persistence status (currently only local)
const isSynced = false; // Always false as there's no actual cloud sync yet.
const persistenceStatusText = isSynced ? 'Data Synced' : 'Data Saved Locally';
const persistenceTooltipText = isSynced
  ? 'Data is synced with the cloud database.'
  : "Data is saved in your browser's local storage. Cloud sync is not active.";


export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar(); // Get sidebar state

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
          {/* Save Status Indicator */}
           <Tooltip>
               <TooltipTrigger asChild>
                   {/* Use a div instead of Button for non-interactive trigger */}
                   <div className="flex items-center w-full justify-start px-2 py-1 cursor-default h-10">
                       {/* Conditionally render Cloud or CloudOff icon */}
                       {isSynced ? (
                           <Cloud className="h-[1.2rem] w-[1.2rem] text-accent flex-shrink-0" /> // Synced icon
                       ) : (
                           <CloudOff className="h-[1.2rem] w-[1.2rem] text-muted-foreground flex-shrink-0" /> // Local icon
                       )}
                       <span className="ml-2 text-xs text-muted-foreground group-data-[state=collapsed]:hidden">
                           {persistenceStatusText} {/* Dynamic text */}
                       </span>
                       <span className="sr-only">Data Save Status</span>
                   </div>
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
