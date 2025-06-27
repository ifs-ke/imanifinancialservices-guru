// src/app/(dashboard)/statements/BudgetVarianceReportSection.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, PieChart as PieChartIcon, TrendingUp, TrendingDown, MinusCircle, Target as TargetIcon, Coins, DollarSign, HelpCircle, Eye } from 'lucide-react';
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

  const filteredTransactions = useMemo(() => {
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

    const relevantBudgetMonths = (startDate && endDate) ? getUniqueMonthsInRange(startDate, endDate) : [];
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

        // Check if transaction is linked to a budget item THAT EXISTS IN THE RELEVANT PERIODS
        if (linkedBudgetItemDescription && budgetCategoryMap[linkedBudgetItemDescription]) {
            key = linkedBudgetItemDescription;
            category = budgetCategoryMap[linkedBudgetItemDescription];
            description = linkedBudgetItemDescription;
        } else {
            // Treat as unplanned/unbudgeted
            description = tx.description;
            category = isIncomeTx ? 'unbudgeted-income' : 'unplanned-expense';
            key = `${category}-${description.toLowerCase().trim()}`; // Unique key for unplanned items
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

    if (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate)) return varianceMap;

    const actuals = actualSpendingByDescriptionAndCategory;
    const processedActualKeys = new Set<string>();

    const relevantBudgetMonths = getUniqueMonthsInRange(startDate, endDate);
    const relevantBudgetItems = allBudgetItemsGlobal.filter(item => relevantBudgetMonths.includes(item.period));
    const uniqueBudgetItemDescriptions = Array.from(new Set(relevantBudgetItems.map(item => item.description)));
    
    // 1. Process all budgeted items and their matched actuals
    uniqueBudgetItemDescriptions.forEach(description => {
        const totalBudgeted = relevantBudgetItems
            .filter(item => item.description === description)
            .reduce((sum, item) => sum + item.amount, 0);

        const category = relevantBudgetItems.find(item => item.description === description)!.category;
        
        const actualData = actuals[description]; // Direct lookup by the budget item's description
        
        varianceMap[category].push({
            description: description,
            budgeted: totalBudgeted,
            actual: actualData?.amount ?? null,
            itemCount: actualData?.count ?? 0,
        });

        if (actualData) {
            processedActualKeys.add(description); // Mark this actual as processed
        }
    });

    // 2. Add any remaining actuals that were not matched to a budget item
    Object.entries(actuals).forEach(([key, actualData]) => {
        if (!processedActualKeys.has(key)) {
            // This is an unplanned/unbudgeted item
            varianceMap[actualData.category].push({
                description: `* ${actualData.description}`,
                budgeted: 0,
                actual: actualData.amount,
                itemCount: actualData.count,
            });
        }
    });

    // Sort each category for display
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

    const varianceColor = variance > 0 ? 'text-accent' : variance < 0 ? 'text-destructive' : 'text-muted-foreground';

    return (
        <TableRow key={`${category}-${description}`} className="text-sm">
             <TableCell className={cn("pl-4 pr-2 py-1.5", isUnbudgeted && "italic text-muted-foreground")}>{displayDescription}</TableCell>
             <TableCell className="text-right font-mono px-2 py-1.5">{budgetedValue > 0 ? formatCurrency(budgetedValue) : '-'}</TableCell>
             <TableCell className="text-right font-mono px-2 py-1.5">{actual !== null ? formatCurrency(actual) : '-'}</TableCell>
             <TableCell className={cn("text-right font-mono pr-4 pl-2 py-1.5", varianceColor)}>
               {(variance > 0 ? '+' : '') + formatCurrency(variance)}
             </TableCell>
        </TableRow>
    );
  };

  const renderSection = (title: string, data: { description: string; budgeted: number; actual: number | null; }[], category: ExtendedBudgetItemCategory, totals: { budgeted: number; actual: number; variance: number; }, IconComponent: React.ElementType, headerColor: string) => {
    if (data.length === 0) return null;
    return (
      <>
        <TableRow className="bg-muted hover:bg-muted">
            <TableCell colSpan={4} className={cn("font-semibold flex items-center gap-2", headerColor)}>
                <IconComponent className="h-4 w-4" /> {title}
            </TableCell>
        </TableRow>
        {data.map(item => renderDetailRow(category, item.description, item.budgeted, item.actual))}
        <TableRow className="font-bold border-t-2 bg-muted/50">
            <TableCell>Total {title}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(totals.budgeted)}</TableCell>
            <TableCell className="text-right font-mono">{formatCurrency(totals.actual)}</TableCell>
            <TableCell className={cn("text-right font-mono", totals.variance > 0 ? 'text-accent' : 'text-destructive')}>{totals.variance >= 0 ? '+' : ''}{formatCurrency(totals.variance)}</TableCell>
        </TableRow>
      </>
    )
  };


  const budgetPeriodRangeForDisplay = useMemo(() => {
    if (!startDate || !endDate || !isDateValid(startDate) || !isDateValid(endDate)) return "Selected Period";
    const relevantMonths = getUniqueMonthsInRange(startDate, endDate);
    if (relevantMonths.length === 0) return "Selected Period (No Budgets)";
    if (relevantMonths.length === 1) return format(parse(relevantMonths[0], 'yyyy-MM', new Date()), 'MMMM yyyy');
    return `${format(parse(relevantMonths[0], 'yyyy-MM', new Date()), 'MMM yyyy')} - ${format(parse(relevantMonths[relevantMonths.length - 1], 'yyyy-MM', new Date()), 'MMM yyyy')}`;
  }, [startDate, endDate]);

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

  const noDataForReport = Object.values(varianceDataByCategory).every(arr => arr.length === 0) && filteredTransactions.length === 0;

  return (
    <Card className="lg:col-span-2 shadow-md">
        <CardHeader className="p-6 flex flex-row justify-between items-start">
            <div>
                <CardTitle className="flex items-center gap-2"><PieChartIcon className="h-5 w-5 text-primary"/>Budget Variance Report</CardTitle>
                <CardDescription>
                    Compares actual spending from <span className='font-semibold'>{formatDateForStatements(startDate)}</span> to <span className='font-semibold'>{formatDateForStatements(endDate)}</span>
                    {` `}against the full budget for <span className='font-semibold'>{budgetPeriodRangeForDisplay}</span>.
                </CardDescription>
                <p className='text-xs text-muted-foreground pt-1 flex items-center gap-1'><Info size={14}/>Items marked with * are unplanned/unbudgeted. Overall Variance is (Net Actual - Net Budgeted).</p>
            </div>
             <Button variant="outline" size="sm" onClick={() => setIsDetailDialogOpen(true)} disabled={noDataForReport}>
                <Eye className="mr-2 h-4 w-4"/> View Detailed Breakdown
            </Button>
        </CardHeader>
        {noDataForReport ? (
            <CardContent className="p-6 pt-0 text-center text-muted-foreground">
                No transaction or budget data available for the selected period to generate a variance report.
            </CardContent>
        ) : (
            <>
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
            </>
        )}

        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Detailed Budget Variance: {budgetPeriodRangeForDisplay}</DialogTitle>
                    <DialogDescription>
                        Breakdown of budgeted vs. actual amounts for the period {formatDateForStatements(startDate)} to {formatDateForStatements(endDate)}.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh] pr-2 mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-4 pr-2">Item</TableHead>
                                <TableHead className="text-right px-2">Budgeted</TableHead>
                                <TableHead className="text-right px-2">Actual</TableHead>
                                <TableHead className="text-right w-[180px] pr-4 pl-2">Variance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {renderSection("Income", varianceDataByCategory.income.concat(varianceDataByCategory['unbudgeted-income']), 'income', { budgeted: varianceTotalsByCategory.income.budgeted, actual: varianceTotalsByCategory.totalActualIncome, variance: varianceTotalsByCategory.totalActualIncome - varianceTotalsByCategory.income.budgeted }, TrendingUp, 'text-primary')}
                            
                            {renderSection("Recurring Expenses", varianceDataByCategory['recurring-expense'], 'recurring-expense', varianceTotalsByCategory['recurring-expense'], TrendingDown, 'text-destructive')}

                            {renderSection("One-Time Expenses", varianceDataByCategory['one-time-expense'], 'one-time-expense', varianceTotalsByCategory['one-time-expense'], MinusCircle, 'text-destructive')}

                            {renderSection("Unplanned Expenses", varianceDataByCategory['unplanned-expense'], 'unplanned-expense', varianceTotalsByCategory['unplanned-expense'], HelpCircle, 'text-destructive')}
                            
                            {renderSection("Goals", varianceDataByCategory.goal, 'goal', varianceTotalsByCategory.goal, TargetIcon, 'text-blue-600')}

                            {renderSection("Debt Allocation", varianceDataByCategory.debt, 'debt', varianceTotalsByCategory.debt, Coins, 'text-orange-600')}
                        </TableBody>
                    </Table>
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
