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
import { PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, List, BrainCircuit, Loader2, AlertTriangle, CalendarClock, Edit3, XCircle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDebtStore } from '@/store/debtStore';
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalBudgetedExpenses, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { DebtItem } from '@/lib/types';
import Link from 'next/link';
import DebtFormSheet from '@/components/debt/DebtFormSheet';
import DebtAnalysisDialog from '@/components/debt/DebtAnalysisDialog';
import { analyzeDebtStrategy, type DebtAnalysisInput, type DebtAnalysisOutput } from '@/ai/flows/debt-analysis-flow';
import { formatCurrency, cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { getDebtColumns } from './columns';
import { PageHeader } from '@/components/layout/PageHeader';
import Papa from 'papaparse';


export default function DebtPage() {
  const { debts, deleteDebt, setDebts } = useDebtStore(); // Added setDebts if mass delete needs it
  const totalBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalBudgetedExpenses = useBudgetStore(selectTotalBudgetedExpenses);
  const totalBudgetedDebtPayment = useBudgetStore(selectTotalBudgetedDebt);
  const { toast } = useToast();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtItem | null>(null);
  const [debtToDelete, setDebtToDelete] = useState<DebtItem | null>(null);
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DebtAnalysisOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>("N/A");
  const [isMassDeleteDialogOpen, setIsMassDeleteDialogOpen] = useState(false);


  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const handleAddClick = () => { setEditingDebt(null); setIsFormSheetOpen(true); };
  
  const handleEditClick = useCallback((debt: DebtItem) => { 
    setEditingDebt(debt); 
    setIsFormSheetOpen(true); 
  }, []);

  const handleFormSheetClose = () => { setIsFormSheetOpen(false); setEditingDebt(null); };
  
  const handleDeleteClick = useCallback((debt: DebtItem) => { 
    setDebtToDelete(debt); 
  }, []);
  
  const confirmDeleteDebt = () => { 
    if (!debtToDelete) return; 
    deleteDebt(debtToDelete.id); 
    setDebtToDelete(null); 
    toast({ title: 'Debt Deleted' }); 
    setRowSelection({}); // Clear selection after single delete
  };

  const columns = React.useMemo(() => getDebtColumns(handleEditClick, handleDeleteClick), [handleEditClick, handleDeleteClick]);

  const table = useReactTable({
    data: debts,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
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
      // Directly call deleteDebt for each selected ID.
      // This might be less efficient than a dedicated batch delete in the store,
      // but works with the current store API.
      const remainingDebts = debts.filter(debt => !selectedDebtIds.includes(debt.id));
      setDebts(remainingDebts); // Assuming setDebts replaces all debts
      toast({ title: 'Batch Delete Successful', description: `${selectedDebtIds.length} debt(s) deleted.` });
      setRowSelection({}); // Clear selection
    }
    setIsMassDeleteDialogOpen(false);
  };

  useEffect(() => {
    const fundsForDebtPayment = totalBudgetedDebtPayment;
    const totalDebtPrincipal = debts.reduce((sum, debt) => sum + debt.principal, 0);

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline("Debt Free!");
        return;
    }
    if (fundsForDebtPayment <= 0) {
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
    if (fundsForDebtPayment < totalMinPayments) {
        setDebtPayoffTimeline(interestWarning ? "Warning: Min payments low." : "Warning: Budgeted debt funds < min payments.");
        return;
    }

    let currentDebts = debts.map(d => ({ ...d, principal: d.principal }));
    let months = 0;
    const MAX_MONTHS = 720; 

    while (currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01 && months < MAX_MONTHS) {
        months++;
        let availablePayment = fundsForDebtPayment;
        currentDebts.forEach(debt => { if (debt.principal > 0) debt.principal += debt.principal * (debt.interestRate / 100 / 12); });
        currentDebts.forEach(debt => {
             if (debt.principal > 0 && availablePayment > 0.01) {
                 const payment = Math.min(debt.minPayment, debt.principal, availablePayment);
                 debt.principal -= payment;
                 availablePayment -= payment;
             }
        });
        if (availablePayment > 0.01) {
             currentDebts.sort((a, b) => { const rateDiff = b.interestRate - a.interestRate; return rateDiff !== 0 ? rateDiff : b.principal - a.principal; });
             for (const debt of currentDebts) {
                 if (debt.principal > 0.01 && availablePayment > 0.01) {
                    const payment = Math.min(availablePayment, debt.principal);
                    debt.principal -= payment;
                    availablePayment -= payment;
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

  const handleAnalyzeDebt = async () => {
      setIsAnalyzing(true); setAnalysisError(null); setAnalysisResult(null); setIsAnalysisDialogOpen(true);
      if (debts.length === 0) { setAnalysisError("Add debts first."); setIsAnalyzing(false); return; }
      const analysisInput: DebtAnalysisInput = { debts, totalBudgetedIncome, totalBudgetedExpenses };
      try {
          const result = await analyzeDebtStrategy(analysisInput);
          setAnalysisResult(result);
      } catch (error: any) { console.error("Debt analysis failed:", error); setAnalysisError(`Analysis failed: ${error.message || 'Please try again.'}`); toast({ title: "Analysis Failed", variant: "destructive" }); }
      finally { setIsAnalyzing(false); }
  };
  const handleAnalysisDialogClose = () => { setIsAnalysisDialogOpen(false); };

  const handleExportCsv = useCallback(() => {
      if (debts.length === 0) { toast({ title: "No data to export" }); return; }
      const csvRows = debts.map(debt => ({
        Description: debt.description.replace(/"/g, "''"), // Sanitize description
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

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <PageHeader
        title="Manage Debts"
        description="Track debts, view amortization, and get payoff strategies."
        icon={<Coins />}
      >
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleAddClick}><PlusCircle className="mr-2 h-4 w-4" /> Add Debt</Button>
           <Button onClick={handleAnalyzeDebt} disabled={isAnalyzing || debts.length === 0}> {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />} {isAnalyzing ? 'Analyzing...' : 'Suggest Strategy'}</Button>
           <Button asChild variant="default"><Link href="/debt/import"><FileUp className="mr-2 h-4 w-4" /> Import CSV</Link></Button>
            <Button variant="secondary" onClick={handleExportCsv} disabled={debts.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
        </div>
      </PageHeader>

      <Card className="mb-6 mx-4 md:mx-6 lg:mx-8 shadow-md">
        <CardHeader className="p-6">
          <CardTitle className="text-lg">Debt Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm p-6">
          <div className="flex flex-col p-3 rounded-md border bg-destructive/10">
            <span className="text-muted-foreground mb-1">Total Outstanding Debt</span>
            <span className="font-bold text-lg font-mono text-destructive">{formatCurrency(debts.reduce((sum, d) => sum + d.principal, 0))}</span>
          </div>
           <div className="flex flex-col p-3 rounded-md border bg-primary/10">
             <span className="text-muted-foreground mb-1 flex items-center gap-1"><CalendarClock size={14}/> Estimated Payoff Timeline</span>
             <span className="font-bold text-lg font-mono text-primary">{debtPayoffTimeline}</span>
             <span className="text-xs text-muted-foreground">(Based on budgeted debt payments & avalanche method)</span>
           </div>
        </CardContent>
      </Card>

      <main className="flex-1 px-4 md:px-6 lg:px-8">
        <Card className="shadow-sm">
           <CardHeader className="p-4 md:p-6 border-b">
            <CardTitle className="text-lg">Debt List</CardTitle>
            <CardDescription>Your current outstanding debts.</CardDescription>
            {selectedDebtIds.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center border-t pt-4">
                    <span className="text-sm text-muted-foreground mb-2 sm:mb-0">{selectedDebtIds.length} selected</span>
                    <div className="flex flex-wrap gap-2">
                        {/* Batch update for debts could be added here if needed */}
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
              data={debts}
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
         <DebtAnalysisDialog isOpen={isAnalysisDialogOpen} onClose={handleAnalysisDialogClose} analysisResult={analysisResult} isLoading={isAnalyzing} error={analysisError} formatCurrency={formatCurrency} />

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
