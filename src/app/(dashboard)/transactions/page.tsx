
// src/app/(dashboard)/transactions/page.tsx
'use client';

import React, { useState, type ChangeEvent, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, FileUp, FileDown } from 'lucide-react'; // Removed Upload icon, kept FileUp/Down
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactionsStore } from '@/store/transactionsStore'; // Import Zustand store hook
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types'; // Import shared types
import Link from 'next/link'; // Import Link
import { format } from 'date-fns'; // For date formatting
import { cn } from '@/lib/utils'; // For conditional classes
import EditTransactionDialog from './EditTransactionDialog'; // Import the new Edit Dialog

// Helper to format Date to YYYY-MM-DD for input[type=date]
const formatDateForInput = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Initial form data structure including categorization fields
const initialFormData = {
    date: formatDateForInput(new Date()),
    description: '',
    amount: '',
    modeOfPayment: '' as ModeOfPayment | '',
    frequency: '' as TransactionFrequency | '',
    variability: '' as TransactionVariability | '',
};

export default function TransactionsPage() {
  // Use Zustand store hook for transaction state management
  const { transactions, addTransaction, deleteTransaction } = useTransactionsStore(); // Removed updateTransaction, will be handled by EditTransactionDialog

  // Local state for dialogs, editing, deleting, and form data
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false); // State to control edit dialog
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [formData, setFormData] = useState(initialFormData); // Primarily for Add dialog now
  const { toast } = useToast();

  // Reset add form data when add dialog closes
  useEffect(() => {
    if (!isAddDialogOpen) {
        setFormData(initialFormData);
    }
  }, [isAddDialogOpen]);

  // Reset editing state when edit dialog closes
  useEffect(() => {
      if (!isEditDialogOpen) {
          setEditingTransaction(null);
      }
  }, [isEditDialogOpen]);

  // --- CRUD Operations using Zustand Store ---

  // CREATE (remains in this component, uses standard Dialog)
  const handleAddTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const { date, description, amount, modeOfPayment, frequency, variability } = formData;

    if (!date || !description || !amount || !modeOfPayment) {
      toast({ title: 'Missing Information', description: 'Please fill out required fields (Date, Desc, Amount, Mode).', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
      return;
    }

    addTransaction({
      date: new Date(date + 'T00:00:00'),
      description: description,
      amount: parsedAmount,
      modeOfPayment: modeOfPayment as ModeOfPayment,
      frequency: frequency || undefined,
      variability: variability || undefined,
    });

    setIsAddDialogOpen(false);
    toast({ title: 'Transaction Added', description: 'Successfully added.' });
  };

  // UPDATE (moved to EditTransactionDialog, this handler now just opens the dialog)
  const handleEditClick = (transaction: TransactionWithId) => {
    setEditingTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  // DELETE (remains the same)
  const handleDeleteClick = (transaction: TransactionWithId) => {
    setTransactionToDelete(transaction);
  };

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null);
    toast({ title: 'Transaction Deleted', description: 'Successfully removed.' });
  };

  // --- Other Handlers (for Add Dialog) ---

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
     setFormData(prev => ({ ...prev, [name]: value }));
  };

   // --- Formatting (remain the same) ---

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatCategory = (value: string | undefined) => {
      if (!value) return <span className="text-muted-foreground italic">N/A</span>;
      return value.charAt(0).toUpperCase() + value.slice(1);
  }

  // --- Export Functionality (remain the same) ---
  const handleExportCsv = useCallback(() => {
    if (transactions.length === 0) {
      toast({ title: "No data to export", description: "Add transactions to export a CSV file.", variant: "default" });
      return;
    }

    const csvRows = [];
    const headers = ['Date', 'Description', 'Amount (KES)', 'Mode of Payment', 'Frequency', 'Variability'];
    csvRows.push(headers.join(','));

    for (const tx of transactions) {
      const sanitizedDescription = tx.description.replace(/"/g, "''");
       const dateObj = tx.date instanceof Date ? tx.date : new Date(tx.date);

      const values = [
        isNaN(dateObj.getTime()) ? 'Invalid Date' : format(dateObj, 'yyyy-MM-dd'),
        `"${sanitizedDescription}"`,
        tx.amount,
        tx.modeOfPayment,
        tx.frequency || '',
        tx.variability || ''
      ].join(',');
      csvRows.push(values);
    }

    const csvData = csvRows.join('\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transactions_export.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "CSV Exported", description: "Successfully downloaded transaction data." });
  }, [transactions, toast]);


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
        <div className="flex gap-2 flex-wrap"> {/* Added flex-wrap */}
          {/* Add Transaction Dialog (Standard Dialog) */}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Transaction</DialogTitle>
                <DialogDescription>Manually enter details below.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddTransactionSubmit} className="grid gap-4 py-4">
                {/* Input Fields */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-date" className="text-right">Date</Label>
                  <Input id="add-date" name="date" type="date" value={formData.date} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-description" className="text-right">Description</Label>
                  <Input id="add-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Coffee" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-amount" className="text-right">Amount (KES)</Label>
                  <Input id="add-amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleInputChange} className="col-span-3" placeholder="e.g., -550 or 10000" required />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-modeOfPayment" className="text-right">Payment Mode</Label>
                  <Select name="modeOfPayment" value={formData.modeOfPayment} onValueChange={(value) => handleSelectChange('modeOfPayment', value)} required>
                    <SelectTrigger id="add-modeOfPayment" className="col-span-3">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="Mpesa">Mpesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Categorization Selects */}
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-frequency" className="text-right">Frequency</Label>
                   <Select name="frequency" value={formData.frequency} onValueChange={(value) => handleSelectChange('frequency', value)}>
                    <SelectTrigger id="add-frequency" className="col-span-3">
                      <SelectValue placeholder="Optional: Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recurring">Recurring</SelectItem>
                      <SelectItem value="one-time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-variability" className="text-right">Variability</Label>
                   <Select name="variability" value={formData.variability} onValueChange={(value) => handleSelectChange('variability', value)}>
                    <SelectTrigger id="add-variability" className="col-span-3">
                      <SelectValue placeholder="Optional: Select variability" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="variable">Variable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                   <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                   </DialogClose>
                  <Button type="submit">Add Transaction</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

           {/* Import Button */}
           <Button asChild variant="default">
             <Link href="/transactions/import">
               <FileUp className="mr-2 h-4 w-4" /> Import File
             </Link>
           </Button>
            {/* Export Button */}
            <Button variant="secondary" onClick={handleExportCsv}>
              <FileDown className="mr-2 h-4 w-4" /> Export CSV
            </Button>
         </div>
      </header>

      <main className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>Your recent financial activities.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[90px]">Mode</TableHead>
                    <TableHead className="w-[90px]">Frequency</TableHead>
                    <TableHead className="w-[90px]">Variability</TableHead>
                    <TableHead className="text-right w-[140px]">Amount (KES)</TableHead>
                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length > 0 ? (
                    transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-medium">{formatDate(tx.date)}</TableCell>
                        <TableCell className="max-w-[250px] truncate" title={tx.description}>{tx.description}</TableCell>
                        <TableCell>{tx.modeOfPayment}</TableCell>
                        <TableCell className="text-xs">{formatCategory(tx.frequency)}</TableCell>
                        <TableCell className="text-xs">{formatCategory(tx.variability)}</TableCell>
                        <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>
                          {formatCurrency(tx.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                           {/* Edit Button - Triggers Edit Dialog */}
                           <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(tx)}>
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit</span>
                           </Button>
                           {/* Delete Button & Confirmation Dialog */}
                           <AlertDialog open={transactionToDelete?.id === tx.id} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
                             <AlertDialogTrigger asChild>
                               <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(tx)}>
                                 <Trash2 className="h-4 w-4" />
                                 <span className="sr-only">Delete</span>
                               </Button>
                             </AlertDialogTrigger>
                             <AlertDialogContent>
                               {transactionToDelete && transactionToDelete.id === tx.id && ( // Ensure correct transaction is targeted
                                 <>
                                   <AlertDialogHeader>
                                     <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                     <AlertDialogDescription>
                                       This action cannot be undone. This will permanently delete the transaction: <br/>
                                       <strong>{formatDate(transactionToDelete.date)} - {transactionToDelete.description} ({formatCurrency(transactionToDelete.amount)})</strong>
                                     </AlertDialogDescription>
                                   </AlertDialogHeader>
                                   <AlertDialogFooter>
                                     <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Cancel</AlertDialogCancel>
                                     <AlertDialogAction onClick={confirmDeleteTransaction}>Delete</AlertDialogAction>
                                   </AlertDialogFooter>
                                 </>
                                )}
                               </AlertDialogContent>
                           </AlertDialog>
                         </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No transactions yet. Import a file or add one manually.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>

      {/* Edit Transaction Dialog Component */}
      {editingTransaction && (
          <EditTransactionDialog
              isOpen={isEditDialogOpen}
              onClose={() => setIsEditDialogOpen(false)}
              transaction={editingTransaction}
          />
      )}

    </div>
  );
}

