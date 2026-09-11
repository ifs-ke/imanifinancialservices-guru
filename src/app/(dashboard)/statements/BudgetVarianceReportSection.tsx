// src/app/(dashboard)/statements/BudgetVarianceReportSection.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, PieChart as PieChartIcon, TrendingUp, TrendingDown, MinusCircle, Target as TargetIcon, Coins, HelpCircle, Eye, FileDown } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore } from '@/store/budgetStore';
import type { TransactionWithId, BudgetItem, BudgetItemCategory as InternalBudgetItemCategory } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, parse, isEqual, isValid as isDateValid, eachMonthOfInterval } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';

interface BudgetVarianceReportSectionProps {
  startDate?: Date;
  endDate?: Date;
}

type ExtendedBudgetItemCategory = InternalBudgetItemCategory | 'unplanned-expense' | 'unbudgeted-income';

const formatDateForStatements = (date: Date | undefined, defaultText: string = "N/A") => {
  if (!date || !isDateValid(date)) return <span>{defaultText}</span>;
  return format(date, "LLL dd, y");
};

const getUniqueMonthsInRange = (start: Date, end: Date): string[] => {
  if (!isDateValid(start) || !isDateValid(end) || end < start) return [];
  const months = eachMonthOfInterval({ start, end });
  const endMonthStart = dfnsStartOfMonth(end);
  if (!months.find(m => isEqual(dfnsStartOfMonth(m), endMonthStart))) {
    months.push(endMonthStart);
  }
  return Array.from(new Set(months.map(date => format(date, 'yyyy-MM'))));
};

