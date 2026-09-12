// src/components/admin/AdminPayPerUseTracking.tsx
/**
 * @file AdminPayPerUseTracking.tsx
 * @description Administrative pay-per-use usage cost tracking, rate card configuration, and user billing ledger.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
  getPricingRateCard, 
  updatePricingRateCard, 
  PricingRateCard, 
  DEFAULT_RATE_CARD,
  resetUserBillingCycle,
  trackUserUsage
} from '@/lib/payPerUse';
import { getAllUsers } from '@/services/adminUserService';
import { AppUserProfile } from '@/lib/roles';
import { useToast } from '@/hooks/use-toast';
import { 
  Coins, 
  Settings2, 
  TrendingUp, 
  Database, 
  HardDrive, 
  Sparkles, 
  Activity, 
  RotateCcw, 
  FileText, 
  Save, 
  AlertCircle,
  CheckCircle2,
  Receipt,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function AdminPayPerUseTracking() {
  const { toast } = useToast();

  const [rateCard, setRateCard] = useState<PricingRateCard>(DEFAULT_RATE_CARD);
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Invoice Preview State
  const [invoiceUser, setInvoiceUser] = useState<AppUserProfile | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rates, userList] = await Promise.all([
        getPricingRateCard(),
        getAllUsers(),
      ]);
      setRateCard(rates);
      setUsers(userList);
    } catch (err) {
      toast({
        title: 'Error loading billing data',
        description: 'Failed to retrieve usage and pricing metrics.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveRateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingRates(true);
    try {
      const saved = await updatePricingRateCard(rateCard);
      setRateCard(saved);
      toast({
        title: 'Rate Card Updated',
        description: 'Pay-per-use unit pricing has been updated across the platform.',
      });
    } catch (err: any) {
      toast({
        title: 'Save Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingRates(false);
    }
  };

  const handleResetCycle = async (user: AppUserProfile) => {
    try {
      await resetUserBillingCycle(user.uid);
      toast({
        title: 'Billing Cycle Reset',
        description: `Reset usage counters and incurred cost for ${user.email}.`,
      });
      await loadData();
    } catch (err: any) {
      toast({
        title: 'Reset Failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const handleSimulateUsage = async (user: AppUserProfile) => {
    try {
      await trackUserUsage(user.uid, 'write', 15);
      await trackUserUsage(user.uid, 'read', 60);
      await trackUserUsage(user.uid, 'ai_forecast', 1);
      toast({
        title: 'Simulated Usage Applied',
        description: `Recorded 15 writes, 60 reads, and 1 AI projection for ${user.email}.`,
      });
      await loadData();
    } catch (err: any) {
      toast({
        title: 'Simulation Failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  // Metrics Aggregations
  const totalPlatformCostKes = users.reduce((acc, u) => acc + (u.incurredCostKes || 0), 0);
  const totalReads = users.reduce((acc, u) => acc + (u.totalReads || 0), 0);
  const totalWrites = users.reduce((acc, u) => acc + (u.totalWrites || 0), 0);
  const totalStorageKb = users.reduce((acc, u) => acc + (u.totalStorageKb || 0), 0);
  const totalAiForecasts = users.reduce((acc, u) => acc + (u.totalAiForecasts || 0), 0);

  const filteredUsers = users.filter(u =>
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6" id="admin-pay-per-use-section">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="w-5 h-5 text-primary" />
            Pay-Per-Use Tracking & Usage Cost Billing
          </h2>
          <p className="text-sm text-muted-foreground">
            Track user consumption across database operations, storage, and AI calls with automated cost computation.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <Activity className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </Button>
      </div>

      {/* Aggregated Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Total Billed Cost</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {formatCurrency(totalPlatformCostKes)}
          </div>
          <p className="text-xs text-muted-foreground">Accrued across {users.length} registered accounts</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Database Operations</span>
            <Database className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {(totalReads + totalWrites).toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            {totalReads.toLocaleString()} reads • {totalWrites.toLocaleString()} writes
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Storage Consumption</span>
            <HardDrive className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {(totalStorageKb / 1024).toFixed(2)} MB
          </div>
          <p className="text-xs text-muted-foreground">{totalStorageKb.toLocaleString()} KB indexed Firestore data</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">AI Forecasting Runs</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {totalAiForecasts.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">Investment projections computed</p>
        </div>
      </div>

      {/* Rate Card Configuration Card */}
      <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">Global Pay-Per-Use Rate Card (KES)</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            Last modified: {new Date(rateCard.updatedAt || Date.now()).toLocaleDateString()}
          </span>
        </div>

        <form onSubmit={handleSaveRateCard} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rate-read" className="text-xs">Firestore Read (KES)</Label>
              <Input 
                id="rate-read"
                type="number"
                step="0.005"
                min="0.001"
                value={rateCard.readCostKes}
                onChange={e => setRateCard({ ...rateCard, readCostKes: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate-write" className="text-xs">Firestore Write (KES)</Label>
              <Input 
                id="rate-write"
                type="number"
                step="0.01"
                min="0.001"
                value={rateCard.writeCostKes}
                onChange={e => setRateCard({ ...rateCard, writeCostKes: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate-storage" className="text-xs">Storage per MB/Mo (KES)</Label>
              <Input 
                id="rate-storage"
                type="number"
                step="0.05"
                min="0.01"
                value={rateCard.storageMbMonthKes}
                onChange={e => setRateCard({ ...rateCard, storageMbMonthKes: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate-api" className="text-xs">API / Sync Event (KES)</Label>
              <Input 
                id="rate-api"
                type="number"
                step="0.05"
                min="0.01"
                value={rateCard.apiCallCostKes}
                onChange={e => setRateCard({ ...rateCard, apiCallCostKes: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate-ai" className="text-xs">AI Forecast Run (KES)</Label>
              <Input 
                id="rate-ai"
                type="number"
                step="0.5"
                min="0.1"
                value={rateCard.aiForecastCostKes}
                onChange={e => setRateCard({ ...rateCard, aiForecastCostKes: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" disabled={isSavingRates} id="btn-save-rate-card">
              <Save className="w-4 h-4 mr-1.5" />
              {isSavingRates ? 'Saving Rates...' : 'Update Platform Rates'}
            </Button>
          </div>
        </form>
      </div>

      {/* User Usage & Cost Ledger */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            User Pay-Per-Use Ledger & Spending Quotas
          </h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input 
              placeholder="Filter users..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" id="table-usage-ledger">
              <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3.5 font-semibold">User</th>
                  <th className="px-4 py-3.5 font-semibold">Role</th>
                  <th className="px-4 py-3.5 font-semibold">Activity (R / W / AI)</th>
                  <th className="px-4 py-3.5 font-semibold">Incurred Cost</th>
                  <th className="px-4 py-3.5 font-semibold">Quota Progress</th>
                  <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredUsers.map(user => {
                  const incurred = user.incurredCostKes || 0;
                  const limit = user.spendingLimitKes || 1500;
                  const percentUsed = Math.min(Math.round((incurred / limit) * 100), 100);
                  const isExceeded = incurred >= limit;
                  const isNearLimit = percentUsed >= 80;

                  return (
                    <tr key={user.uid} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{user.displayName}</div>
                        <div className="text-[11px] text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        <Badge variant="outline" className="text-[10px]">
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="font-mono text-foreground font-semibold">{user.totalReads ?? 0}</span> R •{' '}
                        <span className="font-mono text-foreground font-semibold">{user.totalWrites ?? 0}</span> W •{' '}
                        <span className="font-mono text-foreground font-semibold">{user.totalAiForecasts ?? 0}</span> AI
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCurrency(incurred)}
                      </td>
                      <td className="px-4 py-3 min-w-[160px]">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">{percentUsed}% of limit</span>
                            <span className={isExceeded ? 'text-destructive font-bold' : isNearLimit ? 'text-amber-500 font-bold' : 'text-muted-foreground'}>
                              {formatCurrency(limit)}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all ${
                                isExceeded 
                                  ? 'bg-destructive' 
                                  : isNearLimit 
                                    ? 'bg-amber-500' 
                                    : 'bg-primary'
                              }`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleSimulateUsage(user)}
                            className="h-7 text-[11px]"
                            title="Simulate Usage Batch"
                            id={`btn-simulate-usage-${user.uid}`}
                          >
                            + Use
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setInvoiceUser(user)}
                            className="h-7 text-[11px]"
                            title="View Statement / Invoice"
                            id={`btn-invoice-${user.uid}`}
                          >
                            Invoice
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleResetCycle(user)}
                            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                            title="Reset Monthly Cycle"
                            id={`btn-reset-cycle-${user.uid}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Invoice Statement Modal */}
      <Dialog open={!!invoiceUser} onOpenChange={() => setInvoiceUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Pay-Per-Use Statement of Account
            </DialogTitle>
            <DialogDescription>
              Itemized billing statement based on active rate card.
            </DialogDescription>
          </DialogHeader>

          {invoiceUser && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3.5 rounded-lg bg-muted/50 border border-border space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account:</span>
                  <span className="font-semibold text-foreground">{invoiceUser.displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-mono text-foreground">{invoiceUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Cycle:</span>
                  <span className="font-medium text-foreground">Current (Active)</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-b border-border py-3">
                <div className="flex justify-between">
                  <span>Firestore Reads ({invoiceUser.totalReads ?? 0} × {formatCurrency(rateCard.readCostKes)})</span>
                  <span className="font-mono font-medium">
                    {formatCurrency((invoiceUser.totalReads ?? 0) * rateCard.readCostKes)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Firestore Writes ({invoiceUser.totalWrites ?? 0} × {formatCurrency(rateCard.writeCostKes)})</span>
                  <span className="font-mono font-medium">
                    {formatCurrency((invoiceUser.totalWrites ?? 0) * rateCard.writeCostKes)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Indexed Storage ({(invoiceUser.totalStorageKb ?? 64) / 1024} MB)</span>
                  <span className="font-mono font-medium">
                    {formatCurrency((((invoiceUser.totalStorageKb ?? 64) / 1024) * rateCard.storageMbMonthKes))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>AI Forecast Runs ({invoiceUser.totalAiForecasts ?? 0} × {formatCurrency(rateCard.aiForecastCostKes)})</span>
                  <span className="font-mono font-medium">
                    {formatCurrency((invoiceUser.totalAiForecasts ?? 0) * rateCard.aiForecastCostKes)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-sm font-bold pt-1">
                <span>Total Incurred Cost</span>
                <span className="text-primary text-base">
                  {formatCurrency(invoiceUser.incurredCostKes ?? 0)}
                </span>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setInvoiceUser(null)}>
                  Close
                </Button>
                <Button onClick={() => {
                  toast({
                    title: 'Invoice Sent',
                    description: `Dispatched statement of ${formatCurrency(invoiceUser.incurredCostKes ?? 0)} to ${invoiceUser.email}.`,
                  });
                  setInvoiceUser(null);
                }}>
                  Send to Client
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminPayPerUseTracking;
