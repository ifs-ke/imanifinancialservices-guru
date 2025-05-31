// src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, TrendingUp, TrendingDown, Scale, Coins, PieChart, BarChart2, MinusCircle, LineChart as LineChartIcon, CalendarClock, Target, CheckCircle, AlertTriangle as AlertTriangleIcon, Banknote, Landmark, BookOpen, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore, selectCurrentBudgetPeriod, selectTotalBudgetedDebt } from '@/store/budgetStore';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, differenceInDays, parse, getDaysInMonth, isValid as isDateValid } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import type { BudgetItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useSyncManager } from '@/hooks/useSyncManager';
import { PageHeader } from '@/components/layout/PageHeader'; // Ensure this is imported

const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + item.principal, 0);
const calculateOtherLiabilityTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);

export default function DashboardPage() {
  const allTransactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const assetItems = useStatementStore(state => state.assetItems);
  const otherLiabilityItems = useStatementStore(state => state.otherLiabilityItems);
  const startDate = useStatementStore(state => state.startDate);
  const endDate = useStatementStore(state => state.endDate);
  
  const currentBudgetPeriod = useBudgetStore(selectCurrentBudgetPeriod);
  const allBudgetItems = useBudgetStore(state => state.budgetItems);

  const { toast } = useToast();
  const { gettingStartedDismissed, setGettingStartedDismissed } = useSyncManager();

   const filteredTransactions = useMemo(() => {
       const start = startDate && isDateValid(startDate) ? startDate.getTime() : 0; 
       const end = endDate && isDateValid(endDate) ? new Date(endDate).setHours(23, 59, 59, 999) : Date.now(); 
       return allTransactions.filter(tx => {
           const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
           if (isNaN(txDate.getTime())) return false;
           const txTime = txDate.getTime();
           return txTime >= start && txTime <= end;
       });
     }, [allTransactions, startDate, endDate]);

  const financialData = useMemo(() => {
    const totalAssets = calculateTotal(assetItems);
    const totalDebt = calculateDebtTotal(debts);
    const totalOtherLiabilities = calculateOtherLiabilityTotal(otherLiabilityItems);
    const totalLiabilities = totalDebt + totalOtherLiabilities;
    const netWorth = totalAssets - totalLiabilities;
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

  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<string>('N/A');
  const monthlyBudgetedDebtPayment = useBudgetStore(selectTotalBudgetedDebt);

   useEffect(() => {
    const fundsForDebtPayment = monthlyBudgetedDebtPayment;
    const totalDebtPrincipal = debts.reduce((sum, debt) => sum + debt.principal, 0);

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline("Debt Free!");
        return;
    }
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
    if (fundsForDebtPayment < totalMinPayments) {
        setDebtPayoffTimeline(interestWarning ? "Warning: Min payments low." : "Warning: Budgeted debt funds < min payments.");
        return;
    }

    let currentDebts = debts.map(d => ({ ...d, principal: d.principal }));
    let months = 0;
    const MAX_MONTHS = 720; 

    while (currentDebts.reduce((sum, d) => sum + d.principal, 0) > 0.01 && months < MAX_MONTHS) {
        months++;
        let availablePayment = fundsForDebtPayment;
        currentDebts.forEach(debt => { if (debt.principal > 0) debt.principal += debt.principal * (debt.interestRate / 100 / 12); });
        currentDebts.forEach(debt => {
             if (debt.principal > 0 && availablePayment > 0.01) {
                 const payment = Math.min(debt.minPayment, debt.principal, availablePayment);
                 debt.principal -= payment;
                 availablePayment -= payment;
             }
        });
        if (availablePayment > 0.01) {
             currentDebts.sort((a, b) => { const rateDiff = b.interestRate - a.interestRate; return rateDiff !== 0 ? rateDiff : b.principal - a.principal; });
             for (const debt of currentDebts) {
                 if (debt.principal > 0.01 && availablePayment > 0.01) {
                    const payment = Math.min(availablePayment, debt.principal);
                    debt.principal -= payment;
                    availablePayment -= payment;
                  }
                  if(availablePayment <= 0.01) break; 
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
        if (years > 0) timelineString += `${years} year${years > 1 ? 's' : ''}`;
        if (remainingMonths > 0) { if (years > 0) timelineString += " and "; timelineString += `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`; }
        setDebtPayoffTimeline(`${timelineString || 'Less than a month'} (estimated)`);
     }
   }, [debts, monthlyBudgetedDebtPayment]); 

  const budgetVariance = useMemo(() => {
    const actualIncomeForStatementPeriod = filteredTransactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

    const actualExpensesForStatementPeriod = filteredTransactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    const budgetItemsForCurrentBudgetMonth = allBudgetItems.filter(item => item.period === currentBudgetPeriod);

    const stmtStart = startDate && isDateValid(startDate) ? startDate : dfnsStartOfMonth(new Date());
    const stmtEnd = endDate && isDateValid(endDate) ? endDate : dfnsEndOfMonth(new Date());
    const daysInStatementPeriod = differenceInDays(stmtEnd, stmtStart) + 1;
    
    const budgetMonthDate = parse(currentBudgetPeriod, 'yyyy-MM', new Date());
    const daysInActualBudgetMonth = isDateValid(budgetMonthDate) ? getDaysInMonth(budgetMonthDate) : 0;
    
    let budgetMultiplier = 0;
    if (daysInStatementPeriod > 0 && daysInActualBudgetMonth > 0) {
        const budgetMonthStart = dfnsStartOfMonth(budgetMonthDate);
        const budgetMonthEnd = dfnsEndOfMonth(budgetMonthDate);
        
        const overlapStart = stmtStart > budgetMonthStart ? stmtStart : budgetMonthStart;
        const overlapEnd = stmtEnd < budgetMonthEnd ? stmtEnd : budgetMonthEnd;

        if (overlapEnd >= overlapStart) {
            const effectiveDaysInStatementForBudget = differenceInDays(overlapEnd, overlapStart) + 1;
            budgetMultiplier = effectiveDaysInStatementForBudget / daysInActualBudgetMonth;
        }
    }

    let proratedBudgetedIncome = 0;
    let proratedBudgetedExpenses = 0; 

    budgetItemsForCurrentBudgetMonth.forEach(item => {
        const proratedAmount = item.amount * budgetMultiplier;
        if (item.category === 'income') {
            proratedBudgetedIncome += proratedAmount;
        } else if (item.category !== 'unplanned-expense') { 
            proratedBudgetedExpenses += proratedAmount;
        }
    });

    if (proratedBudgetedIncome === 0 && proratedBudgetedExpenses === 0 && actualIncomeForStatementPeriod === 0 && actualExpensesForStatementPeriod === 0) {
       return { value: null, status: 'no-data' as const };
    }
    
    const netBudgetedProrated = proratedBudgetedIncome - proratedBudgetedExpenses;
    const netActualForPeriod = actualIncomeForStatementPeriod - actualExpensesForStatementPeriod;
    const variance = netActualForPeriod - netBudgetedProrated;
    
    const threshold = Math.max(Math.abs(netBudgetedProrated * 0.05), 50); 
    let status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' = 'no-data';

    if ( (proratedBudgetedIncome === 0 && proratedBudgetedExpenses === 0) && (actualIncomeForStatementPeriod === 0 && actualExpensesForStatementPeriod === 0) ) {
        status = 'no-data';
    } else if (Math.abs(variance) <= threshold) {
        status = 'on-track';
    } else if (variance > 0) { 
        status = 'under-budget';
    } else { 
        status = 'over-budget'; 
    }

    return { value: variance, status };
  }, [filteredTransactions, allBudgetItems, currentBudgetPeriod, startDate, endDate]);

  const handleCloseGettingStarted = () => {
      setGettingStartedDismissed(true); 
      toast({
          title: "Getting Started Guide Dismissed",
          description: "You can always refer back to the documentation for help.",
      });
  };

  const handleShowGettingStarted = () => {
      setGettingStartedDismissed(false); 
  };

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
    <div className="flex flex-col min-h-screen w-full py-4 md:py-6 lg:py-8 bg-background">
       <PageHeader
          title="Executive Summary"
          description={
            <>
              High-level overview. Budget Variance uses range:
              {startDate || endDate ? (
                <span className='font-semibold ml-1'>
                  {startDate && isDateValid(startDate) ? format(startDate, 'PP') : 'Start'} - {endDate && isDateValid(endDate) ? format(endDate, 'PP') : 'End'}
                </span>
              ) : (
                <span className='font-semibold ml-1'>All Time</span>
              )}
            </>
          }
        >
            {gettingStartedDismissed && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShowGettingStarted}
                >
                    <BookOpen className="mr-2 h-4 w-4" /> Show Getting Started
                </Button>
            )}
       </PageHeader>

        {!gettingStartedDismissed && (
            <Card className="mb-6 mx-4 md:mx-6 lg:mx-8 shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-muted-foreground" data-ai-hint="bank building" /> Getting Started
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={handleCloseGettingStarted} className="h-7 w-7">
                        <XCircle className="h-4 w-4" />
                        <span className="sr-only">Dismiss</span>
                    </Button>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pt-4 p-4">
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

       <div className="grid gap-4 sm:gap-6 mb-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 px-4 md:px-6 lg:px-8">
         <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
             <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
             <Scale className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent className="p-4">
             <div className="text-2xl font-bold">
               {formatCurrency(financialData.netWorth)}
             </div>
             <p className="text-xs text-muted-foreground break-words">
                Assets ({formatCurrency(financialData.totalAssets)}) - Liabilities ({formatCurrency(financialData.totalLiabilities)})
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                 <Link href="/statements">
                     View Statement <ArrowRight className="ml-1 h-3 w-3" />
                 </Link>
             </Button>
           </CardContent>
         </Card>

         <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
             <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
             <Banknote className="h-4 w-4 text-muted-foreground" data-ai-hint="money cash" />
           </CardHeader>
           <CardContent className="p-4">
             <div className="text-2xl font-bold">
               {formatCurrency(financialData.totalAssets)}
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

          <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
             <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
             <Coins className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent className="p-4">
             <div className="text-2xl font-bold">
                 {formatCurrency(financialData.totalLiabilities)}
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

          <Card className="shadow-sm">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
             <CardTitle className="text-sm font-medium">Cash Flow (Overall)</CardTitle>
             {financialData.cashFlow >= 0 ? <TrendingUp className="h-4 w-4 text-accent" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
           </CardHeader>
           <CardContent className="p-4">
             <div className={`text-2xl font-bold ${financialData.cashFlow >= 0 ? 'text-accent' : 'text-destructive'}`}>
               {formatCurrency(financialData.cashFlow)}
             </div>
             <p className="text-xs text-muted-foreground break-words">
               Income ({formatCurrency(financialData.totalIncome)}) - Expenses ({formatCurrency(financialData.totalExpenses)})
             </p>
             <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                 <Link href="/income-expenses">
                     View Analysis <ArrowRight className="ml-1 h-3 w-3" />
                 </Link>
             </Button>
           </CardContent>
         </Card>

          <Card className="shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                 <CardTitle className="text-sm font-medium">Budget Variance</CardTitle>
                  {budgetVariance.status === 'no-data' && <MinusCircle className="h-4 w-4 text-muted-foreground" />}
                  {budgetVariance.status === 'on-track' && <CheckCircle className="h-4 w-4 text-accent" />}
                  {budgetVariance.status === 'under-budget' && <CheckCircle className="h-4 w-4 text-accent" />}
                  {budgetVariance.status === 'over-budget' && <AlertTriangleIcon className="h-4 w-4 text-destructive" />}
             </CardHeader>
              <CardContent className="p-4">
                  <div className={cn("text-2xl font-bold",
                      budgetVariance.status === 'no-data' && 'text-muted-foreground',
                      (budgetVariance.status === 'on-track' || budgetVariance.status === 'under-budget') && 'text-accent',
                      budgetVariance.status === 'over-budget' && 'text-destructive'
                  )}>
                      {budgetVariance.status !== 'no-data' && budgetVariance.value !== null ? `${budgetVariance.value >= 0 ? '+' : ''}${formatCurrency(budgetVariance.value)}` : 'N/A'}
                  </div>
                   <p className={cn("text-xs",
                       budgetVariance.status === 'no-data' && 'text-muted-foreground',
                       (budgetVariance.status === 'on-track' || budgetVariance.status === 'under-budget') && 'text-accent',
                       budgetVariance.status === 'over-budget' && 'text-destructive'
                   )}>
                       {budgetVariance.status === 'no-data' && 'No Data for Period'}
                       {budgetVariance.status === 'on-track' && 'On Track'}
                       {budgetVariance.status === 'under-budget' && 'Favorable Variance'}
                       {budgetVariance.status === 'over-budget' && 'Unfavorable Variance'}
                   </p>
                  <Button asChild variant="link" size="sm" className="p-0 h-auto mt-1 text-xs">
                      <Link href="/statements">
                          View Report <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                  </Button>
              </CardContent>
          </Card>
       </div>

       <main className="flex-1 grid gap-4 sm:gap-6 md:grid-cols-3 px-4 md:px-6 lg:px-8"> 
         <Card className="md:col-span-2 shadow-sm"> 
            <CardHeader className="p-4">
              <CardTitle className="text-base flex items-center gap-2">
                 <LineChartIcon className="h-4 w-4"/> Income/Expense Trend (Overall)
              </CardTitle>
              <CardDescription>Monthly income vs. expenses over time.</CardDescription>
            </CardHeader>
            <CardContent className="pl-2 pr-6 pb-6"> 
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

          <Card className="md:col-span-1 shadow-sm"> 
            <CardHeader className="p-4">
              <CardTitle className="text-base flex items-center gap-2">
                   <BarChart2 className="h-4 w-4" /> Cash Flow Summary (Overall)
              </CardTitle>
              <CardDescription>Total Income vs. Total Expenses</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center pt-4 p-4"> 
               {financialData.totalIncome > 0 || financialData.totalExpenses > 0 ? (
                  <ChartContainer config={cashFlowChartConfig} className="h-[200px] w-full max-w-[250px]"> 
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
