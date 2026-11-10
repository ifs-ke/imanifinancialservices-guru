/**
 * @file SecurityAuditDialog.tsx
 * @description Comprehensive, interactive security audit dialog modal.
 * Displays live client-side security verification, multi-tenant isolation status,
 * storage sanitization metrics, and cryptographic ledger health.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  Lock,
  Database,
  Layers,
  FileCheck2,
  WifiOff,
  User,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { runComprehensiveSecurityAudit, type SecurityAuditReport, type SecurityAuditCheck } from '@/lib/securityAudit';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface SecurityAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SecurityAuditDialog: React.FC<SecurityAuditDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { currentUser, userId, isGuest: isGuestFromAuth } = useAuth();
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(100);
  const [auditReport, setAuditReport] = useState<SecurityAuditReport | null>(null);

  const executeAudit = useCallback(() => {
    setIsScanning(true);
    setScanProgress(20);

    const timer1 = setTimeout(() => setScanProgress(60), 150);
    const timer2 = setTimeout(() => {
      setScanProgress(100);

      // Accurately resolve active authenticated user ID or guest session UID
      const activeUserId =
        currentUser?.uid ||
        currentUser?.id ||
        userId ||
        currentUser?.email ||
        (isGuestFromAuth ? `guest_session` : 'anonymous_user');

      const isGuest =
        isGuestFromAuth ||
        currentUser?.isGuest ||
        currentUser?.isAnonymous ||
        (typeof activeUserId === 'string' && activeUserId.startsWith('guest_')) ||
        activeUserId === 'guest_session';

      const userRole = currentUser?.role || (isGuest ? 'guest' : 'client');

      const report = runComprehensiveSecurityAudit({
        currentUserId: activeUserId,
        isGuest,
        userRole,
        autoRemediate: true,
      });

      setAuditReport(report);
      setIsScanning(false);
    }, 350);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [currentUser, userId, isGuestFromAuth]);

  useEffect(() => {
    if (open) {
      executeAudit();
    }
  }, [open, executeAudit]);

  const handleDownloadReport = () => {
    if (!auditReport) return;
    try {
      const dataStr =
        'data:text/json;charset=utf-8,' +
        encodeURIComponent(JSON.stringify(auditReport, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute(
        'download',
        `security-audit-${auditReport.tenantContext.currentUserId}-${Date.now()}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast({
        title: 'Audit Report Exported',
        description: 'Security audit report saved to JSON.',
      });
    } catch {
      toast({
        title: 'Export Failed',
        description: 'Could not export audit log.',
        variant: 'destructive',
      });
    }
  };

  const getCheckIcon = (check: SecurityAuditCheck) => {
    if (check.status === 'passed') {
      return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
    }
    if (check.status === 'warning') {
      return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    }
    return <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
  };

  const getCategoryIcon = (category: SecurityAuditCheck['category']) => {
    switch (category) {
      case 'tenant_isolation':
        return <Layers className="h-3.5 w-3.5 text-muted-foreground" />;
      case 'storage_encryption':
        return <Lock className="h-3.5 w-3.5 text-muted-foreground" />;
      case 'access_control':
        return <Shield className="h-3.5 w-3.5 text-muted-foreground" />;
      case 'ledger_integrity':
        return <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />;
      case 'offline_boundary':
        return <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />;
      default:
        return <Database className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-5 overflow-hidden">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold tracking-tight">
                  Security & Data Isolation Audit
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Tenant verification, storage sanitization, and cryptographic ledger scan.
                </DialogDescription>
              </div>
            </div>

            {auditReport && (
              <Badge
                variant={
                  auditReport.overallStatus === 'passed'
                    ? 'default'
                    : auditReport.overallStatus === 'warning'
                    ? 'secondary'
                    : 'destructive'
                }
                className={cn(
                  'px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
                  auditReport.overallStatus === 'passed' &&
                    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                )}
              >
                {auditReport.overallStatus === 'passed'
                  ? `${auditReport.healthScore}% SECURE`
                  : auditReport.overallStatus === 'warning'
                  ? `${auditReport.healthScore}% REVIEW`
                  : 'BREACH DETECTED'}
              </Badge>
            )}
          </div>

          {isScanning && (
            <div className="pt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Scanning local partitions & storage...</span>
                <span>{scanProgress}%</span>
              </div>
              <Progress value={scanProgress} className="h-1" />
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 pr-1 py-3 space-y-3">
          {/* Uncluttered Session Tenant Card */}
          {auditReport && (
            <div className="p-3 rounded-xl bg-muted/20 border border-border/50 space-y-2 mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {currentUser?.fullName || currentUser?.firstName || currentUser?.email || auditReport.tenantContext.currentUserId}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] font-medium px-2 py-0.5 border',
                      auditReport.tenantContext.isGuest
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full mr-1 inline-block',
                        auditReport.tenantContext.isGuest ? 'bg-amber-500' : 'bg-emerald-500'
                      )}
                    />
                    {auditReport.tenantContext.isGuest ? 'Guest Sandbox' : 'Authenticated User'}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-mono capitalize px-2 py-0.5">
                    {auditReport.tenantContext.role}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px] pt-1.5 border-t border-border/30 text-muted-foreground">
                <div>
                  Tenant ID: <span className="font-mono font-medium text-foreground">{auditReport.tenantContext.currentUserId}</span>
                </div>
                <div>
                  Records Scanned: <span className="font-semibold text-foreground">{auditReport.scannedCounts.total}</span>
                </div>
                <div>
                  Auto-Adopted: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{auditReport.remediatedCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Clean Audit Checks List */}
          <div className="space-y-2">
            {auditReport?.checks.map((check) => (
              <div
                key={check.id}
                className={cn(
                  'p-3 rounded-lg border transition-all text-xs',
                  check.status === 'passed' && 'border-border/50 bg-card/60',
                  check.status === 'warning' && 'border-amber-500/30 bg-amber-500/5',
                  check.status === 'failed' && 'border-destructive/30 bg-destructive/5'
                )}
              >
                <div className="flex items-start gap-2.5">
                  {getCheckIcon(check)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {getCategoryIcon(check.category)}
                      <span className="font-semibold text-foreground text-xs">
                        {check.title}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 leading-normal">
                      {check.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Minimalist Scanned Breakdown */}
          {auditReport && (
            <div className="mt-3 p-2.5 rounded-lg border border-border/30 bg-muted/10 text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">Financial Ledger:</span>
              <div className="flex flex-wrap gap-3">
                <span>Transactions: <strong className="text-foreground">{auditReport.scannedCounts.transactions}</strong></span>
                <span>Debts: <strong className="text-foreground">{auditReport.scannedCounts.debts}</strong></span>
                <span>Budgets: <strong className="text-foreground">{auditReport.scannedCounts.budgets}</strong></span>
                <span>Assets: <strong className="text-foreground">{auditReport.scannedCounts.assets}</strong></span>
                <span>Investments: <strong className="text-foreground">{auditReport.scannedCounts.investments}</strong></span>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={executeAudit}
              disabled={isScanning}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isScanning && 'animate-spin')} />
              Re-Scan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadReport}
              disabled={!auditReport}
              className="gap-1.5 text-xs h-8"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>

          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 px-4"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
