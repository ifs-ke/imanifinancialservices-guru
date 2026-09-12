// src/app/(dashboard)/admin/page.tsx
/**
 * @file page.tsx (Admin Dashboard)
 * @description Dedicated executive administrator governance dashboard.
 * Houses User Management, Role Assignments, Application Log Reviews, and Pay-Per-Use Tracking.
 */

'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AdminUserManagement } from '@/components/admin/AdminUserManagement';
import { AdminLogReviews } from '@/components/admin/AdminLogReviews';
import { AdminPayPerUseTracking } from '@/components/admin/AdminPayPerUseTracking';
import { 
  ShieldCheck, 
  Users, 
  ClipboardList, 
  Coins, 
  Layers,
  Crown,
  Lock
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10" id="page-admin-dashboard">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl border border-primary/20 bg-gradient-to-r from-card to-primary/5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs px-2.5 py-0.5">
              <Crown className="w-3.5 h-3.5 mr-1" /> Super Admin Control Console
            </Badge>
            <span className="text-xs text-muted-foreground">Tier 1 Clearance</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            System Administration & Governance
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{user?.email}</span>. Manage platform users, assign roles, inspect forensic audit logs, and monitor pay-per-use billing telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-card border border-border text-xs text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-primary" /> Active Enforcer
            </div>
            <span>Firestore RBAC v2.0</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-xl h-11 bg-muted/60 p-1 border border-border">
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
      </Tabs>
    </div>
  );
}
