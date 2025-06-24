'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowRight, TrendingUp, TrendingDown, Scale, Coins, Banknote, LineChart as LineChartIcon, Target, CheckCircle, AlertTriangle as AlertTriangleIcon, BookOpen, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore, selectCurrentBudgetPeriod, selectTotalBudgetedDebt } from '@/store/budgetStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, differenceInDays, parse, getDaysInMonth, isValid as isDateValid } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useSyncManager } from '@/hooks/useSyncManager';
import { PageHeader } from '@/components/layout/PageHeader';
import { useUser } from "@clerk/nextjs";

const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + (item.amount || 0), 0);
const calculateDebtTotal = (items: { principal: number }[]) => items.reduce((sum, item) => sum + (item.principal || 0), 0);

// --- Internal Components for Dashboard ---

interface MetricCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  primaryDescription?: string;
  secondaryDescription?: string;
  primaryLink?: { href: string; label: string };
  secondaryLink?: { href: string; label: string };
  valueColorClass?: string;
  children?: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon: Icon, primaryDescription, secondaryDescription, primaryLink, secondaryLink, valueColorClass, children }) => (
  <Card className="shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent className="p-4">
      <div className={cn("text-2xl font-bold", valueColorClass)}>
        {formatCurrency(value)}
      </div>
      {primaryDescription && <p className="text-xs text-muted-foreground">{primaryDescription}</p>}
      {secondaryDescription && <p className="text-xs text-muted-foreground mt-1">{secondaryDescription}</p>}
      {children}
      {(primaryLink || secondaryLink) && (
        <div className="flex items-center gap-4 mt-2">
          {primaryLink && (
            <Button asChild variant="link" size="sm" className="p-0 h-auto text-xs">
              <Link href={primaryLink.href}>{primaryLink.label} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          )}
          {secondaryLink && (
            <Button asChild variant="link" size="sm" className="p-0 h-auto text-xs">
              <Link href={secondaryLink.href}>{secondaryLink.label} <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          )}
        </div>
      )}
    </CardContent>
  </Card>
);

interface KpiCardProps {
    title: string;
    value: string;
    status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' | 'neutral' | 'warning';
    description: string;
    link?: { href: string; label: string };
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, status, description, link }) => {
    const statusConfig = {
        'on-track': { icon: CheckCircle, color: 'text-accent' },
        'under-budget': { icon: CheckCircle, color: 'text-accent' },
        'over-budget': { icon: AlertTriangleIcon, color: 'text-destructive' },
        'warning': { icon: AlertTriangleIcon, color: 'text-yellow-500' },
        'no-data': { icon: AlertTriangleIcon, color: 'text-muted-foreground' },
        'neutral': { icon: Scale, color: 'text-primary' },
    };

    const { icon: Icon, color } = statusConfig[status] || statusConfig.neutral;

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-2 p-4">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <div className="flex items-center gap-2">
                     <Icon className={cn("h-5 w-5", color)} />
                     <p className={cn("text-xl font-semibold", color)}>{value}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
                {link && (
                    <Button asChild variant="link" size="sm" className="p-0 h-auto mt-2 text-xs">
                        <Link href={link.href}>{link.label} <ArrowRight className="ml-1 h-3 w-3" /></Link>
                    </Button>
                )}
            </CardContent>
        </Card>
    );
};

