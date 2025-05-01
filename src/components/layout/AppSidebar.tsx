
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarContent,
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
  CircleDollarSign, // Changed from Landmark for Debts
  Menu,
  Settings,
  Landmark, // Keep for App title
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText, secondaryIcon: FileUp },
  { href: '/debt', label: 'Debts', icon: CircleDollarSign }, // Added Debts link
  { href: '/statements', label: 'Statements', icon: FileText },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile } = useSidebar();

  return (
    <>
      <SidebarHeader className="flex items-center justify-between p-2">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Landmark className="w-6 h-6 text-primary" />
          <span className="font-semibold text-lg text-foreground">
            Debt Conqueror
          </span>
        </Link>
        {isMobile && (
          <Button variant="ghost" size="icon" asChild>
            <SidebarTrigger>
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
          </Button>
        )}
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-y-auto p-2">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref legacyBehavior>
                <SidebarMenuButton
                  asChild
                   // Check if the current path starts with the item's href
                   // This makes parent routes active when viewing sub-routes (like /transactions/import)
                  isActive={pathname.startsWith(item.href)}
                  tooltip={item.label}
                >
                  <a>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                     {/* Render secondary icon if present */}
                     {item.secondaryIcon && (
                       <item.secondaryIcon className="ml-auto h-3 w-3 text-muted-foreground group-data-[state=collapsed]:hidden" />
                    )}
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {/* Optional Footer for settings or user profile */}
      {/* <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/settings" passHref legacyBehavior>
              <SidebarMenuButton asChild tooltip="Settings">
                <a>
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </a>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter> */}
    </>
  );
}
