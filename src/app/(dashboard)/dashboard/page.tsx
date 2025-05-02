
// src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale, Coins, PieChart, BarChart2, MinusCircle, LineChart as LineChartIcon, CalendarClock, Target, CheckCircle, AlertTriangle, Banknote, Landmark } from 'lucide-react'; // Added Banknote, Landmark
import Link from 'next/link';
import Image from 'next/image';
import { useTransactionsStore } from '@/store/transactionsStore'; // Import transactions store
import { useDebtStore } from '@/store/debtStore'; // Import debt store
import { useStatementStore } from '@/store/statementStore'; // Import statement store for items and dates
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted } from '@/store/budgetStore'; // Import budget store hook and selectors
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts'; // Changed to LineChart, Line
import { format } from 'date-fns'; // Import date-fns format
import { cn } from '@/lib/utils'; // Import cn utility


// Calculation Functions (consider moving to utils)
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + item.principal, 0);
const calculateOtherLiabilityTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0); // Corrected from item.principal

// Formatting Functions
const formatCurrency = (amount: number | undefined) => {
   if (amount === undefined || isNaN(amount)) return 'N/A'; // Added NaN check
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES', // Use KES
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format date to 'MMM yyyy'
const formatMonthYear = (date: Date) => format(date, 'MMM yyyy');

export default function DashboardPage() {
  // Use Zustand store hooks directly
  const allTransactions = useTransactionsStore(state => state.transactions); // Get ALL transactions
  const debts = useDebtStore(state => state.debts);
  // Get statement items and date range from statementStore
  const assetItems = useStatementStore(state => state.assetItems);
  const otherLiabilityItems = useStatementStore(state => state.otherLiabilityItems);
  const startDate = useStatementStore(state => state.startDate); // Keep for header display
  const endDate = useStatementStore(state => state.endDate);     // Keep for header display
  // Use budget store selectors
  const totalBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalRecurringExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const totalOneTimeExpenses = useBudgetStore(selectTotalOneTimeExpenses);
  const totalGoals = useBudgetStore(selectTotalGoals);
  const netBudgetedMonthly = useBudgetStore(selectNetBudgeted); // Renamed for clarity in this context
  const totalBudgetedExpenses = useBudgetStore(selectTotalBudgetedExpenses); // Get total basic expenses


  // Calculate financial metrics based on ALL transactions and other context data
  const financialData = useMemo(() => {
    const totalAssets = calculateTotal(assetItems);
    const totalDebt = calculateDebtTotal(debts);
    const totalOtherLiabilities = calculateOtherLiabilityTotal(otherLiabilityItems);
    const totalLiabilities = totalDebt + totalOtherLiabilities;
    const netWorth = totalAssets - totalLiabilities;

    // Use ALL transactions for overall cash flow calculation
    const totalIncomeAllTime = calculateTotal(allTransactions.filter(tx => tx.amount > 0));
    const totalExpensesAllTime = Math.abs(calculateTotal(allTransactions.filter(tx => tx.amount < 0)));
    const netActualAllTime = totalIncomeAllTime - totalExpensesAllTime; // Actual net for ALL transactions

    return {
      netWorth,
      cashFlow: netActualAllTime, // Use all-time net actual
      totalDebt,
      totalAssets,
      totalLiabilities, // Add combined liabilities
      totalIncome: totalIncomeAllTime, // Use all-time income
      totalExpenses: totalExpensesAllTime, // Use all-time expenses
      totalOtherLiabilities,
    };
    // Dependencies updated to use allTransactions instead of filteredTransactions
  }, [allTransactions, debts, assetItems, otherLiabilityItems]);


  // State for formatted currency values to avoid hydration issues
  const [formattedNetWorth, setFormattedNetWorth] = useState<string>('N/A');
  const [formattedTotalAssets, setFormattedTotalAssets] = useState<string>('N/A');
  const [formattedTotalLiabilities, setFormattedTotalLiabilities] = useState<string>('N/A');
  const [formattedCashFlow, setFormattedCashFlow] = useState<string>('N/A');
  const [formattedTotalIncome, setFormattedTotalIncome] = useState<string>('N/A'); // Renamed state variable
  const [formattedTotalExpenses, setFormattedTotalExpenses] = useState<string>('N/A'); // Renamed state variable
  // Removed other liabilities state as it's now part of totalLiabilities


  useEffect(() => {
    // Format the values here to avoid server/client differences
    setFormattedNetWorth(formatCurrency(financialData.netWorth));
    setFormattedTotalAssets(formatCurrency(financialData.totalAssets));
    setFormattedTotalLiabilities(formatCurrency(financialData.totalLiabilities)); // Use combined liabilities
    setFormattedCashFlow(formatCurrency(financialData.cashFlow));
    setFormattedTotalIncome(formatCurrency(financialData.totalIncome)); // Use all-time income data
    setFormattedTotalExpenses(formatCurrency(financialData.totalExpenses)); // Use all-time expense data


    // Removed budget status/variance calculation from useEffect

  }, [financialData]);

  // --- Debt Payoff Timeline Calculation (Kept for potential use elsewhere, not main metrics) ---
  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>("N/A");

  useEffect(() => {
    // Calculation logic remains the same, based on total debt and budget figures
    const fundsForDebtPayment = totalBudgetedIncome - totalBudgetedExpenses;
    const totalDebtPrincipal = debts.reduce((sum, debt) => sum + debt.principal, 0);

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline("Debt Free!");
        return;
    }

    if (fundsForDebtPayment <= 0) {
        setDebtPayoffTimeline("Cannot estimate: Budgeted income does not cover basic expenses.");
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
    const MAX_MONTHS = 720;

    while (currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01 && months < MAX_MONTHS) {
        months++;
        let availablePayment = fundsForDebtPayment;

        currentDebts.forEach(debt => {
            if (debt.principal > 0) {
                debt.principal += debt.principal * (debt.interestRate / 100 / 12);
            }
        });

        currentDebts.forEach(debt => {
            if (debt.principal > 0) {
                const payment = Math.min(debt.minPayment, debt.principal, availablePayment);
                debt.principal -= payment;
                availablePayment -= payment;
            }
        });

        if (availablePayment > 0) {
            currentDebts.sort((a, b) => {
                 const rateDiff = b.interestRate - a.interestRate;
                 if (rateDiff !== 0) return rateDiff;
                 return b.principal - a.principal;
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
         setDebtPayoffTimeline(`${timelineString} (estimated)`);
     }

}, [debts, totalBudgetedIncome, totalBudgetedExpenses, totalGoals]); // Re-calculate on changes


  // --- Chart Data and Config ---

  // 1. Income vs Expense Chart (Bar Chart - Based on ALL transactions)
  const cashFlowChartData = useMemo(() => [
    { name: 'Income', value: financialData.totalIncome, fill: "hsl(var(--chart-2))" }, // Use all-time income
    { name: 'Expenses', value: financialData.totalExpenses, fill: "hsl(var(--destructive))" }, // Use all-time expenses
  ], [financialData.totalIncome, financialData.totalExpenses]); // Depend on all-time data

  const cashFlowChartConfig = {
    value: { label: 'Amount (KES)' },
    Income: { label: 'Income', color: "hsl(var(--chart-2))" },
    Expenses: { label: 'Expenses', color: "hsl(var(--destructive))" },
  } satisfies ChartConfig;

  // 2. Asset Allocation Chart (Pie Chart) - Remains the same, not date-dependent
   const assetChartData = useMemo(() =>
    assetItems
      .filter(item => item.amount > 0) // Only include positive assets
      .map((item, index) => ({
        name: item.description,
        value: item.amount,
        fill: `hsl(var(--chart-${(index % 5) + 1}))` // Cycle through chart colors
    })), [assetItems]);

   const assetChartConfig = useMemo(() => {
       const config: ChartConfig = {};
       assetChartData.forEach((item) => {
           config[item.name] = {
               label: item.name,
               color: item.fill // Use the same fill color assigned earlier
           };
       });
       // Add a key for the value itself for the tooltip
       config.value = { label: 'Amount (KES)' };
       return config;
   }, [assetChartData]);

   // 3. Income/Expense Trend Chart (Line Chart - Based on ALL transactions)
   const trendChartData = useMemo(() => {
        const monthlyData: { [key: string]: { month: string; income: number; expense: number } } = {};

        // Use ALL transactions for trend analysis
        const sortedAllTransactions = [...allTransactions].sort((a, b) => { // Use allTransactions
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
            return dateA.getTime() - dateB.getTime();
        });

        sortedAllTransactions.forEach(tx => {
            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
            if (isNaN(txDate.getTime())) return;

            const monthKey = format(txDate, 'yyyy-MM');
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { month: format(txDate, 'MMM yyyy'), income: 0, expense: 0 };
            }

            if (tx.amount > 0) {
                monthlyData[monthKey].income += tx.amount;
            } else if (tx.amount < 0) {
                monthlyData[monthKey].expense += Math.abs(tx.amount);
            }
        });

        return Object.values(monthlyData).sort((a, b) => {
            const dateA = new Date(a.month.replace(' ', ' 1, '));
            const dateB = new Date(b.month.replace(' ', ' 1, '));
            return dateA.getTime() - dateB.getTime();
        });
    }, [allTransactions]); // Depend on allTransactions

   const trendChartConfig = {
        income: { label: "Income", color: "hsl(var(--chart-2))" },
        expense: { label: "Expenses", color: "hsl(var(--destructive))" },
        month: { label: "Month" },
    } satisfies ChartConfig;


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 bg-background">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Executive Summary
        </h1>
        <p className="text-muted-foreground">
           High-level overview of your current financial position.
        </p>
      </header>

      {/* Updated grid layout for better responsiveness and new charts */}
      <main className="flex-1 grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">

        {/* Financial Metrics Cards - Span 1 col each */}
        <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formattedNetWorth}
            </div>
            <p className="text-xs text-muted-foreground">
               Assets ({formattedTotalAssets}) - Liabilities ({formattedTotalLiabilities})
            </p>
             {/* Link to Statements */}
            <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/statements">
                    View Statement <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
            </Button>
          </CardContent>
        </Card>

         <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formattedTotalAssets}
            </div>
            <p className="text-xs text-muted-foreground">
               Combined value of your assets
            </p>
            <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/statements">
                    Manage Assets <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
            </Button>
          </CardContent>
        </Card>

         <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {formattedTotalLiabilities}
            </div>
            <p className="text-xs text-muted-foreground">
               Debts ({formatCurrency(financialData.totalDebt)}) + Other Liabilities ({formatCurrency(financialData.totalOtherLiabilities)})
            </p>
            <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/debt">
                    Manage Debts <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
            </Button>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs ml-2">
                <Link href="/statements">
                    Manage Other <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
             </Button>
          </CardContent>
        </Card>

         <Card className="md:col-span-1 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash Flow (Overall)</CardTitle>
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
              {formattedCashFlow}
            </div>
            <p className="text-xs text-muted-foreground">
              Income ({formattedTotalIncome}) - Expenses ({formattedTotalExpenses})
            </p>
            <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                <Link href="/transactions">
                    View Transactions <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
            </Button>
          </CardContent>
        </Card>


         {/* Debt Payoff Timeline Card - Can be moved or kept based on importance */}
        {/* <Card className="md:col-span-1 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Debt Payoff Timeline</CardTitle>
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-lg font-bold">
                    {debtPayoffTimeline}
                </div>
                <p className="text-xs text-muted-foreground">
                    Based on current debt & budgeted expenses.
                </p>
                 <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                    <Link href="/debt">
                        Manage Debts <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                 </Button>
            </CardContent>
        </Card> */}



        {/* Chart Cards - Span full width on md, adjust for lg/xl */}
        <Card className="md:col-span-2 lg:col-span-4">
           <CardHeader>
             <CardTitle className="text-base flex items-center gap-2">
                <LineChartIcon className="h-4 w-4"/> Income/Expense Trend (Overall)
             </CardTitle>
             <CardDescription>Monthly income vs. expenses over the entire transaction history.</CardDescription>
           </CardHeader>
           <CardContent>
                {trendChartData.length > 1 ? ( // Need at least 2 points for a line chart
                    <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
                        {/* Changed to LineChart */}
                        <LineChart
                            accessibilityLayer
                            data={trendChartData}
                            margin={{ left: -20, right: 10, top: 10, bottom: 0 }}
                        >
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis
                                dataKey="month"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tickFormatter={(value) => value.slice(0, 3)} // Show only month abbreviation
                                // Optionally adjust number of ticks for smaller screens
                                // interval="preserveStartEnd" // Show start and end, adjust middle
                                // minTickGap={20} // Minimum gap between ticks
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tickFormatter={(value) => `KES ${value / 1000}k`} // Format as thousands
                            />
                            <ChartTooltip
                                cursor={true} // Show cursor for LineChart
                                content={<ChartTooltipContent indicator="line" />} // Use line indicator
                             />
                             {/* Removed defs for gradients */}
                             <Line
                                dataKey="income"
                                type="monotone"
                                stroke="hsl(var(--chart-2))"
                                strokeWidth={2}
                                dot={false} // Optionally hide dots for cleaner look
                             />
                             <Line
                                dataKey="expense"
                                type="monotone"
                                stroke="hsl(var(--destructive))"
                                strokeWidth={2}
                                dot={false} // Optionally hide dots for cleaner look
                             />
                        </LineChart>
                    </ChartContainer>
                 ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                        Not enough data for trend analysis (need transactions spanning at least two months).
                    </div>
                 )}
            </CardContent>
         </Card>

         {/* Existing Chart Cards */}
         <Card className="md:col-span-1 lg:col-span-2"> {/* Adjust span */}
           <CardHeader>
             <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="h-4 w-4" /> Cash Flow Summary (Overall) {/* Updated title */}
             </CardTitle>
             <CardDescription>Total Income vs. Total Expenses</CardDescription>
           </CardHeader>
           <CardContent>
              {financialData.totalIncome > 0 || financialData.totalExpenses > 0 ? ( // Use all-time data check
                 <ChartContainer config={cashFlowChartConfig} className="h-[200px] w-full">
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
                 <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                     No income or expense data available.
                 </div>
              )}
           </CardContent>
         </Card>

         <Card className="md:col-span-1 lg:col-span-2"> {/* Adjust span */}
           <CardHeader>
             <CardTitle className="text-base flex items-center gap-2">
                 <PieChart className="h-4 w-4"/> Asset Allocation
             </CardTitle>
             <CardDescription>Distribution of your assets by value</CardDescription>
           </CardHeader>
           <CardContent className="flex items-center justify-center">
              {assetChartData.length > 0 ? (
                  <ChartContainer config={assetChartConfig} className="h-[200px] w-full max-w-[300px]">
                     <ResponsiveContainer width="100%" height={200}>
                         <PieChart>
                          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideIndicator />} />
                          <Pie
                             data={assetChartData}
                             dataKey="value"
                             nameKey="name"
                             cx="50%"
                             cy="50%"
                             outerRadius={70}
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
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                     No positive asset data available. Add assets in Statements.
                 </div>
              )}
           </CardContent>
         </Card>


        {/* Action/Navigation Cards - Adjust spans */}
        <Card className="md:col-span-1 lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Manage Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow">
             <Image
              src="https://picsum.photos/400/200"
              alt="Ledger book with coins and pen"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="money ledger coins pen" // Updated hint
            />
            <p className="text-sm text-muted-foreground">
              Import, categorize, and manage your financial transactions.
            </p>
          </CardContent>
           <CardFooter>
             <Button asChild variant="outline" className="w-full">
              <Link href="/transactions">
                Go to Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Analyze Income & Expenses</CardTitle>
          </CardHeader>
           <CardContent className="flex-grow">
             <Image
              src="https://picsum.photos/400/200"
              alt="Graph showing upward and downward financial trends"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="finance chart graph money trend" // Updated hint
            />
            <p className="text-sm text-muted-foreground">
              Detailed breakdown of your income and expense patterns.
            </p>
          </CardContent>
           <CardFooter className="flex flex-col sm:flex-row gap-2">
                <Button asChild variant="secondary" className="flex-1">
                <Link href="/income-expenses">
                    View Analysis <TrendingUp className="ml-2 h-4 w-4" />
                </Link>
                </Button>
             </CardFooter>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Manage Debts</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow">
            <Image
              src="https://picsum.photos/400/200"
              alt="Stack of coins next to a calculator"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="coins calculator finance debt money"
            />
            <p className="text-sm text-muted-foreground">
              Track and manage your outstanding debts and view amortization.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/debt">
                Manage Debts <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="md:col-span-1 lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>View Statements</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow">
            <Image
              src="https://picsum.photos/400/200"
              alt="Formal financial statement document with pen"
              width={400}
              height={200}
              className="rounded-md object-cover mb-4 aspect-[2/1]"
              data-ai-hint="documents report sheet balance statement pen"
            />
            <p className="text-sm text-muted-foreground">
              Review Net Worth, Cash Flow, and Budget Variance Reports.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/statements">
                View Statements <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}

