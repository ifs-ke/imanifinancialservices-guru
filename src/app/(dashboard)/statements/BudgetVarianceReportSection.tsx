
// src/app/(dashboard)/statements/BudgetVarianceReportSection.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter as ShadTableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, PieChart as PieChartIcon, TrendingUp, TrendingDown, MinusCircle, Target as TargetIcon, Coins, DollarSign, HelpCircle, Eye } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore, selectCurrentBudgetPeriod } from '@/store/budgetStore';
import type { TransactionWithId, BudgetItem, BudgetItemCategory as InternalBudgetItemCategory } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from '@/components/ui/separator';
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, parse, differenceInDays, getDaysInMonth, isEqual, isValid as isDateValid } from 'date-fns';
import { Badge } from '@/components/ui/badge';
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

interface BudgetVarianceReportSectionProps {
  startDate?: Date;
  endDate?: Date;
}

type ExtendedBudgetItemCategory = InternalBudgetItemCategory | 'unplanned-expense' | 'unbudgeted-income';

const formatDateForStatements = (date: Date | undefined) => {
    if (!date || !isDateValid(date)) return <span>Pick a date</span>;
    return format(date, "LLL dd, y");
};


const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & {
    label: string;
    sum: number;
    budgetedSum?: number | null;
    variance?: number | null;
    itemCount?: number,
    icon?: React.ElementType,
    className?: string;
  }
>(({ label, sum, budgetedSum, variance, itemCount, icon: Icon, children, className, ...props }, ref) => {
    const hasBudget = budgetedSum !== undefined && budgetedSum !== null;
    const hasVariance = variance !== undefined && variance !== null;
    let varianceColor = 'text-muted-foreground'; 
    if (hasVariance) {
      if (variance > 0) varianceColor = 'text-accent'; 
      else if (variance < 0) varianceColor = 'text-destructive'; 
    }

  return (
      <AccordionTrigger ref={ref} {...props} className={cn('hover:no-underline py-3 px-4 data-[state=open]:border-b data-[state=closed]:border-b-0', className)}>
        <div className="flex justify-between items-center w-full">
            <span className="flex items-center gap-2 text-base font-semibold">
               {Icon && <Icon className="h-4 w-4" />}
              {label}
               {hasBudget && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">(Budget: {formatCurrency(budgetedSum)})</span>
               )}
            </span>
            <div className="flex items-center gap-2">
                {itemCount !== undefined && itemCount > 0 && <span className="text-xs text-muted-foreground">({itemCount} items)</span>}
                {hasVariance && isFinite(variance) && (budgetedSum !== 0 || sum !== 0) && ( 
                    <Badge variant={variance >=0 ? "default" : "destructive"} className={cn("text-xs font-mono", varianceColor)}>
                      {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                    </Badge>
                )}
                <span className="font-semibold font-mono text-base">{formatCurrency(sum)}</span>
            </div>
        </div>
      </AccordionTrigger>
  );
});
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