export default function DashboardPage() {
  const allTransactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const assetItems = useStatementStore(state => state.assetItems);
  const otherLiabilityItems = useStatementStore(state => state.otherLiabilityItems);
  const investmentItems = useInvestmentStore(state => state.investmentItems);
  const storeStartDate = useStatementStore(state => state.startDate);
  const storeEndDate = useStatementStore(state => state.endDate);
  const currentBudgetPeriod = useBudgetStore(selectCurrentBudgetPeriod);
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const { toast } = useToast();
  const { gettingStartedDismissed, setGettingStartedDismissed: dismissGettingStartedCard } = useSyncManager();
  const { user } = useUser();

  const filteredTransactions = useMemo(() => {
    const start = storeStartDate && isDateValid(storeStartDate) ? storeStartDate.getTime() : 0;
    const end = storeEndDate && isDateValid(storeEndDate) ? new Date(storeEndDate).setHours(23, 59, 59, 999) : Date.now();
    return allTransactions.filter(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return false;
        const txTime = txDate.getTime();
        return txTime >= start && txTime <= end;
    });
  }, [allTransactions, storeStartDate, storeEndDate]);

  const financialData = useMemo(() => {
    const totalAssetsFromStatement = calculateTotal(assetItems);
    const totalInvestmentValue = investmentItems.reduce((sum, item) => sum + (item.currentValue || 0), 0);
    const netWorthTotalAssets = totalAssetsFromStatement + totalInvestmentValue;

    const totalDebtValue = calculateDebtTotal(debts);
    const totalOtherLiabilitiesValue = calculateTotal(otherLiabilityItems);
    const totalLiabilitiesValue = totalDebtValue + totalOtherLiabilitiesValue;
    const netWorthValue = netWorthTotalAssets - totalLiabilitiesValue;

    const totalIncomeAllTime = calculateTotal(allTransactions.filter(tx => tx.amount > 0));
    const totalExpensesAllTime = Math.abs(calculateTotal(allTransactions.filter(tx => tx.amount < 0)));
    const netCashFlowAllTime = totalIncomeAllTime - totalExpensesAllTime;

    return {
      netWorth: netWorthValue,
      cashFlow: netCashFlowAllTime,
      totalDebt: totalDebtValue,
      totalAssets: netWorthTotalAssets,
      totalLiabilities: totalLiabilitiesValue,
      totalIncome: totalIncomeAllTime,
      totalExpenses: totalExpensesAllTime,
      totalOtherLiabilities: totalOtherLiabilitiesValue,
      totalInvestmentValue: totalInvestmentValue,
    };
  }, [allTransactions, debts, assetItems, otherLiabilityItems, investmentItems]);

  const [debtPayoffTimeline, setDebtPayoffTimeline] = useState<{value: string, status: KpiCardProps['status']}>({ value: "N/A", status: "no-data"});
  const monthlyBudgetedDebtPayment = useBudgetStore(selectTotalBudgetedDebt);

  useEffect(() => {
    const fundsForDebtPayment = monthlyBudgetedDebtPayment;
    const totalDebtPrincipal = financialData.totalDebt;

    if (totalDebtPrincipal <= 0) {
        setDebtPayoffTimeline({ value: "Debt Free!", status: 'on-track' }); return;
    }
    if (fundsForDebtPayment <= 0) {
        setDebtPayoffTimeline({ value: "No Debt Budget", status: 'no-data' }); return;
    }
    
    // Simplified calculation for display
    const monthsToPayoff = totalDebtPrincipal / fundsForDebtPayment;
    if (monthsToPayoff > 720) {
        setDebtPayoffTimeline({ value: `> 60 years`, status: 'warning' });
    } else {
        const years = Math.floor(monthsToPayoff / 12);
        const remainingMonths = Math.ceil(monthsToPayoff % 12);
        let timelineString = "";
        if (years > 0) timelineString += `${years} year${years > 1 ? 's' : ''}`;
        if (remainingMonths > 0) { if (years > 0) timelineString += " and "; timelineString += `${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`; }
        setDebtPayoffTimeline({ value: `${timelineString || '< 1 month'}`, status: 'neutral' });
    }
  }, [financialData.totalDebt, monthlyBudgetedDebtPayment]);

  const budgetVariance = useMemo(() => {
    // This logic remains the same as it was already well-defined
    const actualIncome = filteredTransactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const actualExpenses = filteredTransactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const budgetItemsForPeriod = allBudgetItems.filter(item => item.period === currentBudgetPeriod);
    
    const stmtStart = storeStartDate || dfnsStartOfMonth(new Date());
    const stmtEnd = storeEndDate || dfnsEndOfMonth(new Date());
    const daysInStatement = differenceInDays(stmtEnd, stmtStart) + 1;
    const budgetMonthDate = parse(currentBudgetPeriod, 'yyyy-MM', new Date());
    const daysInBudgetMonth = isDateValid(budgetMonthDate) ? getDaysInMonth(budgetMonthDate) : 30;

    let proratedBudgetedIncome = 0;
    let proratedBudgetedExpenses = 0;
    if (daysInBudgetMonth > 0) {
        const budgetMultiplier = daysInStatement / daysInBudgetMonth;
        budgetItemsForPeriod.forEach(item => {
            if (item.category === 'income') proratedBudgetedIncome += item.amount * budgetMultiplier;
            else if (item.category !== 'unplanned-expense') proratedBudgetedExpenses += item.amount * budgetMultiplier;
        });
    }

    if (proratedBudgetedIncome === 0 && proratedBudgetedExpenses === 0 && actualIncome === 0 && actualExpenses === 0) {
        return { value: 0, status: 'no-data' as const };
    }
    const netBudgeted = proratedBudgetedIncome - proratedBudgetedExpenses;
    const netActual = actualIncome - actualExpenses;
    const variance = netActual - netBudgeted;
    const threshold = Math.max(Math.abs(netBudgeted * 0.05), 50);
    let status: KpiCardProps['status'] = 'no-data';
    if ( (proratedBudgetedIncome === 0 && proratedBudgetedExpenses === 0) && (actualIncome === 0 && actualExpenses === 0) ) status = 'no-data';
    else if (Math.abs(variance) <= threshold) status = 'on-track';
    else if (variance > 0) status = 'under-budget';
    else status = 'over-budget';

    return { value: variance, status };
  }, [filteredTransactions, allBudgetItems, currentBudgetPeriod, storeStartDate, storeEndDate]);

  const trendChartData = useMemo(() => {
    // This logic also remains the same
    const monthlyData: { [key: string]: { month: string; income: number; expense: number } } = {};
    const sortedAllTransactions = [...allTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sortedAllTransactions.forEach(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return;
        const monthKey = format(txDate, 'yyyy-MM');
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { month: format(txDate, 'MMM yy'), income: 0, expense: 0 };
        if (tx.amount > 0) monthlyData[monthKey].income += tx.amount;
        else if (tx.amount < 0) monthlyData[monthKey].expense += Math.abs(tx.amount);
    });
    return Object.values(monthlyData);
  }, [allTransactions]);

  const trendChartConfig = {
    income: { label: "Income", color: "hsl(var(--accent))" },
    expense: { label: "Expenses", color: "hsl(var(--destructive))" },
  } satisfies ChartConfig;

  const handleCloseGettingStarted = () => {
    dismissGettingStartedCard(true);
    toast({ title: "Getting Started Guide Dismissed" });
  };

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8 bg-background">
      <PageHeader
        title="Dashboard"
        description={<>High-level overview of your finances for period: <span className='font-semibold'>{storeStartDate && isDateValid(storeStartDate) ? format(storeStartDate, 'PP') : 'Start'} to {storeEndDate && isDateValid(storeEndDate) ? format(storeEndDate, 'PP') : 'End'}</span></>}
        icon={LayoutDashboard}
      />

      <main className="flex-1 grid gap-6 px-4 md:px-6 lg:px-8">
        {!gettingStartedDismissed && (
          <Alert>
            <BookOpen className="h-4 w-4" />
            <div className="flex-1">
              <AlertTitle>Welcome, {user?.firstName || 'User'}!</AlertTitle>
              <AlertDescription>
                Follow the links in the sidebar to add your transactions, manage debts, and set a budget to get started.
              </AlertDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={handleCloseGettingStarted} className="h-7 w-7 flex-shrink-0">
                <XCircle className="h-4 w-4" /><span className="sr-only">Dismiss</span>
            </Button>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Net Worth"
            value={financialData.netWorth}
            icon={Scale}
            primaryDescription={`Assets - Liabilities`}
            primaryLink={{ href: '/statements', label: 'View Statement' }}
            valueColorClass={financialData.netWorth >= 0 ? 'text-primary' : 'text-destructive'}
          />
          <MetricCard
            title="Cash Flow (Overall)"
            value={financialData.cashFlow}
            icon={financialData.cashFlow >= 0 ? TrendingUp : TrendingDown}
            primaryDescription="Total income minus total expenses"
            primaryLink={{ href: '/income-expenses', label: 'View Analysis' }}
            valueColorClass={financialData.cashFlow >= 0 ? 'text-accent' : 'text-destructive'}
          />
          <MetricCard
            title="Total Assets"
            value={financialData.totalAssets}
            icon={Banknote}
            primaryDescription={`Investments: ${formatCurrency(financialData.totalInvestmentValue)}`}
            primaryLink={{ href: '/statements', label: 'Manage Assets' }}
            secondaryLink={{ href: '/investments', label: 'Manage Investments' }}
          />
          <MetricCard
            title="Total Liabilities"
            value={financialData.totalLiabilities}
            icon={Coins}
            primaryDescription={`Debts: ${formatCurrency(financialData.totalDebt)}`}
            primaryLink={{ href: '/debt', label: 'Manage Debts' }}
            secondaryLink={{ href: '/statements', label: 'Other Liabilities' }}
          />
        </div>
        
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            <KpiCard
                title="Budget Variance"
                value={budgetVariance.status !== 'no-data' ? `${budgetVariance.value >= 0 ? '+' : ''}${formatCurrency(budgetVariance.value)}` : 'N/A'}
                status={budgetVariance.status}
                description={`vs. prorated budget for ${format(parse(currentBudgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy')}`}
                link={{ href: '/statements', label: 'View Full Report' }}
            />
             <KpiCard
                title="Estimated Debt Payoff"
                value={debtPayoffTimeline.value}
                status={debtPayoffTimeline.status}
                description="Based on Avalanche method & current budget"
                link={{ href: '/debt', label: 'Review Debts' }}
            />
        </div>

        <Card className="shadow-sm">
          <CardHeader className="p-4">
            <CardTitle className="text-base flex items-center gap-2">
              <LineChartIcon className="h-4 w-4 text-primary" /> Income/Expense Trend (Overall)
            </CardTitle>
            <CardDescription>Monthly income vs. expenses over time.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2 pr-6 pb-6">
            {trendChartData.length > 1 ? (
              <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
                <LineChart accessibilityLayer data={trendChartData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => value} stroke="hsl(var(--foreground))" />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => `KES ${Number(value) / 1000}k`} stroke="hsl(var(--foreground))" />
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
      </main>
    </div>
  );
}
