
// src/app/(dashboard)/debt/page.tsx
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  flexRender,
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
import { PlusCircle, Coins, FileUp, FileDown, AlertTriangle, CalendarClock, CheckCircle, Info, XCircle, Trash2, AlertCircle } from 'lucide-react'; // Added AlertCircle
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDebtStore } from '@/store/debtStore';
import { useBudgetStore, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { DebtItem as PublicDebtItem } from '@/lib/types'; // Public type
import Link from 'next/link';
import DebtFormSheet from '@/components/debt/DebtFormSheet';
import { formatCurrency, cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { getDebtColumns } from './columns';
import { PageHeader } from '@/components/layout/PageHeader';
import Papa from 'papaparse';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// Internal type for the page component, matching the store's version
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
        setDebtPayoffTimeline("Cannot estimate: No funds budgeted for debt.");
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
        setDebtPayoffTimeline(interestWarning ? "Warning: Min payments low relative to interest." : "Warning: Budgeted debt funds < total min payments.");
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
       setDebtPayoffTimeline(`Over ${Math.floor(MAX_MONTHS / 12)} years (estimate)`);
    } else {
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
         let timelineString = "";
        if (years > 0) timelineString += `${years} year${years > 1 ? 's' : ''}`;
        if (remainingMonths > 0) { if (years > 0) timelineString += " and "; timelineString += `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`; }
        setDebtPayoffTimeline(`${timelineString || 'Less than a month'} (estimated)`);
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

      const csvData = Papa.unparse(csvRows, { header: true });
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
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
    if (debts.length === 0) return { text: "No debts to reconcile.", variant: "default" as const, icon: Info };
    if (totalBudgetedDebtPayment <= 0) return { text: "No funds budgeted for debt repayment.", variant: "outline" as const, icon: Info };
    if (totalBudgetedDebtPayment < totalMinPayments) return { text: "Budgeted payment is less than total minimums. Action recommended.", variant: "destructive" as const, icon: AlertTriangle };
    if (totalBudgetedDebtPayment > totalMinPayments * 1.2) return { text: "Budgeted payment exceeds minimums. Good progress expected!", variant: "default" as const, icon: CheckCircle };
    return { text: "Budgeted payment covers minimums.", variant: "outline" as const, icon: Info };
  }, [debts, totalBudgetedDebtPayment, totalMinPayments]);


  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader
        title="Manage Debts"
        description="Track debts, view amortization, and reconcile with your budget."
        icon={Coins}
      >
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleAddClick}><PlusCircle className="mr-2 h-4 w-4" /> Add Debt</Button>
           <Button asChild variant="default"><Link href="/debt/import"><FileUp className="mr-2 h-4 w-4" /> Import CSV</Link></Button>
            <Button variant="secondary" onClick={handleExportCsv} disabled={debts.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
        </div>
      </PageHeader>

      <Card className="mb-6 mx-4 md:mx-6 lg:mx-8 shadow-md">
        <CardHeader className="p-6">
          <CardTitle className="text-lg">Debt Overview & Reconciliation</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm p-6">
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground">Total Outstanding Debt:</span>
              <span className="font-bold text-xl font-mono text-destructive">{formatCurrency(debts.reduce((sum, d) => sum + d.principal, 0))}</span>
            </div>
             <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground">Monthly Budgeted Debt Payment:</span>
              <span className="font-bold text-xl font-mono text-primary">{formatCurrency(totalBudgetedDebtPayment)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-muted-foreground flex items-center gap-1"><CalendarClock size={14}/> Estimated Payoff Timeline:</span>
              <span className="font-bold text-lg font-mono text-primary">{debtPayoffTimeline}</span>
            </div>
          </div>
          <div className="md:border-l md:pl-6 space-y-3">
            <h4 className="font-medium text-base text-muted-foreground">Reconciliation Insights</h4>
             <Badge variant={reconciliationInsight.variant} className="text-sm p-2 w-full justify-start gap-2">
                <reconciliationInsight.icon className="h-4 w-4 flex-shrink-0"/>
                <span>{reconciliationInsight.text}</span>
             </Badge>
             {totalMinPayments > 0 && (
                <p className="text-xs text-muted-foreground">Total Minimum Payments Required: {formatCurrency(totalMinPayments)}</p>
             )}
          </div>
        </CardContent>
      </Card>

      <main className="flex-1 px-4 md:px-6 lg:px-8">
        <Card className="shadow-sm">
           <CardHeader className="p-4 md:p-6 border-b">
            <CardTitle className="text-lg">Debt List</CardTitle>
            <CardDescription>Your current outstanding debts. A pulsing dot <AlertCircle className="inline h-3 w-3 text-destructive" /> indicates an unacknowledged principal change or a new item. Click dot to acknowledge.</CardDescription>
            {selectedDebtIds.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center border-t pt-4">
                    <span className="text-sm text-muted-foreground mb-2 sm:mb-0">{selectedDebtIds.length} selected</span>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="destructive" onClick={handleMassDeleteClick}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
                            <XCircle className="mr-2 h-4 w-4" /> Clear Selection
                        </Button>
                    </div>
                </div>
            )}
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <DataTable
              columns={columns}
              data={debts as InternalDebtItem[]} // Cast here for DataTable if columns expect InternalDebtItem
              table={table}
              searchColumn="description"
              searchPlaceholder="Search debt descriptions..."
            />
          </CardContent>
           {debts.length > 0 && (
             <CardFooter className="p-4 border-t text-xs text-muted-foreground">
               {table.getFilteredRowModel().rows.length} debt(s) showing.
             </CardFooter>
           )}
        </Card>
      </main>

         <DebtFormSheet isOpen={isFormSheetOpen} onClose={handleFormSheetClose} debt={editingDebt} />

        <AlertDialog open={!!debtToDelete} onOpenChange={(open) => !open && setDebtToDelete(null)}>
        {debtToDelete && (
            <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>Delete: <strong>{debtToDelete.description} ({formatCurrency(debtToDelete.principal)})</strong>?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setDebtToDelete(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteDebt}>Delete</AlertDialogAction></AlertDialogFooter>
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
            <AlertDialogAction onClick={confirmMassDelete}>Delete Selected</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
