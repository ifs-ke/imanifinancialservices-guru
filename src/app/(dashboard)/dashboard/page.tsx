// src/app/(dashboard)/dashboard/page.tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight,
  PlusCircle,
  CreditCard,
  Calendar as CalendarIcon,
  ArrowRight,
  Check,
  RotateCcw,
  ShieldCheck,
  Zap,
  Compass,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip
} from 'recharts';
import { 
  format, 
  subMonths, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  startOfDay, 
  endOfDay, 
  isWithinInterval, 
  parseISO,
  isValid,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  differenceInCalendarDays,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useBudgetStore } from '@/store/budgetStore';
import { calculateBudgetThresholdWarnings } from '@/lib/budgetThresholdUtils';
import { isDebtActive } from '@/lib/debtUtils';
import BudgetThresholdWarningCard from '@/components/dashboard/BudgetThresholdWarningCard';

export type DateFilterPreset = 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'ytd' | 'all' | 'custom';

/**
 * Custom tooltip for the cash flow chart in sentence case
 */
interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

const CustomChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-xs text-popover-foreground p-2.5 rounded-lg shadow-md border border-border text-xs space-y-1 min-w-[140px]">
      <div className="font-semibold text-foreground border-b border-border/50 pb-1">{label}</div>
      {payload.map((entry, index) => (
        <div key={`tooltip-${index}`} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name === 'income' ? 'Income' : 'Expense'}:
          </span>
          <span className="font-mono font-medium text-foreground">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const transactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const assetItems = useStatementStore(state => state.assetItems);
  const otherLiabilityItems = useStatementStore(state => state.otherLiabilityItems);
  const investmentItems = useInvestmentStore(state => state.investmentItems);
  const budgetItems = useBudgetStore(state => state.budgetItems);

  // Date range filter state
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  // Compute active date range and sentence case labels
  const { dateRange, selectionDurationLabel, selectionSubtitle } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);
    let label = 'this month';
    let subtitle = format(now, 'MMMM yyyy');

    switch (datePreset) {
      case 'this-month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = 'this month';
        subtitle = format(now, 'MMMM yyyy');
        break;

      case 'last-month': {
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        label = 'last month';
        subtitle = format(lastMonth, 'MMMM yyyy');
        break;
      }

      case 'last-30':
        start = startOfDay(subDays(now, 30));
        end = endOfDay(now);
        label = 'last 30 days';
        subtitle = `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
        break;

      case 'last-90':
        start = startOfDay(subDays(now, 90));
        end = endOfDay(now);
        label = 'last 90 days';
        subtitle = `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
        break;

      case 'ytd':
        start = startOfYear(now);
        end = endOfDay(now);
        label = `YTD ${now.getFullYear()}`;
        subtitle = `Jan 1 – ${format(now, 'MMM d, yyyy')}`;
        break;

      case 'all': {
        // Find earliest transaction or fallback to 1 year ago
        let earliestDate = subMonths(now, 11);
        transactions.forEach(t => {
          const d = t.date instanceof Date ? t.date : new Date(t.date);
          if (!isNaN(d.getTime()) && d < earliestDate) {
            earliestDate = d;
          }
        });
        start = startOfMonth(earliestDate);
        end = endOfMonth(now);
        label = 'all time';
        subtitle = `${format(start, 'MMM yyyy')} – ${format(end, 'MMM yyyy')}`;
        break;
      }

      case 'custom': {
        const parsedStart = parseISO(customStartDate);
        const parsedEnd = parseISO(customEndDate);
        start = isValid(parsedStart) ? startOfDay(parsedStart) : startOfMonth(now);
        end = isValid(parsedEnd) ? endOfDay(parsedEnd) : endOfMonth(now);
        label = 'custom range';
        subtitle = `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
        break;
      }

      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = 'this month';
        subtitle = format(now, 'MMMM yyyy');
    }

    return {
      dateRange: { start, end },
      selectionDurationLabel: label,
      selectionSubtitle: subtitle,
    };
  }, [datePreset, customStartDate, customEndDate, transactions]);

  // Compute active budget period key ('yyyy-MM') and budget threshold warnings
  const activeBudgetPeriod = useMemo(() => {
    if (datePreset === 'this-month') return format(new Date(), 'yyyy-MM');
    if (datePreset === 'last-month') return format(subMonths(new Date(), 1), 'yyyy-MM');
    return format(dateRange.start, 'yyyy-MM');
  }, [datePreset, dateRange.start]);

  const budgetThresholdWarnings = useMemo(() => {
    return calculateBudgetThresholdWarnings(budgetItems, transactions, activeBudgetPeriod);
  }, [budgetItems, transactions, activeBudgetPeriod]);

  // Core financial metrics calculated from stores
  const financialMetrics = useMemo(() => {
    const liquidAssets = assetItems.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
    const investedAssets = investmentItems.reduce((sum, item) => sum + (Number(item?.currentValue || item?.amountInvested) || 0), 0);
    const totalAssets = liquidAssets + investedAssets;

    const totalDebt = debts.filter(isDebtActive).reduce((sum, debt) => sum + (Number(debt?.principal) || 0), 0);
    const otherLiabilities = otherLiabilityItems.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
    const totalLiabilities = totalDebt + otherLiabilities;

    const netWorth = totalAssets - totalLiabilities;

    let periodIncome = 0;
    let periodExpenses = 0;

    transactions.forEach(tx => {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (isNaN(txDate.getTime())) return;
      if (isWithinInterval(txDate, { start: dateRange.start, end: dateRange.end })) {
        if (tx.amount > 0) {
          periodIncome += tx.amount;
        } else if (tx.amount < 0) {
          periodExpenses += Math.abs(tx.amount);
        }
      }
    });

    const netCashFlow = periodIncome - periodExpenses;
    const savingsRate = periodIncome > 0 ? ((periodIncome - periodExpenses) / periodIncome) * 100 : 0;

    // =========================================================================
    // Weighted Average Monthly Burn Rate for Emergency Runway
    // Weights recent months progressively higher (linear recency weights: 1, 2, ... N)
    // to capture current cost of living while factoring in all historical monthly data
    // =========================================================================
    const expenseTx = transactions.filter(t => t.amount < 0);
    let weightedMonthlyBurn = 0;
    let monthsAnalyzed = 1;

    if (expenseTx.length > 0) {
      let earliestDate = new Date();
      const monthlyExpenseMap: Record<string, number> = {};

      expenseTx.forEach(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isValid(txDate)) {
          if (txDate < earliestDate) earliestDate = txDate;
          const monthKey = format(txDate, 'yyyy-MM');
          monthlyExpenseMap[monthKey] = (monthlyExpenseMap[monthKey] || 0) + Math.abs(tx.amount);
        }
      });

      const startMonth = startOfMonth(earliestDate);
      const endMonth = startOfMonth(new Date());
      let monthsInterval: Date[] = [];
      try {
        monthsInterval = eachMonthOfInterval({ start: startMonth, end: endMonth });
      } catch {
        monthsInterval = [startMonth];
      }

      monthsAnalyzed = Math.max(1, monthsInterval.length);
      let totalWeightedExpense = 0;
      let totalWeights = 0;

      monthsInterval.forEach((mDate, index) => {
        const key = format(mDate, 'yyyy-MM');
        const monthExpense = monthlyExpenseMap[key] || 0;
        // Linear recency weight from 1 (oldest month) to N (most recent month)
        const weight = index + 1;
        totalWeightedExpense += monthExpense * weight;
        totalWeights += weight;
      });

      weightedMonthlyBurn = totalWeights > 0 ? totalWeightedExpense / totalWeights : 0;
    } else if (periodExpenses > 0) {
      weightedMonthlyBurn = periodExpenses;
      monthsAnalyzed = 1;
    }

    const monthlyExpenses = weightedMonthlyBurn;
    const liquidityRatio = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : (liquidAssets > 0 ? 99 : 0);
    const liquidPercentage = totalAssets > 0 ? (liquidAssets / totalAssets) * 100 : 0;

    return {
      netWorth,
      totalAssets,
      totalLiabilities,
      liquidAssets,
      investedAssets,
      totalDebt,
      periodIncome,
      periodExpenses,
      netCashFlow,
      savingsRate,
      monthlyExpenses,
      monthsAnalyzed,
      liquidityRatio,
      liquidPercentage,
    };
  }, [assetItems, investmentItems, debts, otherLiabilityItems, transactions, dateRange]);

  // Health and benchmark status for liquidity ratio
  const liquidityHealth = useMemo(() => {
    const ratio = financialMetrics.liquidityRatio;
    if (ratio >= 6) {
      return {
        label: 'Optimal buffer',
        color: 'text-navy dark:text-gold border-gold/30',
        bg: 'bg-gold/10',
        barColor: 'bg-navy dark:bg-gold',
      };
    }
    if (ratio >= 3) {
      return {
        label: 'Healthy buffer',
        color: 'text-navy dark:text-navy-pale border-navy/30',
        bg: 'bg-navy/10',
        barColor: 'bg-navy',
      };
    }
    if (ratio >= 1) {
      return {
        label: 'Moderate buffer',
        color: 'text-amber-700 dark:text-amber-400 border-amber-500/30',
        bg: 'bg-amber-500/10',
        barColor: 'bg-amber-500',
      };
    }
    return {
      label: 'Low buffer',
      color: 'text-muted-foreground border-border',
      bg: 'bg-muted',
      barColor: 'bg-slate-400',
    };
  }, [financialMetrics.liquidityRatio]);

  // Dynamic cash flow chart data that adapts to selected date range and granularity
  const { chartData, chartSubtitle } = useMemo(() => {
    const { start, end } = dateRange;
    const daySpan = Math.max(1, differenceInCalendarDays(end, start));

    // Case 1: Short ranges (<= 35 days: this month, last month, last 30 days, or short custom range)
    // Granularity: Day by day
    if (daySpan <= 35) {
      let days: Date[] = [];
      try {
        days = eachDayOfInterval({ start, end });
      } catch {
        days = [start, end];
      }

      const dailyMap: { [key: string]: { label: string; income: number; expenses: number } } = {};
      days.forEach(day => {
        const key = format(day, 'yyyy-MM-dd');
        dailyMap[key] = {
          label: format(day, 'MMM d'),
          income: 0,
          expenses: 0,
        };
      });

      transactions.forEach(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return;
        const key = format(txDate, 'yyyy-MM-dd');
        if (dailyMap[key]) {
          if (tx.amount > 0) {
            dailyMap[key].income += tx.amount;
          } else if (tx.amount < 0) {
            dailyMap[key].expenses += Math.abs(tx.amount);
          }
        }
      });

      return {
        chartData: Object.values(dailyMap),
        chartSubtitle: `Daily trend for ${selectionDurationLabel} (${selectionSubtitle})`,
      };
    }

    // Case 2: Medium ranges (36 - 120 days: last 90 days, 3-4 months custom range)
    // Granularity: Weekly buckets
    if (daySpan <= 120) {
      let weeks: Date[] = [];
      try {
        weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      } catch {
        weeks = [start, end];
      }

      const weeklyList = weeks.map((weekStart) => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        return {
          start: weekStart,
          end: weekEnd,
          label: format(weekStart, 'MMM d'),
          income: 0,
          expenses: 0,
        };
      });

      transactions.forEach(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return;
        
        const targetWeek = weeklyList.find(w => 
          isWithinInterval(txDate, { start: startOfDay(w.start), end: endOfDay(w.end) })
        );
        if (targetWeek) {
          if (tx.amount > 0) {
            targetWeek.income += tx.amount;
          } else if (tx.amount < 0) {
            targetWeek.expenses += Math.abs(tx.amount);
          }
        }
      });

      return {
        chartData: weeklyList.map(w => ({
          label: w.label,
          income: w.income,
          expenses: w.expenses,
        })),
        chartSubtitle: `Weekly trend for ${selectionDurationLabel} (${selectionSubtitle})`,
      };
    }

    // Case 3: Long ranges (> 120 days: YTD, all time, multi-month custom ranges)
    // Granularity: Monthly buckets
    let months: Date[] = [];
    try {
      months = eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) });
    } catch {
      months = [start, end];
    }

    const monthlyMap: { [key: string]: { label: string; income: number; expenses: number } } = {};
    months.forEach(month => {
      const key = format(month, 'yyyy-MM');
      monthlyMap[key] = {
        label: format(month, 'MMM yy'),
        income: 0,
        expenses: 0,
      };
    });

    transactions.forEach(tx => {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (isNaN(txDate.getTime())) return;
      const key = format(txDate, 'yyyy-MM');
      if (monthlyMap[key]) {
        if (tx.amount > 0) {
          monthlyMap[key].income += tx.amount;
        } else if (tx.amount < 0) {
          monthlyMap[key].expenses += Math.abs(tx.amount);
        }
      }
    });

    return {
      chartData: Object.values(monthlyMap),
      chartSubtitle: `Monthly trend for ${selectionDurationLabel} (${selectionSubtitle})`,
    };
  }, [dateRange, selectionDurationLabel, selectionSubtitle, transactions]);

  // Recent 5 transactions
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5);
  }, [transactions]);

  return (
    <div className="flex flex-col w-full min-h-screen p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      
      {/* ========================================================= */}
      {/* EXECUTIVE HERO BANNER (Homepage Design Language) */}
      {/* ========================================================= */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs relative overflow-hidden transition-all hover:border-gold/30">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
          
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
              Financial Dashboard
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground max-w-2xl font-normal leading-relaxed">
              Consolidated real-time overview of net worth, cash flow, asset allocation, and emergency runway with zero-based envelope tracking.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
            <Link href="/transactions">
              <Button id="dashboard-record-tx-btn" className="h-10 px-4 text-xs font-semibold rounded-xl gap-2 shadow-xs bg-navy text-gold hover:bg-navy-mid dark:bg-gold dark:text-navy dark:hover:bg-gold-bright w-full sm:w-auto">
                <PlusCircle className="h-4 w-4" />
                <span>Record transaction</span>
              </Button>
            </Link>
          </div>

        </div>

        {/* Date Filter Bar */}
        <div className="mt-6 pt-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-gold" /> Active range:
            </span>
            <span className="text-xs font-semibold text-foreground bg-muted/60 px-2.5 py-1 rounded-lg border border-border/40 font-mono">
              {selectionSubtitle}
            </span>
          </div>

          {/* Date presets pill bar */}
          <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/50 text-xs flex-wrap gap-0.5">
            {(['this-month', 'last-month', 'last-30', 'last-90', 'ytd', 'all'] as const).map((preset) => {
              const labels: Record<string, string> = {
                'this-month': 'This month',
                'last-month': 'Last month',
                'last-30': '30 days',
                'last-90': '90 days',
                'ytd': 'YTD',
                'all': 'All'
              };
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDatePreset(preset)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                    datePreset === preset 
                      ? "bg-navy text-gold dark:bg-gold dark:text-navy shadow-xs font-semibold" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {labels[preset]}
                </button>
              );
            })}

            {/* Custom range popover */}
            <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer",
                    datePreset === 'custom' 
                      ? "bg-navy text-gold dark:bg-gold dark:text-navy shadow-xs font-semibold" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  <span>{datePreset === 'custom' ? 'Custom' : 'Custom...'}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-border/40 pb-2">
                    <span className="font-semibold text-foreground">Select date range</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-1.5 text-[11px] text-muted-foreground"
                      onClick={() => {
                        setDatePreset('this-month');
                        setIsCustomOpen(false);
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Reset
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="custom-start-date" className="text-[11px] text-muted-foreground">
                        Start date
                      </Label>
                      <Input
                        id="custom-start-date"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="custom-end-date" className="text-[11px] text-muted-foreground">
                        End date
                      </Label>
                      <Input
                        id="custom-end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2 border-t border-border/40">
                    <Button
                      size="sm"
                      className="h-8 text-xs font-medium w-full"
                      onClick={() => {
                        setDatePreset('custom');
                        setIsCustomOpen(false);
                      }}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Apply range
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Budget threshold warning banner/card */}
      <BudgetThresholdWarningCard 
        warnings={budgetThresholdWarnings} 
        periodLabel={selectionSubtitle} 
      />

      {/* ========================================================= */}
      {/* 🍱 HIGH-CONTRAST METRIC CARDS & BENTO GRID */}
      {/* ========================================================= */}
      
      {/* Top Metric Cards (4 Grid Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Total Net Worth */}
        <Card className="border border-border/80 shadow-xs bg-card hover:border-gold/40 transition-all rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <div>
              <span className="text-xs font-semibold text-muted-foreground block">
                Total net worth
              </span>
              <span className="text-[11px] text-muted-foreground/80">
                Asset & liability balance
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center shrink-0">
              <Scale className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <div className={cn(
              "text-2xl lg:text-3xl font-extrabold font-mono tracking-tight",
              financialMetrics.netWorth >= 0 ? "text-foreground" : "text-destructive"
            )}>
              {formatCurrency(financialMetrics.netWorth)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40 font-mono">
              <span>Assets: <strong className="text-foreground">{formatCurrency(financialMetrics.totalAssets)}</strong></span>
              <span>Liabilities: <strong className="text-muted-foreground">{formatCurrency(financialMetrics.totalLiabilities)}</strong></span>
            </div>
          </div>
        </Card>

        {/* Metric 2: Income */}
        <Card className="border border-border/80 shadow-xs bg-card hover:border-gold/40 transition-all rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <div>
              <span className="text-xs font-semibold text-muted-foreground block">
                Period income
              </span>
              <span className="text-[11px] text-muted-foreground/80">
                {selectionDurationLabel}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <div className="text-2xl lg:text-3xl font-extrabold font-mono text-foreground tracking-tight">
              +{formatCurrency(financialMetrics.periodIncome)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
              <span>Retention rate:</span>
              <span className="font-mono font-semibold text-navy dark:text-gold bg-transparent">
                {financialMetrics.savingsRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </Card>

        {/* Metric 3: Expenses */}
        <Card className="border border-border/80 shadow-xs bg-card hover:border-gold/40 transition-all rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <div>
              <span className="text-xs font-semibold text-muted-foreground block">
                Period expenses
              </span>
              <span className="text-[11px] text-muted-foreground/80">
                {selectionDurationLabel}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <div className="text-2xl lg:text-3xl font-extrabold font-mono text-foreground tracking-tight">
              -{formatCurrency(financialMetrics.periodExpenses)}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
              <span>Net cash flow:</span>
              <span className={cn(
                "font-mono font-semibold",
                financialMetrics.netCashFlow >= 0 ? "text-navy dark:text-gold" : "text-destructive"
              )}>
                {financialMetrics.netCashFlow >= 0 ? `+${formatCurrency(financialMetrics.netCashFlow)}` : `-${formatCurrency(Math.abs(financialMetrics.netCashFlow))}`}
              </span>
            </div>
          </div>
        </Card>

        {/* Metric 4: Liquidity Runway */}
        <Card className="border border-border/80 shadow-xs bg-card hover:border-gold/40 transition-all rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <div>
              <span className="text-xs font-semibold text-muted-foreground block">
                Liquidity runway
              </span>
              <span className="text-[11px] text-muted-foreground/80">
                Emergency coverage
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <div className="text-2xl lg:text-3xl font-extrabold font-mono text-foreground tracking-tight flex items-baseline justify-between">
              <span>{financialMetrics.liquidityRatio.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">mos</span></span>
              <Badge variant="outline" className={cn("text-[10px] font-semibold py-0.5 px-2", liquidityHealth.color)}>
                {liquidityHealth.label}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40 font-mono">
              <span>Monthly burn:</span>
              <span className="font-semibold text-foreground">{formatCurrency(financialMetrics.monthlyExpenses)}</span>
            </div>
          </div>
        </Card>

      </div>

      {/* Main Bento Grid: Cash Flow Chart & Asset Allocation */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">

        {/* Bento Centerpiece: Cash Flow Area Chart (8 cols) */}
        <Card className="lg:col-span-8 border border-border/80 shadow-xs bg-card rounded-2xl flex flex-col justify-between">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-gold dark:text-gold-bright" />
                Cash flow overview
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                {chartSubtitle}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-navy dark:bg-gold" /> Income
              </span>
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Expenses
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-2 flex-1 flex flex-col justify-center">
            <div className="h-[290px] lg:h-[330px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0F2D5C" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#C9971A" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="expenseColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748B" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#64748B" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    tickLine={false} 
                    axisLine={false} 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11} 
                    minTickGap={20}
                  />
                  <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11} 
                    tickFormatter={(v) => {
                      const num = Number(v);
                      if (num === 0) return '0';
                      if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
                      if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(0)}k`;
                      return `${num}`;
                    }}
                  />
                  <Tooltip content={<CustomChartTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="income" 
                    name="income"
                    stroke="#0F2D5C" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#incomeColor)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="expenses" 
                    name="expenses"
                    stroke="#64748B" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#expenseColor)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Bento Side Stack: Asset Allocation + Liquidity (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          {/* Card A: Asset Allocation Breakdown */}
          <Card className="border border-border/80 shadow-xs bg-card rounded-2xl flex flex-col justify-between">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-bold text-foreground">
                Asset allocation
              </CardTitle>
              <Link href="/statements" className="text-xs text-gold dark:text-gold-bright hover:underline flex items-center gap-1 font-semibold">
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/40 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-gold" /> Liquid accounts
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(financialMetrics.liquidAssets)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-navy dark:text-gold" /> Investments
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(financialMetrics.investedAssets)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/40">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-slate-500" /> Total debt
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(financialMetrics.totalDebt)}
                  </span>
                </div>
              </div>

              {/* Equity ratio progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Asset equity share</span>
                  <span className="font-semibold text-foreground">{financialMetrics.totalAssets > 0 ? (((financialMetrics.totalAssets - financialMetrics.totalLiabilities) / financialMetrics.totalAssets) * 100).toFixed(0) : 0}% equity</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
                  <div 
                    className="bg-navy dark:bg-gold h-full transition-all" 
                    style={{ width: `${financialMetrics.totalAssets > 0 ? Math.min((financialMetrics.netWorth / financialMetrics.totalAssets) * 100, 100) : 0}%` }} 
                  />
                </div>
              </div>
            </CardContent>
            <div className="p-2.5 px-4 bg-muted/20 border-t border-border/40 flex justify-between items-center text-xs rounded-b-2xl">
              <span className="text-muted-foreground">Active holdings:</span>
              <span className="font-semibold text-foreground">{assetItems.length + investmentItems.length} items</span>
            </div>
          </Card>

          {/* Card B: Emergency Reserve Coverage */}
          <Card className="border border-border/80 shadow-xs bg-card rounded-2xl flex flex-col justify-between">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm font-bold text-foreground">
                  Emergency runway
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  6-month safety buffer target
                </CardDescription>
              </div>
              <div className={cn("p-1.5 rounded-md", liquidityHealth.bg, liquidityHealth.color)}>
                <ShieldCheck className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Target funding</span>
                  <span className="font-semibold text-foreground">{Math.min(100, Math.round((financialMetrics.liquidityRatio / 6) * 100))}% funded</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex">
                  <div 
                    className={cn("h-full transition-all", liquidityHealth.barColor)}
                    style={{ width: `${Math.min(100, (financialMetrics.liquidityRatio / 6) * 100)}%` }} 
                  />
                </div>
              </div>
            </CardContent>
            <div className="p-2.5 px-4 bg-muted/20 border-t border-border/40 flex justify-between items-center text-xs rounded-b-2xl">
              <span className="text-muted-foreground">Liquid asset share:</span>
              <span className="font-mono font-semibold text-foreground">{financialMetrics.liquidPercentage.toFixed(1)}%</span>
            </div>
          </Card>

        </div>

        {/* Bento Bottom Tile: Recent Transactions (12 cols) */}
        <Card className="lg:col-span-12 border border-border/80 shadow-xs bg-card rounded-2xl">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-foreground">
                Recent transactions
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Latest recorded activity
              </CardDescription>
            </div>
            <Link href="/transactions" className="text-xs text-gold dark:text-gold-bright hover:underline flex items-center gap-1 font-semibold">
              View all transactions <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            {recentTransactions.length > 0 ? (
              <div className="divide-y divide-border/40">
                {recentTransactions.map((tx) => {
                  const isIncome = tx.amount > 0;
                  const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                  return (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-muted/30 px-2 rounded-lg transition-colors">
                      <div className="flex items-center gap-3 truncate">
                        <div className={cn(
                          "p-2 rounded-lg shrink-0",
                          isIncome ? "bg-navy-pale dark:bg-navy-mid text-navy dark:text-gold" : "bg-muted text-muted-foreground"
                        )}>
                          {isIncome ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-foreground truncate">{tx.description}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {!isNaN(txDate.getTime()) ? format(txDate, 'MMM d, yyyy') : 'No date'} • {tx.modeOfPayment || 'Direct'}
                          </div>
                        </div>
                      </div>
                      <div className={cn(
                        "font-mono font-bold text-right shrink-0",
                        isIncome ? "text-navy dark:text-gold" : "text-foreground"
                      )}>
                        {isIncome ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No transactions recorded yet. Click &quot;Record transaction&quot; to begin.
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ========================================================= */}
      {/* HOMEPAGE FEATURE SHORTCUTS STRIP */}
      {/* ========================================================= */}
      <div className="pt-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick module shortcuts
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link href="/statements" className="group p-3.5 rounded-2xl bg-card border border-border/80 hover:border-gold/40 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-gold group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground group-hover:text-gold transition-colors">Statements</div>
              <div className="text-[11px] text-muted-foreground">Assets & liabilities</div>
            </div>
          </Link>

          <Link href="/budget" className="group p-3.5 rounded-2xl bg-card border border-border/80 hover:border-gold/40 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center group-hover:scale-105 transition-transform">
                <Wallet className="h-4 w-4" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-gold group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground group-hover:text-gold transition-colors">Budget Envelopes</div>
              <div className="text-[11px] text-muted-foreground">Zero-based limit tracking</div>
            </div>
          </Link>

          <Link href="/debt" className="group p-3.5 rounded-2xl bg-card border border-border/80 hover:border-gold/40 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center group-hover:scale-105 transition-transform">
                <Zap className="h-4 w-4" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-gold group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground group-hover:text-gold transition-colors">Debt Strategies</div>
              <div className="text-[11px] text-muted-foreground">Avalanche vs snowball</div>
            </div>
          </Link>

          <Link href="/weekly-review" className="group p-3.5 rounded-2xl bg-card border border-border/80 hover:border-gold/40 transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center group-hover:scale-105 transition-transform">
                <Activity className="h-4 w-4" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-gold group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground group-hover:text-gold transition-colors">Weekly Review</div>
              <div className="text-[11px] text-muted-foreground">Reflect & plan journal</div>
            </div>
          </Link>

          <Link href="/ai-chat" className="group p-3.5 rounded-2xl bg-card border border-border/80 hover:border-gold/40 transition-all flex flex-col justify-between col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-navy-pale text-navy dark:bg-navy-mid dark:text-gold flex items-center justify-center group-hover:scale-105 transition-transform">
                <Compass className="h-4 w-4" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-gold group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground group-hover:text-gold transition-colors">AI Advisor</div>
              <div className="text-[11px] text-muted-foreground">Financial coaching</div>
            </div>
          </Link>
        </div>
      </div>

    </div>
  );
}
