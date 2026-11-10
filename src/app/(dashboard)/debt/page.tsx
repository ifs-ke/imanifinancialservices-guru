// src/app/(dashboard)/debt/page.tsx
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  PlusCircle, 
  Coins, 
  FileUp, 
  FileDown, 
  AlertTriangle, 
  CalendarClock, 
  CheckCircle, 
  Info, 
  XCircle, 
  Trash2, 
  AlertCircle,
  HelpCircle,
  TrendingDown,
  Users,
  Landmark
} from 'lucide-react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { useDebtStore } from '@/store/debtStore';
import { useBudgetStore, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { DebtItem as PublicDebtItem, DebtStatus } from '@/lib/types';
import { computeDebtStatus, isDebtActive, isDebtPaidOff } from '@/lib/debtUtils';
import Link from 'next/link';
import DebtFormPopover from '@/components/debt/DebtFormPopover';
import { DebtRestructureDialog } from '@/components/debt/DebtRestructureDialog';
import { DebtStrategyRecommendations } from '@/components/debt/DebtStrategyRecommendations';
import { formatCurrency, cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { getDebtColumns } from '@/components/debt/DebtColumns';
import { Badge } from '@/components/ui/badge';

interface InternalDebtItem extends PublicDebtItem {
  _acknowledgementVersion?: number;
}

export default function DebtPage() {
  const { debts, deleteDebt, updateDebt, setDebts, acknowledgeDebtChange, acknowledgedPrincipals } = useDebtStore();
  const totalBudgetedDebtPayment = useBudgetStore(selectTotalBudgetedDebt);
  const { toast } = useToast();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<InternalDebtItem | null>(null);
  const [restructuringDebt, setRestructuringDebt] = useState<InternalDebtItem | null>(null);
  const [isRestructureOpen, setIsRestructureOpen] = useState(false);
  const [debtToDelete, setDebtToDelete] = useState<InternalDebtItem | null>(null);
  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>("N/A");
  const [isMassDeleteDialogOpen, setIsMassDeleteDialogOpen] = useState(false);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const handleAddClick = () => { setEditingDebt(null); setIsFormSheetOpen(true); };

  const handleEditClick = useCallback((debt: InternalDebtItem) => {
    setEditingDebt(debt);
    setIsFormSheetOpen(true);
  }, []);

  const handleRestructureClick = useCallback((debt: InternalDebtItem) => {
    setRestructuringDebt(debt);
    setIsRestructureOpen(true);
  }, []);

  const [activeTab, setActiveTab] = useState<'monthly' | 'history'>('monthly');

  const activeDebts = useMemo(() => debts.filter(isDebtActive), [debts]);
  const paidOffDebts = useMemo(() => debts.filter(isDebtPaidOff), [debts]);

  const displayedDebts = useMemo(() => {
    return activeTab === 'monthly' ? activeDebts : paidOffDebts;
  }, [activeTab, activeDebts, paidOffDebts]);

  const handleStatusChange = useCallback((debt: InternalDebtItem, newStatus: DebtStatus) => {
    updateDebt({ ...debt, status: newStatus });
    if (newStatus === 'paid_off') {
      toast({
        title: 'Debt Paid Off!',
        description: `"${debt.description}" marked as paid off and moved to Debt History.`,
      });
    } else {
      toast({
        title: 'Debt Reactivated',
        description: `"${debt.description}" restored to Monthly Debts.`,
      });
    }
  }, [updateDebt, toast]);

  const handleFormSheetClose = () => { setIsFormSheetOpen(false); setEditingDebt(null); };
  const handleRestructureClose = () => { setIsRestructureOpen(false); setRestructuringDebt(null); };

  const handleDeleteClick = useCallback((debt: InternalDebtItem) => {
    setDebtToDelete(debt);
  }, []);

  const confirmDeleteDebt = () => {
    if (!debtToDelete) return;
    deleteDebt(debtToDelete.id);
    setDebtToDelete(null);
    toast({ title: 'Debt Deleted' });
    setRowSelection({});
  };

  const columns = React.useMemo(() => getDebtColumns(
    handleEditClick, 
    handleDeleteClick, 
    acknowledgeDebtChange, 
    acknowledgedPrincipals,
    handleStatusChange,
    handleRestructureClick
  ), [handleEditClick, handleDeleteClick, acknowledgeDebtChange, acknowledgedPrincipals, handleStatusChange, handleRestructureClick]);

  const table = useReactTable({
    data: displayedDebts as InternalDebtItem[],
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    autoResetPageIndex: false,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedDebtIds = useMemo(() => {
    return table.getSelectedRowModel().rows.map(row => row.original.id);
  }, [rowSelection, table]);

  const handleMassDeleteClick = () => {
     if (selectedDebtIds.length === 0) {
       toast({ title: 'No Selection', description: 'Please select debts to delete.', variant: 'default' });
       return;
     }
     setIsMassDeleteDialogOpen(true);
  };

  const confirmMassDelete = () => {
    if (selectedDebtIds.length > 0) {
      const remainingDebts = debts.filter(debt => !selectedDebtIds.includes(debt.id));
      setDebts(remainingDebts);
      toast({ title: 'Batch Delete Successful', description: `${selectedDebtIds.length} debt(s) deleted.` });
      setRowSelection({});
    }
    setIsMassDeleteDialogOpen(false);
  };

  useEffect(() => {
    const fundsForDebtPaymentFromBudget = totalBudgetedDebtPayment;
    const totalDebtPrincipal = activeDebts.reduce((sum, debt) => sum + debt.principal, 0);

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline("Debt Free!");
        return;
    }
    if (fundsForDebtPaymentFromBudget <= 0) {
        setDebtPayoffTimeline("Funds needed");
        return;
    }
    const totalMinPayments = activeDebts.reduce((sum, debt) => sum + debt.minPayment, 0);
    let interestWarning = false;
    activeDebts.forEach(debt => {
        const rate = debt.interestRate || 0;
        const monthlyInterest = debt.principal * (rate / 100 / 12);
        if (debt.minPayment > 0 && monthlyInterest > 0 && debt.minPayment <= monthlyInterest) {
            interestWarning = true;
        }
    });
    if (fundsForDebtPaymentFromBudget < totalMinPayments) {
        setDebtPayoffTimeline(interestWarning ? "Low min payments" : "Increase budget");
        return;
    }

    let currentDebts = activeDebts.map(d => ({ ...d, principal: d.principal }));
    let months = 0;
    const MAX_MONTHS = 720;

    while (currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01 && months < MAX_MONTHS) {
        months++;
        let availablePayment = fundsForDebtPaymentFromBudget;
        currentDebts.forEach(debt => { 
          const rate = debt.interestRate || 0;
          if (debt.principal > 0 && rate > 0) {
            debt.principal += debt.principal * (rate / 100 / 12); 
          }
        });

        currentDebts.forEach(debt => {
             if (debt.principal > 0 && availablePayment > 0.01) {
                 const paymentTowardsMin = Math.min(debt.minPayment, debt.principal, availablePayment);
                 debt.principal -= paymentTowardsMin;
                 availablePayment -= paymentTowardsMin;
             }
        });
        if (availablePayment > 0.01) {
             currentDebts.sort((a, b) => {
                 const rateDiff = (b.interestRate || 0) - (a.interestRate || 0);
                 if (rateDiff !== 0) return rateDiff;
                 return b.principal - a.principal;
              });
              for (const debt of currentDebts) {
                  if (debt.principal > 0.01 && availablePayment > 0.01) {
                     const extraPayment = Math.min(availablePayment, debt.principal);
                     debt.principal -= extraPayment;
                     availablePayment -= extraPayment;
                   }
                   if(availablePayment <= 0.01) break;
               }
         }
         currentDebts = currentDebts.filter(debt => debt.principal > 0.01);
    }

    if (months >= MAX_MONTHS && currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01) {
       setDebtPayoffTimeline(`Over ${Math.floor(MAX_MONTHS / 12)} years`);
    } else {
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
        let timelineString = "";
        if (years > 0) timelineString += `${years} yr${years > 1 ? 's' : ''}`;
        if (remainingMonths > 0) { if (years > 0) timelineString += " "; timelineString += `${remainingMonths} mo${remainingMonths > 1 ? 's' : ''}`; }
        setDebtPayoffTimeline(`${timelineString || 'Less than 1 mo'}`);
     }
   }, [activeDebts, totalBudgetedDebtPayment]);

  const handleExportCsv = useCallback(() => {
      if (debts.length === 0) { toast({ title: "No data to export" }); return; }
      const csvRows = debts.map(debt => ({
        Date: debt.date || new Date().toISOString().split('T')[0],
        Classification: debt.classification === 'personal' ? 'Personal (Friends/Family)' : 'Institutional (Bank/SACCO)',
        Description: debt.description.replace(/"/g, "''"),
        'Principal (KES)': debt.principal,
        'Interest Rate (%)': debt.interestRate !== undefined && debt.interestRate !== null ? debt.interestRate : 0,
        'Min Payment (KES)': debt.minPayment,
        Term: debt.term,
      }));

      // Direct clean CSV builder
      const headers = ['Date', 'Classification', 'Description', 'Principal (KES)', 'Interest Rate (%)', 'Min Payment (KES)', 'Term'];
      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => [
          `"${row.Date}"`,
          `"${row.Classification}"`,
          `"${row.Description}"`,
          row['Principal (KES)'],
          row['Interest Rate (%)'],
          row['Min Payment (KES)'],
          row.Term
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `debts_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "CSV Exported", description: "Debt portfolio successfully downloaded." });
  }, [debts, toast]);

  const totalMinPayments = useMemo(() => activeDebts.reduce((sum, d) => sum + d.minPayment, 0), [activeDebts]);
  const reconciliationInsight = useMemo(() => {
    if (activeDebts.length === 0) return { text: "No active debts to reconcile.", variant: "default" as const, icon: Info };
    if (totalBudgetedDebtPayment <= 0) return { text: "No budget allocated to repayment.", variant: "outline" as const, icon: Info };
    if (totalBudgetedDebtPayment < totalMinPayments) return { text: "Budget underfunds total minimums.", variant: "destructive" as const, icon: AlertTriangle };
    if (totalBudgetedDebtPayment > totalMinPayments * 1.2) return { text: "Budget accelerates payoff! High savings potential.", variant: "default" as const, icon: CheckCircle };
    return { text: "Allocated budget covers minimums safely.", variant: "outline" as const, icon: Info };
  }, [activeDebts, totalBudgetedDebtPayment, totalMinPayments]);

  const totalOutstandingDebt = useMemo(() => activeDebts.reduce((sum, d) => sum + d.principal, 0), [activeDebts]);
  const personalDebts = useMemo(() => activeDebts.filter(d => (d.classification || 'personal') === 'personal'), [activeDebts]);
  const institutionalDebts = useMemo(() => activeDebts.filter(d => d.classification === 'institutional'), [activeDebts]);
  const totalPersonalDebt = useMemo(() => personalDebts.reduce((sum, d) => sum + d.principal, 0), [personalDebts]);
  const totalInstitutionalDebt = useMemo(() => institutionalDebts.reduce((sum, d) => sum + d.principal, 0), [institutionalDebts]);

  const overdueDebts = useMemo(() => {
    return activeDebts.filter(d => {
      const status = computeDebtStatus({
        status: d.status,
        dueDate: d.dueDate,
        date: d.date,
        term: d.term,
        principal: d.principal,
      });
      return status === 'overdue';
    });
  }, [activeDebts]);
  const totalOverdueDebt = useMemo(() => overdueDebts.reduce((sum, d) => sum + d.principal, 0), [overdueDebts]);

  return (
    <div className="flex flex-col w-full min-h-screen p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Overdue Debt Alert Banner */}
      {overdueDebts.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-950 dark:text-rose-100 shadow-sm animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-sm block">
                {overdueDebts.length} Overdue Debt Instrument{overdueDebts.length > 1 ? 's' : ''} Detected ({formatCurrency(totalOverdueDebt)})
              </span>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                One or more debts have passed their expected maturity date or short-term loan schedule. Prioritize repayment or renegotiate terms with lenders.
              </p>
            </div>
          </div>
          <Badge variant="destructive" className="shrink-0 text-xs py-1 px-3">
            Action Required
          </Badge>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🧭 HEADER & ACTION BUTTONS */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Manage Debts
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Track debts, analyze amortization schedules, and align repayments with your monthly budget.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          <DebtFormPopover
            isOpen={isFormSheetOpen && !editingDebt}
            onClose={handleFormSheetClose}
            debt={null}
            trigger={
              <Button variant="outline" size="sm" onClick={handleAddClick} className="h-9 text-xs font-semibold cursor-pointer">
                <PlusCircle className="mr-1.5 h-4 w-4 text-emerald-500" /> 
                Add Debt
              </Button>
            }
          />
          <Button asChild variant="outline" size="sm" className="h-9 text-xs font-semibold">
            <Link href="/debt/import">
              <FileUp className="mr-1.5 h-4 w-4" /> Import CSV
            </Link>
          </Button>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={handleExportCsv} 
            disabled={debts.length === 0}
            className="h-9 text-xs font-semibold cursor-pointer"
          >
            <FileDown className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 📊 CORE STAT CARDS */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Outstanding Debt */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between rounded-xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-xs font-medium text-muted-foreground block">Total outstanding debt</span>
              <span className="text-[10px] text-muted-foreground">Aggregated principal balance</span>
            </div>
            <span className="p-1.5 rounded-md bg-rose-500/10 text-destructive">
              <TrendingDown className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-destructive tracking-tight">
              {formatCurrency(totalOutstandingDebt)}
            </div>
          </CardContent>
        </Card>

        {/* Personal vs Institutional Breakdown */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between rounded-xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-xs font-medium text-muted-foreground block">Debt Classification Split</span>
              <span className="text-[10px] text-muted-foreground">Friends & Family vs Banks</span>
            </div>
            <span className="p-1.5 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Users className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" /> Personal:
              </span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(totalPersonalDebt)} <span className="text-[10px] font-normal text-muted-foreground">({personalDebts.length})</span></span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Institutional:
              </span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(totalInstitutionalDebt)} <span className="text-[10px] font-normal text-muted-foreground">({institutionalDebts.length})</span></span>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Budgeted Allocation */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between rounded-xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-xs font-medium text-muted-foreground block">Budgeted monthly payoff</span>
              <span className="text-[10px] text-muted-foreground">Allocated from current budget</span>
            </div>
            <span className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Coins className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-primary tracking-tight">
              {formatCurrency(totalBudgetedDebtPayment)}
            </div>
          </CardContent>
        </Card>

        {/* Estimated Timeline */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between rounded-xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-xs font-medium text-muted-foreground block">Payoff timeline</span>
              <span className="text-[10px] text-muted-foreground">Estimated clearance duration</span>
            </div>
            <span className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CalendarClock className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              {debtPayoffTimeline}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================= */}
      {/* 🤝 RECONCILIATION & ACTION INSIGHTS */}
      {/* ========================================================= */}
      <Card className="border border-border/60 shadow-xs bg-card rounded-xl">
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Reconciliation Status</CardTitle>
          <CardDescription className="text-xs">How your scheduled budget covers mandatory loan structures.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
            <reconciliationInsight.icon className={cn(
              "h-5 w-5 mt-0.5 flex-shrink-0",
              reconciliationInsight.variant === 'destructive' ? "text-destructive" :
              reconciliationInsight.variant === 'default' ? "text-emerald-500" : "text-muted-foreground"
            )}/>
            <div className="space-y-1">
              <span className="font-semibold block text-foreground">Budget Alignment</span>
              <p className="text-muted-foreground">{reconciliationInsight.text}</p>
            </div>
          </div>

          <div className="flex flex-col justify-center space-y-1 md:border-l md:pl-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Required Minimum Monthly Payments:</span>
              <span className="font-mono font-bold text-foreground">{formatCurrency(totalMinPayments)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Budget Repayment Coverage Ratio:</span>
              <span className={cn(
                "font-mono font-bold",
                totalMinPayments > 0 && totalBudgetedDebtPayment >= totalMinPayments ? "text-emerald-500" : "text-amber-500"
              )}>
                {totalMinPayments > 0 ? `${((totalBudgetedDebtPayment / totalMinPayments) * 100).toFixed(0)}%` : 'N/A'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================= */}
      {/* 🧭 STRATEGIC DEBT PAYOFF & INCOME RECOMMENDATIONS */}
      {/* ========================================================= */}
      <DebtStrategyRecommendations />

      {/* ========================================================= */}
      {/* 📋 DEBT REGISTRY TABLE (MONTHLY DEBTS vs DEBT HISTORY) */}
      {/* ========================================================= */}
      <Card className="border border-border/60 shadow-xs bg-card rounded-xl overflow-hidden">
        <CardHeader className="p-4 border-b border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-semibold text-foreground">
                {activeTab === 'monthly' ? 'Monthly Debt Obligations' : 'Debt History (Paid-Off Archive)'}
              </CardTitle>
              <div className="flex items-center gap-1 p-0.5 bg-muted/60 rounded-lg border border-border/40">
                <Button
                  size="xs"
                  variant={activeTab === 'monthly' ? 'default' : 'ghost'}
                  onClick={() => { setActiveTab('monthly'); setRowSelection({}); }}
                  className="h-7 text-xs font-semibold px-2.5 rounded-md"
                >
                  Monthly Debts ({activeDebts.length})
                </Button>
                <Button
                  size="xs"
                  variant={activeTab === 'history' ? 'default' : 'ghost'}
                  onClick={() => { setActiveTab('history'); setRowSelection({}); }}
                  className="h-7 text-xs font-semibold px-2.5 rounded-md flex items-center gap-1"
                >
                  <CheckCircle className="h-3 w-3 text-blue-500" />
                  Debt History ({paidOffDebts.length})
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              {activeTab === 'monthly'
                ? 'Current active obligations and amortizations. When a debt is paid off, it is automatically removed from this list and archived in Debt History.'
                : 'Historical record of fully settled debt instruments. Preserved for financial auditing, net worth reconciliation, and personal milestone tracking.'}
            </CardDescription>
          </div>

          {selectedDebtIds.length > 0 && (
            <div className="flex items-center gap-2 self-start md:self-center">
              <span className="text-[11px] text-muted-foreground font-mono">{selectedDebtIds.length} selected</span>
              <Button size="xs" variant="destructive" onClick={handleMassDeleteClick} className="h-8 text-xs font-semibold px-2.5">
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete Selected
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setRowSelection({})} className="h-8 text-xs font-semibold px-2.5">
                <XCircle className="mr-1 h-3.5 w-3.5" /> Clear Selection
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-4">
          <DataTable
            columns={columns}
            data={displayedDebts as InternalDebtItem[]}
            table={table}
            searchColumn="description"
            searchPlaceholder={activeTab === 'monthly' ? "Search monthly debts..." : "Search debt history..."}
          />
        </CardContent>

        {displayedDebts.length > 0 && (
          <CardFooter className="p-3 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
            Showing {table.getFilteredRowModel().rows.length} of {displayedDebts.length} {activeTab === 'monthly' ? 'monthly active debt instruments' : 'paid-off historical debt instruments'}.
          </CardFooter>
        )}
      </Card>

      {/* Form, Restructure & Confirmation Dialogs */}
      <DebtFormPopover isOpen={isFormSheetOpen && !!editingDebt} onClose={handleFormSheetClose} debt={editingDebt} />
      
      <DebtRestructureDialog 
        isOpen={isRestructureOpen} 
        onClose={handleRestructureClose} 
        debt={restructuringDebt} 
      />

      <AlertDialog open={!!debtToDelete} onOpenChange={(open) => !open && setDebtToDelete(null)}>
        {debtToDelete && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                Delete <strong>{debtToDelete.description} ({formatCurrency(debtToDelete.principal)})</strong>? This action will permanently remove this instrument from your financial forecasts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDebtToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteDebt} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <AlertDialog open={isMassDeleteDialogOpen} onOpenChange={setIsMassDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Debts?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedDebtIds.length} selected debt(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMassDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
