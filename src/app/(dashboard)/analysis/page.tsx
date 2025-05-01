'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Lightbulb, BarChartBig } from 'lucide-react';
import { analyzeDebtAndRecommendStrategy, type AnalyzeDebtOutput } from '@/ai/flows/debt-analysis-and-strategy';
import type { Transaction } from '@/services/transaction-importer';

// Mock data for demonstration - replace with actual data fetching/state management
const mockTransactions: Transaction[] = [
  { date: new Date(2024, 5, 15), description: 'Salary Deposit', amount: 3000 },
  { date: new Date(2024, 5, 16), description: 'Groceries - SuperMart', amount: -85.50 },
  { date: new Date(2024, 5, 17), description: 'Rent Payment', amount: -1200 },
  { date: new Date(2024, 5, 18), description: 'Credit Card Min Payment', amount: -150 },
  { date: new Date(2024, 5, 20), description: 'Student Loan Payment', amount: -300 },
  { date: new Date(2024, 5, 22), description: 'Car Loan Payment', amount: -450 },
];
const mockTotalDebt = 25000;

export default function AnalysisPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeDebtOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      // Prepare input for the AI flow
      const input = {
        transactions: mockTransactions.map(tx => ({
          ...tx,
          date: tx.date.toISOString(), // Convert Date to string for AI
        })),
        totalDebt: mockTotalDebt,
      };

      // Call the server action (AI flow)
      const result = await analyzeDebtAndRecommendStrategy(input);
      setAnalysisResult(result);
      toast({
        title: 'Analysis Complete',
        description: 'Your debt analysis and strategy recommendation is ready.',
      });
    } catch (err) {
      console.error('Analysis failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Analysis failed: ${errorMessage}`);
      toast({
        title: 'Analysis Failed',
        description: 'Could not generate debt analysis. Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Debt Analysis & Strategy
        </h1>
        <p className="text-muted-foreground">
          Get AI-powered insights based on Dave Ramsey's principles.
        </p>
      </header>

      <main className="flex-1 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Generate Your Debt Strategy</CardTitle>
            <CardDescription>
              Click the button below to analyze your current financial data (using mocked data for now) and receive a recommended debt repayment strategy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAnalysis} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Analyze My Debt'
              )}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {analysisResult && (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                 <BarChartBig className="h-5 w-5 text-primary" />
                <CardTitle>Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
                 <p className="text-sm whitespace-pre-wrap">{analysisResult.summary}</p>
              </CardContent>
            </Card>
            <Card className="bg-accent/10 border-accent">
              <CardHeader className="flex flex-row items-center gap-2 pb-2">
                 <Lightbulb className="h-5 w-5 text-accent" />
                <CardTitle className="text-accent">Strategy Recommendation</CardTitle>
              </CardHeader>
              <CardContent>
                 <p className="text-sm whitespace-pre-wrap text-accent-foreground/90">{analysisResult.recommendation}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {!isLoading && !analysisResult && !error && (
           <Alert>
             <Lightbulb className="h-4 w-4" />
             <AlertTitle>Ready to Analyze</AlertTitle>
             <AlertDescription>
               Click the "Analyze My Debt" button to get started. The analysis will use your transaction history and total debt information.
             </AlertDescription>
           </Alert>
        )}
      </main>
    </div>
  );
}
