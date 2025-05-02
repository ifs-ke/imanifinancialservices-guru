
// src/components/debt/DebtAnalysisDialog.tsx
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose // Import DialogClose
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Loader2, BrainCircuit } from 'lucide-react';
import type { DebtAnalysisOutput } from '@/ai/flows/debt-analysis-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DebtAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  analysisResult: DebtAnalysisOutput | null;
  isLoading: boolean;
  error: string | null;
  formatCurrency: (amount: number) => string; // Pass formatter
}

const DebtAnalysisDialog: React.FC<DebtAnalysisDialogProps> = ({
  isOpen,
  onClose,
  analysisResult,
  isLoading,
  error,
  formatCurrency,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl"> {/* Increased width */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" /> Debt Strategy Analysis
          </DialogTitle>
          <DialogDescription>
            AI-powered suggestions for tackling your debts based on your current situation.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4"> {/* Added max height and padding */}
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

            {analysisResult && !isLoading && !error && (
                <div className="space-y-6">
                    {/* Strategy Recommendation */}
                    <section>
                         <h3 className="text-lg font-semibold mb-2">Recommended Strategy</h3>
                         <p className="text-base font-medium text-primary">{analysisResult.debtClearanceStrategy.split(':')[0]}</p> {/* Extract strategy name */}
                         <p className="text-sm text-muted-foreground mt-1">{analysisResult.debtClearanceStrategy.substring(analysisResult.debtClearanceStrategy.indexOf(':') + 1).trim()}</p> {/* Extract explanation */}
                     </section>

                      {/* Suggested Payments Table */}
                     <section>
                         <h3 className="text-lg font-semibold mb-2">Suggested Monthly Payments</h3>
                        <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead>Debt Description</TableHead>
                                     <TableHead className="text-right">Suggested Payment (KES)</TableHead>
                                     <TableHead>Rationale</TableHead>
                                 </TableRow>
                             </TableHeader>
                             <TableBody>
                                 {analysisResult.suggestedPayments.map((payment) => (
                                     <TableRow key={payment.debtId}>
                                         <TableCell className="font-medium">{payment.debtDescription}</TableCell>
                                         <TableCell className="text-right font-mono">{formatCurrency(payment.suggestedMonthlyPayment)}</TableCell>
                                         <TableCell className="text-xs text-muted-foreground">{payment.rationale}</TableCell>
                                     </TableRow>
                                 ))}
                             </TableBody>
                         </Table>
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
                             <p className="text-sm text-muted-foreground">{analysisResult.additionalTips}</p>
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
 
      