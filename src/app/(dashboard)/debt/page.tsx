
// src/app/(dashboard)/debt/page.tsx
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, List, BrainCircuit, Loader2, AlertTriangle, CalendarClock } from 'lucide-react'; // Added BrainCircuit, Loader2, AlertTriangle, CalendarClock
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDebtStore } from '@/store/debtStore'; // Import Zustand store hook
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalBudgetedExpenses } from '@/store/budgetStore'; // Import budget store hook and selectors
import type { DebtItem } from '@/lib/types';
import Link from 'next/link';
import { format } from 'date-fns';
import DebtFormSheet from '@/components/debt/DebtFormSheet'; // Import the form sheet
import DebtAmortizationSheet from '@/components/debt/DebtAmortizationSheet'; // Import the amortization sheet
import DebtAnalysisDialog from '@/components/debt/DebtAnalysisDialog'; // Import the analysis dialog
import { analyzeDebtStrategy, type DebtAnalysisInput, type DebtAnalysisOutput } from '@/ai/flows/debt-analysis-flow'; // Import the AI flow

// Formatting Functions
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercentage = (rate: number) => {
    return `${rate.toFixed(2)}%`;
};

export default function DebtPage() {
  // Use Zustand store hook for debt state management
  const { debts, deleteDebt } = useDebtStore();
  // Use Zustand store hook for budget data (using selectors)
  const totalBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalBudgetedExpenses = useBudgetStore(selectTotalBudgetedExpenses);
  const { toast } = useToast();

  // Local state remains the same
  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtItem | null>(null);
  const [debtToDelete, setDebtToDelete] = useState<DebtItem | null>(null);
  // State for AI Analysis
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DebtAnalysisOutput | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // State for Debt Payoff Timeline
  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>("N/A");


   // --- Debt Payoff Timeline Calculation (Copied from Dashboard, now local to Debt page) ---
   useEffect(() => {
    // Calculation logic remains the same, based on total debt and budget figures
    const fundsForDebtPayment = totalBudgetedIncome - totalBudgetedExpenses;
    const totalDebtPrincipal = debts.reduce((sum, debt) => sum + debt.principal, 0);

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline("Debt Free!");
        return;
    }

    if (fundsForDebtPayment <= 0) {
        setDebtPayoffTimeline("Cannot estimate: Budget doesn't cover expenses.");
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
        setDebtPayoffTimeline(interestWarning ? "Warning: Min payments may not cover interest." : "Warning: Funds less than min payments.");
        return;
    }

    let currentDebts = debts.map(d => ({ ...d, principal: d.principal }));
    let months = 0;
    const MAX_MONTHS = 720; // 60 years limit

    while (currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01 && months < MAX_MONTHS) {
        months++;
        let availablePayment = fundsForDebtPayment;

        // Accrue interest first
        currentDebts.forEach(debt => {
            if (debt.principal > 0) {
                debt.principal += debt.principal * (debt.interestRate / 100 / 12);
            }
        });

        // Pay minimums
        currentDebts.forEach(debt => {
            if (debt.principal > 0) {
                const payment = Math.min(debt.minPayment, debt.principal, availablePayment);
                debt.principal -= payment;
                availablePayment -= payment;
            }
        });

        // Apply extra payments (Avalanche method: highest interest first, then highest balance)
        if (availablePayment > 0) {
            currentDebts.sort((a, b) => {
                 const rateDiff = b.interestRate - a.interestRate;
                 if (rateDiff !== 0) return rateDiff;
                 return b.principal - a.principal; // Tie-breaker: higher balance
            });

            for (const debt of currentDebts) {
                 if (debt.principal > 0 && availablePayment > 0) {
                     const payment = Math.min(availablePayment, debt.principal);
                     debt.principal -= payment;
                     availablePayment -= payment;
                 }
                 if(availablePayment <= 0) break;
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
        if (years > 0) {
             timelineString += `${years} year${years > 1 ? 's' : ''}`;
        }
         if (remainingMonths > 0) {
             if (years > 0) timelineString += " and ";
             timelineString += `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
         }
         setDebtPayoffTimeline(`${timelineString || 'Less than a month'} (estimated)`); // Handle case where it's paid off quickly
     }

   }, [debts, totalBudgetedIncome, totalBudgetedExpenses]); // Re-calculate on changes


  // Handlers for opening sheets/dialogs
  const handleAddClick = () => {
    setEditingDebt(null);
    setIsFormSheetOpen(true);
  };

  const handleEditClick = (debt: DebtItem) => {
    setEditingDebt(debt);
    setIsFormSheetOpen(true);
  };

  // Handle closing the form sheet
  const handleFormSheetClose = () => {
      setIsFormSheetOpen(false);
      setEditingDebt(null);
  };


  // DELETE
  const handleDeleteClick = (debt: DebtItem) => {
    setDebtToDelete(debt);
  };

  const confirmDeleteDebt = () => {
    if (!debtToDelete) return;
    // Use deleteDebt action from Zustand store
    deleteDebt(debtToDelete.id);
    setDebtToDelete(null);
    toast({ title: 'Debt Deleted', description: 'Successfully removed debt item.' });
  };

  // --- AI Debt Analysis ---
  const handleAnalyzeDebt = async () => {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setAnalysisResult(null);
      setIsAnalysisDialogOpen(true); // Open dialog immediately to show loading

      if (debts.length === 0) {
          setAnalysisError("Please add debts before running the analysis.");
          setIsAnalyzing(false);
          return;
      }

      const analysisInput: DebtAnalysisInput = {
          debts: debts, // Use debts from Zustand store
          totalBudgetedIncome: totalBudgetedIncome, // Use income from budget store
          totalBudgetedExpenses: totalBudgetedExpenses, // Use expenses from budget store
      };

      try {
          console.log("Calling AI flow with input:", analysisInput); // Add logging
          const result = await analyzeDebtStrategy(analysisInput);
           console.log("AI flow result:", result); // Add logging
          setAnalysisResult(result);
      } catch (error: any) {
          console.error("Debt analysis failed:", error);
           setAnalysisError(`Analysis failed: ${error.message || 'Please try again.'}`);
          toast({
              title: "Analysis Failed",
              description: "Could not get debt strategy suggestions.",
              variant: "destructive"
          });
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleAnalysisDialogClose = () => {
      setIsAnalysisDialogOpen(false);
  };


  // --- Export Functionality (remains the same) ---
  const handleExportCsv = useCallback(() => {
      if (debts.length === 0) {
      toast({ title: "No data to export", description: "Add debts to export a CSV file.", variant: "default" });
      return;
      }

      const csvRows = [];
      const headers = ['Description', 'Principal (KES)', 'Interest Rate (%)', 'Min Payment (KES)', 'Term'];
      csvRows.push(headers.join(','));

      for (const debt of debts) {
      const sanitizedDescription = debt.description.replace(/"/g, "''");
      const values = [
          `"${sanitizedDescription}"`,
          debt.principal,
          debt.interestRate,
          debt.minPayment,
          debt.term,
      ].join(',');
      csvRows.push(values);
      }

      const csvData = csvRows.join('\n');
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'debts_export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: "CSV Exported", description: "Successfully downloaded debt data." });
  }, [debts, toast]);


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary"/> Manage Debts
          </h1>
          <p className="text-muted-foreground">
            Track your outstanding debts, view amortization, and get payoff strategies.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleAddClick}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Debt
          </Button>
           <Button onClick={handleAnalyzeDebt} disabled={isAnalyzing || debts.length === 0}>
             {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
             {isAnalyzing ? 'Analyzing...' : 'Suggest Strategy'}
           </Button>
           <Button asChild variant="default">
             <Link href="/debt/import">
               <FileUp className="mr-2 h-4 w-4" /> Import CSV
             </Link>
           </Button>
            <Button variant="secondary" onClick={handleExportCsv}>
              <FileDown className="mr-2 h-4 w-4" /> Export CSV
            </Button>
        </div>
      </header>

      {/* Debt Summary / Timeline Card */}
      <Card className="mb-6 shadow-md">
        <CardHeader>
          <CardTitle>Debt Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {/* Total Debt */}
          <div className="flex flex-col p-3 rounded-md border bg-destructive/10">
            <span className="text-muted-foreground mb-1">Total Outstanding Debt</span>
            <span className="font-bold text-lg font-mono text-destructive">{formatCurrency(debts.reduce((sum, d) => sum + d.principal, 0))}</span>
          </div>
          {/* Estimated Payoff Timeline */}
           <div className="flex flex-col p-3 rounded-md border bg-primary/10">
             <span className="text-muted-foreground mb-1 flex items-center gap-1"><CalendarClock size={14}/> Estimated Payoff Timeline</span>
             <span className="font-bold text-lg font-mono text-primary">{debtPayoffTimeline}</span>
             <span className="text-xs text-muted-foreground">(Based on current budget & avalanche method)</span>
           </div>
        </CardContent>
      </Card>

      <main className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Debt List</CardTitle>
            <CardDescription>Your current outstanding debts.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Term</TableHead>
                    <TableHead className="text-right">Principal Balance</TableHead>
                    <TableHead className="text-right">Interest Rate</TableHead>
                    <TableHead className="text-right">Min. Payment</TableHead>
                    <TableHead className="text-right w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debts.length > 0 ? (
                    debts.map((debt) => (
                      <TableRow key={debt.id}>
                        <TableCell className="font-medium">{debt.description}</TableCell>
                        <TableCell className="text-center text-xs capitalize text-muted-foreground">{debt.term}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(debt.principal)}</TableCell>
                        <TableCell className="text-right font-mono">{formatPercentage(debt.interestRate)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(debt.minPayment)}</TableCell>
                        <TableCell className="text-right">
                           {/* Edit Button - Opens Form Sheet */}
                           <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(debt)}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>

                           {/* Amortization Button - Opens Amortization Sheet */}
                            <DebtAmortizationSheet debt={debt}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mr-1 h-7 w-7"
                                    aria-label={`Show amortization for ${debt.description}`}
                                >
                                    <List className="h-4 w-4" />
                                    <span className="sr-only">Amortization</span>
                                </Button>
                            </DebtAmortizationSheet>

                          {/* Delete Button & Confirmation Dialog */}
                           <AlertDialog open={debtToDelete?.id === debt.id} onOpenChange={(open) => !open && setDebtToDelete(null)}>
                             <AlertDialogTrigger asChild>
                               <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(debt)}>
                                 <Trash2 className="h-4 w-4" />
                                 <span className="sr-only">Delete</span>
                               </Button>
                             </AlertDialogTrigger>
                            <AlertDialogContent>
                                {debtToDelete && debtToDelete.id === debt.id && ( // Render content only when this specific debt is selected
                                    <>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone. This will permanently delete the debt: <br />
                                                <strong>{debtToDelete.description} ({formatCurrency(debtToDelete.principal)})</strong>
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setDebtToDelete(null)}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={confirmDeleteDebt}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </>
                                )}
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No debts recorded yet. Add one or import a CSV to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

         {/* Debt Form Sheet (for Add/Edit) */}
         <DebtFormSheet
            isOpen={isFormSheetOpen}
            onClose={handleFormSheetClose}
            debt={editingDebt}
         />

         {/* Debt Analysis Dialog */}
         <DebtAnalysisDialog
             isOpen={isAnalysisDialogOpen}
             onClose={handleAnalysisDialogClose}
             analysisResult={analysisResult}
             isLoading={isAnalyzing}
             error={analysisError}
             formatCurrency={formatCurrency}
         />

      </main>
    </div>
  );
}

    