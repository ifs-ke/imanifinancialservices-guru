
// src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale, Coins, PieChart, BarChart2, MinusCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useTransactions } from '@/contexts/TransactionsContext';
import { useDebt } from '@/contexts/DebtContext';
import { useStatement } from '@/contexts/StatementContext';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, Pie, PieSector, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts'; // Renamed import to avoid conflict

// Calculation Functions (consider moving to utils)
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + item.principal, 0);
const calculateOtherLiabilityTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);

export default function DashboardPage() {
  const { transactions } = useTransactions();
  const { debts } = useDebt();
  const { assetItems, otherLiabilityItems } = useStatement();

  // Calculate financial metrics based on context data
  const financialData = useMemo(() => {
    const totalAssets = calculateTotal(assetItems);
    const totalDebt = calculateDebtTotal(debts);
    const totalOtherLiabilities = calculateOtherLiabilityTotal(otherLiabilityItems);
    const netWorth = totalAssets - (totalDebt + totalOtherLiabilities);

    // Calculate cash flow for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransactions = transactions.filter(tx => {
        const txDate = typeof tx.date === 'string' ? new Date(tx.date) : tx.date;
        return txDate instanceof Date && !isNaN(txDate.getTime()) && txDate >= thirtyDaysAgo;
    });
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
      totalOtherLiabilities,
    };
  }, [transactions, debts, assetItems, otherLiabilityItems]);

  const formatCurrency = (amount: number | undefined) => {
     if (amount === undefined) return 'N/A';
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
    { name: 'Income', value: financialData.totalIncomeRecent, fill: "hsl(var(--chart-2))" },
    { name: 'Expenses', value: financialData.totalExpensesRecent, fill: "hsl(var(--destructive))" },
  ], [financialData.totalIncomeRecent, financialData.totalExpensesRecent]);

  const cashFlowChartConfig = {
    value: { label: 'Amount (KES)' },
    Income: { label: 'Income', color: "hsl(var(--chart-2))" },
    Expenses: { label: 'Expenses', color: "hsl(var(--destructive))" },
  } satisfies ChartConfig;

  // 2. Asset Allocation Chart (Pie Chart)
   const assetChartData = useMemo(() =>
    assetItems
      .filter(item => item.amount > 0)
      .map((item, index) => ({
        name: item.description,
        value: item.amount,
        fill: `hsl(var(--chart-${(index % 5) + 1}))`
    })), [assetItems]);

   const assetChartConfig = useMemo(() => {
       const config: ChartConfig = {};
       assetChartData.forEach((item) => {
           config[item.name] = {
               label: item.name,
               color: item.fill
           };
       });
       return config;
   }, [assetChartData]);


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

      {/* Use grid layout for responsiveness */}
      <main className="flex-1 grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">

        {/* Financial Metrics Cards - Span 2 cols on smaller grids, 1 on larger */}
        <Card className="md:col-span-1 lg:col-span-2 xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(financialData.netWorth)}
            </div>
            <p className="text-xs text-muted-foreground">
               Assets ({formatCurrency(financialData.totalAssets)}) - Liabilities ({formatCurrency(financialData.totalDebt + financialData.totalOtherLiabilities)})
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-1 lg:col-span-2 xl:col-span-2">
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
              Income ({formatCurrency(financialData.totalIncomeRecent)}) - Expenses ({formatCurrency(financialData.totalExpensesRecent)})
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2 lg:col-span-2 xl:col-span-2"> {/* Span full width on md */}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
             <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(financialData.totalDebt)}
            </div>
             <p className="text-xs text-muted-foreground">
              Debts: {formatCurrency(financialData.totalDebt)}. Other Liabilities: {formatCurrency(financialData.totalOtherLiabilities)}
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
              <Link href="/debt">
                Manage Debts <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
             </Button>
          </CardContent>
        </Card>

        {/* Chart Cards - Span 2 cols each */}
        <Card className="md:col-span-2 lg:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
                 <BarChart2 className="h-4 w-4" /> Cash Flow (Last 30d)
            </CardTitle>
            <CardDescription>Income vs. Expenses</CardDescription>
          </CardHeader>
          <CardContent>
             {financialData.totalIncomeRecent > 0 || financialData.totalExpensesRecent > 0 ? (
                <ChartContainer config={cashFlowChartConfig} className="h-[200px] w-full"> {/* Increased height */}
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
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm"> {/* Increased height */}
                    No income or expense data for the last 30 days.
                </div>
             )}
          </CardContent>
        </Card>

         <Card className="md:col-span-2 lg:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4"/> Asset Allocation
            </CardTitle>
            <CardDescription>Distribution of your assets</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
             {assetChartData.length > 0 ? (
                 <ChartContainer config={assetChartConfig} className="h-[200px] w-full max-w-[300px]"> {/* Increased height and width */}
                    <ResponsiveContainer width="100%" height={200}> {/* Increased height */}
                        <PieChart>
                         <ChartTooltip content={<ChartTooltipContent nameKey="name" hideIndicator />} />
                         <Pie
                            data={assetChartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={70} // Slightly larger radius
                            innerRadius={50}
                            labelLine={false}
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
                 <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm text-center px-4"> {/* Increased height */}
                    No positive asset data available. Add assets in Statements.
                </div>
             )}
          </CardContent>
        </Card>

        {/* Action/Navigation Cards - Span 2 cols each */}
        <Card className="md:col-span-1 lg:col-span-2 xl:col-span-2">
          <CardHeader>
            <CardTitle>Manage Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
             <Image
              src="https://picsum.photos/400/200?random=1" // Added random query param for unique images
              alt="Transactions illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]" // Maintain aspect ratio
              data-ai-hint="finance transaction record"
            />
            <p className="text-sm text-muted-foreground flex-grow"> {/* Added flex-grow */}
              Import, categorize, and manage your financial transactions.
            </p>
            <Button asChild variant="outline" className="mt-auto">
              <Link href="/transactions">
                Go to Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-2 xl:col-span-2">
          <CardHeader>
            <CardTitle>View Income/Expenses</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
             <Image
              src="https://picsum.photos/400/200?random=2"
              alt="Income/Expense illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="money analysis report chart"
            />
            <p className="text-sm text-muted-foreground flex-grow">
              Analyze your income and expense patterns.
            </p>
             <div className="flex flex-col sm:flex-row gap-2 mt-auto"> {/* Stack vertically on small screens */}
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

        <Card className="md:col-span-2 lg:col-span-2 xl:col-span-2"> {/* Span full width on md */}
          <CardHeader>
            <CardTitle>View Statements</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Image
              src="https://picsum.photos/400/200?random=3"
              alt="Financial statements illustration"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="documents report sheet balance"
            />
            <p className="text-sm text-muted-foreground flex-grow">
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
