
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
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts'; // Changed to LineChart, Line
import { format, startOfMonth, endOfMonth } from 'date-fns'; // Import date-fns format
import { cn } from '@/lib/utils'; // Import cn utility
import type { BudgetItemCategory } from '@/lib/types'; // Import BudgetItemCategory


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
  const startDate = useStatementStore(state => state.startDate); // Get date range for filtering transactions
  const endDate = useStatementStore(state => state.endDate);
  // Use budget store selectors and items
  const totalBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalRecurringExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const totalOneTimeExpenses = useBudgetStore(selectTotalOneTimeExpenses);
  const totalGoals = useBudgetStore(selectTotalGoals);
  const netBudgetedMonthly = useBudgetStore(selectNetBudgeted); // Renamed for clarity in this context
  const totalBudgetedExpenses = useBudgetStore(selectTotalBudgetedExpenses); // Get total basic expenses
  const budgetItems = useBudgetStore(state => state.budgetItems); // Get budget items for variance


   // Filter transactions based on the global startDate and endDate from the store
   const filteredTransactions = useMemo(() => {
       const start = startDate ? startDate.getTime() : 0;
       // Set end date to the very end of the selected day
       const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Date.now();
       return allTransactions.filter(tx => {
           const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
           if (isNaN(txDate.getTime())) return false;
           const txTime = txDate.getTime();
           return txTime >= start && txTime <= end;
       });
     }, [allTransactions, startDate, endDate]); // Depend on store dates


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
  const [formattedBudgetVariance, setFormattedBudgetVariance] = useState<string>('N/A');
  const [budgetStatus, setBudgetStatus] = useState<'on-track' | 'over-budget' | 'under-budget' | 'no-data'>('no-data');
  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>('N/A'); // Add state for timeline


  // --- Debt Payoff Timeline Calculation ---
  useEffect(() => {
    // Use totalBudgetedIncome and totalBudgetedExpenses directly from store selectors
    const fundsForDebtPayment = totalBudgetedIncome - totalBudgetedExpenses; // Simple funds calculation
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

    // More robust amortization simulation (Avalanche Method)
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

         currentDebts = currentDebts.filter(debt => debt.principal > 0.01); // Remove paid-off debts
    }

    // Format timeline string
    if (months >= MAX_MONTHS && currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01) {
       setDebtPayoffTimeline(`Over ${Math.floor(MAX_MONTHS / 12)} years (est.)`);
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
         setDebtPayoffTimeline(`${timelineString || 'Less than a month'} (est.)`); // Handle case where it's paid off quickly
     }

     // Depend on debts from debtStore and income/expense selectors from budgetStore
    }, [debts, totalBudgetedIncome, totalBudgetedExpenses]);



  // Calculate Budget Variance using filtered transactions
  const budgetVariance = useMemo(() => {
      const actualIncome = calculateTotal(filteredTransactions.filter(tx => tx.amount > 0));
      const actualExpenses = Math.abs(calculateTotal(filteredTransactions.filter(tx => tx.amount < 0)));

       // Group budget items by category to calculate totals
       const budgetedTotalsByCategory: Record<BudgetItemCategory, number> = {
           income: 0,
           'recurring-expense': 0,
           'one-time-expense': 0,
           goal: 0,
       };
       budgetItems.forEach(item => {
           budgetedTotalsByCategory[item.category] += item.amount;
       });
       const totalBudgetedIncome = budgetedTotalsByCategory.income;
       const totalBudgetedExpenses = budgetedTotalsByCategory['recurring-expense'] + budgetedTotalsByCategory['one-time-expense'];
       const totalBudgetedGoals = budgetedTotalsByCategory.goal;

      // Check if budget data exists
       if (totalBudgetedIncome === 0 && totalBudgetedExpenses === 0 && totalBudgetedGoals === 0) {
           return { value: null, status: 'no-data' };
       }

      const netBudgeted = totalBudgetedIncome - totalBudgetedExpenses - totalBudgetedGoals;
      const netActual = actualIncome - actualExpenses; // Actual expenses for the period

      // Variance calculation: Actual Net - Budgeted Net
      // Positive variance means actual net is higher than budgeted (favorable)
      // Negative variance means actual net is lower than budgeted (unfavorable)
      const variance = netActual - netBudgeted;

      let status: typeof budgetStatus = 'no-data';
      if (variance > 0) status = 'under-budget'; // More income/less spending than budgeted (favorable)
      else if (variance < 0) status = 'over-budget'; // Less income/more spending than budgeted (unfavorable)
      else status = 'on-track'; // Actual matches budgeted exactly

       return { value: variance, status };
  }, [filteredTransactions, budgetItems]); // Depend on filtered transactions and budget items

  useEffect(() => {
    // Format the values here to avoid server/client differences
    setFormattedNetWorth(formatCurrency(financialData.netWorth));
    setFormattedTotalAssets(formatCurrency(financialData.totalAssets));
    setFormattedTotalLiabilities(formatCurrency(financialData.totalLiabilities)); // Use combined liabilities
    setFormattedCashFlow(formatCurrency(financialData.cashFlow));
    setFormattedTotalIncome(formatCurrency(financialData.totalIncome)); // Use all-time income data
    setFormattedTotalExpenses(formatCurrency(financialData.totalExpenses)); // Use all-time expense data
     // Format Budget Variance
     if (budgetVariance.value !== null) {
       setFormattedBudgetVariance(formatCurrency(budgetVariance.value));
       setBudgetStatus(budgetVariance.status);
     } else {
       setFormattedBudgetVariance('N/A');
       setBudgetStatus('no-data');
     }

  }, [financialData, budgetVariance]);

  // --- Chart Data and Config ---

   // 1. Income vs Expense Chart (Bar Chart - Based on ALL transactions)
   // Use theme variables for colors
   const cashFlowChartData = useMemo(() => [
     { name: 'Income', value: financialData.totalIncome, fill: "hsl(var(--accent))" }, // Use accent color for income
     { name: 'Expenses', value: financialData.totalExpenses, fill: "hsl(var(--destructive))" }, // Use destructive for expenses
   ], [financialData.totalIncome, financialData.totalExpenses]);

   const cashFlowChartConfig = {
     value: { label: 'Amount (KES)' },
     Income: { label: 'Income', color: "hsl(var(--accent))" }, // Use accent HSL
     Expenses: { label: 'Expenses', color: "hsl(var(--destructive))" }, // Use destructive HSL
   } satisfies ChartConfig;



    // 3. Income/Expense Trend Chart (Line Chart - Based on ALL transactions)
    // Use theme variables for colors
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
         income: { label: "Income", color: "hsl(var(--accent))" }, // Use accent HSL
         expense: { label: "Expenses", color: "hsl(var(--destructive))" }, // Use destructive HSL
         month: { label: "Month" },
     } satisfies ChartConfig;


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 bg-background">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Executive Summary
        </h1>
         {/* Date Range Display */}
         <p className="text-sm text-muted-foreground">
           High-level overview of your financial position. Budget Variance uses range:
           {startDate || endDate ? (
                <span className='font-semibold ml-1'>
                    {startDate ? format(startDate, 'PP') : 'Start'} - {endDate ? format(endDate, 'PP') : 'End'}
                </span>
            ) : (
                <span className='font-semibold ml-1'>All Time</span>
            )}
         </p>
      </header>

      {/* Metrics Grid (Top Section) */}
       <div className="grid gap-4 sm:gap-6 mb-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
         <Card className="lg:col-span-1">
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

          <Card className="lg:col-span-1">
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

          <Card className="lg:col-span-1">
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

          <Card className="lg:col-span-1">
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

          {/* Budget Variance Card - Updated status description */}
          <Card className="lg:col-span-1">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Budget Variance</CardTitle>
                  {/* Icon based on status */}
                  {budgetStatus === 'no-data' && <MinusCircle className="h-4 w-4 text-muted-foreground" />}
                  {budgetStatus === 'on-track' && <CheckCircle className="h-4 w-4 text-accent" />}
                  {budgetStatus === 'under-budget' && <CheckCircle className="h-4 w-4 text-accent" />}
                  {budgetStatus === 'over-budget' && <AlertTriangle className="h-4 w-4 text-destructive" />}
             </CardHeader>
              <CardContent>
                  <div className={cn("text-2xl font-bold",
                      budgetStatus === 'no-data' && 'text-muted-foreground',
                      (budgetStatus === 'on-track' || budgetStatus === 'under-budget') && 'text-accent',
                      budgetStatus === 'over-budget' && 'text-destructive'
                  )}>
                      {budgetStatus !== 'no-data' ? `${budgetVariance.value! >= 0 ? '+' : ''}${formattedBudgetVariance}` : 'N/A'}
                  </div>
                   <p className={cn("text-xs",
                      budgetStatus === 'no-data' && 'text-muted-foreground',
                      (budgetStatus === 'on-track' || budgetStatus === 'under-budget') && 'text-accent', // Favorable text color
                      budgetStatus === 'over-budget' && 'text-destructive' // Unfavorable text color
                  )}>
                      {budgetStatus === 'no-data' && 'No Budget/Actuals Data'}
                       {budgetStatus === 'on-track' && 'On Track (Actual matches Budget)'}
                       {budgetStatus === 'under-budget' && 'Favorable (Under Budget / Over Income)'}
                       {budgetStatus === 'over-budget' && 'Unfavorable (Over Budget / Under Income)'}
                   </p>
                  <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                      <Link href="/statements">
                          View Report <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                  </Button>
              </CardContent>
          </Card>
       </div>

       {/* Charts and Navigation Grid (Bottom Section) */}
       <main className="flex-1 grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"> {/* Changed to 3 columns */}
         {/* Chart Cards */}
         <Card className="md:col-span-2 lg:col-span-3 xl:col-span-2"> {/* Adjusted span */}
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
                             <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" /> {/* Use theme border color */}
                             <XAxis
                                 dataKey="month"
                                 tickLine={false}
                                 axisLine={false}
                                 tickMargin={8}
                                 tickFormatter={(value) => value.slice(0, 3)} // Show only month abbreviation
                                 stroke="hsl(var(--foreground))" // Use theme text color
                             />
                             <YAxis
                                 tickLine={false}
                                 axisLine={false}
                                 tickMargin={8}
                                 tickFormatter={(value) => `KES ${value / 1000}k`} // Format as thousands
                                 stroke="hsl(var(--foreground))" // Use theme text color
                             />
                             <ChartTooltip
                                 cursor={true} // Show cursor for LineChart
                                 content={<ChartTooltipContent indicator="line" />} // Use line indicator
                              />
                              <Line
                                 dataKey="income"
                                 type="monotone"
                                 stroke="hsl(var(--accent))" // Use theme accent
                                 strokeWidth={2}
                                 dot={false} // Optionally hide dots for cleaner look
                              />
                              <Line
                                 dataKey="expense"
                                 type="monotone"
                                 stroke="hsl(var(--destructive))" // Use theme destructive
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
          <Card className="md:col-span-1 lg:col-span-1 xl:col-span-1"> {/* Adjusted span */}
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
                            tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} // Use theme foreground
                            width={60} // Give slightly more space for labels
                          />
                          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" /> {/* Use theme border */}
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

         {/* Action/Navigation Cards - Make these span 1 column each for consistency */}
          <Card className="flex flex-col"> {/* Adjusted span */}
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

          <Card className="flex flex-col"> {/* Adjusted span */}
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

          <Card className="flex flex-col"> {/* Adjusted span */}
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
              {/* Debt Payoff Timeline */}
             <div className="mt-3 pt-3 border-t border-border"> {/* Use theme border */}
                 <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><CalendarClock size={12}/> Est. Debt Payoff Timeline</p>
                  <p className="font-semibold text-primary">{debtPayoffTimeline}</p>
              </div>
           </CardContent>
           <CardFooter>
             <Button asChild variant="secondary" className="w-full">
               <Link href="/debt">
                 Manage Debts <ArrowRight className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           </CardFooter>
         </Card>

         {/* Removed the last row containing "View Statements" and "Plan Your Budget" cards */}

       </main>
     </div>
  );
}

    