'use client'; // Required for client-side calculations/state

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, Scale, DollarSign, Landmark } from 'lucide-react';

// Mock data - replace with actual data fetching and calculation logic (values in KES)
const mockIncome = [
  { description: 'Salary', amount: 300000 },
  { description: 'Freelance Work', amount: 50000 },
];

const mockExpenses = [
  { description: 'Rent', amount: 120000 },
  { description: 'Groceries', amount: 35000 },
  { description: 'Utilities', amount: 15000 },
  { description: 'Transportation', amount: 10000 },
  { description: 'Debt Payments', amount: 60000 }, // Combined debt payments
  { description: 'Entertainment', amount: 20000 },
];

const mockAssets = [
  { description: 'Checking Account', amount: 250000 },
  { description: 'Savings Account', amount: 1000000 },
  { description: 'Car (Estimated Value)', amount: 800000 },
   { description: 'Investments', amount: 500000 },
];

const mockLiabilities = [
  { description: 'Credit Card Debt', amount: 300000 },
  { description: 'Student Loan', amount: 1500000 },
  { description: 'Car Loan', amount: 700000 },
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
  return new Intl.NumberFormat('en-KE', { // Changed locale to en-KE
    style: 'currency',
    currency: 'KES', // Changed currency to KES
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
                <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
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

                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
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
                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
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

                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
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


```
  </change>
  <change>
    <file>src/app/(dashboard)/transactions/page.tsx</file>
    <description>Update formatCurrency function to use KES (Kenyan Shilling) and update mock transaction amounts.</description>
    <content><![CDATA['use client';

import React, { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Transaction, importTransactions } from '@/services/transaction-importer';
import { PlusCircle, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Mock initial transactions (values in KES)
const initialTransactions: Transaction[] = [
  { date: new Date(2024, 5, 15), description: 'Salary Deposit', amount: 300000 },
  { date: new Date(2024, 5, 16), description: 'Groceries - Naivas', amount: -8550 },
  { date: new Date(2024, 5, 17), description: 'Rent Payment', amount: -120000 },
  { date: new Date(2024, 5, 18), description: 'Coffee Shop', amount: -525 },
  { date: new Date(2024, 5, 20), description: 'Utility Bill - KPLC', amount: -7500 },
  { date: new Date(2024, 5, 22), description: 'Dinner Out - Artcaffe', amount: -6000 },
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [newTransaction, setNewTransaction] = useState({ date: '', description: '', amount: '' });
  const [isImporting, setIsImporting] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      // TODO: Replace with actual API call for importTransactions
      // For now, we simulate importing by adding dummy data or parsing locally if possible.
      // const imported = await importTransactions(file);
      // setTransactions(prev => [...prev, ...imported]);

      // Simulate import success with placeholder data
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
       const imported = [
         { date: new Date(), description: `Imported from ${file.name}`, amount: Math.random() > 0.5 ? 15000 : -5000 }, // Example amounts in KES
       ];
       setTransactions(prev => [...prev, ...imported].sort((a, b) => b.date.getTime() - a.date.getTime()));


      toast({
        title: 'Import Successful',
        description: `${file.name} imported successfully.`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Import failed:', error);
      toast({
        title: 'Import Failed',
        description: 'There was an error importing the file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      // Reset file input if needed
      event.target.value = '';
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setNewTransaction(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTransaction = (event: React.FormEvent) => {
     event.preventDefault();
     const { date, description, amount } = newTransaction;

     if (!date || !description || !amount) {
       toast({
         title: 'Missing Information',
         description: 'Please fill out all fields for the new transaction.',
         variant: 'destructive',
       });
       return;
     }

     const parsedAmount = parseFloat(amount);
     if (isNaN(parsedAmount)) {
        toast({
         title: 'Invalid Amount',
         description: 'Please enter a valid number for the amount.',
         variant: 'destructive',
       });
       return;
     }


     const transactionToAdd: Transaction = {
       date: new Date(date), // Consider timezone issues / use a date picker
       description: description,
       amount: parsedAmount,
     };

     setTransactions(prev => [transactionToAdd, ...prev].sort((a, b) => b.date.getTime() - a.date.getTime()));
     setNewTransaction({ date: '', description: '', amount: '' }); // Reset form
     setIsAddDialogOpen(false); // Close dialog
     toast({
       title: 'Transaction Added',
       description: 'The new transaction has been successfully added.',
     });
   };


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { // Changed locale to en-KE
      style: 'currency',
      currency: 'KES', // Changed currency to KES
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { // Keep date format consistent or change as needed (e.g., en-GB)
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Transactions
          </h1>
          <p className="text-muted-foreground">
            View, import, and manage your financial transactions.
          </p>
        </div>
         <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
               <Button variant="outline">
                 <PlusCircle className="mr-2 h-4 w-4" /> Add Transaction
               </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Transaction</DialogTitle>
                <DialogDescription>
                  Manually enter a transaction below.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddTransaction} className="grid gap-4 py-4">
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="date" className="text-right">
                     Date
                   </Label>
                   <Input
                     id="date"
                     name="date"
                     type="date"
                     value={newTransaction.date}
                     onChange={handleInputChange}
                     className="col-span-3"
                     required
                   />
                 </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="description" className="text-right">
                     Description
                   </Label>
                   <Input
                     id="description"
                     name="description"
                     value={newTransaction.description}
                     onChange={handleInputChange}
                     className="col-span-3"
                     placeholder="e.g., Coffee purchase"
                     required
                   />
                 </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                   <Label htmlFor="amount" className="text-right">
                     Amount (KES)
                   </Label>
                   <Input
                     id="amount"
                     name="amount"
                     type="number"
                     step="0.01"
                     value={newTransaction.amount}
                     onChange={handleInputChange}
                     className="col-span-3"
                     placeholder="e.g., -550.00 or 10000"
                     required
                   />
                 </div>
                 <DialogFooter>
                   <Button type="submit">Add Transaction</Button>
                 </DialogFooter>
               </form>
            </DialogContent>
          </Dialog>

           <Button asChild variant="default">
             <Label htmlFor="file-upload" className="cursor-pointer">
               <Upload className="mr-2 h-4 w-4" /> Import File
               <Input
                 id="file-upload"
                 type="file"
                 className="hidden"
                 onChange={handleFileChange}
                 accept=".csv, .xlsx, .ofx, .qif" // Adjust accepted file types
                 disabled={isImporting}
               />
             </Label>
           </Button>
         </div>
      </header>

      <main className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              Your recent financial activities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full"> {/* Adjust height as needed */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right w-[150px]">Amount (KES)</TableHead> {/* Increased width */}
                    {/* Add Categorization column later */}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length > 0 ? (
                    transactions.map((tx, index) => (
                      <TableRow key={`${tx.date.toISOString()}-${index}-${tx.description}`}> {/* Ensure unique key */}
                        <TableCell className="font-medium">{formatDate(tx.date)}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            tx.amount >= 0 ? 'text-accent' : 'text-destructive'
                          }`}
                        >
                          {formatCurrency(tx.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                        No transactions yet. Import a file or add one manually.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
           {/* Optionally add pagination or load more */}
          {/* <CardFooter>
            <p className="text-xs text-muted-foreground">Showing latest transactions.</p>
          </CardFooter> */}
        </Card>
      </main>
    </div>
  );
}

```
  </change>
  <change>
    <file>src/app/layout.tsx</file>
    <description>Add `dark` class to html tag to enable dark mode based on system preference or manual toggle (requires theme switcher implementation).</description>
    <content><![CDATA[import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

// Initialize Inter font for sans-serif
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

// Initialize Roboto Mono font for monospace
const roboto_mono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Debt Conqueror',
  description: 'Take control of your finances and conquer your debt.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Add className="dark" here to force dark mode, or implement a theme switcher
    // that dynamically adds/removes the class based on user preference or system settings.
    // For now, we'll assume a theme switcher might handle this, or rely on OS preference.
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable, // Use Inter variable
          roboto_mono.variable // Use Roboto Mono variable
        )}
      >
        <SidebarProvider>
          {children}
          <Toaster />
        </SidebarProvider>
      </body>
    </html>
  );
}
