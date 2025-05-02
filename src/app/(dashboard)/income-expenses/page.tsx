
// src/app/(dashboard)/income-expenses/page.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTransactionsStore } from '@/store/transactionsStore';
import type { TransactionWithId } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingDown, TrendingUp, Tag, Scale } from 'lucide-react';
import { Separator } from '@/components/ui/separator'; // Import Separator
import { cn } from '@/lib/utils';

// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

// Helper to format category badges
const formatCategoryBadge = (value: string | undefined) => {
    if (!value) return null;
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="text-xs font-normal">{text}</Badge>;
}

export default function IncomeExpensesPage() {
  const { transactions } = useTransactionsStore();

  // Filter transactions
  const incomeTransactions = useMemo(() => transactions.filter(tx => tx.amount > 0), [transactions]);
  const expenseTransactions = useMemo(() => transactions.filter(tx => tx.amount < 0), [transactions]);

  // Categorize function
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
    // Sort within categories by date descending
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

  // Categorize income and expenses
  const categorizedIncome = useMemo(() => categorizeTransactions(incomeTransactions), [incomeTransactions]);
  const categorizedExpenses = useMemo(() => categorizeTransactions(expenseTransactions), [expenseTransactions]);

  // Calculate totals
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

  // Render function for transaction rows
  const renderTransactionRow = (tx: TransactionWithId, isExpense = false) => (
    <TableRow key={tx.id}>
      <TableCell className="font-medium">{formatDate(tx.date)}</TableCell>
      <TableCell className="max-w-[250px] truncate" title={tx.description}>{tx.description}</TableCell>
      <TableCell>{tx.modeOfPayment}</TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(isExpense ? Math.abs(tx.amount) : tx.amount)}</TableCell>
    </TableRow>
  );

  // Render function for category sections
  const renderCategorySection = (
    title: string,
    description: string,
    transactions: TransactionWithId[],
    total: number,
    isExpense = false
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Tag className="h-4 w-4"/>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[90px]">Mode</TableHead>
                <TableHead className="text-right w-[140px]">Amount (KES)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length > 0 ? (
                transactions.map(tx => renderTransactionRow(tx, isExpense))
              ) : (
                <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No transactions in this category.</TableCell></TableRow>
              )}
            </TableBody>
            {transactions.length > 0 && (
                <TableFooter>
                    <TableRow>
                        <TableCell colSpan={3} className="text-right font-semibold">Total {title}</TableCell>
                        <TableCell className="text-right font-bold font-mono">{formatCurrency(total)}</TableCell>
                    </TableRow>
                </TableFooter>
            )}
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <TrendingUp className="text-primary" /> Income & Expense Analysis
        </h1>
        <p className="text-muted-foreground">
          Detailed breakdown of your income and expenses based on recurrence and variability.
        </p>
      </header>

      {/* Summary Section */}
       <section className="mb-8 grid gap-4 md:grid-cols-3">
           <Card className="shadow-md">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                 <TrendingUp className="h-4 w-4 text-accent" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-accent">{formatCurrency(incomeTotals.grandTotal)}</div>
                 <p className="text-xs text-muted-foreground">Across all categories</p>
               </CardContent>
           </Card>
           <Card className="shadow-md">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                 <TrendingDown className="h-4 w-4 text-destructive" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-destructive">{formatCurrency(expenseTotals.grandTotal)}</div>
                 <p className="text-xs text-muted-foreground">Across all categories</p>
               </CardContent>
           </Card>
           <Card className="shadow-md">
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Net Income</CardTitle>
                 <Scale className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                  <div className={cn("text-2xl font-bold", netIncome >= 0 ? 'text-accent' : 'text-destructive')}>
                      {formatCurrency(netIncome)}
                  </div>
                  <p className="text-xs text-muted-foreground">Total Income - Total Expenses</p>
               </CardContent>
           </Card>
       </section>


      <main className="flex-1 grid gap-8 lg:grid-cols-2">

        {/* Income Details Section */}
        <section className="space-y-6">
            <h2 className="text-xl font-semibold flex items-center gap-2"><TrendingUp className="text-accent"/>Income Details</h2>
            {renderCategorySection("Recurring - Fixed", "Income received regularly with the same amount (e.g., Salary).", categorizedIncome.recurringFixed, incomeTotals.recurringFixed)}
            {renderCategorySection("Recurring - Variable", "Income received regularly but the amount changes.", categorizedIncome.recurringVariable, incomeTotals.recurringVariable)}
            {renderCategorySection("One-Time - Fixed", "Non-recurring income with a fixed amount (e.g., Bonus, Gift).", categorizedIncome.oneTimeFixed, incomeTotals.oneTimeFixed)}
            {renderCategorySection("One-Time - Variable", "Non-recurring income with varying amounts (e.g., Freelance projects).", categorizedIncome.oneTimeVariable, incomeTotals.oneTimeVariable)}
            {categorizedIncome.uncategorized.length > 0 && renderCategorySection("Uncategorized Income", "Income missing frequency or variability information.", categorizedIncome.uncategorized, incomeTotals.uncategorized)}
        </section>

        {/* Expense Details Section */}
         <section className="space-y-6">
             <h2 className="text-xl font-semibold flex items-center gap-2"><TrendingDown className="text-destructive"/>Expense Details</h2>
             {renderCategorySection("Recurring - Fixed", "Expenses that occur regularly with the same amount (e.g., Rent).", categorizedExpenses.recurringFixed, expenseTotals.recurringFixed, true)}
             {renderCategorySection("Recurring - Variable", "Expenses that occur regularly but the amount changes (e.g., Groceries).", categorizedExpenses.recurringVariable, expenseTotals.recurringVariable, true)}
             {renderCategorySection("One-Time - Fixed", "Non-recurring expenses with a fixed amount (e.g., Specific purchase).", categorizedExpenses.oneTimeFixed, expenseTotals.oneTimeFixed, true)}
             {renderCategorySection("One-Time - Variable", "Non-recurring expenses with varying amounts (e.g., Dining out).", categorizedExpenses.oneTimeVariable, expenseTotals.oneTimeVariable, true)}
              {categorizedExpenses.uncategorized.length > 0 && renderCategorySection("Uncategorized Expenses", "Expenses missing frequency or variability information.", categorizedExpenses.uncategorized, expenseTotals.uncategorized, true)}
        </section>


      </main>
    </div>
  );
}
