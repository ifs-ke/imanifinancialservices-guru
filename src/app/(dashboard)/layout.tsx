
import React from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TransactionsProvider } from '@/contexts/TransactionsContext';
import { DebtProvider } from '@/contexts/DebtContext'; // Import the Debt provider

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TransactionsProvider>
      <DebtProvider> {/* Wrap with DebtProvider */}
        <>
          <Sidebar side="left" variant="sidebar" collapsible="icon">
            <AppSidebar />
            <SidebarRail />
          </Sidebar>
          <SidebarInset>{children}</SidebarInset>
        </>
      </DebtProvider>
    </TransactionsProvider>
  );
}
