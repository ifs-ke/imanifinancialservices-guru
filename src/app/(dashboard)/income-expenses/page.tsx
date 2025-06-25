// src/app/(dashboard)/income-expenses/page.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTransactionsStore } from '@/store/transactionsStore';
import type { TransactionWithId } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingDown, TrendingUp, Tag, Scale, Award } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn, formatCurrency } from '@/lib/utils'; 
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; 

const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatCategoryBadge = (value: string | undefined) => {
    if (!value) return null;
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="text-xs font-normal">{text}</Badge>;
}

const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; description?: string; count: number }
>(({ label, sum, description, count, children, ...props }, ref) => {
  return (
      <AccordionTrigger ref={ref} {...props} className='hover:no-underline py-3 px-4 data-[state=open]:border-b'>
        <div className="flex justify-between items-center w-full">
            <div className='flex flex-col items-start text-left'>
                 <span className="flex items-center gap-2 text-base font-semibold">
                    {label}
                 </span>
                 {description && <p className='text-xs text-muted-foreground font-normal mt-0.5'>{description}</p>}
            </div>
            {count > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">({count} items)</span>
                    <span className="font-semibold font-mono text-base">{formatCurrency(sum)}</span>
                </div>
            )}
        </div>
      </AccordionTrigger>
  );
});
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


