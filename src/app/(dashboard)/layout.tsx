
import React from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TransactionsProvider } from '@/contexts/TransactionsContext'; // Import the provider

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TransactionsProvider> {/* Wrap the layout content with the provider */}
      <>
        <Sidebar side="left" variant="sidebar" collapsible="icon">
          <AppSidebar />
          <SidebarRail />
        </Sidebar>
        <SidebarInset>{children}</SidebarInset>
      </>
    </TransactionsProvider>
  );
}
