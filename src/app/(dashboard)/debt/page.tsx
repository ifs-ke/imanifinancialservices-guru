// src/app/(dashboard)/debt/page.tsx
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, List, BrainCircuit, Loader2, AlertTriangle, CalendarClock } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDebtStore } from '@/store/debtStore';
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalBudgetedExpenses, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { DebtItem } from '@/lib/types';
import Link from 'next/link';
import { format } from 'date-fns';
import DebtFormSheet from '@/components/debt/DebtFormSheet'; // Updated import path
import DebtAmortizationSheet from '@/components/debt/DebtAmortizationSheet';
import DebtAnalysisDialog from '@/components/debt/DebtAnalysisDialog';
import { analyzeDebtStrategy, type DebtAnalysisInput, type DebtAnalysisOutput } from '@/ai/flows/debt-analysis-flow';
import { formatCurrency, cn } from '@/lib/utils'; // Import cn

// Formatting Function (formatCurrency moved to utils)
const formatPercentage = (rate: number) => {
    return `${rate.toFixed(2)}%`;
};

export default function DebtPage() {
  const { debts, deleteDebt } = useDebtStore();
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

  const handleAddClick = () => { setEditingDebt(null); setIsFormSheetOpen(true); };
  const handleEditClick = (debt: DebtItem) => { setEditingDebt(debt); setIsFormSheetOpen(true); };
  const handleFormSheetClose = () => { setIsFormSheetOpen(false); setEditingDebt(null); };
  const handleDeleteClick = (debt: DebtItem) => { setDebtToDelete(debt); };
  const confirmDeleteDebt = () => { if (!debtToDelete) return; deleteDebt(debtToDelete.id); setDebtToDelete(null); toast({ title: 'Debt Deleted' }); };

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
      const csvRows = [['Description', 'Principal (KES)', 'Interest Rate (%)', 'Min Payment (KES)', 'Term']];
      for (const debt of debts) { const sanitizedDesc = debt.description.replace(/"/g, "''"); csvRows.push([`"${sanitizedDesc}"`, debt.principal, debt.interestRate, debt.minPayment, debt.term].join(',')); }
      const csvData = csvRows.join('\n'); const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'debts_export.csv'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); toast({ title: "CSV Exported" });
  }, [debts, toast]);

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary"/> Manage Debts
          </h1>
          <p className="text-muted-foreground">Track debts, view amortization, and get payoff strategies.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleAddClick}><PlusCircle className="mr-2 h-4 w-4" /> Add Debt</Button>
           <Button onClick={handleAnalyzeDebt} disabled={isAnalyzing || debts.length === 0}> {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />} {isAnalyzing ? 'Analyzing...' : 'Suggest Strategy'}</Button>
           <Button asChild variant="default"><Link href="/debt/import"><FileUp className="mr-2 h-4 w-4" /> Import CSV</Link></Button>
            <Button variant="secondary" onClick={handleExportCsv}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
        </div>
      </header>

      <Card className="mb-6 shadow-md">
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

      <main className="flex-1">
        <Card className="shadow-sm">
          <CardHeader className="p-6">
            <CardTitle className="text-lg">Debt List</CardTitle>
            <CardDescription>Your current outstanding debts.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6 pr-3">Description</TableHead>
                    <TableHead className="text-center px-3">Term</TableHead>
                    <TableHead className="text-right px-3">Principal</TableHead>
                    <TableHead className="text-right px-3">Rate</TableHead>
                    <TableHead className="text-right px-3">Min. Payment</TableHead>
                    <TableHead className="text-right w-[130px] pr-6 pl-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debts.length > 0 ? (
                    debts.map((debt) => (
                      <TableRow key={debt.id}>
                        <TableCell className="font-medium pl-6 pr-3">{debt.description}</TableCell>
                        <TableCell className="text-center text-xs capitalize text-muted-foreground px-3">{debt.term}</TableCell>
                        <TableCell className="text-right font-mono px-3">{formatCurrency(debt.principal)}</TableCell>
                        <TableCell className="text-right font-mono px-3">{formatPercentage(debt.interestRate)}</TableCell>
                        <TableCell className="text-right font-mono px-3">{formatCurrency(debt.minPayment)}</TableCell>
                        <TableCell className="text-right pr-6 pl-3 py-1">
                           <div className="flex justify-end items-center gap-0.5">
                               <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditClick(debt)}><Edit className="h-4 w-4" /><span className="sr-only">Edit</span></Button>
                               <DebtAmortizationSheet debt={debt}><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Amortization for ${debt.description}`}><List className="h-4 w-4" /><span className="sr-only">Amortization</span></Button></DebtAmortizationSheet>
                               <AlertDialog open={debtToDelete?.id === debt.id} onOpenChange={(open) => !open && setDebtToDelete(null)}>
                                 <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(debt)}><Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span></Button></AlertDialogTrigger>
                                <AlertDialogContent>{debtToDelete && debtToDelete.id === debt.id && (<><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>Delete: <strong>{debtToDelete.description} ({formatCurrency(debtToDelete.principal)})</strong>?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setDebtToDelete(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteDebt}>Delete</AlertDialogAction></AlertDialogFooter></>)}</AlertDialogContent>
                              </AlertDialog>
                           </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No debts recorded yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

         <DebtFormSheet isOpen={isFormSheetOpen} onClose={handleFormSheetClose} debt={editingDebt} />
         <DebtAnalysisDialog isOpen={isAnalysisDialogOpen} onClose={handleAnalysisDialogClose} analysisResult={analysisResult} isLoading={isAnalyzing} error={analysisError} formatCurrency={formatCurrency} />

      </main>
    </div>
  );
}