export default function IncomeExpensesPage() {
  const { transactions } = useTransactionsStore();

  const incomeTransactions = useMemo(() => transactions.filter(tx => tx.amount > 0), [transactions]);
  const expenseTransactions = useMemo(() => transactions.filter(tx => tx.amount < 0), [transactions]);

  const categorizeTransactions = (txs: TransactionWithId[]) => {
    const categories = {
      recurringFixed: [] as TransactionWithId[],
      recurringVariable: [] as TransactionWithId[],
      oneTimeFixed: [] as TransactionWithId[],
      oneTimeVariable: [] as TransactionWithId[],
      uncategorized: [] as TransactionWithId[],
    };
    txs.forEach(tx => {
      if (tx.frequency === 'recurring' && tx.variability === 'fixed') categories.recurringFixed.push(tx);
      else if (tx.frequency === 'recurring' && tx.variability === 'variable') categories.recurringVariable.push(tx);
      else if (tx.frequency === 'one-time' && tx.variability === 'fixed') categories.oneTimeFixed.push(tx);
      else if (tx.frequency === 'one-time' && tx.variability === 'variable') categories.oneTimeVariable.push(tx);
      else categories.uncategorized.push(tx);
    });
    for (const key in categories) {
        categories[key as keyof typeof categories].sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
            return dateB.getTime() - dateA.getTime();
         });
    }
    return categories;
  };

  const categorizedIncome = useMemo(() => categorizeTransactions(incomeTransactions), [incomeTransactions]);
  const categorizedExpenses = useMemo(() => categorizeTransactions(expenseTransactions), [expenseTransactions]);

  const calculateTotal = (items: TransactionWithId[], absValue = false) =>
    items.reduce((sum, item) => sum + (absValue ? Math.abs(item.amount) : item.amount), 0);

  const incomeTotals = useMemo(() => ({
    recurringFixed: calculateTotal(categorizedIncome.recurringFixed),
    recurringVariable: calculateTotal(categorizedIncome.recurringVariable),
    oneTimeFixed: calculateTotal(categorizedIncome.oneTimeFixed),
    oneTimeVariable: calculateTotal(categorizedIncome.oneTimeVariable),
    uncategorized: calculateTotal(categorizedIncome.uncategorized),
    grandTotal: calculateTotal(incomeTransactions),
  }), [categorizedIncome, incomeTransactions]);

  const expenseTotals = useMemo(() => ({
    recurringFixed: calculateTotal(categorizedExpenses.recurringFixed, true),
    recurringVariable: calculateTotal(categorizedExpenses.recurringVariable, true),
    oneTimeFixed: calculateTotal(categorizedExpenses.oneTimeFixed, true),
    oneTimeVariable: calculateTotal(categorizedExpenses.oneTimeVariable, true),
    uncategorized: calculateTotal(categorizedExpenses.uncategorized, true),
    grandTotal: calculateTotal(expenseTransactions, true),
  }), [categorizedExpenses, expenseTransactions]);

  const netIncome = incomeTotals.grandTotal - expenseTotals.grandTotal;

  const topSpendingCategories = useMemo(() => {
    const spendingByCategory: Record<string, { totalAmount: number; count: number }> = {};

    expenseTransactions.forEach(tx => {
        const category = tx.categoryName || 'Uncategorized';
        if (!spendingByCategory[category]) {
            spendingByCategory[category] = { totalAmount: 0, count: 0 };
        }
        spendingByCategory[category].totalAmount += Math.abs(tx.amount);
        spendingByCategory[category].count += 1;
    });

    const categoriesArray = Object.entries(spendingByCategory).map(([name, data]) => ({
        name,
        ...data
    }));

    const topByAmount = [...categoriesArray].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5);
    const topByCount = [...categoriesArray].sort((a, b) => b.count - a.count).slice(0, 5);
    
    return { topByAmount, topByCount };
  }, [expenseTransactions]);

  const renderTransactionRow = (tx: TransactionWithId, isExpense = false) => (
    <TableRow key={tx.id}>
      <TableCell className="font-medium w-[100px] pl-4 pr-2">{formatDate(tx.date)}</TableCell>
      <TableCell className="max-w-[200px] sm:max-w-[250px] truncate px-2" title={tx.description}>{tx.description}</TableCell>
      <TableCell className="w-[90px] px-2">{tx.modeOfPayment}</TableCell>
      <TableCell className="text-right font-mono w-[140px] pr-4 pl-2">{formatCurrency(isExpense ? Math.abs(tx.amount) : tx.amount)}</TableCell>
    </TableRow>
  );

  const renderCategorySection = (
    value: string, 
    title: string,
    description: string,
    transactions: TransactionWithId[],
    total: number,
    isExpense = false
  ) => (
    <AccordionItem value={value} className="border-b-0 mb-2 rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
        <AccordionTriggerWithSum label={title} sum={total} description={description} count={transactions.length} />
        <AccordionContent className="p-0">
            {transactions.length > 0 ? (
                 <ScrollArea className={cn("w-full", transactions.length > 8 ? "h-[350px]" : "h-auto")}>
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px] pl-4 pr-2">Date</TableHead>
                            <TableHead className="px-2">Description</TableHead>
                            <TableHead className="w-[90px] px-2">Mode</TableHead>
                            <TableHead className="text-right w-[140px] pr-4 pl-2">Amount (KES)</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions.map(tx => renderTransactionRow(tx, isExpense))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            ) : (
                 <p className="text-center text-muted-foreground py-4 text-sm px-4">No transactions in this category.</p>
            )}
        </AccordionContent>
    </AccordionItem>
  );

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
      <header className="mb-6 px-4 md:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <TrendingUp className="text-primary" /> Income & Expense Analysis
        </h1>
        <p className="text-muted-foreground">Breakdown based on recurrence and variability.</p>
      </header>

       <section className="mb-8 px-4 md:px-6 lg:px-8 grid gap-4 md:grid-cols-3">
           <Card className="shadow-md">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                 <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                 <TrendingUp className="h-4 w-4 text-accent" />
               </CardHeader>
               <CardContent className="p-4">
                 <div className="text-2xl font-bold text-accent">{formatCurrency(incomeTotals.grandTotal)}</div>
                 <p className="text-xs text-muted-foreground">Across all categories</p>
               </CardContent>
           </Card>
           <Card className="shadow-md">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                 <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                 <TrendingDown className="h-4 w-4 text-destructive" />
               </CardHeader>
               <CardContent className="p-4">
                 <div className="text-2xl font-bold text-destructive">{formatCurrency(expenseTotals.grandTotal)}</div>
                 <p className="text-xs text-muted-foreground">Across all categories</p>
               </CardContent>
           </Card>
           <Card className="shadow-md">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                 <CardTitle className="text-sm font-medium">Net Income</CardTitle>
                 <Scale className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent className="p-4">
                  <div className={cn("text-2xl font-bold", netIncome >= 0 ? 'text-accent' : 'text-destructive')}>
                      {formatCurrency(netIncome)}
                  </div>
                  <p className="text-xs text-muted-foreground">Total Income - Total Expenses</p>
               </CardContent>
           </Card>
       </section>
       
       <section className="mb-8 px-4 md:px-6 lg:px-8">
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-3">
                <Award className="h-5 w-5 text-primary" /> Top Spending Areas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-base">Top 5 by Total Amount Spent</CardTitle>
                        <CardDescription className="text-xs">Your highest spending categories by amount.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="space-y-4">
                            {topSpendingCategories.topByAmount.map((cat, index) => (
                                <div key={index} className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-muted-foreground w-6 text-center">#{index + 1}</span>
                                        <span className="font-medium truncate" title={cat.name}>{cat.name}</span>
                                    </div>
                                    <span className="font-mono font-semibold">{formatCurrency(cat.totalAmount)}</span>
                                </div>
                            ))}
                            {topSpendingCategories.topByAmount.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">No categorized expenses found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-base">Top 5 by Transaction Count</CardTitle>
                        <CardDescription className="text-xs">Your most frequent spending categories.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="space-y-3">
                            {topSpendingCategories.topByCount.map((cat, index) => (
                                <div key={index} className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-muted-foreground w-6 text-center">#{index + 1}</span>
                                        <span className="font-medium truncate" title={cat.name}>{cat.name}</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-mono font-semibold">{formatCurrency(cat.totalAmount)}</p>
                                      <p className="text-xs text-muted-foreground">{cat.count} transactions</p>
                                    </div>
                                </div>
                            ))}
                            {topSpendingCategories.topByCount.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">No categorized expenses found.</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
       </section>

      <main className="flex-1 grid gap-8 lg:grid-cols-2 px-4 md:px-6 lg:px-8">
        <section className="space-y-2">
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-3 pl-1"><TrendingUp className="text-accent"/> Income Details</h2>
            <Accordion type="multiple" className="w-full space-y-2" defaultValue={[]}>
                 {renderCategorySection("income-rf", "Recurring - Fixed", "Regular income, same amount (e.g., Salary).", categorizedIncome.recurringFixed, incomeTotals.recurringFixed)}
                 {renderCategorySection("income-rv", "Recurring - Variable", "Regular income, amount changes.", categorizedIncome.recurringVariable, incomeTotals.recurringVariable)}
                 {renderCategorySection("income-otf", "One-Time - Fixed", "Non-recurring income, fixed amount (e.g., Bonus).", categorizedIncome.oneTimeFixed, incomeTotals.oneTimeFixed)}
                 {renderCategorySection("income-otv", "One-Time - Variable", "Non-recurring income, varying amount (e.g., Freelance).", categorizedIncome.oneTimeVariable, incomeTotals.oneTimeVariable)}
                 {categorizedIncome.uncategorized.length > 0 && renderCategorySection("income-uncat", "Uncategorized Income", "Missing frequency/variability info.", categorizedIncome.uncategorized, incomeTotals.uncategorized)}
            </Accordion>
        </section>

         <section className="space-y-2">
             <h2 className="text-xl font-semibold flex items-center gap-2 mb-3 pl-1"><TrendingDown className="text-destructive"/> Expense Details</h2>
             <Accordion type="multiple" className="w-full space-y-2" defaultValue={[]}>
                  {renderCategorySection("expense-rf", "Recurring - Fixed", "Regular expenses, same amount (e.g., Rent).", categorizedExpenses.recurringFixed, expenseTotals.recurringFixed, true)}
                  {renderCategorySection("expense-rv", "Recurring - Variable", "Regular expenses, amount changes (e.g., Groceries).", categorizedExpenses.recurringVariable, expenseTotals.recurringVariable, true)}
                  {renderCategorySection("expense-otf", "One-Time - Fixed", "Non-recurring expenses, fixed amount.", categorizedExpenses.oneTimeFixed, expenseTotals.oneTimeFixed, true)}
                  {renderCategorySection("expense-otv", "One-Time - Variable", "Non-recurring expenses, varying amount (e.g., Dining out).", categorizedExpenses.oneTimeVariable, expenseTotals.oneTimeVariable, true)}
                  {categorizedExpenses.uncategorized.length > 0 && renderCategorySection("expense-uncat", "Uncategorized Expenses", "Missing frequency/variability info.", categorizedExpenses.uncategorized, expenseTotals.uncategorized, true)}
             </Accordion>
        </section>
      </main>
    </div>
  );
}
