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
  TrendingDown
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
import type { DebtItem as PublicDebtItem } from '@/lib/types';
import Link from 'next/link';
import DebtFormPopover from '@/components/debt/DebtFormPopover';
import { formatCurrency, cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { getDebtColumns } from './columns';
import { Badge } from '@/components/ui/badge';

interface InternalDebtItem extends PublicDebtItem {
  _acknowledgementVersion?: number;
}

export default function DebtPage() {
  const { debts, deleteDebt, setDebts, acknowledgeDebtChange, acknowledgedPrincipals } = useDebtStore();
  const totalBudgetedDebtPayment = useBudgetStore(selectTotalBudgetedDebt);
  const { toast } = useToast();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<InternalDebtItem | null>(null);
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

  const handleFormSheetClose = () => { setIsFormSheetOpen(false); setEditingDebt(null); };

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

  const columns = React.useMemo(() => getDebtColumns(handleEditClick, handleDeleteClick, acknowledgeDebtChange, acknowledgedPrincipals), [handleEditClick, handleDeleteClick, acknowledgeDebtChange, acknowledgedPrincipals]);

  const table = useReactTable({
    data: debts,
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
    const totalDebtPrincipal = debts.reduce((sum, debt) => sum + debt.principal, 0);

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline("Debt Free!");
        return;
    }
    if (fundsForDebtPaymentFromBudget <= 0) {
        setDebtPayoffTimeline("Funds needed");
        return;
    }
    const totalMinPayments = debts.reduce((sum, debt) => sum + debt.minPayment, 0);
    let interestWarning = false;
    debts.forEach(debt => {
        const monthlyInterest = debt.principal * (debt.interestRate / 100 / 12);
        if (debt.minPayment > 0 && monthlyInterest > 0 && debt.minPayment <= monthlyInterest) {
            interestWarning = true;
        }
    });
    if (fundsForDebtPaymentFromBudget < totalMinPayments) {
        setDebtPayoffTimeline(interestWarning ? "Low min payments" : "Increase budget");
        return;
    }

    let currentDebts = debts.map(d => ({ ...d, principal: d.principal }));
    let months = 0;
    const MAX_MONTHS = 720;

    while (currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01 && months < MAX_MONTHS) {
        months++;
        let availablePayment = fundsForDebtPaymentFromBudget;
        currentDebts.forEach(debt => { if (debt.principal > 0) debt.principal += debt.principal * (debt.interestRate / 100 / 12); });

        currentDebts.forEach(debt => {
             if (debt.principal > 0 && availablePayment > 0.01) {
                 const paymentTowardsMin = Math.min(debt.minPayment, debt.principal, availablePayment);
                 debt.principal -= paymentTowardsMin;
                 availablePayment -= paymentTowardsMin;
             }
        });
        if (availablePayment > 0.01) {
             currentDebts.sort((a, b) => {
                 const rateDiff = b.interestRate - a.interestRate;
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
   }, [debts, totalBudgetedDebtPayment]);

  const handleExportCsv = useCallback(() => {
      if (debts.length === 0) { toast({ title: "No data to export" }); return; }
      const csvRows = debts.map(debt => ({
        Description: debt.description.replace(/"/g, "''"),
        'Principal (KES)': debt.principal,
        'Interest Rate (%)': debt.interestRate,
        'Min Payment (KES)': debt.minPayment,
        Term: debt.term,
      }));

      // Direct clean CSV builder
      const headers = ['Description', 'Principal (KES)', 'Interest Rate (%)', 'Min Payment (KES)', 'Term'];
      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => [
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
      link.download = 'debts_export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "CSV Exported" });
  }, [debts, toast]);

  const totalMinPayments = useMemo(() => debts.reduce((sum, d) => sum + d.minPayment, 0), [debts]);
  const reconciliationInsight = useMemo(() => {
    if (debts.length === 0) return { text: "No active debts to reconcile.", variant: "default" as const, icon: Info };
    if (totalBudgetedDebtPayment <= 0) return { text: "No budget allocated to repayment.", variant: "outline" as const, icon: Info };
    if (totalBudgetedDebtPayment < totalMinPayments) return { text: "Budget underfunds total minimums.", variant: "destructive" as const, icon: AlertTriangle };
    if (totalBudgetedDebtPayment > totalMinPayments * 1.2) return { text: "Budget accelerates payoff! High savings potential.", variant: "default" as const, icon: CheckCircle };
    return { text: "Allocated budget covers minimums safely.", variant: "outline" as const, icon: Info };
  }, [debts, totalBudgetedDebtPayment, totalMinPayments]);

  const totalOutstandingDebt = useMemo(() => debts.reduce((sum, d) => sum + d.principal, 0), [debts]);

  return (
    <div className="flex flex-col w-full min-h-screen p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      {/* 📋 DEBT REGISTRY TABLE */}
      {/* ========================================================= */}
      <Card className="border border-border/60 shadow-xs bg-card rounded-xl overflow-hidden">
        <CardHeader className="p-4 border-b border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">Active Debt Portfolio</CardTitle>
            <CardDescription className="text-xs">
              List of current outstanding debts. A pulsing dot <AlertCircle className="inline h-3.5 w-3.5 text-destructive align-middle animate-pulse" /> indicates unacknowledged balance or rate updates. Click it to accept.
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
            data={debts as InternalDebtItem[]}
            table={table}
            searchColumn="description"
            searchPlaceholder="Search outstanding debts..."
          />
        </CardContent>

        {debts.length > 0 && (
          <CardFooter className="p-3 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
            Showing {table.getFilteredRowModel().rows.length} of {debts.length} active debt instruments.
          </CardFooter>
        )}
      </Card>

      {/* Form & Confirmation Dialogs */}
      <DebtFormPopover isOpen={isFormSheetOpen && !!editingDebt} onClose={handleFormSheetClose} debt={editingDebt} />

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
