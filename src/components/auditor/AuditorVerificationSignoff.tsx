// src/components/auditor/AuditorVerificationSignoff.tsx
/**
 * @file AuditorVerificationSignoff.tsx
 * @description Formal audit sign-off and verification stamp console for certified auditors.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
  getAuditVerifications, 
  createAuditVerification, 
  AuditVerificationRecord 
} from '@/services/auditorService';
import { getAllUsers } from '@/services/adminUserService';
import { AppUserProfile } from '@/lib/roles';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  FileCheck, 
  Stamp, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Plus, 
  RefreshCw,
  Search,
  Scale
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AuditorVerificationSignoff() {
  const { user: currentAuditor } = useAuth();
  const { toast } = useToast();

  const [verifications, setVerifications] = useState<AuditVerificationRecord[]>([]);
  const [clients, setClients] = useState<AppUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [selectedClientId, setSelectedClientId] = useState('');
  const [periodKey, setPeriodKey] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [status, setStatus] = useState<'VERIFIED' | 'FLAGGED' | 'PENDING_CLARIFICATION'>('VERIFIED');
  const [notes, setNotes] = useState('');
  const [dpaComplianceConfirmed, setDpaComplianceConfirmed] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [verifList, allUsers] = await Promise.all([
        getAuditVerifications(),
        getAllUsers(),
      ]);
      setVerifications(verifList);
      const clientList = allUsers.filter(u => u.role === 'client');
      setClients(clientList);
      if (clientList.length > 0 && !selectedClientId) {
        setSelectedClientId(clientList[0].uid);
      }
    } catch (err) {
      toast({
        title: 'Error loading verifications',
        description: 'Failed to retrieve audit sign-off registry.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSignoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      toast({ title: 'Select Client', description: 'Please choose a client to sign off.', variant: 'destructive' });
      return;
    }

    const client = clients.find(c => c.uid === selectedClientId);
    if (!client) return;

    setIsSubmitting(true);
    try {
      await createAuditVerification({
        auditorId: currentAuditor?.uid || 'auditor',
        auditorEmail: currentAuditor?.email || 'auditor@ifs-guru.com',
        clientId: client.uid,
        clientEmail: client.email,
        periodKey,
        status,
        notes,
        dpaComplianceConfirmed,
      });

      toast({
        title: 'Audit Stamp Issued',
        description: `Successfully signed off period ${periodKey} for ${client.email} with status '${status}'.`,
      });

      setIsDialogOpen(false);
      setNotes('');
      await loadData();
    } catch (err: any) {
      toast({
        title: 'Sign-off Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: AuditVerificationRecord['status']) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs font-semibold">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
          </Badge>
        );
      case 'FLAGGED':
        return (
          <Badge variant="destructive" className="text-xs font-semibold">
            <AlertTriangle className="w-3 h-3 mr-1" /> Flagged
          </Badge>
        );
      case 'PENDING_CLARIFICATION':
      default:
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs font-semibold">
            <Clock className="w-3 h-3 mr-1" /> Pending Clarification
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6" id="auditor-verification-signoff-section">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Stamp className="w-5 h-5 text-primary" />
            Formal Audit Sign-Offs & Compliance Stamps
          </h2>
          <p className="text-sm text-muted-foreground">
            Issue certified periodic audit endorsements, flag financial irregularities, and record compliance seals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button size="sm" onClick={() => setIsDialogOpen(true)} id="btn-open-signoff-dialog">
            <Plus className="w-4 h-4 mr-1.5" />
            Issue New Audit Stamp
          </Button>
        </div>
      </div>

      {/* Verifications Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left" id="table-audit-verifications">
            <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3.5 font-semibold">Stamp Date</th>
                <th className="px-4 py-3.5 font-semibold">Period</th>
                <th className="px-4 py-3.5 font-semibold">Client</th>
                <th className="px-4 py-3.5 font-semibold">Auditor</th>
                <th className="px-4 py-3.5 font-semibold">Audit Status</th>
                <th className="px-4 py-3.5 font-semibold">DPA 2019</th>
                <th className="px-4 py-3.5 font-semibold">Auditor Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    <RefreshCw className="w-4 h-4 mx-auto animate-spin mb-1.5" />
                    Loading audit verification ledger...
                  </td>
                </tr>
              ) : verifications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No audit sign-off stamps recorded yet. Click &ldquo;Issue New Audit Stamp&rdquo; to seal a client period.
                  </td>
                </tr>
              ) : (
                verifications.map(v => (
                  <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(v.timestamp).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">
                      {v.periodKey}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{v.clientEmail}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{v.clientId}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.auditorEmail}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(v.status)}
                    </td>
                    <td className="px-4 py-3">
                      {v.dpaComplianceConfirmed ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                          Confirmed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px]">
                          Unconfirmed
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                      {v.notes || 'Routine periodic compliance sign-off.'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Sign-Off Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stamp className="w-5 h-5 text-primary" />
              Issue Periodic Audit Verification Stamp
            </DialogTitle>
            <DialogDescription>
              Record an official regulatory sign-off for a client accounting period.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSignoff} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="signoff-client">Client Account</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger id="signoff-client">
                  <SelectValue placeholder="Choose client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.uid} value={c.uid}>
                      {c.displayName} ({c.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="signoff-period">Accounting Period</Label>
                <Input 
                  id="signoff-period"
                  placeholder="YYYY-MM (e.g. 2026-09)"
                  value={periodKey}
                  onChange={e => setPeriodKey(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signoff-status">Verification Status</Label>
                <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                  <SelectTrigger id="signoff-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VERIFIED">Verified (Clean)</SelectItem>
                    <SelectItem value="FLAGGED">Flagged (Discrepancy)</SelectItem>
                    <SelectItem value="PENDING_CLARIFICATION">Pending Clarification</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signoff-notes">Auditor Findings & Observations</Label>
              <Textarea 
                id="signoff-notes"
                placeholder="Enter audit observations, sample testing conclusions, or justification for flags..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-start gap-2.5">
              <Checkbox 
                id="signoff-dpa"
                checked={dpaComplianceConfirmed}
                onCheckedChange={checked => setDpaComplianceConfirmed(!!checked)}
                className="mt-0.5"
              />
              <Label htmlFor="signoff-dpa" className="text-xs text-muted-foreground leading-normal cursor-pointer">
                I confirm that client records adhere to Kenya Data Protection Act (DPA 2019) requirements and that sample reconciliation was conducted in read-only confidentiality.
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} id="btn-submit-audit-stamp">
                {isSubmitting ? 'Recording Stamp...' : 'Affix Audit Stamp'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AuditorVerificationSignoff;
