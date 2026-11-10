// src/app/(dashboard)/admin/page.tsx
/**
 * @file page.tsx (Admin Dashboard)
 * @description Dedicated executive administrator governance dashboard.
 * Houses User Management, Role Assignments, Application Log Reviews, Pay-Per-Use Tracking, and Database Maintenance.
 */

'use client';

import React, { useState } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/context/AuthContext';
import { AdminUserManagement } from '@/components/admin/AdminUserManagement';
import { AdminLogReviews } from '@/components/admin/AdminLogReviews';
import { AdminPayPerUseTracking } from '@/components/admin/AdminPayPerUseTracking';
import { AdminDatabaseReset } from '@/components/admin/AdminDatabaseReset';
import { 
  ShieldCheck, 
  Users, 
  ClipboardList, 
  Coins, 
  Layers,
  Crown,
  Lock,
  Database
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function AdminDashboardPage() {
  const { user, isAdmin, isAuditor, isLoaded } = useAuth();

  if (!isLoaded) return <div className="flex items-center justify-center min-h-[50vh]"><LoadingSpinner size={48} text="Authenticating..." /></div>;
  if (!isAdmin) return <div className="p-8 text-center text-destructive">Unauthorized access</div>;
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10" id="page-admin-dashboard">
      {/* Top Banner */}
      <div className="mt-2 p-4 rounded-2xl border-0 bg-gradient-to-r from-card to-primary/5 shadow-none flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            System Administration
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{user?.email}</span>. Manage platform users, assign roles, inspect forensic audit logs, monitor pay-per-use billing telemetry, and perform database maintenance.
          </p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl h-11 bg-muted/60 p-1 border border-border">
          <TabsTrigger value="users" className="gap-2 text-xs sm:text-sm" id="tab-admin-users">
            <Users className="w-4 h-4" />
            <span>Users & Roles</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2 text-xs sm:text-sm" id="tab-admin-logs">
            <ClipboardList className="w-4 h-4" />
            <span>Log Reviews</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2 text-xs sm:text-sm" id="tab-admin-billing">
            <Coins className="w-4 h-4" />
            <span>Pay-Per-Use</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2 text-xs sm:text-sm" id="tab-admin-database">
            <Database className="w-4 h-4" />
            <span>DB Maintenance</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="outline-none">
          <AdminUserManagement />
        </TabsContent>

        <TabsContent value="logs" className="outline-none">
          <AdminLogReviews />
        </TabsContent>

        <TabsContent value="billing" className="outline-none">
          <AdminPayPerUseTracking />
        </TabsContent>

        <TabsContent value="database" className="outline-none">
          <AdminDatabaseReset />
        </TabsContent>
      </Tabs>
    </div>
  );
}
