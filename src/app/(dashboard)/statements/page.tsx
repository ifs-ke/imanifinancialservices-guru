'use client'; // Required for client-side calculations/state

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, Scale, DollarSign, Landmark } from 'lucide-react';

// Mock data - replace with actual data fetching and calculation logic
const mockIncome = [
  { description: 'Salary', amount: 3000 },
  { description: 'Freelance Work', amount: 500 },
];

const mockExpenses = [
  { description: 'Rent', amount: 1200 },
  { description: 'Groceries', amount: 350 },
  { description: 'Utilities', amount: 150 },
  { description: 'Transportation', amount: 100 },
  { description: 'Debt Payments', amount: 600 }, // Combined debt payments
  { description: 'Entertainment', amount: 200 },
];

const mockAssets = [
  { description: 'Checking Account', amount: 2500 },
  { description: 'Savings Account', amount: 10000 },
  { description: 'Car (Estimated Value)', amount: 8000 },
   { description: 'Investments', amount: 5000 },
];

const mockLiabilities = [
  { description: 'Credit Card Debt', amount: 3000 },
  { description: 'Student Loan', amount: 15000 },
  { description: 'Car Loan', amount: 7000 },
];

// Calculation Functions
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);

const totalIncome = calculateTotal(mockIncome);
const totalExpenses = calculateTotal(mockExpenses);
const cashFlow = totalIncome - totalExpenses;

const totalAssets = calculateTotal(mockAssets);
const totalLiabilities = calculateTotal(mockLiabilities);
const netWorth = totalAssets - totalLiabilities;

// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD', // Adjust currency as needed
  }).format(amount);
};

export default function StatementsPage() {
  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Financial Statements
        </h1>
        <p className="text-muted-foreground">
          Review your cash flow and net worth.
        </p>
      </header>

      <main className="flex-1 grid gap-6 md:grid-cols-2">
        {/* Cash Flow Statement Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {cashFlow >= 0 ? <TrendingUp className="text-accent" /> : <TrendingDown className="text-destructive" />}
              Cash Flow Statement
            </CardTitle>
            <CardDescription>Income vs. Expenses for the Period (Mock Data)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="font-semibold bg-secondary/50">
                  <TableCell>Income</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {mockIncome.map((item, index) => (
                  <TableRow key={`income-${index}`}>
                    <TableCell className="pl-6">{item.description}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Income</TableCell>
                    <TableCell className="text-right font-semibold font-mono">{formatCurrency(totalIncome)}</TableCell>
                  </TableRow>

                 <TableRow className="font-semibold bg-secondary/50">
                  <TableCell>Expenses</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {mockExpenses.map((item, index) => (
                  <TableRow key={`expense-${index}`}>
                    <TableCell className="pl-6">{item.description}</TableCell>
                    <TableCell className="text-right font-mono">({formatCurrency(item.amount)})</TableCell>
                  </TableRow>
                ))}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Expenses</TableCell>
                    <TableCell className="text-right font-semibold font-mono">({formatCurrency(totalExpenses)})</TableCell>
                  </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow className="text-lg">
                  <TableHead>Net Cash Flow</TableHead>
                  <TableHead
                    className={`text-right font-bold font-mono ${
                      cashFlow >= 0 ? 'text-accent' : 'text-destructive'
                    }`}
                  >
                    {formatCurrency(cashFlow)}
                  </TableHead>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Net Worth Statement Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="text-primary" />
              Net Worth Statement
            </CardTitle>
            <CardDescription>Assets vs. Liabilities as of Today (Mock Data)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                 <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                 <TableRow className="font-semibold bg-secondary/50">
                   <TableCell className="flex items-center gap-2"><Landmark className="h-4 w-4"/>Assets</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {mockAssets.map((item, index) => (
                  <TableRow key={`asset-${index}`}>
                    <TableCell className="pl-6">{item.description}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                  </TableRow>
                ))}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Assets</TableCell>
                    <TableCell className="text-right font-semibold font-mono">{formatCurrency(totalAssets)}</TableCell>
                  </TableRow>

                 <TableRow className="font-semibold bg-secondary/50">
                   <TableCell className="flex items-center gap-2"><DollarSign className="h-4 w-4"/>Liabilities</TableCell>
                   <TableCell></TableCell>
                </TableRow>
                {mockLiabilities.map((item, index) => (
                  <TableRow key={`liability-${index}`}>
                    <TableCell className="pl-6">{item.description}</TableCell>
                    <TableCell className="text-right font-mono">({formatCurrency(item.amount)})</TableCell>
                  </TableRow>
                ))}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Liabilities</TableCell>
                    <TableCell className="text-right font-semibold font-mono">({formatCurrency(totalLiabilities)})</TableCell>
                  </TableRow>
              </TableBody>
               <TableFooter>
                <TableRow className="text-lg">
                  <TableHead>Net Worth</TableHead>
                  <TableHead
                    className={`text-right font-bold font-mono ${
                      netWorth >= 0 ? 'text-primary' : 'text-destructive' // Using primary for positive net worth
                    }`}
                  >
                    {formatCurrency(netWorth)}
                  </TableHead>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

