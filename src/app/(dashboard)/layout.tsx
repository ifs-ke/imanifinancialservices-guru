// src/app/(dashboard)/layout.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
} from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
// import { useAuth } from '@clerk/nextjs/client'; // Clerk disabled
// import { redirect } from 'next/navigation'; // Clerk disabled, no redirect needed here
import { useSyncManager } from '@/hooks/useSyncManager';
import { Skeleton } from '@/components/ui/skeleton';
import FloatingChatButton from '@/components/layout/FloatingChatButton';
import { useBudgetNotifications } from '@/services/notificationService';
import DataSyncMismatchDialog from '@/components/layout/DataSyncMismatchDialog';
import { logInfo, logWarn, logError } from '@/lib/logger';

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isClient, setIsClient] = useState(false);
  const [isMismatchDialogOpen, setIsMismatchDialogOpen] = useState(false);