const BudgetVarianceReportSection: React.FC<BudgetVarianceReportSectionProps> = ({ startDate, endDate }) => {
  const transactions = useTransactionsStore(state => state.transactions);
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const budgetPeriod = useBudgetStore(selectCurrentBudgetPeriod); 
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);


  const filteredTransactions = useMemo(() => {
    if (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate)) {
      return []; 
    }
    const start = startDate.getTime();
    const endOfDay = new Date(endDate).setHours(23, 59, 59, 999);

    return transactions.filter(tx => {
        const txDate = tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date);
        if (!isDateValid(txDate)) return false;
        const txTime = txDate.getTime();
        return txTime >= start && txTime <= endOfDay;
    });
  }, [transactions, startDate, endDate]);

  const actualSpendingByCategory = useMemo(() => {
    const actuals: Record<string, { amount: number; count: number; category: ExtendedBudgetItemCategory; originalDescription: string }> = {};
    const budgetItemsForSelectedPeriod = allBudgetItems.filter(item => item.period === budgetPeriod);

    filteredTransactions.forEach(tx => {
        if (tx.amount === 0) return;
        const isIncomeTx = tx.amount > 0;
        let matchedBudgetItem: BudgetItem | undefined = undefined;

        if (tx.categoryName) {
            matchedBudgetItem = budgetItemsForSelectedPeriod.find(
                bi => bi.description === tx.categoryName &&
                      (isIncomeTx ? bi.category === 'income' : bi.category !== 'income')
            );
        }

        let categoryKey: ExtendedBudgetItemCategory;
        let keyDescription: string;

        if (isIncomeTx) {
            categoryKey = matchedBudgetItem && matchedBudgetItem.category === 'income' ? 'income' : 'unbudgeted-income';
            keyDescription = matchedBudgetItem ? matchedBudgetItem.description : tx.description;
        } else { 
            categoryKey = matchedBudgetItem ? matchedBudgetItem.category : 'unplanned-expense';
            keyDescription = matchedBudgetItem ? matchedBudgetItem.description : tx.description;
        }

        const groupKey = `${categoryKey}-${keyDescription.toLowerCase().trim()}`;
        const amount = Math.abs(tx.amount);

        if (!actuals[groupKey]) {
            actuals[groupKey] = { amount: 0, count: 0, category: categoryKey, originalDescription: keyDescription };
        }
        actuals[groupKey].amount += amount;
        actuals[groupKey].count += 1;
    });
    return actuals;
  }, [filteredTransactions, allBudgetItems, budgetPeriod]);

  const varianceDataByCategory = useMemo(() => {
    const varianceMap: Record<ExtendedBudgetItemCategory, { description: string; budgeted: number; actual: number | null; itemCount: number }[]> = {
        income: [], 'recurring-expense': [], 'one-time-expense': [], goal: [], debt: [],
        'unplanned-expense': [], 'unbudgeted-income': []
    };
    const actualsTracked: Set<string> = new Set();
    const budgetItemsForSelectedPeriod = allBudgetItems.filter(item => item.period === budgetPeriod);

    const stmtStart = startDate && isDateValid(startDate) ? startDate : dfnsStartOfMonth(new Date());
    const stmtEnd = endDate && isDateValid(endDate) ? endDate : dfnsEndOfMonth(new Date());
    const budgetMonthDate = parse(budgetPeriod, 'yyyy-MM', new Date());

    if (!isDateValid(budgetMonthDate)) return varianceMap;

    const budgetMonthStart = dfnsStartOfMonth(budgetMonthDate);
    const budgetMonthEnd = dfnsEndOfMonth(budgetMonthDate);
    const daysInBudgetMonth = getDaysInMonth(budgetMonthDate);

    budgetItemsForSelectedPeriod.forEach(item => {
        const descKey = item.description.toLowerCase().trim();
        const categoryKey = item.category as InternalBudgetItemCategory;
        const actualGroupKey = `${categoryKey}-${descKey}`;
        const actualGroup = actualSpendingByCategory[actualGroupKey];
        const actualAmount = actualGroup ? actualGroup.amount : null;
        const actualItemCount = actualGroup ? actualGroup.count : 0;

        let budgetAmountToCompare = item.amount;
        const statementOverlapsBudgetMonth = (stmtStart <= budgetMonthEnd && stmtEnd >= budgetMonthStart);

        if (statementOverlapsBudgetMonth && !(isEqual(stmtStart, budgetMonthStart) && isEqual(stmtEnd, budgetMonthEnd)) && daysInBudgetMonth > 0) {
            const overlapStart = stmtStart > budgetMonthStart ? stmtStart : budgetMonthStart;
            const overlapEnd = stmtEnd < budgetMonthEnd ? stmtEnd : budgetMonthEnd;
            let effectiveDaysInStatementForBudget = 0;
            if (overlapEnd >= overlapStart) {
                 effectiveDaysInStatementForBudget = differenceInDays(overlapEnd, overlapStart) + 1;
            }
            budgetAmountToCompare = effectiveDaysInStatementForBudget > 0 ? (item.amount / daysInBudgetMonth) * effectiveDaysInStatementForBudget : 0;
        } else if (!statementOverlapsBudgetMonth) {
             budgetAmountToCompare = 0;
        }

        if (varianceMap[categoryKey]) {
            varianceMap[categoryKey].push({ description: item.description, budgeted: budgetAmountToCompare, actual: actualAmount, itemCount: actualItemCount });
            if (actualGroup) actualsTracked.add(actualGroupKey);
        }
    });

    Object.entries(actualSpendingByCategory).forEach(([groupKey, data]) => {
        if (!actualsTracked.has(groupKey)) {
             const targetCategoryArray = varianceMap[data.category];
             if (targetCategoryArray) {
                 targetCategoryArray.push({
                     description: `* ${data.originalDescription}`,
                     budgeted: 0,
                     actual: data.amount,
                     itemCount: data.count,
                 });
             }
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
  }, [allBudgetItems, budgetPeriod, actualSpendingByCategory, startDate, endDate]);

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

  const renderVarianceRow = (category: ExtendedBudgetItemCategory, description: string, budgeted: number, actual: number | null) => {
    const actualValue = actual ?? 0;
    const budgetedValue = budgeted;
    const isUnbudgeted = description.startsWith('* ');
    const displayDescription = isUnbudgeted ? description.substring(2) : description;
    const isIncomeCategory = category === 'income' || category === 'unbudgeted-income';

    let variance = isIncomeCategory ? actualValue - budgetedValue : budgetedValue - actualValue;

    let statusText = '-';
    let statusColor = 'text-muted-foreground';
    const isFavorable = variance >= 0;

     if (actual === null && budgetedValue === 0 && !isUnbudgeted) statusText = '-';
     else if (isUnbudgeted) { statusText = `${isIncomeCategory ? '+' : '-'}${formatCurrency(actualValue)} (Unbudgeted)`; statusColor = isIncomeCategory ? 'text-accent' : 'text-destructive'; }
     else if (actual === null) { statusText = `${isIncomeCategory ? '-' : '+'}${formatCurrency(budgetedValue)} (Not ${isIncomeCategory ? 'Realized' : 'Spent'})`; statusColor = isIncomeCategory ? 'text-destructive' : 'text-accent'; }
     else {
        const threshold = Math.max(Math.abs(budgetedValue * 0.05), 50);
        if (Math.abs(variance) <= threshold && budgetedValue !== 0) { statusText = 'On Track'; statusColor = 'text-primary'; }
        else if (isFavorable && (budgetedValue !== 0 || actualValue !== 0)) { statusText = `+${formatCurrency(Math.abs(variance))} (Favorable)`; statusColor = 'text-accent'; }
        else if (!isFavorable && (budgetedValue !== 0 || actualValue !== 0)) { statusText = `-${formatCurrency(Math.abs(variance))} (Unfavorable)`; statusColor = 'text-destructive'; }
    }

    return (
        <TableRow key={`${category}-${description}`} className="text-sm">
             <TableCell className={cn("pl-4 pr-2 py-1.5", isUnbudgeted && "italic text-muted-foreground")}>{displayDescription}</TableCell>
             <TableCell className="text-right font-mono px-2 py-1.5">{budgetedValue > 0 ? formatCurrency(budgetedValue) : (isUnbudgeted || actual === null ? '-' : formatCurrency(0))}</TableCell>
             <TableCell className="text-right font-mono px-2 py-1.5">{actual !== null ? formatCurrency(actual) : '-'}</TableCell>
             <TableCell className={cn("text-right font-mono text-xs pr-4 pl-2 py-1.5", statusColor)}>{statusText}</TableCell>
        </TableRow>
    );
  };

  const budgetPeriodDisplay = budgetPeriod && isDateValid(parse(budgetPeriod, 'yyyy-MM', new Date()))
    ? format(parse(budgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy')
    : 'Selected Period';

  const renderSummaryItem = (label: string, actual: number, budgeted: number, isIncome: boolean) => {
    const variance = isIncome ? actual - budgeted : budgeted - actual;
    const varianceColor = variance >= 0 ? 'text-accent' : 'text-destructive';
    const variancePrefix = variance >= 0 ? '+' : '';
    const hasMeaningfulData = actual !== 0 || budgeted !== 0;

    return (
        <div className="p-4 border rounded-lg bg-background shadow-sm">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">{label}</h4>
            <div className="flex justify-between items-baseline">
                <span className="text-xl font-semibold font-mono">{formatCurrency(actual)}</span>
                <span className="text-xs text-muted-foreground">Budget: {formatCurrency(budgeted)}</span>
            </div>
            {hasMeaningfulData && (
              <p className={cn("text-xs font-mono mt-1", varianceColor)}>
                  Variance: {variancePrefix}{formatCurrency(variance)}
              </p>
            )}
        </div>
    );
  };

  return (
    <Card className="lg:col-span-2 shadow-md">
        <CardHeader className="p-6 flex flex-row justify-between items-start">
            <div>
                <CardTitle className="flex items-center gap-2"><PieChartIcon className="h-5 w-5 text-primary"/>Budget Variance Report</CardTitle>
                <CardDescription>Compares the budget for <span className='font-semibold'>{budgetPeriodDisplay}</span> with actual transactions from <span className='font-semibold'>{formatDateForStatements(startDate)}</span> to <span className='font-semibold'>{formatDateForStatements(endDate)}</span>.</CardDescription>
                <p className='text-xs text-muted-foreground pt-1 flex items-center gap-1'><Info size={14}/>Items marked with * are unplanned/unbudgeted. Overall Variance is (Net Actual - Net Budgeted).</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsDetailDialogOpen(true)} disabled={Object.values(varianceDataByCategory).every(arr => arr.length === 0)}>
                <Eye className="mr-2 h-4 w-4"/> View Detailed Breakdown
            </Button>
        </CardHeader>
        <CardContent className="p-6 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderSummaryItem("Total Income", varianceTotalsByCategory.totalActualIncome, varianceTotalsByCategory.totalBudgetedIncome, true)}
            {renderSummaryItem("Total Spending", varianceTotalsByCategory.totalActualSpending, varianceTotalsByCategory.totalBudgetedSpending, false)}
        </CardContent>
         <CardFooter className="flex flex-col gap-2 p-6 border-t">
             <div className="flex justify-between w-full font-semibold text-base mt-1">
                 <span>Net Budgeted (Income - Budgeted Spending):</span>
                 <span className="font-mono">{formatCurrency(varianceTotalsByCategory.netBudgeted)}</span>
             </div>
             <div className="flex justify-between w-full font-semibold text-base">
                 <span>Net Actual (Income - Actual Spending):</span>
                 <span className="font-mono">{formatCurrency(varianceTotalsByCategory.netActual)}</span>
             </div>
             <Separator className="my-2" />
             <div className="flex justify-between w-full font-bold text-lg">
                 <span>Overall Variance (Net Actual - Net Budgeted):</span>
                 <span className={cn("font-mono", varianceTotalsByCategory.overallVariance >= 0 ? 'text-accent' : 'text-destructive')}>
                     {varianceTotalsByCategory.overallVariance >= 0 ? '+' : ''}{formatCurrency(varianceTotalsByCategory.overallVariance)}
                 </span>
             </div>
          </CardFooter>

        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Detailed Budget Variance: {budgetPeriodDisplay}</DialogTitle>
                    <DialogDescription>
                        Breakdown of budgeted vs. actual amounts for the period {formatDateForStatements(startDate)} to {formatDateForStatements(endDate)}.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh] pr-2">
                    <Accordion type="multiple" className="w-full space-y-2 py-4" defaultValue={[]}>
                        <AccordionItem value="income-variance" className="border-b-0 mb-2 rounded-lg border bg-muted/30 text-card-foreground shadow-sm overflow-hidden">
                            <AccordionTriggerWithSum label="Budgeted Income" icon={TrendingUp} sum={varianceTotalsByCategory.income.actual} budgetedSum={varianceTotalsByCategory.income.budgeted} variance={varianceTotalsByCategory.income.variance} itemCount={varianceTotalsByCategory.income.itemCount} className="text-accent data-[state=open]:border-b data-[state=closed]:border-b-0" />
                            <AccordionContent className="p-0 bg-background">{varianceDataByCategory.income.length > 0 ? (<ScrollArea className="h-[200px] w-full"><Table><TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Item</TableHead><TableHead className="text-right px-2">Budget</TableHead><TableHead className="text-right px-2">Actual</TableHead><TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.income.map(item => renderVarianceRow('income', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No budgeted income for variance.</p>)}</AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="unbudgeted-income-variance" className="border-b-0 mb-2 rounded-lg border bg-muted/30 text-card-foreground shadow-sm overflow-hidden">
                            <AccordionTriggerWithSum label="Unbudgeted Income" icon={DollarSign} sum={varianceTotalsByCategory['unbudgeted-income'].actual} budgetedSum={0} variance={varianceTotalsByCategory['unbudgeted-income'].variance} itemCount={varianceTotalsByCategory['unbudgeted-income'].itemCount} className="text-accent/80 data-[state=open]:border-b data-[state=closed]:border-b-0" />
                            <AccordionContent className="p-0 bg-background">{varianceDataByCategory['unbudgeted-income'].length > 0 ? (<ScrollArea className="h-[200px] w-full"><Table><TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Item</TableHead><TableHead className="text-right px-2">Budget</TableHead><TableHead className="text-right px-2">Actual</TableHead><TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['unbudgeted-income'].map(item => renderVarianceRow('unbudgeted-income', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No unbudgeted income.</p>)}</AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="recurring-expense-variance" className="border-b-0 mb-2 rounded-lg border bg-muted/30 text-card-foreground shadow-sm overflow-hidden">
                            <AccordionTriggerWithSum label="Recurring Expenses" icon={TrendingDown} sum={varianceTotalsByCategory['recurring-expense'].actual} budgetedSum={varianceTotalsByCategory['recurring-expense'].budgeted} variance={varianceTotalsByCategory['recurring-expense'].variance} itemCount={varianceTotalsByCategory['recurring-expense'].itemCount} className="text-destructive data-[state=open]:border-b data-[state=closed]:border-b-0" />
                            <AccordionContent className="p-0 bg-background">{varianceDataByCategory['recurring-expense'].length > 0 ? (<ScrollArea className="h-[200px] w-full"><Table><TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Item</TableHead><TableHead className="text-right px-2">Budget</TableHead><TableHead className="text-right px-2">Actual</TableHead><TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['recurring-expense'].map(item => renderVarianceRow('recurring-expense', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No recurring expenses for variance.</p>)}</AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="one-time-expense-variance" className="border-b-0 mb-2 rounded-lg border bg-muted/30 text-card-foreground shadow-sm overflow-hidden">
                            <AccordionTriggerWithSum label="One-Time Expenses" icon={MinusCircle} sum={varianceTotalsByCategory['one-time-expense'].actual} budgetedSum={varianceTotalsByCategory['one-time-expense'].budgeted} variance={varianceTotalsByCategory['one-time-expense'].variance} itemCount={varianceTotalsByCategory['one-time-expense'].itemCount} className="text-destructive data-[state=open]:border-b data-[state=closed]:border-b-0" />
                            <AccordionContent className="p-0 bg-background">{varianceDataByCategory['one-time-expense'].length > 0 ? (<ScrollArea className="h-[200px] w-full"><Table><TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Item</TableHead><TableHead className="text-right px-2">Budget</TableHead><TableHead className="text-right px-2">Actual</TableHead><TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['one-time-expense'].map(item => renderVarianceRow('one-time-expense', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No one-time expenses for variance.</p>)}</AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="unplanned-expense-variance" className="border-b-0 mb-2 rounded-lg border bg-muted/30 text-card-foreground shadow-sm overflow-hidden">
                            <AccordionTriggerWithSum label="Unplanned Expenses" icon={HelpCircle} sum={varianceTotalsByCategory['unplanned-expense'].actual} budgetedSum={0} variance={varianceTotalsByCategory['unplanned-expense'].variance} itemCount={varianceTotalsByCategory['unplanned-expense'].itemCount} className="text-destructive data-[state=open]:border-b data-[state=closed]:border-b-0" />
                            <AccordionContent className="p-0 bg-background">{varianceDataByCategory['unplanned-expense'].length > 0 ? (<ScrollArea className="h-[200px] w-full"><Table><TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Item</TableHead><TableHead className="text-right px-2">Budget</TableHead><TableHead className="text-right px-2">Actual</TableHead><TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['unplanned-expense'].map(item => renderVarianceRow('unplanned-expense', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No unplanned expenses.</p>)}</AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="goal-variance" className="border-b-0 mb-2 rounded-lg border bg-muted/30 text-card-foreground shadow-sm overflow-hidden">
                            <AccordionTriggerWithSum label="Goals" icon={TargetIcon} sum={varianceTotalsByCategory.goal.actual} budgetedSum={varianceTotalsByCategory.goal.budgeted} variance={varianceTotalsByCategory.goal.variance} itemCount={varianceTotalsByCategory.goal.itemCount} className="text-primary data-[state=open]:border-b data-[state=closed]:border-b-0" />
                            <AccordionContent className="p-0 bg-background">{varianceDataByCategory.goal.length > 0 ? (<ScrollArea className="h-[200px] w-full"><Table><TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Item</TableHead><TableHead className="text-right px-2">Budget</TableHead><TableHead className="text-right px-2">Actual</TableHead><TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.goal.map(item => renderVarianceRow('goal', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No goals for variance.</p>)}</AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="debt-variance" className="border-b-0 rounded-lg border bg-muted/30 text-card-foreground shadow-sm overflow-hidden">
                            <AccordionTriggerWithSum label="Debt Allocation" icon={Coins} sum={varianceTotalsByCategory.debt.actual} budgetedSum={varianceTotalsByCategory.debt.budgeted} variance={varianceTotalsByCategory.debt.variance} itemCount={varianceTotalsByCategory.debt.itemCount} className="text-destructive/80 data-[state=open]:border-b data-[state=closed]:border-b-0" />
                            <AccordionContent className="p-0 bg-background">{varianceDataByCategory.debt.length > 0 ? (<ScrollArea className="h-[200px] w-full"><Table><TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Item</TableHead><TableHead className="text-right px-2">Budget</TableHead><TableHead className="text-right px-2">Actual</TableHead><TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.debt.map(item => renderVarianceRow('debt', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No debt allocations for variance.</p>)}</AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </ScrollArea>
                <DialogFooter className="mt-6">
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </Card>
  );
};

export default BudgetVarianceReportSection;
    