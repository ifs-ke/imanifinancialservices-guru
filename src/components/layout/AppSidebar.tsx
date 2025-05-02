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
  PieChart, // Added Budget icon
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
  { href: '/budget', label: 'Budget', icon: PieChart }, // Added Budget link
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, state } = useSidebar(); // Get sidebar state

  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-2 border-b border-sidebar-border"> {/* Added border */}
        <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0"> {/* Added flex-shrink-0 */}
          <Landmark className="w-6 h-6 text-primary" />
          {/* Conditionally render text based on sidebar state */}
          {state === 'expanded' && (
            <span className="font-semibold text-lg text-sidebar-foreground whitespace-nowrap"> {/* Added whitespace-nowrap */}
              Debt Conqueror
            </span>
          )}
        </Link>
        {/* Hamburger menu for mobile */}
        {isMobile && (
          <SidebarTrigger asChild>
              <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
              </Button>
          </SidebarTrigger>
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
                    variant={isActive ? "active" : "ghost"} // Use custom 'active' variant styling defined in sidebar.tsx
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
       <SidebarFooter className="p-2 mt-auto border-t border-sidebar-border"> {/* Added border */}
          <ThemeToggle /> {/* Add ThemeToggle here */}
      </SidebarFooter>
    </>
  );
}
