
// src/app/(dashboard)/income/page.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTransactionsStore } from '@/store/transactionsStore'; // Import Zustand store hook
import type { TransactionWithId } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, Tag } from 'lucide-react'; // Import relevant icons

// Formatting Function (consider moving to utils)
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

export default function IncomePage() {
  const { transactions } = useTransactionsStore(); // Use Zustand hook

  // Filter only income (amount > 0)
  const incomeTransactions = useMemo(() =>
    transactions.filter(tx => tx.amount > 0),
    [transactions]
  );

  // Categorize income
  const categorizedIncome = useMemo(() => {
    const categories = {
      recurringFixed: [] as TransactionWithId[],
      recurringVariable: [] as TransactionWithId[],
      oneTimeFixed: [] as TransactionWithId[], // Less common for income, but possible (e.g., bonus)
      oneTimeVariable: [] as TransactionWithId[],
      uncategorized: [] as TransactionWithId[],
    };

    incomeTransactions.forEach(tx => {
      if (tx.frequency === 'recurring' && tx.variability === 'fixed') {
        categories.recurringFixed.push(tx);
      } else if (tx.frequency === 'recurring' && tx.variability === 'variable') {
        categories.recurringVariable.push(tx);
      } else if (tx.frequency === 'one-time' && tx.variability === 'fixed') {
        categories.oneTimeFixed.push(tx);
      } else if (tx.frequency === 'one-time' && tx.variability === 'variable') {
        categories.oneTimeVariable.push(tx);
      } else {
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
  }, [incomeTransactions]);

  // Calculate totals for each category
  const calculateTotal = (items: TransactionWithId[]) => items.reduce((sum, item) => sum + item.amount, 0);

  const totals = useMemo(() => ({
    recurringFixed: calculateTotal(categorizedIncome.recurringFixed),
    recurringVariable: calculateTotal(categorizedIncome.recurringVariable),
    oneTimeFixed: calculateTotal(categorizedIncome.oneTimeFixed),
    oneTimeVariable: calculateTotal(categorizedIncome.oneTimeVariable),
    uncategorized: calculateTotal(categorizedIncome.uncategorized),
    grandTotal: calculateTotal(incomeTransactions),
  }), [categorizedIncome, incomeTransactions]);

  // Render function for transaction rows
  const renderIncomeRow = (tx: TransactionWithId) => (
    <TableRow key={tx.id}>
      <TableCell className="font-medium">{formatDate(tx.date)}</TableCell>
      <TableCell className="max-w-[250px] truncate" title={tx.description}>{tx.description}</TableCell>
      <TableCell>{tx.modeOfPayment}</TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(tx.amount)}</TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <TrendingUp className="text-accent" /> Income Analysis
        </h1>
        <p className="text-muted-foreground">
          Breakdown of your income based on recurrence and variability.
        </p>
      </header>

      <main className="flex-1 grid gap-6 md:grid-cols-2">

        {/* Recurring Fixed Income Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4"/>Recurring - Fixed
            </CardTitle>
            <CardDescription>Income received regularly with the same amount (e.g., Salary).</CardDescription>
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
                  {categorizedIncome.recurringFixed.length > 0 ? (
                    categorizedIncome.recurringFixed.map(renderIncomeRow)
                  ) : (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No recurring fixed income found.</TableCell></TableRow>
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

        {/* Recurring Variable Income Card */}
        <Card>
          <CardHeader>
             <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4"/>Recurring - Variable
            </CardTitle>
            <CardDescription>Income received regularly but the amount changes (e.g., Side hustle with varying payouts).</CardDescription>
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
                  {categorizedIncome.recurringVariable.length > 0 ? (
                    categorizedIncome.recurringVariable.map(renderIncomeRow)
                  ) : (
                     <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No recurring variable income found.</TableCell></TableRow>
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

         {/* One-Time Variable Income Card */}
         <Card>
          <CardHeader>
             <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4"/>One-Time - Variable
            </CardTitle>
            <CardDescription>Non-recurring income with varying amounts (e.g., Freelance projects, Selling items).</CardDescription>
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
                  {categorizedIncome.oneTimeVariable.length > 0 ? (
                    categorizedIncome.oneTimeVariable.map(renderIncomeRow)
                  ) : (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No one-time variable income found.</TableCell></TableRow>
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

         {/* One-Time Fixed Income Card */}
         <Card>
          <CardHeader>
             <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4"/>One-Time - Fixed
            </CardTitle>
            <CardDescription>Non-recurring income with a fixed amount (e.g., Bonus, Gift).</CardDescription>
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
                  {categorizedIncome.oneTimeFixed.length > 0 ? (
                    categorizedIncome.oneTimeFixed.map(renderIncomeRow)
                  ) : (
                     <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No one-time fixed income found.</TableCell></TableRow>
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

         {/* Uncategorized Income Card (Optional) */}
        {categorizedIncome.uncategorized.length > 0 && (
            <Card className="md:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                 <Tag className="h-4 w-4"/>Uncategorized Income
                </CardTitle>
                <CardDescription>Income missing frequency or variability information.</CardDescription>
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
                     {categorizedIncome.uncategorized.map(renderIncomeRow)}
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
                 <Coins className="h-5 w-5"/>Total Income Summary
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
                            <TableCell>Grand Total Income</TableCell>
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
