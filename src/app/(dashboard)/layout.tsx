
import React from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle'; // Import ThemeToggle


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Remove Context Providers - Zustand stores are accessed directly via hooks
    <>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        <AppSidebar />
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {/* Optionally add a header within the inset area */}
        {/* <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4">
          <h1 className="text-xl font-semibold">Debt Conqueror</h1>
          <div className="ml-auto">
            <ThemeToggle /> {/* Example: Add ThemeToggle here too/instead */}
          {/* </div>
        </header> */}
        {children}
      </SidebarInset>
    </>
  );
}
