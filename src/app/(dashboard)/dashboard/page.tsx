// src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale, Coins, PieChart, BarChart2, MinusCircle, LineChart as LineChartIcon, CalendarClock, Target, CheckCircle, AlertTriangle as AlertTriangleIcon, Banknote, Landmark, Cloud, CloudOff, Lightbulb, X } from 'lucide-react'; // Added X
import Link from 'next/link';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted, selectTotalBudgetedDebt } from '@/store/budgetStore'; // Import selectTotalBudgetedDebt
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { format, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import type { BudgetItemCategory } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useSyncManager } from '@/hooks/useSyncManager'; // Import hook to manage getting started state

// Calculation Functions
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + item.principal, 0);
const calculateOtherLiabilityTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0); // Use amount for other liabilities

// Formatting Functions
const formatCurrency = (amount: number | undefined) => {
   if (amount === undefined || isNaN(amount)) return 'N/A';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatMonthYear = (date: Date) => format(date, 'MMM yyyy');

export default function DashboardPage() {
  // Use Zustand store hooks directly
  const allTransactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const assetItems = useStatementStore(state => state.assetItems);
  const otherLiabilityItems = useStatementStore(state => state.otherLiabilityItems);
  const startDate = useStatementStore(state => state.startDate);
  const endDate = useStatementStore(state => state.endDate);
  const monthlyBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const monthlyRecurringExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const monthlyOneTimeExpenses = useBudgetStore(selectTotalOneTimeExpenses);
  const monthlyBudgetedGoals = useBudgetStore(selectTotalGoals);
  const monthlyNetBudgeted = useBudgetStore(selectNetBudgeted);
  const monthlyBudgetedExpenses = useBudgetStore(selectTotalBudgetedExpenses);
  const monthlyBudgetedDebtPayment = useBudgetStore(selectTotalBudgetedDebt); // Get budgeted debt payment
  const budgetItems = useBudgetStore(state => state.budgetItems);
  const { toast } = useToast();
  // Use hook for getting started state AND setter
  const { gettingStartedDismissed, setGettingStartedDismissed } = useSyncManager();

   // Filter transactions based on the global startDate and endDate from the store
   const filteredTransactions = useMemo(() => {
       // Use defaults if dates are undefined
       const start = startDate ? startDate.getTime() : 0; // Consider transactions from the beginning if no start date
       const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Date.now(); // Use now if no end date
       return allTransactions.filter(tx => {
           const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
           if (isNaN(txDate.getTime())) return false;
           const txTime = txDate.getTime();
           return txTime >= start && txTime <= end;
       });
     }, [allTransactions, startDate, endDate]);

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
    const netActualAllTime = totalIncomeAllTime - totalExpensesAllTime;

    return {
      netWorth,
      cashFlow: netActualAllTime,
      totalDebt,
      totalAssets,
      totalLiabilities,
      totalIncome: totalIncomeAllTime,
      totalExpenses: totalExpensesAllTime,
      totalOtherLiabilities,
    };
  }, [allTransactions, debts, assetItems, otherLiabilityItems]);

  // State for formatted currency values to avoid hydration issues
  const [formattedNetWorth, setFormattedNetWorth] = useState<string>('N/A');
  const [formattedTotalAssets, setFormattedTotalAssets] = useState<string>('N/A');
  const [formattedTotalLiabilities, setFormattedTotalLiabilities] = useState<string>('N/A');
  const [formattedCashFlow, setFormattedCashFlow] = useState<string>('N/A');
  const [formattedTotalIncome, setFormattedTotalIncome] = useState<string>('N/A');
  const [formattedTotalExpenses, setFormattedTotalExpenses] = useState<string>('N/A');
  const [formattedBudgetVariance, setFormattedBudgetVariance] = useState<string>('N/A');
  const [budgetStatus, setBudgetStatus] = useState<'on-track' | 'over-budget' | 'under-budget' | 'no-data'>('no-data');
  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>('N/A');

   // --- Debt Payoff Timeline Calculation ---
   useEffect(() => {
    // Use the explicitly budgeted amount for debt payments
    const fundsForDebtPayment = monthlyBudgetedDebtPayment;
    const totalDebtPrincipal = debts.reduce((sum, debt) => sum + debt.principal, 0);

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline("Debt Free!");
        return;
    }

    // Check if ANY funds are allocated for debt
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

    // Check if budgeted amount covers minimums
    if (fundsForDebtPayment < totalMinPayments) {
        setDebtPayoffTimeline(interestWarning ? "Warning: Min payments low." : "Warning: Budgeted debt funds < min payments.");
        return;
    }

    // Proceed with calculation using the budgeted amount
    let currentDebts = debts.map(d => ({ ...d, principal: d.principal }));
    let months = 0;
    const MAX_MONTHS = 720; // 60 years limit

    while (currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01 && months < MAX_MONTHS) {
        months++;
        let availablePayment = fundsForDebtPayment;

        // Apply interest first
        currentDebts.forEach(debt => { if (debt.principal > 0) debt.principal += debt.principal * (debt.interestRate / 100 / 12); });

        // Apply minimum payments first (within available funds)
        currentDebts.forEach(debt => {
            if (debt.principal > 0 && availablePayment > 0.01) {
                 const payment = Math.min(debt.minPayment, debt.principal, availablePayment);
                 debt.principal -= payment;
                 availablePayment -= payment;
            }
        });


        // Apply remaining available funds using Avalanche method
        if (availablePayment > 0.01) {
            // Sort by interest rate (highest first), then principal (highest first for tie-breaking)
            currentDebts.sort((a, b) => { const rateDiff = b.interestRate - a.interestRate; return rateDiff !== 0 ? rateDiff : b.principal - a.principal; });

            for (const debt of currentDebts) {
                if (debt.principal > 0.01 && availablePayment > 0.01) {
                    const payment = Math.min(availablePayment, debt.principal);
                    debt.principal -= payment;
                    availablePayment -= payment;
                 }
                 if(availablePayment <= 0.01) break; // Stop if no more funds
             }
        }
         currentDebts = currentDebts.filter(debt => debt.principal > 0.01); // Remove paid-off debts
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
   }, [debts, monthlyBudgetedDebtPayment]); // Use monthlyBudgetedDebtPayment as dependency


   // Calculate Budget Variance
   const budgetVariance = useMemo(() => {
       const actualIncome = calculateTotal(filteredTransactions.filter(tx => tx.amount > 0));
       const actualExpenses = Math.abs(calculateTotal(filteredTransactions.filter(tx => tx.amount < 0)));
       // Use defaults if dates are undefined
       const start = startDate || startOfMonth(new Date());
       const end = endDate || endOfMonth(new Date());
       const daysInPeriod = differenceInDays(end, start) + 1;
       const daysInAvgMonth = 30.44; // Average days in a month
       const budgetMultiplier = daysInPeriod / daysInAvgMonth;

       // Calculate prorated budget based on selected period
       const proratedBudgetedIncome = budgetItems
           .filter(item => item.category === 'income')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);
       const proratedBudgetedExpenses = budgetItems
           .filter(item => item.category === 'recurring-expense' || item.category === 'one-time-expense')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);
       const proratedBudgetedGoals = budgetItems
           .filter(item => item.category === 'goal')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);
        // Calculate prorated debt payments (optional, depends if you want variance on debt payments)
       const proratedBudgetedDebt = budgetItems
           .filter(item => item.category === 'debt')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);


       if ((proratedBudgetedIncome === 0 && proratedBudgetedExpenses === 0 && proratedBudgetedGoals === 0 && proratedBudgetedDebt === 0) || (actualIncome === 0 && actualExpenses === 0)) {
           return { value: null, status: 'no-data' };
       }

        // Include debt in net calculation for variance
        const netBudgetedProrated = proratedBudgetedIncome - proratedBudgetedExpenses - proratedBudgetedGoals - proratedBudgetedDebt;
       const netActual = actualIncome - actualExpenses; // Actual expenses include all spending, including debt payments if tracked as transactions
       const variance = netActual - netBudgetedProrated; // Positive variance means actual net income > budgeted net income (favorable)
       const threshold = Math.max(Math.abs(netBudgetedProrated * 0.01), 50); // 1% or KES 50 threshold
       let status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' = 'no-data';

       if (Math.abs(variance) <= threshold) status = 'on-track';
       else if (variance > 0) status = 'under-budget'; // Favorable (spent less or earned more than budgeted net)
       else status = 'over-budget'; // Unfavorable (spent more or earned less than budgeted net)

       return { value: variance, status };
   }, [filteredTransactions, budgetItems, startDate, endDate]);

  useEffect(() => {
    setFormattedNetWorth(formatCurrency(financialData.netWorth));
    setFormattedTotalAssets(formatCurrency(financialData.totalAssets));
    setFormattedTotalLiabilities(formatCurrency(financialData.totalLiabilities));
    setFormattedCashFlow(formatCurrency(financialData.cashFlow));
    setFormattedTotalIncome(formatCurrency(financialData.totalIncome));
    setFormattedTotalExpenses(formatCurrency(financialData.totalExpenses));
     if (budgetVariance.value !== null) {
       setFormattedBudgetVariance(formatCurrency(budgetVariance.value));
       setBudgetStatus(budgetVariance.status);
     } else {
       setFormattedBudgetVariance('N/A');
       setBudgetStatus('no-data');
     }
  }, [financialData, budgetVariance]);

  const handleCloseGettingStarted = () => {
      setGettingStartedDismissed(true); // Update local state via hook setter
      toast({
          title: "Getting Started Guide Dismissed",
          description: "You can always refer back to the documentation for help.",
      });
  };


  // --- Chart Data and Config ---
  const cashFlowChartData = useMemo(() => [
     { name: 'Income', value: financialData.totalIncome, fill: "hsl(var(--accent))" },
     { name: 'Expenses', value: financialData.totalExpenses, fill: "hsl(var(--destructive))" },
   ], [financialData.totalIncome, financialData.totalExpenses]);

   const cashFlowChartConfig = {
     value: { label: 'Amount (KES)' },
     Income: { label: 'Income', color: "hsl(var(--accent))" },
     Expenses: { label: 'Expenses', color: "hsl(var(--destructive))" },
   } satisfies ChartConfig

    const trendChartData = useMemo(() => {
         const monthlyData: { [key: string]: { month: string; income: number; expense: number } } = {};
         const sortedAllTransactions = [...allTransactions].sort((a, b) => {
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

             if (tx.amount > 0) monthlyData[monthKey].income += tx.amount;
             else if (tx.amount < 0) monthlyData[monthKey].expense += Math.abs(tx.amount);
         });

         return Object.values(monthlyData).sort((a, b) => {
             const dateA = new Date(a.month.replace(' ', ' 1, '));
             const dateB = new Date(b.month.replace(' ', ' 1, '));
             return dateA.getTime() - dateB.getTime();
         });
     }, [allTransactions]);

    const trendChartConfig = {
         income: { label: "Income", color: "hsl(var(--accent))" },
         expense: { label: "Expenses", color: "hsl(var(--destructive))" },
         month: { label: "Month" },
     } satisfies ChartConfig


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 bg-background">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Executive Summary
        </h1>
         <p className="text-sm text-muted-foreground">
           High-level overview. Budget Variance uses range:
           {startDate || endDate ? (
                <span className='font-semibold ml-1'>
                    {startDate ? format(startDate, 'PP') : 'Start'} - {endDate ? format(endDate, 'PP') : 'End'}
                </span>
            ) : (
                <span className='font-semibold ml-1'>All Time</span>
            )}
         </p>
      </header>

       {/* Getting Started Section */}
        {!gettingStartedDismissed && ( // Show only if not dismissed
            <Card className="mb-6 shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-muted-foreground" /> Getting Started
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={handleCloseGettingStarted}>
                        <X className="h-4 w-4" />
                        <span className="sr-only">Dismiss</span>
                    </Button>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pt-4"> {/* Added top padding */}
                    <p className="text-sm text-muted-foreground">
                        Welcome to IFC - Guru! Here's a quick guide:
                    </p>
                    <ol className="list-decimal pl-5 space-y-2 text-sm">
                        <li>
                            <Link href="/transactions" className="text-primary hover:underline">
                                Add your transactions
                            </Link>{" "}
                            (or import a CSV).
                        </li>
                        <li>
                            <Link href="/debt" className="text-primary hover:underline">
                                Manage your debts
                            </Link>{" "}
                            and see payoff estimates.
                        </li>
                         <li>
                            <Link href="/budget" className="text-primary hover:underline">
                                Set a budget
                            </Link>{" "}
                            to plan your spending.
                        </li>
                        <li>
                            <Link href="/statements" className="text-primary hover:underline">
                                Review statements
                            </Link>{" "}
                            (Net Worth, Cash Flow, Budget Variance).
                        </li>
                         <li>
                            <Link href="/weekly-review" className="text-primary hover:underline">
                                Perform a weekly review
                            </Link>{" "}
                            to add comments and journal entries.
                        </li>
                    </ol>
                     <p className="text-xs text-muted-foreground pt-2">Dismiss this card using the 'X' icon.</p>
                </CardContent>
            </Card>
        )}


       {/* Metrics Grid */}
       <div className="grid gap-4 sm:gap-6 mb-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
         {/* Net Worth Card */}
         <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
             <Scale className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">
               {formattedNetWorth}
             </div>
             <p className="text-xs text-muted-foreground break-words">
                Assets ({formattedTotalAssets}) - Liabilities ({formattedTotalLiabilities})
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                 <Link href="/statements">
                     View Statement <ArrowRight className="ml-1 h-3 w-3" />
                 </Link>
             </Button>
           </CardContent>
         </Card>

        {/* Total Assets Card */}
         <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
             <Landmark className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">
               {formattedTotalAssets}
             </div>
             <p className="text-xs text-muted-foreground break-words">
                Combined value of assets
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                 <Link href="/statements">
                     Manage Assets <ArrowRight className="ml-1 h-3 w-3" />
                 </Link>
             </Button>
           </CardContent>
         </Card>

        {/* Total Liabilities Card */}
          <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
             <Coins className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold">
                 {formattedTotalLiabilities}
             </div>
              <p className="text-xs text-muted-foreground break-words">
                Debts ({formatCurrency(financialData.totalDebt)}) + Other ({formatCurrency(financialData.totalOtherLiabilities)})
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

        {/* Cash Flow Card */}
          <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Cash Flow (Overall)</CardTitle>
             {financialData.cashFlow >= 0 ? <TrendingUp className="h-4 w-4 text-accent" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
           </CardHeader>
           <CardContent>
             <div className={`text-2xl font-bold ${financialData.cashFlow >= 0 ? 'text-accent' : 'text-destructive'}`}>
               {formattedCashFlow}
             </div>
             <p className="text-xs text-muted-foreground break-words">
               Income ({formattedTotalIncome}) - Expenses ({formattedTotalExpenses})
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                 <Link href="/income-expenses"> {/* Link to combined page */}
                     View Analysis <ArrowRight className="ml-1 h-3 w-3" />
                 </Link>
             </Button>
           </CardContent>
         </Card>

        {/* Budget Variance Card */}
          <Card className="shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Budget Variance</CardTitle>
                  {budgetStatus === 'no-data' && <MinusCircle className="h-4 w-4 text-muted-foreground" />}
                  {budgetStatus === 'on-track' && <CheckCircle className="h-4 w-4 text-accent" />}
                  {budgetStatus === 'under-budget' && <CheckCircle className="h-4 w-4 text-accent" />}
                  {budgetStatus === 'over-budget' && <AlertTriangleIcon className="h-4 w-4 text-destructive" />}
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
                       (budgetStatus === 'on-track' || budgetStatus === 'under-budget') && 'text-accent',
                       budgetStatus === 'over-budget' && 'text-destructive'
                   )}>
                       {budgetStatus === 'no-data' && 'No Data for Period'}
                       {budgetStatus === 'on-track' && 'On Track'}
                       {budgetStatus === 'under-budget' && 'Favorable Variance'}
                       {budgetStatus === 'over-budget' && 'Unfavorable Variance'}
                   </p>
                  <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                      <Link href="/statements">
                          View Report <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                  </Button>
              </CardContent>
          </Card>
       </div>

       {/* Charts Grid */}
       <main className="flex-1 grid gap-4 sm:gap-6 md:grid-cols-3"> {/* Adjusted grid */}
         {/* Income/Expense Trend Chart */}
         <Card className="md:col-span-2 shadow-sm"> {/* Span 2 cols */}
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                 <LineChartIcon className="h-4 w-4"/> Income/Expense Trend (Overall)
              </CardTitle>
              <CardDescription>Monthly income vs. expenses over time.</CardDescription>
            </CardHeader>
            <CardContent className="pl-2 pr-6 pb-6"> {/* Adjusted padding */}
                 {trendChartData.length > 1 ? (
                     <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
                         <LineChart accessibilityLayer data={trendChartData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                             <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                             <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => value.slice(0, 3)} stroke="hsl(var(--foreground))" />
                             <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => `KES ${value / 1000}k`} stroke="hsl(var(--foreground))" />
                             <ChartTooltip cursor={true} content={<ChartTooltipContent indicator="line" />} />
                              <Line dataKey="income" type="monotone" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                              <Line dataKey="expense" type="monotone" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                         </LineChart>
                     </ChartContainer>
                  ) : (
                     <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                         Not enough data for trend analysis (need transactions over multiple months).
                     </div>
                  )}
             </CardContent>
          </Card>

          {/* Cash Flow Summary Chart */}
          <Card className="md:col-span-1 shadow-sm"> {/* Span 1 col */}
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                   <BarChart2 className="h-4 w-4" /> Cash Flow Summary (Overall)
              </CardTitle>
              <CardDescription>Total Income vs. Total Expenses</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center pt-4"> {/* Adjusted padding */}
               {financialData.totalIncome > 0 || financialData.totalExpenses > 0 ? (
                  <ChartContainer config={cashFlowChartConfig} className="h-[200px] w-full max-w-[250px]"> {/* Constrained width */}
                    <BarChart accessibilityLayer data={cashFlowChartData} layout="vertical" margin={{left: 0, right: 10, top: 0, bottom: 0}}>
                         <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={10} tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} width={60} />
                          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                          <Bar dataKey="value" radius={5} />
                      </BarChart>
                  </ChartContainer>
               ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                      No income or expense data.
                  </div>
               )}
            </CardContent>
          </Card>
       </main>
     </div>
  );
}
