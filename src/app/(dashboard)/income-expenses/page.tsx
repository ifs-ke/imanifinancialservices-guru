// src/app/(dashboard)/income-expenses/page.tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  ArrowRight, 
  Lock, 
  Sparkles,
  Building2,
  ShoppingBag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion';
import { 
  format, 
  subMonths, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfDay, 
  endOfDay, 
  isWithinInterval, 
  isValid 
} from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import type { TransactionWithId } from '@/lib/types';

export type SimpleDatePreset = 'all' | 'this-month' | 'last-30' | 'last-90';

export default function IncomeExpensesPage() {
  const { transactions } = useTransactionsStore();

  // Selected date preset
  const [datePreset, setDatePreset] = useState<SimpleDatePreset>('all');

  // Date range calculation
  const { dateRange, durationLabel } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);
    let label = 'all time';

    switch (datePreset) {
      case 'this-month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = format(now, 'MMMM yyyy');
        break;
      case 'last-30':
        start = startOfDay(subDays(now, 30));
        end = endOfDay(now);
        label = 'last 30 days';
        break;
      case 'last-90':
        start = startOfDay(subDays(now, 90));
        end = endOfDay(now);
        label = 'last 90 days';
        break;
      case 'all':
      default: {
        let earliestDate = subMonths(now, 12);
        transactions.forEach(t => {
          const d = t.date instanceof Date ? t.date : new Date(t.date);
          if (isValid(d) && d < earliestDate) {
            earliestDate = d;
          }
        });
        start = startOfDay(earliestDate);
        end = endOfDay(now);
        label = 'all records';
      }
    }

    return { dateRange: { start, end }, durationLabel: label };
  }, [datePreset, transactions]);

  // Filter transactions within active interval
  const periodTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (!isValid(txDate)) return false;
      return isWithinInterval(txDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [transactions, dateRange]);

  // Segmented transaction lists & summaries
  const segments = useMemo(() => {
    const recurringIncome: TransactionWithId[] = [];
    const oneTimeIncome: TransactionWithId[] = [];
    const fixedExpenses: TransactionWithId[] = [];
    const variableExpenses: TransactionWithId[] = [];

    let recIncTotal = 0;
    let oneIncTotal = 0;
    let fixExpTotal = 0;
    let varExpTotal = 0;

    periodTransactions.forEach(tx => {
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
    const sortNewest = (a: TransactionWithId, b: TransactionWithId) => {
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
  }, [periodTransactions]);

  // High-level calculations
  const totalIncome = segments.recurringIncome.total + segments.oneTimeIncome.total;
  const totalExpenses = segments.fixedExpenses.total + segments.variableExpenses.total;
  const netCashFlow = totalIncome - totalExpenses;
  const retentionRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;

  return (
    <div className="flex flex-col w-full min-h-screen p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ========================================================= */}
      {/* 🧭 HEADER & PERIOD FILTER */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Income & expense analysis
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            A visual overview of your cash flow categorized by commitment types with collapsible details.
          </p>
        </div>

        {/* Date presets selection aligned perfectly with Dashboard style button selectors */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/50 text-xs">
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                datePreset === 'all' 
                  ? "bg-background text-foreground shadow-xs font-semibold" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All records
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('this-month')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                datePreset === 'this-month' 
                  ? "bg-background text-foreground shadow-xs font-semibold" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('last-30')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                datePreset === 'last-30' 
                  ? "bg-background text-foreground shadow-xs font-semibold" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              30 days
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('last-90')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer",
                datePreset === 'last-90' 
                  ? "bg-background text-foreground shadow-xs font-semibold" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              90 days
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 📊 SUMMARY PANEL (Parent Component Summaries) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Income */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-xs font-medium text-muted-foreground block">Total income</span>
              <span className="text-[10px] text-muted-foreground capitalize font-mono">
                {durationLabel}
              </span>
            </div>
            <span className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              +{formatCurrency(totalIncome)}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border/40 pt-2 font-mono">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Rec: {((segments.recurringIncome.total / (totalIncome || 1)) * 100).toFixed(0)}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/55" />
                Var: {((segments.oneTimeIncome.total / (totalIncome || 1)) * 100).toFixed(0)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-xs font-medium text-muted-foreground block">Total expenses</span>
              <span className="text-[10px] text-muted-foreground capitalize font-mono">
                {durationLabel}
              </span>
            </div>
            <span className="p-1.5 rounded-md bg-rose-500/10 text-destructive">
              <TrendingDown className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className="text-2xl font-bold font-mono text-destructive tracking-tight">
              -{formatCurrency(totalExpenses)}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border/40 pt-2 font-mono">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Fixed: {((segments.fixedExpenses.total / (totalExpenses || 1)) * 100).toFixed(0)}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400/55" />
                Var: {((segments.variableExpenses.total / (totalExpenses || 1)) * 100).toFixed(0)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Net Cash Flow & Retention */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <span className="text-xs font-medium text-muted-foreground block">Net cash flow</span>
              <span className="text-[10px] text-muted-foreground">Inflow retention efficacy</span>
            </div>
            <span className="p-1.5 rounded-md bg-primary/10 text-primary">
              <Scale className="h-4 w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2">
            <div className={cn(
              "text-2xl font-bold font-mono tracking-tight",
              netCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
            )}>
              {netCashFlow >= 0 ? `+${formatCurrency(netCashFlow)}` : `-${formatCurrency(Math.abs(netCashFlow))}`}
            </div>
            <div className="space-y-1 border-t border-border/40 pt-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Retention rate:</span>
                <span className={cn(
                  "font-mono font-bold",
                  retentionRate >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                )}>
                  {retentionRate.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    retentionRate > 25 ? "bg-emerald-500" : retentionRate > 0 ? "bg-amber-500" : "bg-destructive"
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, retentionRate))}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ========================================================= */}
      {/* 🚀 BENTO GRID - THE 4 SEGMENTED QUADRANTS */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Q1: Recurring Income */}
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-xs font-semibold text-foreground">Recurring Income</CardTitle>
                  <CardDescription className="text-[10px] text-muted-foreground/80">Predictable regular inflows</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-emerald-500/20 bg-emerald-500/5">
                {((segments.recurringIncome.total / (totalIncome || 1)) * 100).toFixed(0)}% of income
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3">
            <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
              <span className="text-[10px] text-muted-foreground">Segment Total:</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                +{formatCurrency(segments.recurringIncome.total)}
              </span>
            </div>

            {/* Collapsible details list */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="items" className="border-none">
                <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                  View Transactions ({segments.recurringIncome.items.length})
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  {segments.recurringIncome.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {segments.recurringIncome.items.map((tx) => {
                        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                        return (
                          <div key={tx.id} className="flex justify-between items-center text-[11px] p-2 rounded-md bg-muted/30 border border-border/40">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{tx.description}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {isValid(txDate) ? format(txDate, 'MMM d, yyyy') : ''} • {tx.categoryName || 'General'}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-emerald-600">
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
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-500">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-xs font-semibold text-foreground">Variable Income</CardTitle>
                  <CardDescription className="text-[10px] text-muted-foreground/80">One-time bonuses or gifts</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-emerald-500/20 bg-emerald-500/5">
                {((segments.oneTimeIncome.total / (totalIncome || 1)) * 100).toFixed(0)}% of income
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3">
            <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
              <span className="text-[10px] text-muted-foreground">Segment Total:</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                +{formatCurrency(segments.oneTimeIncome.total)}
              </span>
            </div>

            {/* Collapsible details list */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="items" className="border-none">
                <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                  View Transactions ({segments.oneTimeIncome.items.length})
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  {segments.oneTimeIncome.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {segments.oneTimeIncome.items.map((tx) => {
                        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                        return (
                          <div key={tx.id} className="flex justify-between items-center text-[11px] p-2 rounded-md bg-muted/30 border border-border/40">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{tx.description}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {isValid(txDate) ? format(txDate, 'MMM d, yyyy') : ''} • {tx.categoryName || 'General'}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-emerald-600">
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
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-rose-500/10 text-destructive">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-xs font-semibold text-foreground">Fixed Expenses</CardTitle>
                  <CardDescription className="text-[10px] text-muted-foreground/80">Rent, utilities, regular commitments</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-destructive/20 bg-destructive/5 text-destructive">
                {((segments.fixedExpenses.total / (totalExpenses || 1)) * 100).toFixed(0)}% of expenses
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3">
            <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
              <span className="text-[10px] text-muted-foreground">Segment Total:</span>
              <span className="text-lg font-bold text-destructive">
                -{formatCurrency(segments.fixedExpenses.total)}
              </span>
            </div>

            {/* Collapsible details list */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="items" className="border-none">
                <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                  View Transactions ({segments.fixedExpenses.items.length})
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  {segments.fixedExpenses.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {segments.fixedExpenses.items.map((tx) => {
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
        <Card className="border border-border/60 shadow-xs bg-card flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-rose-500/10 text-destructive">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-xs font-semibold text-foreground">Variable Expenses</CardTitle>
                  <CardDescription className="text-[10px] text-muted-foreground/80">Shopping, dining and leisure</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-[9px] px-1.5 py-0 border-destructive/20 bg-destructive/5 text-destructive">
                {((segments.variableExpenses.total / (totalExpenses || 1)) * 100).toFixed(0)}% of expenses
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3">
            <div className="flex justify-between items-baseline font-mono pb-2 border-b border-border/40">
              <span className="text-[10px] text-muted-foreground">Segment Total:</span>
              <span className="text-lg font-bold text-destructive">
                -{formatCurrency(segments.variableExpenses.total)}
              </span>
            </div>

            {/* Collapsible details list */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="items" className="border-none">
                <AccordionTrigger className="hover:no-underline py-1 text-xs font-semibold text-primary/90 hover:text-primary">
                  View Transactions ({segments.variableExpenses.items.length})
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  {segments.variableExpenses.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {segments.variableExpenses.items.map((tx) => {
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

      {/* ========================================================= */}
      {/* 🧭 BOTTOM ACTIONS AREA */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-muted/30 border border-border/40 rounded-xl p-4 gap-4">
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-foreground">Need to add, import or edit individual items?</h4>
          <p className="text-[11px] text-muted-foreground">Manage your full ledger records, link bank accounts or filter specific keywords.</p>
        </div>
        <Link href="/transactions" className="w-full sm:w-auto">
          <Button size="sm" className="w-full sm:w-auto h-9 text-xs font-semibold gap-1.5 shadow-xs rounded-lg">
            Go to Transactions Ledger
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

    </div>
  );
}
