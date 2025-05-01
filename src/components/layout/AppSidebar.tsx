
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
  TrendingDown,
  TrendingUp, // Icon for Income
  Menu,
  Settings,
  Landmark,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle'; // Import ThemeToggle

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText, secondaryIcon: FileUp },
  { href: '/income', label: 'Income', icon: TrendingUp }, // Added Income link
  { href: '/expenses', label: 'Expenses', icon: TrendingDown },
  { href: '/debt', label: 'Debts', icon: Coins },
  { href: '/statements', label: 'Statements', icon: FileText },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar(); // Get sidebar state

  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-2">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Landmark className="w-6 h-6 text-primary" />
          {/* Conditionally render text based on sidebar state */}
          {state === 'expanded' && (
            <span className="font-semibold text-lg text-foreground">
              Debt Conqueror
            </span>
          )}
        </Link>
        {/* Hamburger menu for mobile */}
        {isMobile && (
          <Button variant="ghost" size="icon" asChild>
            <SidebarTrigger>
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
          </Button>
        )}
        {/* Desktop collapse trigger */}
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
                {/* Use asChild on SidebarMenuButton, wrap content with Link */}
                <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.label}
                    variant={isActive ? "secondary" : "ghost"} // Use secondary variant when active
                >
                    <Link href={item.href}>
                    <item.icon className="h-4 w-4" />
                    {/* Content inside the Link */}
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
       <SidebarFooter className="p-2 mt-auto">
          <ThemeToggle /> {/* Add ThemeToggle here */}
      </SidebarFooter>
    </>
  );
}
