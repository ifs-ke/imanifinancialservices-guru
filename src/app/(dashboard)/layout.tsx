
import React from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ThemeToggle } from '@/components/ui/ThemeToggle'; // Import ThemeToggle
import { auth } from '@clerk/nextjs/server'; // Import auth for server-side check
import { redirect } from 'next/navigation';


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
   // Server-side auth check (optional, middleware already protects)
   const { userId } = auth();
   if (!userId) {
       redirect('/sign-in'); // Redirect if not logged in
   }

  return (
    // Remove Context Providers - Zustand stores are accessed directly via hooks
    <>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        <AppSidebar />
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {children}
      </SidebarInset>
    </>
  );
}
