// src/components/debt/DebtAnalysisDialog.tsx
import React, { useMemo } from 'react'; // Added useMemo
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Loader2, BrainCircuit, Scale } from 'lucide-react';
import type { DebtAnalysisOutput } from '@/ai/flows/debt-analysis-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils'; // Import cn utility
import { Separator } from '@/components/ui/separator'; // Import Separator

interface DebtAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  analysisResult: DebtAnalysisOutput | null;
  isLoading: boolean;
  error: string | null;
  formatCurrency: (amount: number) => string;
  totalBudgetedDebtPayment: number; // New prop
  totalBudgetedIncome: number; // New prop
  totalBudgetedExpenses: number; // New prop
}

const DebtAnalysisDialog: React.FC<DebtAnalysisDialogProps> = ({
  isOpen,
  onClose,
  analysisResult,
  isLoading,
  error,
  formatCurrency,
  totalBudgetedDebtPayment,
  totalBudgetedIncome,
  totalBudgetedExpenses,
}) => {

  const reconciliationData = useMemo(() => {
    if (!analysisResult) return null;

    const totalAiSuggestedPayment = analysisResult.suggestedPayments.reduce(
        (sum, payment) => sum + payment.suggestedMonthlyPayment, 0
    );
    const differenceAiVsBudgeted = totalAiSuggestedPayment - totalBudgetedDebtPayment;
    const availableFromBudgetSummary = totalBudgetedIncome - totalBudgetedExpenses;

    return {
        totalAiSuggestedPayment,
        differenceAiVsBudgeted,
        availableFromBudgetSummary
    };
  }, [analysisResult, totalBudgetedDebtPayment, totalBudgetedIncome, totalBudgetedExpenses]);


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl"> 
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" /> Debt Strategy Analysis & Reconciliation
          </DialogTitle>
          <DialogDescription>
            AI-powered suggestions for tackling your debts, reconciled against your current budget.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4"> 
            <div className="py-4 space-y-6">
            {isLoading && (
                <div className="flex flex-col items-center justify-center gap-4 p-8 text-muted-foreground">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p>Analyzing your debt strategy...</p>
                </div>
            )}

            {error && !isLoading && (
                 <Alert variant="destructive">
                     <AlertTriangle className="h-4 w-4" />
                     <AlertTitle>Analysis Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                 </Alert>
            )}

            {analysisResult && reconciliationData && !isLoading && !error && (
                <div className="space-y-8">
                    {/* Reconciliation Summary */}
                    <section>
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Scale className="h-5 w-5 text-muted-foreground"/>Reconciliation Summary</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm p-4 border rounded-lg bg-muted/50">
                            <div>
                                <p className="text-muted-foreground">Budgeted Debt Repayment (Monthly):</p>
                                <p className="font-mono font-semibold text-lg">{formatCurrency(totalBudgetedDebtPayment)}</p>
                            </div>
                             <div>
                                <p className="text-muted-foreground">AI Suggested Total Monthly Payment:</p>
                                <p className="font-mono font-semibold text-lg">{formatCurrency(reconciliationData.totalAiSuggestedPayment)}</p>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-muted-foreground">Difference (AI Suggested - Budgeted):</p>
                                <p className={cn("font-mono font-semibold text-lg", reconciliationData.differenceAiVsBudgeted >= 0 ? 'text-accent' : 'text-destructive')}>
                                    {reconciliationData.differenceAiVsBudgeted >= 0 ? '+' : ''}{formatCurrency(reconciliationData.differenceAiVsBudgeted)}
                                </p>
                            </div>
                            <div className="md:col-span-2 border-t pt-3 mt-1">
                                <p className="text-xs text-muted-foreground">Overall Available from Budget (Income - Non-Debt Expenses):</p>
                                <p className="font-mono font-medium text-sm">{formatCurrency(reconciliationData.availableFromBudgetSummary)}</p>
                            </div>
                        </div>
                    </section>

                    <Separator />

                    {/* Strategy Recommendation */}
                    <section>
                         <h3 className="text-lg font-semibold mb-2">Recommended Strategy</h3>
                         <p className="text-base font-medium text-primary">{analysisResult.debtClearanceStrategy.split(':')[0]}</p> 
                         <p className="text-sm text-muted-foreground mt-1">{analysisResult.debtClearanceStrategy.substring(analysisResult.debtClearanceStrategy.indexOf(':') + 1).trim()}</p> 
                     </section>

                      {/* Suggested Payments Table */}
                     <section>
                         <h3 className="text-lg font-semibold mb-2">Suggested Monthly Payments</h3>
                        <div className="border rounded-md overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Debt Description</TableHead>
                                        <TableHead className="text-right">Suggested Payment (KES)</TableHead>
                                        <TableHead className="min-w-[200px]">Rationale</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysisResult.suggestedPayments.map((payment) => (
                                        <TableRow key={payment.debtId}>
                                            <TableCell className="font-medium max-w-[200px] truncate" title={payment.debtDescription}>{payment.debtDescription}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(payment.suggestedMonthlyPayment)}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{payment.rationale}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                     </section>

                      {/* Projected Timeline */}
                     <section>
                         <h3 className="text-lg font-semibold mb-2">Projected Payoff Timeline</h3>
                         <p className="text-xl font-bold text-accent">{analysisResult.projectedPayoffTimeline}</p>
                     </section>

                     {/* Additional Tips */}
                     {analysisResult.additionalTips && (
                         <section>
                             <h3 className="text-lg font-semibold mb-2">Additional Tips</h3>
                             <p className="text-sm text-muted-foreground bg-accent/10 p-3 rounded-md">{analysisResult.additionalTips}</p>
                         </section>
                     )}
                 </div>
            )}
            </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DebtAnalysisDialog;
