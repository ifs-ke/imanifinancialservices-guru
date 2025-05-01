
// src/app/(dashboard)/dashboard/page.tsx
'use client'; // Add this directive because we now use hooks

import React from 'react'; // Removed { useState, useEffect } as they are not needed directly here
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale, Landmark, CircleDollarSign } from 'lucide-react'; // Changed Landmark to CircleDollarSign for Total Debt
import Link from 'next/link';
import Image from 'next/image';
import { useTransactions } from '@/contexts/TransactionsContext'; // Import transaction context
import { useDebt } from '@/contexts/DebtContext'; // Import debt context
import { useMemo } from 'react'; // Import useMemo for calculations

// Function to calculate total (can be moved to utils if needed elsewhere)
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + item.principal, 0);

export default function DashboardPage() {
  const { transactions } = useTransactions();
  const { debts } = useDebt();

  // Calculate financial metrics based on context data
  const financialData = useMemo(() => {
    // Simple Net Worth: Assuming Assets = 5,000,000 KES for now (needs real asset tracking)
    // A more robust solution would involve an Assets context similar to Debts/Transactions
    const mockTotalAssets = 5000000; // Replace with actual asset calculation later
    const totalDebt = calculateDebtTotal(debts);
    const netWorth = mockTotalAssets - totalDebt;

    // Calculate cash flow for the last 30 days (example)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransactions = transactions.filter(tx => tx.date >= thirtyDaysAgo);
    const totalIncomeRecent = calculateTotal(recentTransactions.filter(tx => tx.amount > 0));
    const totalExpensesRecent = Math.abs(calculateTotal(recentTransactions.filter(tx => tx.amount < 0)));
    const cashFlowRecent = totalIncomeRecent - totalExpensesRecent;

    return {
      netWorth,
      cashFlow: cashFlowRecent, // Use calculated cash flow
      totalDebt,
    };
  }, [transactions, debts]); // Recalculate when transactions or debts change

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 bg-background">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Your financial overview and progress.
        </p>
      </header>

      <main className="flex-1 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Financial Metrics Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth (Est.)</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(financialData.netWorth)}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated Assets minus Liabilities
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash Flow (Last 30d)</CardTitle>
            {financialData.cashFlow >= 0 ? (
              <TrendingUp className="h-4 w-4 text-accent" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                financialData.cashFlow >= 0 ? 'text-accent' : 'text-destructive'
              }`}
            >
              {formatCurrency(financialData.cashFlow)}
            </div>
            <p className="text-xs text-muted-foreground">
              Income vs expenses in last 30 days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
             <CircleDollarSign className="h-4 w-4 text-muted-foreground" /> {/* Changed icon */}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(financialData.totalDebt)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total outstanding liabilities
            </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
              <Link href="/debt">
                Manage Debts <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
             </Button>
          </CardContent>
        </Card>

        {/* Action/Navigation Cards */}
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle>Manage Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
             <Image
              src="https://picsum.photos/400/200"
              alt="Transactions illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4"
              data-ai-hint="finance transaction"
            />
            <p className="text-sm text-muted-foreground">
              Import, categorize, and manage your financial transactions.
            </p>
            <Button asChild variant="outline" className="mt-auto">
              <Link href="/transactions">
                Go to Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 lg:col-span-2"> {/* Adjusted span */}
          <CardHeader>
            <CardTitle>View Statements</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Image
              src="https://picsum.photos/400/200"
              alt="Financial statements illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4"
              data-ai-hint="documents report"
            />
            <p className="text-sm text-muted-foreground">
              Check your cash flow and net worth statements.
            </p>
            <Button asChild variant="secondary" className="mt-auto">
              <Link href="/statements">
                View Statements <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
