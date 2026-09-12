// src/components/auditor/AuditorComplianceOverview.tsx
/**
 * @file AuditorComplianceOverview.tsx
 * @description Regulatory compliance dashboard for financial auditors (Kenya DPA 2019, ODPC guidelines, data minimization).
 */

'use client';

import React from 'react';
import { 
  ShieldCheck, 
  FileCheck2, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Scale, 
  Building2,
  Database
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export function AuditorComplianceOverview() {
  return (
    <div className="space-y-6" id="auditor-compliance-overview-section">
      {/* Statutory Header */}
      <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-foreground text-lg">Kenya Data Protection Act (DPA 2019) Compliance</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Official statutory governance status verified under Office of the Data Protection Commissioner (ODPC) guidelines.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge className="bg-emerald-600 text-white font-semibold px-3 py-1 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> ODPC Compliant
          </Badge>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs">
            Zero-Trust RBAC Active
          </Badge>
        </div>
      </div>

      {/* Compliance Pillars Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">1. Access Control & Segregation</span>
            <Lock className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-foreground">Three-Tiered RBAC</div>
            <p className="text-xs text-muted-foreground">
              Strict cryptographic separation between Admin, Auditor, and Client accounts. Auditors maintain absolute read-only rights.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Enforced by Cloud Firestore Rules
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">2. Data Minimization & Privacy</span>
            <Database className="w-4 h-4 text-sky-500" />
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-foreground">Isolated Subcollections</div>
            <p className="text-xs text-muted-foreground">
              Client financial records (transactions, debts, investments) partitioned per UID to eliminate multi-tenant leakage.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Section 25 DPA 2019 Principles
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">3. Immutable Audit Trails</span>
            <FileCheck2 className="w-4 h-4 text-purple-500" />
          </div>
          <div className="space-y-1">
            <div className="text-xl font-bold text-foreground">Write-Once Logging</div>
            <p className="text-xs text-muted-foreground">
              Forensic audit logs record every authentication, authorization shift, data sync, and pay-per-use invoice event.
            </p>
          </div>
          <div className="pt-2 flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Non-repudiation verified
          </div>
        </div>
      </div>

      {/* Statutory Audit Readiness Checklist */}
      <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Auditor Statutory Verification Checklist
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-foreground">Data Subject Rights (Access & Export)</div>
              <p className="text-muted-foreground">Clients can export their entire financial ledger to CSV and JSON at any time.</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-foreground">Audit Non-Interference Mandate</div>
              <p className="text-muted-foreground">Auditors can inspect client ledgers but are forbidden by security rules from modifying data.</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-foreground">Encryption at Rest & in Transit</div>
              <p className="text-muted-foreground">All client financial records are encrypted with AES-256 and transmitted over TLS 1.3.</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-foreground">Pay-Per-Use Transparent Rate Card</div>
              <p className="text-muted-foreground">Pricing is publicly disclosed with automated unit metrics avoiding hidden client fees.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuditorComplianceOverview;
