
// src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale, Coins, PieChart, BarChart2 } from 'lucide-react'; // Added chart icons
import Link from 'next/link';
import Image from 'next/image';
import { useTransactions } from '@/contexts/TransactionsContext';
import { useDebt } from '@/contexts/DebtContext';
import { useStatement } from '@/contexts/StatementContext'; // Import statement context for assets
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart"; // Import Chart components
import { Bar, BarChart, Pie, PieSector, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts'; // Import specific Recharts components

// Calculation Functions (consider moving to utils)
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + item.principal, 0);

export default function DashboardPage() {
  const { transactions } = useTransactions();
  const { debts } = useDebt();
  const { assetItems } = useStatement(); // Get asset items

  // Calculate financial metrics based on context data
  const financialData = useMemo(() => {
    const totalAssets = calculateTotal(assetItems); // Calculate total assets from context
    const totalDebt = calculateDebtTotal(debts);
    const netWorth = totalAssets - totalDebt;

    // Calculate cash flow for the last 30 days (example)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransactions = transactions.filter(tx => tx.date >= thirtyDaysAgo);
    const totalIncomeRecent = calculateTotal(recentTransactions.filter(tx => tx.amount > 0));
    const totalExpensesRecent = Math.abs(calculateTotal(recentTransactions.filter(tx => tx.amount < 0)));
    const cashFlowRecent = totalIncomeRecent - totalExpensesRecent;

    return {
      netWorth,
      cashFlow: cashFlowRecent,
      totalDebt,
      totalAssets,
      totalIncomeRecent,
      totalExpensesRecent,
    };
  }, [transactions, debts, assetItems]); // Added assetItems dependency

  const formatCurrency = (amount: number | undefined) => {
     if (amount === undefined) return 'N/A'; // Handle undefined case
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // --- Chart Data and Config ---

  // 1. Income vs Expense Chart (Bar Chart)
  const cashFlowChartData = useMemo(() => [
    { name: 'Income', value: financialData.totalIncomeRecent, fill: "hsl(var(--chart-2))" }, // Green (accent)
    { name: 'Expenses', value: financialData.totalExpensesRecent, fill: "hsl(var(--destructive))" }, // Red
  ], [financialData.totalIncomeRecent, financialData.totalExpensesRecent]);

  const cashFlowChartConfig = {
    value: { label: 'Amount (KES)' },
    Income: { label: 'Income', color: "hsl(var(--chart-2))" }, // Green
    Expenses: { label: 'Expenses', color: "hsl(var(--destructive))" }, // Red
  } satisfies ChartConfig;

  // 2. Asset Allocation Chart (Pie Chart)
  const assetChartData = useMemo(() =>
    assetItems.map(item => ({
      name: item.description,
      value: item.amount,
      fill: `hsl(var(--chart-${(assetItems.indexOf(item) % 5) + 1}))` // Cycle through chart colors
    })), [assetItems]);

  const assetChartConfig = useMemo(() => {
     const config: ChartConfig = {};
     assetItems.forEach((item, index) => {
         config[item.description] = {
             label: item.description,
             color: `hsl(var(--chart-${(index % 5) + 1}))`
         }
     });
     return config;
  }, [assetItems]);


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
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(financialData.netWorth)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total Assets ({formatCurrency(financialData.totalAssets)}) minus Total Liabilities ({formatCurrency(financialData.totalDebt + financialData.totalOtherLiabilities)})
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
              Income ({formatCurrency(financialData.totalIncomeRecent)}) vs Expenses ({formatCurrency(financialData.totalExpensesRecent)})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
             <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(financialData.totalDebt)}
            </div>
            <p className="text-xs text-muted-foreground">
              Sum of liabilities from Debts page
            </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
              <Link href="/debt">
                Manage Debts <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
             </Button>
          </CardContent>
        </Card>

        {/* Chart Cards */}
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
                 <BarChart2 className="h-4 w-4" /> Cash Flow (Last 30d)
            </CardTitle>
            <CardDescription>Income vs. Expenses</CardDescription>
          </CardHeader>
          <CardContent>
             {financialData.totalIncomeRecent > 0 || financialData.totalExpensesRecent > 0 ? (
                <ChartContainer config={cashFlowChartConfig} className="h-[150px] w-full">
                  <BarChart accessibilityLayer data={cashFlowChartData} layout="vertical" margin={{left: 0, right: 10, top: 0, bottom: 0}}>
                     <XAxis type="number" hide />
                     <YAxis
                      dataKey="name"
                      type="category"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                     />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent hideLabel />}
                    />
                    <Bar dataKey="value" radius={5} />
                  </BarChart>
                </ChartContainer>
             ) : (
                <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
                    No income or expense data for the last 30 days.
                </div>
             )}
          </CardContent>
        </Card>

         <Card className="md:col-span-2 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4"/> Asset Allocation
            </CardTitle>
            <CardDescription>Distribution of your assets</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
             {assetItems.length > 0 ? (
                 <ChartContainer config={assetChartConfig} className="h-[150px] w-full max-w-[250px]">
                    <ResponsiveContainer width="100%" height={150}>
                        <PieChart>
                         <ChartTooltip content={<ChartTooltipContent nameKey="name" hideIndicator />} />
                        <Pie
                            data={assetChartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={60}
                            innerRadius={40} // Make it a donut chart
                            labelLine={false}
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`} // Optional: show percentage on slice
                            paddingAngle={2}
                         >
                              {assetChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                         </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </ChartContainer>
             ) : (
                 <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
                    No assets recorded yet. Add them in Statements.
                </div>
             )}
          </CardContent>
        </Card>

        {/* Action/Navigation Cards */}
        <Card className="md:col-span-1 lg:col-span-1">
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

        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader>
            <CardTitle>View Income/Expenses</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
             <Image
              src="https://picsum.photos/400/200"
              alt="Income/Expense illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4"
              data-ai-hint="money analysis report"
            />
            <p className="text-sm text-muted-foreground">
              Analyze your income and expense patterns.
            </p>
             <div className="flex gap-2 mt-auto">
                <Button asChild variant="secondary" className="flex-1">
                <Link href="/income">
                    Income Analysis <TrendingUp className="ml-2 h-4 w-4" />
                </Link>
                </Button>
                 <Button asChild variant="secondary" className="flex-1">
                <Link href="/expenses">
                    Expense Analysis <TrendingDown className="ml-2 h-4 w-4" />
                </Link>
                </Button>
             </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1">
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
              data-ai-hint="documents report sheet"
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


// Helper to calculate Total Other Liabilities (assuming useStatement context provides it)
const calculateOtherLiabilityTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);

// Updated financialData calculation including Other Liabilities
const calculateFinancialData = (transactions: any[], debts: any[], assetItems: any[], otherLiabilityItems: any[]) => {
    const totalAssets = calculateTotal(assetItems);
    const totalDebt = calculateDebtTotal(debts);
    const totalOtherLiabilities = calculateOtherLiabilityTotal(otherLiabilityItems); // Calculate this
    const netWorth = totalAssets - (totalDebt + totalOtherLiabilities); // Update net worth calc

    // Calculate cash flow for the last 30 days (example)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransactions = transactions.filter(tx => tx.date >= thirtyDaysAgo);
    const totalIncomeRecent = calculateTotal(recentTransactions.filter(tx => tx.amount > 0));
    const totalExpensesRecent = Math.abs(calculateTotal(recentTransactions.filter(tx => tx.amount < 0)));
    const cashFlowRecent = totalIncomeRecent - totalExpensesRecent;

    return {
      netWorth,
      cashFlow: cashFlowRecent,
      totalDebt,
      totalAssets,
      totalIncomeRecent,
      totalExpensesRecent,
      totalOtherLiabilities, // Return this too
    };
};

// Example usage in the component:
// const { otherLiabilityItems } = useStatement();
// const financialData = useMemo(() => calculateFinancialData(transactions, debts, assetItems, otherLiabilityItems), [transactions, debts, assetItems, otherLiabilityItems]);
// Make sure to import useStatement and get otherLiabilityItems

// In the Net Worth Card Content:
// <p className="text-xs text-muted-foreground">
//  Total Assets ({formatCurrency(financialData.totalAssets)}) minus Total Liabilities ({formatCurrency(financialData.totalDebt + financialData.totalOtherLiabilities)})
// </p>

// In the Debt Card Content: (Maybe add Other Liabilities here or a separate card)
// Option 1: Update Debt Card description
// <p className="text-xs text-muted-foreground">
//  Sum of structured debts. Other liabilities: {formatCurrency(financialData.totalOtherLiabilities)}
// </p>
// Option 2: Add a new Card for Other Liabilities
/*
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Other Liabilities</CardTitle>
    <MinusCircle className="h-4 w-4 text-muted-foreground" /> {/* Example Icon */}
  //</CardHeader>
  //<CardContent>
  //  <div className="text-2xl font-bold">
  //    {formatCurrency(financialData.totalOtherLiabilities)}
  //  </div>
  //  <p className="text-xs text-muted-foreground">
  //    From Net Worth Statement edits
  //  </p>
     {/* Optional link */}
//     <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
//       <Link href="/statements">
//         Manage Other Liabilities <ArrowRight className="ml-1 h-3 w-3" />
//       </Link>
//      </Button>
//   </CardContent>
// </Card>
//*/
