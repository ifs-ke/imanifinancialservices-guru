// src/components/debt/DebtRestructureDialog.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useDebtStore } from '@/store/debtStore';
import type { DebtItem } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { RefreshCw, ArrowRight, CheckCircle2, TrendingDown, Clock, ShieldCheck, Sparkles } from 'lucide-react';

interface DebtRestructureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtItem | null;
}

export function DebtRestructureDialog({ isOpen, onClose, debt }: DebtRestructureDialogProps) {
  const { updateDebt } = useDebtStore();
  const { toast } = useToast();

  const [newPrincipal, setNewPrincipal] = useState<number>(0);
  const [newInterestRate, setNewInterestRate] = useState<number>(0);
  const [newDurationMonths, setNewDurationMonths] = useState<number>(12);
  const [newMinPayment, setNewMinPayment] = useState<number>(0);
  const [restructureReason, setRestructureReason] = useState<string>('Refinanced with lender for lower monthly payments');

  // Initialize values when debt is selected
  useEffect(() => {
    if (debt) {
      setNewPrincipal(debt.principal || 0);
      setNewInterestRate(debt.interestRate !== undefined && debt.interestRate !== null ? debt.interestRate : 0);
      const defaultDuration = debt.term === 'long' ? 24 : 12;
      setNewDurationMonths(defaultDuration);
      setNewMinPayment(debt.minPayment || 0);
      setRestructureReason('Refinanced with lender for lower monthly payments');
    }
  }, [debt, isOpen]);

  // Calculate recommended monthly payment given P, rate, and duration
  const calculateSuggestedPayment = (p: number, annualRate: number, months: number): number => {
    if (p <= 0 || months <= 0) return 0;
    if (annualRate <= 0) {
      return Math.ceil(p / months);
    }
    const monthlyRate = annualRate / 100 / 12;
    const payment = (p * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    return Math.ceil(payment);
  };

  // Recalculate auto-suggested payment when principal, rate, or duration change
  const handleAutoCalculate = () => {
    const suggested = calculateSuggestedPayment(newPrincipal, newInterestRate, newDurationMonths);
    setNewMinPayment(suggested);
  };

  // Comparisons: Before vs After
  const comparison = useMemo(() => {
    if (!debt) return null;

    const oldP = debt.principal || 0;
    const oldRate = debt.interestRate || 0;
    const oldPayment = debt.minPayment || 0;

    // Estimate total interest for old terms (rough simulation)
    const oldMonthlyInterest = oldP * (oldRate / 100 / 12);
    const oldEstimatedMonths = oldPayment > oldMonthlyInterest ? Math.ceil(oldP / (oldPayment - oldMonthlyInterest)) : 999;
    const oldTotalInterest = oldPayment > oldMonthlyInterest ? (oldPayment * Math.min(oldEstimatedMonths, 360)) - oldP : 0;

    // Estimate for new restructured terms
    const newMonthlyRate = newInterestRate / 100 / 12;
    let newTotalInterest = 0;
    if (newInterestRate <= 0) {
      newTotalInterest = 0;
    } else {
      const calculatedMonthlyPay = newMinPayment > 0 ? newMinPayment : calculateSuggestedPayment(newPrincipal, newInterestRate, newDurationMonths);
      newTotalInterest = Math.max(0, (calculatedMonthlyPay * newDurationMonths) - newPrincipal);
    }

    const monthlyCashFlowFreed = oldPayment - newMinPayment;
    const totalInterestSaved = Math.max(0, oldTotalInterest - newTotalInterest);

    return {
      oldPayment,
      newPayment: newMinPayment,
      monthlyCashFlowFreed,
      oldInterestRate: oldRate,
      newInterestRate,
      totalInterestSaved,
      durationMonths: newDurationMonths,
    };
  }, [debt, newPrincipal, newInterestRate, newDurationMonths, newMinPayment]);

  const handleApplyRestructuring = () => {
    if (!debt) return;
    if (newPrincipal <= 0) {
      toast({ title: 'Invalid Principal', description: 'Principal balance must be greater than zero.', variant: 'destructive' });
      return;
    }
    if (newMinPayment <= 0) {
      toast({ title: 'Invalid Payment', description: 'Please specify a monthly payment.', variant: 'destructive' });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const newDueDate = new Date();
    newDueDate.setMonth(newDueDate.getMonth() + newDurationMonths);
    const newDueDateStr = newDueDate.toISOString().split('T')[0];

    const restructureLog = `[Restructured on ${todayStr}]: ${newDurationMonths} mo @ ${newInterestRate}% (Payment: KES ${newMinPayment.toLocaleString()}). Reason: ${restructureReason}`;
    const updatedNotes = debt.notes ? `${debt.notes} | ${restructureLog}` : restructureLog;

    updateDebt({
      ...debt,
      principal: newPrincipal,
      interestRate: newInterestRate,
      minPayment: newMinPayment,
      term: newDurationMonths > 12 ? 'long' : 'short',
      dueDate: newDueDateStr,
      status: 'active',
      notes: updatedNotes,
    });

    toast({
      title: 'Debt Successfully Restructured',
      description: `"${debt.description}" restructured with new monthly payment of ${formatCurrency(newMinPayment)}.`,
    });

    onClose();
  };

  if (!debt) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            <DialogTitle className="text-base font-semibold">Restructure Debt</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Simulate and apply renegotiated loan terms, lower interest rates, or extended durations for <strong>{debt.description}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Restructuring Form Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Current Balance (KES)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newPrincipal || ''}
                onChange={(e) => setNewPrincipal(parseFloat(e.target.value) || 0)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">New Interest Rate (%)</Label>
                <button
                  type="button"
                  onClick={() => setNewInterestRate(0)}
                  className="text-[10px] text-primary hover:underline cursor-pointer"
                >
                  Set 0% (Free)
                </button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newInterestRate}
                onChange={(e) => setNewInterestRate(parseFloat(e.target.value) || 0)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Extended Repayment Term</Label>
              <Select
                value={String(newDurationMonths)}
                onValueChange={(val) => {
                  const m = parseInt(val, 10);
                  setNewDurationMonths(m);
                  setNewMinPayment(calculateSuggestedPayment(newPrincipal, newInterestRate, m));
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6" className="text-xs">6 Months (Short)</SelectItem>
                  <SelectItem value="12" className="text-xs">12 Months (1 Year)</SelectItem>
                  <SelectItem value="18" className="text-xs">18 Months (1.5 Years)</SelectItem>
                  <SelectItem value="24" className="text-xs">24 Months (2 Years)</SelectItem>
                  <SelectItem value="36" className="text-xs">36 Months (3 Years)</SelectItem>
                  <SelectItem value="48" className="text-xs">48 Months (4 Years)</SelectItem>
                  <SelectItem value="60" className="text-xs">60 Months (5 Years)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">New Monthly Payment (KES)</Label>
                <button
                  type="button"
                  onClick={handleAutoCalculate}
                  className="text-[10px] text-primary hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  <Sparkles className="w-2.5 h-2.5" /> Auto-calc
                </button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newMinPayment || ''}
                onChange={(e) => setNewMinPayment(parseFloat(e.target.value) || 0)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Restructuring Agreement Note</Label>
            <Input
              value={restructureReason}
              onChange={(e) => setRestructureReason(e.target.value)}
              placeholder="e.g., Lowered APR through SACCO refinancing"
              className="h-9 text-xs"
            />
          </div>

          {/* Before vs After Impact Summary */}
          {comparison && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Restructuring Impact Comparison</span>
                {comparison.monthlyCashFlowFreed > 0 && (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" />
                    +{formatCurrency(comparison.monthlyCashFlowFreed)}/mo freed
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2 rounded bg-background border border-border/60">
                  <span className="text-[10px] text-muted-foreground block">Current Terms</span>
                  <div className="font-mono font-medium text-foreground mt-0.5">
                    {formatCurrency(comparison.oldPayment)}/mo @ {comparison.oldInterestRate}%
                  </div>
                </div>

                <div className="p-2 rounded bg-background border border-border/60">
                  <span className="text-[10px] text-primary font-medium block">Restructured Terms</span>
                  <div className="font-mono font-bold text-foreground mt-0.5">
                    {formatCurrency(comparison.newPayment)}/mo @ {comparison.newInterestRate}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs cursor-pointer">
            Cancel
          </Button>
          <Button size="sm" onClick={handleApplyRestructuring} className="h-8 text-xs cursor-pointer font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Apply Restructuring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
