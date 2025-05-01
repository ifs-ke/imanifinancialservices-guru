
import React from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TransactionsProvider } from '@/contexts/TransactionsContext';
import { DebtProvider } from '@/contexts/DebtContext'; // Import the Debt provider
import { StatementProvider } from '@/contexts/StatementContext'; // Import the Statement provider


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
     <TransactionsProvider>
       <DebtProvider>
         <StatementProvider> {/* Wrap with StatementProvider */}
           <>
             <Sidebar side="left" variant="sidebar" collapsible="icon">
               <AppSidebar />
               <SidebarRail />
             </Sidebar>
             <SidebarInset>{children}</SidebarInset>
           </>
         </StatementProvider>
       </DebtProvider>
     </TransactionsProvider>
  );
}
