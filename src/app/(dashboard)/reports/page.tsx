// src/app/(dashboard)/reports/page.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Wallet, 
  CreditCard,
  Printer,
  Calendar as CalendarIcon,
  ShieldCheck,
  Briefcase,
  Activity,
  FileCheck,
  CheckCircle,
  HelpCircle,
  Info,
  Lock,
  Sparkles,
  Building2,
  ShoppingBag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip,
  BarChart,
  Bar,
  Legend
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
  eachMonthOfInterval
} from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BudgetVarianceReportSection from '@/app/(dashboard)/statements/BudgetVarianceReportSection';
import PortfolioDiversityDashboard from '@/components/investments/PortfolioDiversityDashboard';

type DateFilterPreset = 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'ytd' | 'all' | 'custom';

export default function ReportsPage() {
  const transactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const assetItems = useStatementStore(state => state.assetItems);
  const otherLiabilityItems = useStatementStore(state => state.otherLiabilityItems);
  const investmentItems = useInvestmentStore(state => state.investmentItems);

  // Date range filter state
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  // Compute active date range and display labels
  const { dateRange, selectionDurationLabel, selectionSubtitle } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);
    let label = 'all-time';
    let subtitle = 'All recorded history';

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
        label = 'YTD';
        subtitle = `Jan 1 – ${format(end, 'MMM d, yyyy')}`;
        break;

      case 'custom':
        start = startOfDay(new Date(customStartDate));
        end = endOfDay(new Date(customEndDate));
        label = 'custom range';
        subtitle = `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
        break;

      case 'all':
      default:
        start = startOfDay(new Date(1970, 0, 1));
        end = endOfDay(now);
        label = 'all-time';
        subtitle = 'All recorded history';
        break;
    }

    return {
      dateRange: { start, end },
      selectionDurationLabel: label,
      selectionSubtitle: subtitle
    };
  }, [datePreset, customStartDate, customEndDate]);

  // Consolidated Financial Metrics
  const metrics = useMemo(() => {
    // Assets
    const liquidAssets = assetItems.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
    const investedAssets = investmentItems.reduce((sum, item) => sum + (Number(item?.currentValue || item?.purchasePrice * item?.quantity) || 0), 0);
    const totalAssets = liquidAssets + investedAssets;

    // Liabilities
    const totalDebt = debts.reduce((sum, debt) => sum + (Number(debt?.principal) || 0), 0);
    const otherLiabilities = otherLiabilityItems.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
    const totalLiabilities = totalDebt + otherLiabilities;

    // Net Worth
    const netWorth = totalAssets - totalLiabilities;

    // Period specific Income and Expenses
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
    const savingsRate = periodIncome > 0 ? (netCashFlow / periodIncome) * 100 : 0;

    // Monthly Burn Rate forEmergency Runway
    const expenseTx = transactions.filter(t => t.amount < 0);
    let monthlyExpenses = 0;
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
      let monthsInterval = [startMonth];
      try {
        monthsInterval = eachMonthOfInterval({ start: startMonth, end: endMonth });
      } catch {
        monthsInterval = [startMonth];
      }

      const totalSpent = Object.values(monthlyExpenseMap).reduce((sum, v) => sum + v, 0);
      const denominator = Math.max(1, monthsInterval.length);
      monthlyExpenses = totalSpent / denominator;
    } else {
      monthlyExpenses = periodExpenses;
    }

    const liquidityRatio = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : (liquidAssets > 0 ? 12 : 0);
    const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    const debtToIncomeRatio = periodIncome > 0 ? (totalDebt / (periodIncome * 12)) * 100 : 0; // Annualized

    return {
      netWorth,
      totalAssets,
      totalLiabilities,
      liquidAssets,
      investedAssets,
      totalDebt,
      otherLiabilities,
      periodIncome,
      periodExpenses,
      netCashFlow,
      savingsRate,
      monthlyExpenses,
      liquidityRatio,
      debtToAssetRatio,
      debtToIncomeRatio
    };
  }, [transactions, debts, assetItems, otherLiabilityItems, investmentItems, dateRange]);

  // Segmented transaction lists & summaries for Income & Expense Analysis Quadrants
  const incomeExpenseSegments = useMemo(() => {
    // Filter transactions within active interval
    const periodTxs = transactions.filter(tx => {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (!isValid(txDate)) return false;
      return isWithinInterval(txDate, { start: dateRange.start, end: dateRange.end });
    });

    const recurringIncome: any[] = [];
    const oneTimeIncome: any[] = [];
    const fixedExpenses: any[] = [];
    const variableExpenses: any[] = [];

    let recIncTotal = 0;
    let oneIncTotal = 0;
    let fixExpTotal = 0;
    let varExpTotal = 0;

    periodTxs.forEach(tx => {
      const isInc = tx.amount > 0;
      const amount = Math.abs(tx.amount);

      if (isInc) {
        if (tx.frequency === 'recurring') {
          recurringIncome.push(tx);
          recIncTotal += amount;
        } else {
          oneTimeIncome.push(tx);
          oneIncTotal += amount;
        }
      } else {
        if (tx.frequency === 'recurring' || tx.variability === 'fixed') {
          fixedExpenses.push(tx);
          fixExpTotal += amount;
        } else {
          variableExpenses.push(tx);
          varExpTotal += amount;
        }
      }
    });

    // Sort items newest first
    const sortNewest = (a: any, b: any) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    };

    return {
      recurringIncome: { items: recurringIncome.sort(sortNewest), total: recIncTotal },
      oneTimeIncome: { items: oneTimeIncome.sort(sortNewest), total: oneIncTotal },
      fixedExpenses: { items: fixedExpenses.sort(sortNewest), total: fixExpTotal },
      variableExpenses: { items: variableExpenses.sort(sortNewest), total: varExpTotal },
    };
  }, [transactions, dateRange]);

  // Custom Chart Data: Month-by-month Income vs Expenses
  const monthlyTimelineData = useMemo(() => {
    const monthsMap: Record<string, { monthKey: string; date: Date; income: number; expenses: number }> = {};
    const now = new Date();
    
    // Default show last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, 'MMM yyyy');
      monthsMap[key] = {
        monthKey: key,
        date: d,
        income: 0,
        expenses: 0
      };
    }

    transactions.forEach(tx => {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (isValid(txDate)) {
        const key = format(txDate, 'MMM yyyy');
        if (monthsMap[key]) {
          if (tx.amount > 0) {
            monthsMap[key].income += tx.amount;
          } else {
            monthsMap[key].expenses += Math.abs(tx.amount);
          }
        }
      }
    });

    return Object.values(monthsMap).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [transactions]);

  // Asset allocation pie / progress format
  const assetBreakdown = useMemo(() => {
    return [
      { name: 'Liquid Accounts', value: metrics.liquidAssets, percentage: metrics.totalAssets > 0 ? (metrics.liquidAssets / metrics.totalAssets) * 100 : 0, color: 'hsl(var(--primary))' },
      { name: 'Investments', value: metrics.investedAssets, percentage: metrics.totalAssets > 0 ? (metrics.investedAssets / metrics.totalAssets) * 100 : 0, color: 'hsl(var(--muted-foreground))' },
    ];
  }, [metrics]);

  // Liabilities allocation
  const liabilitiesBreakdown = useMemo(() => {
    return [
      { name: 'Structured Debts', value: metrics.totalDebt, percentage: metrics.totalLiabilities > 0 ? (metrics.totalDebt / metrics.totalLiabilities) * 100 : 0, color: 'hsl(var(--primary))' },
      { name: 'Other Liabilities', value: metrics.otherLiabilities, percentage: metrics.totalLiabilities > 0 ? (metrics.otherLiabilities / metrics.totalLiabilities) * 100 : 0, color: 'hsl(var(--muted-foreground))' },
    ];
  }, [metrics]);

  // Emergency Runway Health Indicators
  const runwayHealth = useMemo(() => {
    const ratio = metrics.liquidityRatio;
    if (ratio >= 6) return { label: 'Excellent', color: 'text-[#10b981]', bg: 'bg-[#10b981]/10', score: 100 };
    if (ratio >= 3) return { label: 'Healthy', color: 'text-primary', bg: 'bg-primary/5', score: 75 };
    if (ratio >= 1) return { label: 'Caution', color: 'text-amber-500', bg: 'bg-amber-500/10', score: 40 };
    return { label: 'Critical Runway', color: 'text-destructive', bg: 'bg-destructive/10', score: 10 };
  }, [metrics.liquidityRatio]);

  // Overall Financial Position Grade & Scorecard Insights
  const reportInsights = useMemo(() => {
    const insights: { title: string; desc: string; type: 'success' | 'warning' | 'info' }[] = [];
    
    // Insight 1: Net Worth and solvency
    if (metrics.netWorth > 0 && metrics.debtToAssetRatio < 30) {
      insights.push({
        title: 'Strong Solvency Position',
        desc: `Your total assets exceed liabilities comfortably. Total liabilities represent only ${metrics.debtToAssetRatio.toFixed(1)}% of your active assets.`,
        type: 'success'
      });
    } else if (metrics.debtToAssetRatio >= 50) {
      insights.push({
        title: 'High Leverage Warning',
        desc: `Liabilities represent ${metrics.debtToAssetRatio.toFixed(1)}% of your assets. Focus on paying down high-interest structured debts to build robust equity.`,
        type: 'warning'
      });
    }

    // Insight 2: Emergency Runway Coverage
    if (metrics.liquidityRatio >= 6) {
      insights.push({
        title: 'Sufficient Capital Runway',
        desc: `Your liquid cash accounts provide a runway of ${metrics.liquidityRatio.toFixed(1)} months at your current burn rate. This represents an exceptionally secure emergency fund.`,
        type: 'success'
      });
    } else if (metrics.liquidityRatio < 3) {
      insights.push({
        title: 'Low Liquid Runway Buffer',
        desc: `Your emergency runway is ${metrics.liquidityRatio.toFixed(1)} months. We recommend accumulating liquid savings to cover at least 3 to 6 months of historical expenses.`,
        type: 'warning'
      });
    }

    // Insight 3: Cash Flow Savings Rate
    if (metrics.savingsRate >= 20) {
      insights.push({
        title: 'High Savings Capitalization',
        desc: `You are retaining a spectacular ${metrics.savingsRate.toFixed(1)}% of period inflows. This surplus capital should be actively directed toward debt payment or high-yield investments.`,
        type: 'success'
      });
    } else if (metrics.savingsRate < 10 && metrics.savingsRate > 0) {
      insights.push({
        title: 'Tight Monthly Surplus Margin',
        desc: `Your current net savings rate is ${metrics.savingsRate.toFixed(1)}%. Review and cut back non-essential categories to raise your monthly retainable margin to at least 15%.`,
        type: 'info'
      });
    } else if (metrics.savingsRate <= 0 && metrics.periodIncome > 0) {
      insights.push({
        title: 'Net Outflow Deficit',
        desc: `You are spending more than your period income. Your net burn rate represents a financial deficit. Assess structured spending priorities immediately.`,
        type: 'warning'
      });
    }

    // Edge case if no data is registered
    if (insights.length === 0) {
      insights.push({
        title: 'Begin Structuring Records',
        desc: 'Log monthly structured incomes, expected bills, and assets to generate comprehensive 360° position insights.',
        type: 'info'
      });
    }

    return insights;
  }, [metrics]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-12">
      {/* Dynamic PDF Style overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-full-width {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .print-grid {
            display: grid !important;
            grid-template-cols: repeat(2, minmax(0, 1fr)) !important;
            gap: 1.5rem !important;
          }
          .print-border {
            border: 1px solid #d4d4d4 !important;
            box-shadow: none !important;
            border-radius: 12px !important;
            background-color: white !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-page-break {
            page-break-before: always;
            break-before: page;
          }
        }
      ` }} />

      {/* HEADER SECTION */}
      <header className="p-4 md:p-6 lg:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border bg-card no-print">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            360° Financial Position Report
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Consolidated ledger statement, burn rate coverage analysis, and solvency ratio audit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset buttons */}
          <div className="flex items-center gap-1 border border-border bg-muted/40 rounded-lg p-0.5 shadow-xs">
            {(['all', 'ytd', 'last-90', 'this-month'] as const).map((preset) => (
              <Button
                key={preset}
                variant="ghost"
                size="xs"
                onClick={() => setDatePreset(preset)}
                className={cn(
                  "h-7 text-[10px] font-bold px-2 rounded-md uppercase tracking-wider",
                  datePreset === preset ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {preset === 'all' ? 'All Time' : preset === 'ytd' ? 'YTD' : preset === 'last-90' ? '90 Days' : 'This Month'}
              </Button>
            ))}
            
            {/* Custom Range Popover */}
            <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className={cn(
                    "h-7 text-[10px] font-bold px-2 rounded-md uppercase tracking-wider",
                    datePreset === 'custom' ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4 border rounded-xl shadow-lg bg-card" align="end">
                <div className="space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">Select Range</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-muted-foreground uppercase">Start Date</label>
                      <input 
                        type="date" 
                        value={customStartDate} 
                        onChange={(e) => {
                          setCustomStartDate(e.target.value);
                          setDatePreset('custom');
                        }}
                        className="w-full text-xs p-1.5 border rounded-lg bg-background font-mono text-foreground focus:ring-1 focus:ring-primary outline-none" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-muted-foreground uppercase">End Date</label>
                      <input 
                        type="date" 
                        value={customEndDate} 
                        onChange={(e) => {
                          setCustomEndDate(e.target.value);
                          setDatePreset('custom');
                        }}
                        className="w-full text-xs p-1.5 border rounded-lg bg-background font-mono text-foreground focus:ring-1 focus:ring-primary outline-none" 
                      />
                    </div>
                  </div>
                  <Button 
                    size="xs" 
                    className="w-full text-[10px] font-bold uppercase rounded-lg"
                    onClick={() => {
                      setDatePreset('custom');
                      setIsCustomOpen(false);
                    }}
                  >
                    Apply Filter
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Button onClick={handlePrint} variant="default" size="sm" className="h-8 text-xs font-bold gap-1.5 rounded-lg shadow-xs">
            <Printer className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </header>

      {/* PRINT-ONLY COHESIVE COVER HEADER */}
      <div className="hidden print:flex flex-col border-b-2 border-primary pb-6 mb-8 px-4 print-full-width">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-black">IMANI FINANCIAL PORTFOLIO LEDGER</h1>
            <p className="text-xs font-semibold text-neutral-600 mt-1">360° Comprehensive Solvency Statement & Financial Position Report</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold uppercase border border-black p-1 px-2.5 rounded-md">OFFICIAL STATEMENT</span>
            <p className="text-[10px] font-mono text-neutral-500 mt-1">Statement Date: {format(new Date(), 'PPpp')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 mt-6 gap-6 text-xs border-t border-neutral-200 pt-4">
          <div>
            <span className="text-[9px] font-bold uppercase text-neutral-500">Prepared For:</span>
            <p className="font-bold text-neutral-800">Sean Wambua (seanwambua@gmail.com)</p>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold uppercase text-neutral-500">Report Scope:</span>
            <p className="font-bold font-mono text-neutral-800 uppercase">{selectionSubtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 lg:p-8 space-y-6 print-full-width max-w-7xl mx-auto w-full">
        <Tabs defaultValue="360-solvency" className="w-full space-y-6">
          <TabsList className="no-print bg-muted/60 border border-border p-1 rounded-xl flex w-full max-w-md">
            <TabsTrigger value="360-solvency" className="flex-1 text-xs font-bold uppercase py-2">
              360° Solvency
            </TabsTrigger>
            <TabsTrigger value="budget-variance" className="flex-1 text-xs font-bold uppercase py-2">
              Budget Variance
            </TabsTrigger>
            <TabsTrigger value="investments-diversity" className="flex-1 text-xs font-bold uppercase py-2">
              Investments Diversity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="360-solvency" className="space-y-6 focus-visible:outline-none print:block">
            
            {/* TOP FOUR 360° POSITION SCORECARDS */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print-grid">
          
          {/* Solvency Solitary Indicator */}
          <Card className="border border-border shadow-xs bg-card flex flex-col justify-between print-border">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Solvency / Net Worth</span>
              <span className="p-1.5 rounded-lg bg-primary/5 text-primary">
                <Scale className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2">
              <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">{formatCurrency(metrics.netWorth)}</h3>
              <p className="text-[10px] text-muted-foreground">Equity margin value representing overall asset surplus ownership.</p>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Leverage Ratio:</span>
                <span className="font-mono text-foreground font-bold">{metrics.debtToAssetRatio.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Cash Flow / Savings Rate */}
          <Card className="border border-border shadow-xs bg-card flex flex-col justify-between print-border">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Surplus Savings Rate</span>
              <span className="p-1.5 rounded-lg bg-primary/5 text-primary">
                <FileCheck className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2">
              <h3 className={cn("text-2xl font-bold font-mono tracking-tight", metrics.savingsRate >= 0 ? "text-foreground" : "text-destructive")}>
                {metrics.savingsRate.toFixed(1)}%
              </h3>
              <p className="text-[10px] text-muted-foreground">Percentage of earnings retained for investments and emergency runways.</p>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Retained Surplus:</span>
                <span className={cn("font-mono font-bold", metrics.netCashFlow >= 0 ? "text-[#10b981]" : "text-destructive")}>
                  {formatCurrency(metrics.netCashFlow)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Liquid Capital Runway */}
          <Card className="border border-border shadow-xs bg-card flex flex-col justify-between print-border">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Emergency Runway</span>
              <span className="p-1.5 rounded-lg bg-primary/5 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2">
              <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">
                {metrics.liquidityRatio.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">Months</span>
              </h3>
              <p className="text-[10px] text-muted-foreground">Emergency timeline coverage sustained purely by liquid capital.</p>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Burn Rate:</span>
                <span className="font-mono text-foreground font-bold">{formatCurrency(metrics.monthlyExpenses)}/mo</span>
              </div>
            </CardContent>
          </Card>

          {/* Structured Debt Index */}
          <Card className="border border-border shadow-xs bg-card flex flex-col justify-between print-border">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Structured Debt Index</span>
              <span className="p-1.5 rounded-lg bg-primary/5 text-primary">
                <CreditCard className="h-4 w-4" />
              </span>
            </CardHeader>
            <CardContent className="p-4 pt-1 space-y-2">
              <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">{formatCurrency(metrics.totalDebt)}</h3>
              <p className="text-[10px] text-muted-foreground">Aggregated structured debt burden requiring structured service schedules.</p>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Debt to Assets:</span>
                <span className="font-mono text-foreground font-bold">{metrics.debtToAssetRatio.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 360° ASSET AND LIABILITY LEDGER BALANCES (BALANCE SHEET) */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 print-grid">
          
          {/* ASSETS PORTFOLIO LEDGER */}
          <Card className="border border-border shadow-sm rounded-2xl overflow-hidden print-border print-break-inside-avoid">
            <CardHeader className="p-4 md:p-5 border-b border-border bg-card">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Active Asset Ledger
              </CardTitle>
              <CardDescription className="text-[10px]">Realizable holdings providing liquidation values and wealth equity.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2.5">
                {assetBreakdown.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="font-mono text-foreground">{formatCurrency(item.value)}</span>
                    </div>
                    <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all" style={{ width: `${item.percentage}%` }} />
                    </div>
                    <div className="text-[9px] text-muted-foreground font-bold uppercase">{item.percentage.toFixed(1)}% share of assets</div>
                  </div>
                ))}
              </div>

              {/* Sub-item table lists */}
              <div className="pt-4 border-t border-border/40">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Itemized Holdings</h4>
                <div className="text-xs divide-y divide-border/30 max-h-[160px] overflow-y-auto">
                  {assetItems.map((asset) => (
                    <div key={asset.id} className="flex justify-between py-2 items-center">
                      <span className="text-muted-foreground font-medium truncate max-w-[200px]">{asset.description}</span>
                      <span className="font-mono font-bold text-foreground">{formatCurrency(asset.amount)}</span>
                    </div>
                  ))}
                  {investmentItems.map((inv) => (
                    <div key={inv.id} className="flex justify-between py-2 items-center">
                      <span className="text-muted-foreground font-medium truncate max-w-[200px]">{inv.name} <Badge variant="outline" className="text-[8px] py-0 px-1 font-bold ml-1.5 uppercase">{inv.type}</Badge></span>
                      <span className="font-mono font-bold text-foreground">{formatCurrency(inv.currentValue)}</span>
                    </div>
                  ))}
                  {assetItems.length === 0 && investmentItems.length === 0 && (
                    <p className="text-center text-muted-foreground py-4 italic text-[11px]">No active assets currently saved.</p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-between items-center text-xs font-bold text-foreground">
                <span>AGGREGATE ASSETS</span>
                <span className="font-mono">{formatCurrency(metrics.totalAssets)}</span>
              </div>
            </CardContent>
          </Card>

          {/* LIABILITIES STATEMENT LEDGER */}
          <Card className="border border-border shadow-sm rounded-2xl overflow-hidden print-border print-break-inside-avoid">
            <CardHeader className="p-4 md:p-5 border-b border-border bg-card">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" /> Liabilities Ledger
              </CardTitle>
              <CardDescription className="text-[10px]">Realizable structured obligations requiring debt amortization.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2.5">
                {liabilitiesBreakdown.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="font-mono text-foreground">{formatCurrency(item.value)}</span>
                    </div>
                    <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all" style={{ width: `${item.percentage}%` }} />
                    </div>
                    <div className="text-[9px] text-muted-foreground font-bold uppercase">{item.percentage.toFixed(1)}% share of liabilities</div>
                  </div>
                ))}
              </div>

              {/* Sub-item itemized table */}
              <div className="pt-4 border-t border-border/40">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Itemized Obligations</h4>
                <div className="text-xs divide-y divide-border/30 max-h-[160px] overflow-y-auto">
                  {debts.map((debt) => (
                    <div key={debt.id} className="flex justify-between py-2 items-center">
                      <span className="text-muted-foreground font-medium truncate max-w-[200px]">{debt.description} <span className="text-[10px] text-muted-foreground font-bold ml-1">({debt.interestRate}% APR)</span></span>
                      <span className="font-mono font-bold text-foreground">{formatCurrency(debt.principal)}</span>
                    </div>
                  ))}
                  {otherLiabilityItems.map((item) => (
                    <div key={item.id} className="flex justify-between py-2 items-center">
                      <span className="text-muted-foreground font-medium truncate max-w-[200px]">{item.description}</span>
                      <span className="font-mono font-bold text-foreground">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  {debts.length === 0 && otherLiabilityItems.length === 0 && (
                    <p className="text-center text-muted-foreground py-4 italic text-[11px]">No active obligations currently saved.</p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-between items-center text-xs font-bold text-foreground">
                <span>AGGREGATE LIABILITIES</span>
                <span className="font-mono">{formatCurrency(metrics.totalLiabilities)}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* RECHARTS CASHFLOW TREND OVERVIEW CHART (EMERALD AND ROSE AS REQUESTED) */}
        <section className="print-break-inside-avoid">
          <Card className="border border-border shadow-xs bg-card flex flex-col justify-between print-border">
            <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">
                  Cash Flow Timeline Breakdown
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Income inflows compared to expense outflows over previous six calendar months.
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" /> Income Inflows
                </span>
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e]" /> Expense Outflows
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="h-[280px] lg:h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTimelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="expenseColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
                    <XAxis 
                      dataKey="monthKey" 
                      tickLine={false} 
                      axisLine={false} 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={11} 
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={11} 
                      tickFormatter={(v) => {
                        const num = Number(v);
                        if (num === 0) return '0';
                        if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(0)}k`;
                        return `${num}`;
                      }}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        return (
                          <div className="bg-popover/95 backdrop-blur-xs text-popover-foreground p-2.5 rounded-lg shadow-md border border-border text-xs space-y-1 min-w-[140px]">
                            <div className="font-semibold text-foreground border-b border-border/50 pb-1">{label}</div>
                            {payload.map((entry: any, index) => (
                              <div key={`tooltip-${index}`} className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                  {entry.name === 'income' ? 'Inflows' : 'Outflows'}:
                                </span>
                                <span className="font-mono font-medium text-foreground">
                                  {formatCurrency(entry.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="income" 
                      name="income"
                      stroke="#10b981" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#incomeColor)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="expenses" 
                      name="expenses"
                      stroke="#f43f5e" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#expenseColor)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* INFLOWS AND COMMITMENT CASHFLOW QUADRANTS */}
        <section className="print-break-inside-avoid space-y-4">
          <div className="border-t border-border/40 pt-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
              <TrendingUp className="h-4 w-4 text-primary" /> Segmented Cash Flow Commitments
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Detailed tracking of inflows and commitment-based outflows grouped into tactical quadrants.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Q1: Recurring Income */}
            <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between print-border">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-[#10b981]/10 text-[#10b981]">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold text-foreground">Recurring Income</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground/85">Predictable regular inflows</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-[#10b981]/20 bg-[#10b981]/5 text-[#10b981]">
                    {((incomeExpenseSegments.recurringIncome.total / (metrics.periodIncome || 1)) * 100).toFixed(0)}% of income
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-3">
                <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
                  <span className="text-[10px] text-muted-foreground">Segment Total:</span>
                  <span className="text-lg font-bold text-[#10b981]">
                    +{formatCurrency(incomeExpenseSegments.recurringIncome.total)}
                  </span>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="items" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                      View Transactions ({incomeExpenseSegments.recurringIncome.items.length})
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      {incomeExpenseSegments.recurringIncome.items.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {incomeExpenseSegments.recurringIncome.items.map((tx: any) => {
                            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                            return (
                              <div key={tx.id} className="flex justify-between items-center text-[11px] p-2 rounded-md bg-muted/30 border border-border/40">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">{tx.description}</span>
                                  <span className="text-[9px] text-muted-foreground">
                                    {isValid(txDate) ? format(txDate, 'MMM d, yyyy') : ''} • {tx.categoryName || 'General'}
                                  </span>
                                </div>
                                <span className="font-mono font-bold text-[#10b981]">
                                  +{formatCurrency(tx.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-center text-[10px] text-muted-foreground/75 py-2">No records found.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Q2: Variable Income */}
            <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between print-border">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-[#10b981]/10 text-[#10b981]">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold text-foreground">Variable Income</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground/85">One-time bonuses or gifts</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-[#10b981]/20 bg-[#10b981]/5 text-[#10b981]">
                    {((incomeExpenseSegments.oneTimeIncome.total / (metrics.periodIncome || 1)) * 100).toFixed(0)}% of income
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-3">
                <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
                  <span className="text-[10px] text-muted-foreground">Segment Total:</span>
                  <span className="text-lg font-bold text-[#10b981]">
                    +{formatCurrency(incomeExpenseSegments.oneTimeIncome.total)}
                  </span>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="items" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                      View Transactions ({incomeExpenseSegments.oneTimeIncome.items.length})
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      {incomeExpenseSegments.oneTimeIncome.items.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {incomeExpenseSegments.oneTimeIncome.items.map((tx: any) => {
                            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                            return (
                              <div key={tx.id} className="flex justify-between items-center text-[11px] p-2 rounded-md bg-muted/30 border border-border/40">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">{tx.description}</span>
                                  <span className="text-[9px] text-muted-foreground">
                                    {isValid(txDate) ? format(txDate, 'MMM d, yyyy') : ''} • {tx.categoryName || 'General'}
                                  </span>
                                </div>
                                <span className="font-mono font-bold text-[#10b981]">
                                  +{formatCurrency(tx.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-center text-[10px] text-muted-foreground/75 py-2">No records found.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Q3: Fixed Expenses */}
            <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between print-border">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-[#f43f5e]/10 text-[#f43f5e]">
                      <Lock className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold text-foreground">Fixed Expenses</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground/85">Rent, utilities, obligations</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-destructive/20 bg-destructive/5 text-destructive">
                    {((incomeExpenseSegments.fixedExpenses.total / (metrics.periodExpenses || 1)) * 100).toFixed(0)}% of expenses
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-3">
                <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
                  <span className="text-[10px] text-muted-foreground">Segment Total:</span>
                  <span className="text-lg font-bold text-destructive">
                    -{formatCurrency(incomeExpenseSegments.fixedExpenses.total)}
                  </span>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="items" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                      View Transactions ({incomeExpenseSegments.fixedExpenses.items.length})
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      {incomeExpenseSegments.fixedExpenses.items.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {incomeExpenseSegments.fixedExpenses.items.map((tx: any) => {
                            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                            return (
                              <div key={tx.id} className="flex justify-between items-center text-[11px] p-2 rounded-md bg-muted/30 border border-border/40">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">{tx.description}</span>
                                  <span className="text-[9px] text-muted-foreground">
                                    {isValid(txDate) ? format(txDate, 'MMM d, yyyy') : ''} • {tx.categoryName || 'General'}
                                  </span>
                                </div>
                                <span className="font-mono font-bold text-destructive">
                                  -{formatCurrency(Math.abs(tx.amount))}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-center text-[10px] text-muted-foreground/75 py-2">No records found.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            {/* Q4: Variable Expenses */}
            <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between print-border">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-[#f43f5e]/10 text-[#f43f5e]">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-xs font-semibold text-foreground">Variable Expenses</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground/85">Shopping, dining, leisure</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-destructive/20 bg-destructive/5 text-destructive">
                    {((incomeExpenseSegments.variableExpenses.total / (metrics.periodExpenses || 1)) * 100).toFixed(0)}% of expenses
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 space-y-3">
                <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
                  <span className="text-[10px] text-muted-foreground">Segment Total:</span>
                  <span className="text-lg font-bold text-destructive">
                    -{formatCurrency(incomeExpenseSegments.variableExpenses.total)}
                  </span>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="items" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                      View Transactions ({incomeExpenseSegments.variableExpenses.items.length})
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      {incomeExpenseSegments.variableExpenses.items.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {incomeExpenseSegments.variableExpenses.items.map((tx: any) => {
                            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                            return (
                              <div key={tx.id} className="flex justify-between items-center text-[11px] p-2 rounded-md bg-muted/30 border border-border/40">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">{tx.description}</span>
                                  <span className="text-[9px] text-muted-foreground">
                                    {isValid(txDate) ? format(txDate, 'MMM d, yyyy') : ''} • {tx.categoryName || 'General'}
                                  </span>
                                </div>
                                <span className="font-mono font-bold text-destructive">
                                  -{formatCurrency(Math.abs(tx.amount))}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-center text-[10px] text-muted-foreground/75 py-2">No records found.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

          </div>
        </section>

        {/* 360° REPORT INSIGHTS & STRATEGIC RECOMMENDATIONS */}
        <section className="print-break-inside-avoid">
          <Card className="border border-border shadow-xs bg-card print-border">
            <CardHeader className="p-4 md:p-5 border-b border-border bg-card">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" /> Strategic Position Summary
              </CardTitle>
              <CardDescription className="text-[10px]">Actionable optimizations modeled from liquidity coverage and asset solvency indexes.</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {reportInsights.map((insight, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1">
                          <Info className="h-3.5 w-3.5 text-primary" /> {insight.title}
                        </span>
                        <Badge 
                          variant={insight.type === 'success' ? 'outline' : 'secondary'}
                          className={cn(
                            "text-[8px] font-bold px-1.5 py-0 border/40 uppercase",
                            insight.type === 'success' && "bg-[#10b981]/5 text-[#10b981] border-[#10b981]/20",
                            insight.type === 'warning' && "bg-destructive/5 text-destructive border-destructive/20",
                            insight.type === 'info' && "bg-primary/5 text-primary border-primary/20"
                          )}
                        >
                          {insight.type}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{insight.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* PRINT ONLY SIGN-OFF COLUMN */}
              <div className="hidden print:grid grid-cols-2 mt-8 pt-6 border-t border-dashed border-neutral-300 text-xs">
                <div>
                  <p className="text-neutral-500 text-[10px] uppercase">Generated By:</p>
                  <p className="font-bold mt-1 text-neutral-800">Imani Financial System Analyst</p>
                  <span className="text-[10px] text-neutral-500 italic mt-0.5">Automated algorithmic audit engine</span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <p className="text-neutral-500 text-[10px] uppercase">User Signature & Attestation:</p>
                  <div className="w-48 h-8 border-b border-neutral-400 mt-2" />
                  <span className="text-[10px] text-neutral-500 mt-1 font-mono">Sean Wambua</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
          </TabsContent>

          <TabsContent value="budget-variance" className="space-y-6 focus-visible:outline-none print:block">
            <div className="print-page-break" />
            <div className="hidden print:block mb-4">
              <h2 className="text-lg font-bold text-black uppercase tracking-tight">Segment II: Budget vs. Actual Variance</h2>
              <p className="text-[10px] text-neutral-500">Comprehensive variance statement across primary operational budgets and revenue flows.</p>
            </div>
            <BudgetVarianceReportSection startDate={dateRange.start} endDate={dateRange.end} />
          </TabsContent>

          <TabsContent value="investments-diversity" className="space-y-6 focus-visible:outline-none print:block">
            <div className="print-page-break" />
            <div className="hidden print:block mb-4">
              <h2 className="text-lg font-bold text-black uppercase tracking-tight">Segment III: Asset Portfolio Diversification</h2>
              <p className="text-[10px] text-neutral-500">Strategic target rebalancing, asset breadth entropy index, and capitalization recommendations.</p>
            </div>
            <PortfolioDiversityDashboard />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
