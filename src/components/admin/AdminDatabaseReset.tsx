// src/components/admin/AdminDatabaseReset.tsx
/**
 * @file AdminDatabaseReset.tsx
 * @description Executive administrative console component providing database resets, logs purges, and automated realistic demo data seeding.
 */

'use client';

import React, { useState } from 'react';
import { executeFirestoreReset, ResetOptions, ResetResult } from '@/services/adminResetService';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Database, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Sparkles,
  ShieldAlert,
  Server,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AdminDatabaseReset() {
  const { user: currentAdmin } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<ResetOptions['mode']>('wipe_financial');
  const [seedDemo, setSeedDemo] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ResetResult | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (confirmText.toUpperCase() !== 'RESET') {
      toast({
        title: 'Safety Check Failed',
        description: "Please type 'RESET' exactly in the security field to authorize this action.",
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    setLastResult(null);

    try {
      const result = await executeFirestoreReset(
        { mode, seedDemo },
        currentAdmin?.email || 'admin@ifs-guru.com'
      );

      setLastResult(result);

      if (result.success) {
        toast({
          title: 'Database Reset Complete',
          description: result.message,
        });
        setConfirmText('');
      } else {
        toast({
          title: 'Database Reset Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Unexpected Error',
        description: err?.message || 'A critical error occurred during the database operation.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getModeDescription = () => {
    switch (mode) {
      case 'wipe_financial':
        return 'Wipes out all users financial transactions, debts, budget limits, assets, liabilities, and weekly reviews. Registered accounts, administrators, and audit logs are kept.';
      case 'wipe_logs':
        return 'Deletes all immutable operational, security, and usage-billing audit logs stored in the system. App user data is not affected.';
      case 'wipe_all':
        return 'Complete Factory Reset. Purges all financial records, audit logs, verifications, shared reviews, and user accounts (except yourself and the bootstrap super admin). Resets pricing rates to default.';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6" id="admin-db-reset-container">
      {/* Warning Box */}
      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400">
            DANGER ZONE: Irreversible Administrative Operations
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            These operations alter the state of Cloud Firestore. Cleared records are permanently purged and cannot be recovered. Ensure you have coordinated with any active review sessions before executing a purge.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form Panel */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Firestore Purge & Seed Control</h2>
          </div>

          <form onSubmit={handleReset} className="space-y-5">
            {/* Reset Scope Selector */}
            <div className="space-y-2">
              <Label htmlFor="reset-mode-selector" className="text-sm font-semibold">
                Reset Operation Scope
              </Label>
              <Select
                value={mode}
                onValueChange={(val) => setMode(val as ResetOptions['mode'])}
              >
                <SelectTrigger id="reset-mode-selector" className="h-10">
                  <SelectValue placeholder="Select reset scope..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wipe_financial">
                    Reset Financial Ledger & Sync Data Only
                  </SelectItem>
                  <SelectItem value="wipe_logs">
                    Clear Immutable System Audit Logs Only
                  </SelectItem>
                  <SelectItem value="wipe_all">
                    Full System Wipe & Factory Reset (Complete)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {getModeDescription()}
              </p>
            </div>

            {/* Seed Demo Data Switch */}
            <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                  <span className="text-sm font-semibold">Auto-Seed Realistic Demo Data</span>
                </div>
                <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
                  Automatically populates the database with realistic registered users, statutory auditors, transactions (NSE Safaricom shares, HELB debts, SACCO shares), budgets, and complete security audit trails.
                </p>
              </div>
              <Switch
                checked={seedDemo}
                onCheckedChange={setSeedDemo}
                id="toggle-seed-demo"
              />
            </div>

            {/* Safety Lock Input */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Label htmlFor="input-safety-lock" className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Safety Authorization Key
              </Label>
              <p className="text-xs text-muted-foreground">
                To confirm this destructive action, please type the word <span className="font-bold text-foreground select-none">RESET</span> below.
              </p>
              <Input
                id="input-safety-lock"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type 'RESET' to authorize"
                className="h-10 tracking-widest uppercase font-semibold"
                disabled={isSubmitting}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                variant={confirmText.toUpperCase() === 'RESET' ? 'destructive' : 'secondary'}
                disabled={isSubmitting || confirmText.toUpperCase() !== 'RESET'}
                className="h-10 gap-2 shrink-0 transition-all duration-200"
                id="btn-execute-db-reset"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isSubmitting ? 'Resetting Database...' : 'Authorize & Reset Database'}</span>
              </Button>
            </div>
          </form>
        </div>

        {/* Right Status / Output Metrics Panel */}
        <div className="p-6 rounded-2xl border border-border bg-card flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Operational Stats</h2>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upon successful execution of a database reset, the operation counts and items seeded will be rendered in real-time below.
            </p>

            {lastResult && (
              <div className="space-y-3 pt-2 border-t border-border" id="db-reset-summary-board">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Execution Complete</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Users Purged</span>
                    <span className="text-sm font-extrabold text-foreground">{lastResult.counts.usersDeleted}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Sub-Docs Purged</span>
                    <span className="text-sm font-extrabold text-foreground">{lastResult.counts.subDocsDeleted}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Audit Logs Purged</span>
                    <span className="text-sm font-extrabold text-foreground">{lastResult.counts.logsDeleted}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Reviews Purged</span>
                    <span className="text-sm font-extrabold text-foreground">{lastResult.counts.sharedReviewsDeleted}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Seeded Profiles</span>
                    <span className="text-sm font-extrabold text-primary">{lastResult.counts.seededUsers}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Seeded Records</span>
                    <span className="text-sm font-extrabold text-primary">{lastResult.counts.seededSubDocs}</span>
                  </div>
                </div>
              </div>
            )}

            {!lastResult && (
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-xl">
                <Database className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <span className="text-xs text-muted-foreground font-medium">No recent execution data available</span>
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground border-t border-border pt-4 mt-6">
            Authorized Agent UID: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{currentAdmin?.uid || 'anonymous'}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
