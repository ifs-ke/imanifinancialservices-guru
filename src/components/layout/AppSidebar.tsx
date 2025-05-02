
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { UserButton } from '@clerk/nextjs'; // Import UserButton
import { Separator } from '../ui/separator';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText, secondaryIcon: FileUp },
  { href: '/income-expenses', label: 'Income/Expenses', icon: TrendingUp }, // Updated: Combined Income/Expenses link
  { href: '/debt', label: 'Debts', icon: Coins },
  { href: '/statements', label: 'Statements', icon: FileText },
  { href: '/budget', label: 'Budget', icon: PieChart },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar(); // Get sidebar state

  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-2 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0">
          <Landmark className="w-6 h-6 text-primary" />
          {state === 'expanded' && (
            <span className="font-semibold text-lg text-sidebar-foreground whitespace-nowrap">
              Debt Conqueror
            </span>
          )}
        </Link>
        {isMobile && (
          <SidebarTrigger asChild>
              <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
              </Button>
          </SidebarTrigger>
        )}
        {!isMobile && (
           <SidebarTrigger asChild>
               <Button variant="ghost" size="icon" className="ml-auto">
                   <Menu className="h-5 w-5" />
               </Button>
           </SidebarTrigger>
        )}
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
          <div className={cn("flex items-center", state === 'collapsed' ? 'justify-center' : 'justify-between')}>
            <div className={cn(state === 'collapsed' ? 'scale-0' : 'scale-100', 'transition-transform duration-200 ease-in-out')}>
                <UserButton afterSignOutUrl="/sign-in" />
            </div>
             {state === 'expanded' && (
                 <span className="text-xs text-muted-foreground ml-2">Account</span>
             )}
         </div>
          <Separator className="my-1"/>
          <ThemeToggle />
      </SidebarFooter>
    </>
  );
}
