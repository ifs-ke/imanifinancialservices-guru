
// src/app/(dashboard)/expenses/page.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTransactionsStore } from '@/store/transactionsStore'; // Import Zustand store hook
import type { TransactionWithId } from '@/lib/types';
import { Badge } from '@/components/ui/badge'; // Import Badge component
import { Coins, TrendingDown, Tag } from 'lucide-react'; // Import relevant icons

// Formatting Function (copied from other pages, consider moving to utils)
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES', // Use KES
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

export default function ExpensesPage() {
  const { transactions } = useTransactionsStore(); // Use Zustand hook

  // Filter only expenses (amount < 0)
  const expenseTransactions = useMemo(() =>
    transactions.filter(tx => tx.amount < 0),
    [transactions]
  );

  // Categorize expenses
  const categorizedExpenses = useMemo(() => {
    const categories = {
      recurringFixed: [] as TransactionWithId[],
      recurringVariable: [] as TransactionWithId[],
      oneTimeFixed: [] as TransactionWithId[], // Less common, but possible
      oneTimeVariable: [] as TransactionWithId[],
      uncategorized: [] as TransactionWithId[],
    };

    expenseTransactions.forEach(tx => {
      if (tx.frequency === 'recurring' && tx.variability === 'fixed') {
        categories.recurringFixed.push(tx);
      } else if (tx.frequency === 'recurring' && tx.variability === 'variable') {
        categories.recurringVariable.push(tx);
      } else if (tx.frequency === 'one-time' && tx.variability === 'fixed') {
        categories.oneTimeFixed.push(tx);
      } else if (tx.frequency === 'one-time' && tx.variability === 'variable') {
        categories.oneTimeVariable.push(tx);
      } else {
        // Handle cases where frequency or variability is missing or unexpected
        categories.uncategorized.push(tx);
      }
    });

    // Sort within categories by date descending
    for (const key in categories) {
        categories[key as keyof typeof categories].sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0; // Handle invalid dates
             return dateB.getTime() - dateA.getTime();
         });
    }


    return categories;
  }, [expenseTransactions]);

  // Calculate totals for each category
  const calculateTotal = (items: TransactionWithId[]) => items.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  const totals = useMemo(() => ({
    recurringFixed: calculateTotal(categorizedExpenses.recurringFixed),
    recurringVariable: calculateTotal(categorizedExpenses.recurringVariable),
    oneTimeFixed: calculateTotal(categorizedExpenses.oneTimeFixed),
    oneTimeVariable: calculateTotal(categorizedExpenses.oneTimeVariable),
    uncategorized: calculateTotal(categorizedExpenses.uncategorized),
    grandTotal: calculateTotal(expenseTransactions),
  }), [categorizedExpenses, expenseTransactions]);

  // Render function for transaction rows
  const renderExpenseRow = (tx: TransactionWithId) => (
    <TableRow key={tx.id}>
      <TableCell className="font-medium">{formatDate(tx.date)}</TableCell>
      <TableCell className="max-w-[250px] truncate" title={tx.description}>{tx.description}</TableCell>
      <TableCell>{tx.modeOfPayment}</TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(Math.abs(tx.amount))}</TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <TrendingDown className="text-destructive" /> Expense Analysis
        </h1>
        <p className="text-muted-foreground">
          Breakdown of your expenses based on recurrence and variability.
        </p>
      </header>

      <main className="flex-1 grid gap-6 md:grid-cols-2">

        {/* Recurring Fixed Expenses Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4"/>Recurring - Fixed
            </CardTitle>
            <CardDescription>Expenses that occur regularly with the same amount (e.g., Rent, Subscriptions).</CardDescription>
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
                  {categorizedExpenses.recurringFixed.length > 0 ? (
                    categorizedExpenses.recurringFixed.map(renderExpenseRow)
                  ) : (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No recurring fixed expenses found.</TableCell></TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">Total Recurring Fixed</TableCell>
                    <TableCell className="text-right font-bold font-mono">{formatCurrency(totals.recurringFixed)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recurring Variable Expenses Card */}
        <Card>
          <CardHeader>
             <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4"/>Recurring - Variable
            </CardTitle>
            <CardDescription>Expenses that occur regularly but the amount changes (e.g., Groceries, Utilities).</CardDescription>
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
                  {categorizedExpenses.recurringVariable.length > 0 ? (
                    categorizedExpenses.recurringVariable.map(renderExpenseRow)
                  ) : (
                     <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No recurring variable expenses found.</TableCell></TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">Total Recurring Variable</TableCell>
                    <TableCell className="text-right font-bold font-mono">{formatCurrency(totals.recurringVariable)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

         {/* One-Time Variable Expenses Card */}
         <Card>
          <CardHeader>
             <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4"/>One-Time - Variable
            </CardTitle>
            <CardDescription>Non-recurring expenses with varying amounts (e.g., Dining out, Entertainment).</CardDescription>
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
                  {categorizedExpenses.oneTimeVariable.length > 0 ? (
                    categorizedExpenses.oneTimeVariable.map(renderExpenseRow)
                  ) : (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No one-time variable expenses found.</TableCell></TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">Total One-Time Variable</TableCell>
                    <TableCell className="text-right font-bold font-mono">{formatCurrency(totals.oneTimeVariable)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

         {/* One-Time Fixed Expenses Card */}
         <Card>
          <CardHeader>
             <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4"/>One-Time - Fixed
            </CardTitle>
            <CardDescription>Non-recurring expenses with a fixed amount (e.g., Specific purchase, Ticket).</CardDescription>
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
                  {categorizedExpenses.oneTimeFixed.length > 0 ? (
                    categorizedExpenses.oneTimeFixed.map(renderExpenseRow)
                  ) : (
                     <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No one-time fixed expenses found.</TableCell></TableRow>
                  )}
                </TableBody>
                 <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">Total One-Time Fixed</TableCell>
                    <TableCell className="text-right font-bold font-mono">{formatCurrency(totals.oneTimeFixed)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

         {/* Uncategorized Expenses Card (Optional) */}
        {categorizedExpenses.uncategorized.length > 0 && (
            <Card className="md:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                 <Tag className="h-4 w-4"/>Uncategorized Expenses
                </CardTitle>
                <CardDescription>Expenses missing frequency or variability information.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[200px] w-full">
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
                     {categorizedExpenses.uncategorized.map(renderExpenseRow)}
                    </TableBody>
                     <TableFooter>
                        <TableRow>
                            <TableCell colSpan={3} className="text-right font-semibold">Total Uncategorized</TableCell>
                            <TableCell className="text-right font-bold font-mono">{formatCurrency(totals.uncategorized)}</TableCell>
                        </TableRow>
                     </TableFooter>
                </Table>
                </ScrollArea>
            </CardContent>
            </Card>
        )}

         {/* Grand Total Summary Card */}
        <Card className="md:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                 <Coins className="h-5 w-5"/>Total Expenses Summary
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableBody>
                        <TableRow>
                            <TableCell>Total Recurring Fixed</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(totals.recurringFixed)}</TableCell>
                        </TableRow>
                         <TableRow>
                            <TableCell>Total Recurring Variable</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(totals.recurringVariable)}</TableCell>
                        </TableRow>
                         <TableRow>
                            <TableCell>Total One-Time Fixed</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(totals.oneTimeFixed)}</TableCell>
                        </TableRow>
                         <TableRow>
                            <TableCell>Total One-Time Variable</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(totals.oneTimeVariable)}</TableCell>
                        </TableRow>
                         {totals.uncategorized > 0 && (
                            <TableRow>
                                <TableCell>Total Uncategorized</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(totals.uncategorized)}</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="text-lg font-bold border-t-2 border-foreground">
                            <TableCell>Grand Total Expenses</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(totals.grandTotal)}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
        </Card>

      </main>
    </div>
  );
}