const BudgetVarianceReportSection: React.FC<BudgetVarianceReportSectionProps> = ({ startDate, endDate }) => {
  const transactions = useTransactionsStore(state => state.transactions);
  const allBudgetItemsGlobal = useBudgetStore(state => state.budgetItems);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const handlePrintPDF = () => {
    // Flag the document body for isolated printing layout overrides
    document.body.classList.add('print-single-variance-active');

    // Trigger standard high-fidelity system print dialog
    window.print();

    // Remove isolated print overrides after small cooldown
    setTimeout(() => {
      document.body.classList.remove('print-single-variance-active');
    }, 800);
  };

  const filteredTransactions = useMemo(() => {
    if (!startDate && !endDate) return transactions;
    if (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate)) return [];
    const start = startDate.getTime();
    const endOfDay = new Date(endDate).setHours(23, 59, 59, 999);
    return transactions.filter(tx => {
      const txDate = tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date);
      if (!isDateValid(txDate)) return false;
      const txTime = txDate.getTime();
      return txTime >= start && txTime <= endOfDay;
    });
  }, [transactions, startDate, endDate]);

  const actualSpendingByDescriptionAndCategory = useMemo(() => {
    const actuals: Record<string, { amount: number; count: number; category: ExtendedBudgetItemCategory; description: string }> = {};

    const isAllTime = !startDate && !endDate;
    const relevantBudgetMonths = isAllTime
      ? Array.from(new Set(allBudgetItemsGlobal.map(item => item.period)))
      : (startDate && endDate) ? getUniqueMonthsInRange(startDate, endDate) : [];
    const budgetCategoryMap: Record<string, InternalBudgetItemCategory> = {};
    allBudgetItemsGlobal.forEach(item => {
      if (relevantBudgetMonths.includes(item.period)) {
        budgetCategoryMap[item.description] = item.category;
      }
    });

    filteredTransactions.forEach(tx => {
      if (tx.amount === 0) return;

      const isIncomeTx = tx.amount > 0;
      const amount = Math.abs(tx.amount);
      const linkedBudgetItemDescription = tx.categoryName;

      let key: string;
      let category: ExtendedBudgetItemCategory;
      let description: string;

      if (linkedBudgetItemDescription && budgetCategoryMap[linkedBudgetItemDescription]) {
        key = linkedBudgetItemDescription;
        category = budgetCategoryMap[linkedBudgetItemDescription];
        description = linkedBudgetItemDescription;
      } else {
        description = tx.description;
        category = isIncomeTx ? 'unbudgeted-income' : 'unplanned-expense';
        key = `${category}-${description.toLowerCase().trim()}`;
      }
      
      if (!actuals[key]) {
        actuals[key] = { amount: 0, count: 0, category: category, description: description };
      }
      actuals[key].amount += amount;
      actuals[key].count += 1;
    });

    return actuals;
  }, [filteredTransactions, allBudgetItemsGlobal, startDate, endDate]);

  const varianceDataByCategory = useMemo(() => {
    const varianceMap: Record<ExtendedBudgetItemCategory, { description: string; budgeted: number; actual: number | null; itemCount: number }[]> = {
      income: [], 'recurring-expense': [], 'one-time-expense': [], goal: [], debt: [],
      'unplanned-expense': [], 'unbudgeted-income': []
    };

    const isAllTime = !startDate && !endDate;
    if (!isAllTime && (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate))) return varianceMap;

    const actuals = actualSpendingByDescriptionAndCategory;
    const processedActualKeys = new Set<string>();

    const relevantBudgetMonths = isAllTime
      ? Array.from(new Set(allBudgetItemsGlobal.map(item => item.period)))
      : getUniqueMonthsInRange(startDate!, endDate!);
    const relevantBudgetItems = allBudgetItemsGlobal.filter(item => relevantBudgetMonths.includes(item.period));
    const uniqueBudgetItemDescriptions = Array.from(new Set(relevantBudgetItems.map(item => item.description)));
    
    uniqueBudgetItemDescriptions.forEach(description => {
      const totalBudgeted = relevantBudgetItems
        .filter(item => item.description === description)
        .reduce((sum, item) => sum + item.amount, 0);

      const category = relevantBudgetItems.find(item => item.description === description)!.category;
      const actualData = actuals[description];
      
      varianceMap[category].push({
        description: description,
        budgeted: totalBudgeted,
        actual: actualData?.amount ?? null,
        itemCount: actualData?.count ?? 0,
      });

      if (actualData) {
        processedActualKeys.add(description);
      }
    });

    Object.entries(actuals).forEach(([key, actualData]) => {
      if (!processedActualKeys.has(key)) {
        varianceMap[actualData.category].push({
          description: `* ${actualData.description}`,
          budgeted: 0,
          actual: actualData.amount,
          itemCount: actualData.count,
        });
      }
    });

    Object.keys(varianceMap).forEach(key => {
      const catKey = key as ExtendedBudgetItemCategory;
      if (varianceMap[catKey]) {
        varianceMap[catKey].sort((a, b) => {
          const aUnbudgeted = a.description.startsWith('* ');
          const bUnbudgeted = b.description.startsWith('* ');
          if (aUnbudgeted && !bUnbudgeted) return 1;
          if (!aUnbudgeted && bUnbudgeted) return -1;
          return a.description.localeCompare(b.description);
        });
      }
    });

    return varianceMap;
  }, [allBudgetItemsGlobal, startDate, endDate, actualSpendingByDescriptionAndCategory]);

  const varianceTotalsByCategory = useMemo(() => {
    const totals: Record<ExtendedBudgetItemCategory, { budgeted: number; actual: number; variance: number; itemCount: number }> = {
      income: { budgeted: 0, actual: 0, variance: 0, itemCount: 0 },
      'recurring-expense': { budgeted: 0, actual: 0, variance: 0, itemCount: 0 },
      'one-time-expense': { budgeted: 0, actual: 0, variance: 0, itemCount: 0 },
      goal: { budgeted: 0, actual: 0, variance: 0, itemCount: 0 },
      debt: { budgeted: 0, actual: 0, variance: 0, itemCount: 0 },
      'unplanned-expense': { budgeted: 0, actual: 0, variance: 0, itemCount: 0 },
      'unbudgeted-income': { budgeted: 0, actual: 0, variance: 0, itemCount: 0 },
    };

    Object.entries(varianceDataByCategory).forEach(([categoryStringKey, items]) => {
      const catKey = categoryStringKey as ExtendedBudgetItemCategory;
      if (totals[catKey]) {
        items.forEach(item => {
          totals[catKey].budgeted += (item.budgeted || 0);
          totals[catKey].actual += (item.actual ?? 0);
          totals[catKey].itemCount += (item.itemCount || 0);
        });
        if (catKey === 'income' || catKey === 'unbudgeted-income') {
          totals[catKey].variance = totals[catKey].actual - totals[catKey].budgeted;
        } else {
          totals[catKey].variance = totals[catKey].budgeted - totals[catKey].actual;
        }
      }
    });

    const totalBudgetedIncome = totals.income.budgeted;
    const totalActualIncomeCalculated = totals.income.actual + totals['unbudgeted-income'].actual;

    const totalBudgetedSpending = totals['recurring-expense'].budgeted + totals['one-time-expense'].budgeted + totals.goal.budgeted + totals.debt.budgeted;
    const totalActualSpending = totals['recurring-expense'].actual + totals['one-time-expense'].actual + totals.goal.actual + totals.debt.actual + totals['unplanned-expense'].actual;

    const netBudgeted = totalBudgetedIncome - totalBudgetedSpending;
    const netActual = totalActualIncomeCalculated - totalActualSpending;
    const overallVariance = netActual - netBudgeted;

    return { ...totals, netBudgeted, netActual, overallVariance, totalActualIncome: totalActualIncomeCalculated, totalBudgetedIncome, totalActualSpending, totalBudgetedSpending };
  }, [varianceDataByCategory]);

  const renderDetailRow = (category: ExtendedBudgetItemCategory, description: string, budgeted: number, actual: number | null) => {
    const actualValue = actual ?? 0;
    const budgetedValue = budgeted;
    const isUnbudgeted = description.startsWith('* ');
    const displayDescription = isUnbudgeted ? description.substring(2) : description;
    const isIncomeCategory = category === 'income' || category === 'unbudgeted-income';

    let variance = isIncomeCategory ? actualValue - budgetedValue : budgetedValue - actualValue;

    if (actual === null && budgetedValue === 0 && !isUnbudgeted) {
      variance = 0;
    }

    const varianceColor = variance > 0 ? 'text-emerald-500' : variance < 0 ? 'text-rose-500' : 'text-muted-foreground';

    return (
      <TableRow key={`${category}-${description}`} className="hover:bg-muted/10 border-b border-border/20 text-xs">
        <TableCell className={cn("pl-4 pr-2 py-2 font-medium text-foreground", isUnbudgeted && "italic text-muted-foreground/80")}>
          {displayDescription}
          {isUnbudgeted && <span className="ml-1.5 text-[9px] bg-amber-500/10 text-amber-600 px-1 py-0.2 rounded font-mono">Unplanned</span>}
        </TableCell>
        <TableCell className="text-right font-mono px-2 py-2 text-muted-foreground">{budgetedValue > 0 ? formatCurrency(budgetedValue) : '-'}</TableCell>
        <TableCell className="text-right font-mono px-2 py-2 font-semibold text-foreground">{actual !== null ? formatCurrency(actual) : '-'}</TableCell>
        <TableCell className={cn("text-right font-mono pr-4 pl-2 py-2 font-bold", varianceColor)}>
          {variance > 0 ? '+' : ''}{formatCurrency(variance)}
        </TableCell>
      </TableRow>
    );
  };

  const renderSection = (title: string, data: { description: string; budgeted: number; actual: number | null; }[], category: ExtendedBudgetItemCategory, totals: { budgeted: number; actual: number; variance: number; }, IconComponent: React.ElementType, headerColor: string) => {
    if (data.length === 0) return null;
    return (
      <>
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={4} className={cn("font-bold text-xs flex items-center gap-2 py-2.5", headerColor)}>
            <IconComponent className="h-4 w-4" /> {title}
          </TableCell>
        </TableRow>
        {data.map(item => renderDetailRow(category, item.description, item.budgeted, item.actual))}
        <TableRow className="font-bold border-t border-border/50 bg-muted/10 text-xs">
          <TableCell className="pl-4 py-2">Total {title}</TableCell>
          <TableCell className="text-right font-mono text-muted-foreground py-2">{formatCurrency(totals.budgeted)}</TableCell>
          <TableCell className="text-right font-mono text-foreground py-2">{formatCurrency(totals.actual)}</TableCell>
          <TableCell className={cn("text-right font-mono pr-4 py-2", totals.variance >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
            {totals.variance >= 0 ? '+' : ''}{formatCurrency(totals.variance)}
          </TableCell>
        </TableRow>
      </>
    );
  };

  const budgetPeriodRangeForDisplay = useMemo(() => {
    if (!startDate && !endDate) return "All-Time Ledger";
    if (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate)) return "Selected Period";
    const relevantMonths = getUniqueMonthsInRange(startDate, endDate);
    if (relevantMonths.length === 0) return "Selected Period (No Budgets)";
    if (relevantMonths.length === 1) return format(parse(relevantMonths[0], 'yyyy-MM', new Date()), 'MMMM yyyy');
    return `${format(parse(relevantMonths[0], 'yyyy-MM', new Date()), 'MMM yyyy')} - ${format(parse(relevantMonths[relevantMonths.length - 1], 'yyyy-MM', new Date()), 'MMM yyyy')}`;
  }, [startDate, endDate]);

  const renderSummaryCard = (label: string, actual: number, budgeted: number, isIncome: boolean) => {
    const variance = isIncome ? actual - budgeted : budgeted - actual;
    const isPositive = variance >= 0;
    const percentageVariance = budgeted > 0 ? (variance / budgeted) * 100 : 0;

    return (
      <div className="p-4 border border-border/50 rounded-xl bg-background/50 flex flex-col justify-between space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          <Badge variant={isPositive ? 'outline' : 'secondary'} className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 border/50 uppercase",
            isPositive ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20" : "bg-rose-500/5 text-rose-600 border-rose-500/20"
          )}>
            {isPositive ? 'Surplus' : 'Deficit'}
          </Badge>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold font-mono tracking-tight text-foreground">{formatCurrency(actual)}</span>
          <span className="text-[10px] text-muted-foreground font-semibold">Budget: {formatCurrency(budgeted)}</span>
        </div>
        {budgeted > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold pt-1 border-t border-border/30">
            <span className={cn(isPositive ? 'text-emerald-500' : 'text-rose-500')}>
              {isPositive ? '+' : ''}{percentageVariance.toFixed(1)}%
            </span>
            <span className="text-muted-foreground text-[10px]">from targeted benchmark</span>
          </div>
        )}
      </div>
    );
  };

  const noDataForReport = Object.values(varianceDataByCategory).every(arr => arr.length === 0) && filteredTransactions.length === 0;

  return (
    <Card className="lg:col-span-2 shadow-md border border-border/60 overflow-hidden bg-card rounded-2xl">
      <CardHeader className="bg-muted/30 border-b border-border/40 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <PieChartIcon className="h-4.5 w-4.5 text-primary" /> Budget Variance Analysis
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
              Deep dive comparing actual ledger records to active strategic budgets allocated in <span className="font-semibold text-foreground">{budgetPeriodRangeForDisplay}</span>.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <Button 
              variant="outline" 
              size="xs" 
              onClick={() => setIsDetailDialogOpen(true)} 
              disabled={noDataForReport}
              className="h-8 text-xs font-semibold rounded-lg border-border/60 shadow-sm"
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Detailed Balance Sheet
            </Button>
            <Button 
              variant="outline" 
              size="xs" 
              onClick={handlePrintPDF} 
              disabled={noDataForReport}
              className="h-8 text-xs font-semibold rounded-lg border-border/60 bg-card text-foreground shadow-sm hover:bg-muted/10 no-print"
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5 text-primary" /> Download PDF Report
            </Button>
          </div>
        </div>
      </CardHeader>

      {noDataForReport ? (
        <CardContent className="p-10 text-center text-xs text-muted-foreground/80 bg-background/50">
          No transaction records or monthly budgets match the active date duration. Use filters to adjust parameters.
        </CardContent>
      ) : (
        <>
          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/5">
            {renderSummaryCard("Aggregate Income Flows", varianceTotalsByCategory.totalActualIncome, varianceTotalsByCategory.totalBudgetedIncome, true)}
            {renderSummaryCard("Aggregate Outflow Spending", varianceTotalsByCategory.totalActualSpending, varianceTotalsByCategory.totalBudgetedSpending, false)}
          </CardContent>
          <CardFooter className="flex flex-col gap-2 p-5 border-t border-border/40 bg-muted/10">
            <div className="flex justify-between items-center w-full text-xs font-semibold text-muted-foreground">
              <span>Net Strategic Budget Allocation</span>
              <span className="font-mono text-foreground font-bold">{formatCurrency(varianceTotalsByCategory.netBudgeted)}</span>
            </div>
            <div className="flex justify-between items-center w-full text-xs font-semibold text-muted-foreground">
              <span>Net Realized Cash Flows</span>
              <span className="font-mono text-foreground font-bold">{formatCurrency(varianceTotalsByCategory.netActual)}</span>
            </div>
            <Separator className="my-1.5 opacity-50" />
            <div className="flex justify-between items-center w-full">
              <span className="text-sm font-bold text-foreground">Overall Strategic Variance</span>
              <span className={cn(
                "font-mono font-bold text-base tracking-tight px-3 py-1 rounded-full",
                varianceTotalsByCategory.overallVariance >= 0 ? 'text-emerald-600 bg-emerald-500/10' : 'text-rose-600 bg-rose-500/10'
              )}>
                {varianceTotalsByCategory.overallVariance >= 0 ? '+' : ''}{formatCurrency(varianceTotalsByCategory.overallVariance)}
              </span>
            </div>
          </CardFooter>
        </>
      )}

      {/* DETAILED LEDGER SHEET DIALOG */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent data-variance-sheet="true" className="w-[95%] max-w-4xl max-h-[85vh] p-5 rounded-2xl border border-border/60 bg-background shadow-lg overflow-hidden flex flex-col print-variance-sheet">
          <DialogHeader className="pb-3 border-b border-border/40">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" /> Budget Variance Balance Sheet
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Complete category breakdown for the period starting <span className="font-semibold text-foreground">{formatDateForStatements(startDate)}</span> to <span className="font-semibold text-foreground">{formatDateForStatements(endDate)}</span>.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-2 my-4">
            <Table className="border border-border/40 rounded-xl overflow-hidden shadow-sm">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-b border-border/40">
                  <TableHead className="pl-4 text-xs font-semibold py-2.5 text-muted-foreground">Item Specification</TableHead>
                  <TableHead className="text-right text-xs font-semibold py-2.5 text-muted-foreground">Allocated Budget</TableHead>
                  <TableHead className="text-right text-xs font-semibold py-2.5 text-muted-foreground">Actual Spent</TableHead>
                  <TableHead className="text-right text-xs font-semibold py-2.5 text-muted-foreground pr-4 w-[140px]">Net Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderSection("Revenue Flows", varianceDataByCategory.income.concat(varianceDataByCategory['unbudgeted-income']), 'income', { budgeted: varianceTotalsByCategory.income.budgeted, actual: varianceTotalsByCategory.totalActualIncome, variance: varianceTotalsByCategory.totalActualIncome - varianceTotalsByCategory.income.budgeted }, TrendingUp, 'text-emerald-600')}
                {renderSection("Recurring Expenses", varianceDataByCategory['recurring-expense'], 'recurring-expense', varianceTotalsByCategory['recurring-expense'], TrendingDown, 'text-rose-600')}
                {renderSection("One-Time Expenses", varianceDataByCategory['one-time-expense'], 'one-time-expense', varianceTotalsByCategory['one-time-expense'], MinusCircle, 'text-rose-600')}
                {renderSection("Unplanned Spending", varianceDataByCategory['unplanned-expense'], 'unplanned-expense', varianceTotalsByCategory['unplanned-expense'], HelpCircle, 'text-rose-600')}
                {renderSection("Strategic Goals", varianceDataByCategory.goal, 'goal', varianceTotalsByCategory.goal, TargetIcon, 'text-blue-600')}
                {renderSection("Amortized Debt", varianceDataByCategory.debt, 'debt', varianceTotalsByCategory.debt, Coins, 'text-amber-600')}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter className="pt-3 border-t border-border/40 flex items-center justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={handlePrintPDF} className="h-9 text-xs rounded-lg px-4 font-semibold border-border/60 bg-card text-foreground flex items-center gap-1.5 no-print">
              <FileDown className="h-4 w-4 text-primary" /> Print Ledger to PDF
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 text-xs rounded-lg px-4 font-semibold border-border/60 no-print">
                Close Balance Sheet
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default BudgetVarianceReportSection;
