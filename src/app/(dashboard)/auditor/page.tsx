// src/app/(dashboard)/auditor/page.tsx
/**
 * @file page.tsx (Auditor Dashboard)
 * @description Dedicated regulatory auditor dashboard.
 * Houses Kenya DPA 2019 Compliance Overview, Read-Only Client Inspection, and Audit Verification Stamps.
 */

'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AuditorComplianceOverview } from '@/components/auditor/AuditorComplianceOverview';
import { AuditorClientInspection } from '@/components/auditor/AuditorClientInspection';
import { AuditorVerificationSignoff } from '@/components/auditor/AuditorVerificationSignoff';
import { 
  ShieldCheck, 
  Scale, 
  Eye, 
  Stamp, 
  FileCheck2,
  Lock
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function AuditorDashboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('inspection');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10" id="page-auditor-dashboard">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-card to-amber-500/5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold text-xs px-2.5 py-0.5">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Regulatory Audit Console
            </Badge>
            <span className="text-xs text-muted-foreground">Kenya DPA 2019 Certified</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Auditor Compliance & Financial Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{user?.email}</span>. Inspect client portfolios in strictly read-only mode, detect balance anomalies, and affix certified audit sign-off stamps.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-card border border-border text-xs text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-500" /> Read-Only Shield
            </div>
            <span>Mutation Disabled</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-xl h-11 bg-muted/60 p-1 border border-border">
          <TabsTrigger value="inspection" className="gap-2 text-xs sm:text-sm" id="tab-auditor-inspection">
            <Eye className="w-4 h-4" />
            <span>Client Inspection</span>
          </TabsTrigger>
          <TabsTrigger value="signoff" className="gap-2 text-xs sm:text-sm" id="tab-auditor-signoff">
            <Stamp className="w-4 h-4" />
            <span>Audit Stamps</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-2 text-xs sm:text-sm" id="tab-auditor-compliance">
            <Scale className="w-4 h-4" />
            <span>DPA 2019 Status</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inspection" className="outline-none">
          <AuditorClientInspection />
        </TabsContent>

        <TabsContent value="signoff" className="outline-none">
          <AuditorVerificationSignoff />
        </TabsContent>

        <TabsContent value="compliance" className="outline-none">
          <AuditorComplianceOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
