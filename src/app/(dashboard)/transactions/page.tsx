'use client';

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

// Mock initial transactions
const initialTransactions: Transaction[] = [
  { date: new Date(2024, 5, 15), description: 'Salary Deposit', amount: 3000 },
  { date: new Date(2024, 5, 16), description: 'Groceries - SuperMart', amount: -85.50 },
  { date: new Date(2024, 5, 17), description: 'Rent Payment', amount: -1200 },
  { date: new Date(2024, 5, 18), description: 'Coffee Shop', amount: -5.25 },
  { date: new Date(2024, 5, 20), description: 'Utility Bill - Electricity', amount: -75.00 },
  { date: new Date(2024, 5, 22), description: 'Dinner Out', amount: -60.00 },
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
         { date: new Date(), description: `Imported from ${file.name}`, amount: Math.random() > 0.5 ? 150 : -50 },
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD', // Adjust currency as needed
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
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
                     Amount
                   </Label>
                   <Input
                     id="amount"
                     name="amount"
                     type="number"
                     step="0.01"
                     value={newTransaction.amount}
                     onChange={handleInputChange}
                     className="col-span-3"
                     placeholder="e.g., -5.50 or 100"
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
                    <TableHead className="text-right w-[120px]">Amount</TableHead>
                    {/* Add Categorization column later */}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length > 0 ? (
                    transactions.map((tx, index) => (
                      <TableRow key={`${tx.date.toISOString()}-${index}`}> {/* Ensure unique key */}
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
