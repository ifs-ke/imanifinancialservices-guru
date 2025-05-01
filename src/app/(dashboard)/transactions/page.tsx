
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
import { PlusCircle, Upload, Edit, Trash2, FileUp, FileDown } from 'lucide-react'; // Added FileDown for export
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose // Import DialogClose
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
  AlertDialogTrigger, // Import AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactions } from '@/contexts/TransactionsContext'; // Import useTransactions hook
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types'; // Import shared types
import Link from 'next/link'; // Import Link
import { format } from 'date-fns'; // For date formatting
import { cn } from '@/lib/utils'; // For conditional classes
import { jsPDF } from 'jspdf';
// import 'jspdf-autotable'; // Commented out as it caused build errors

// Helper to format Date to YYYY-MM-DD for input[type=date]
const formatDateForInput = (date: Date | string): string => {
    // Handle potential string input from form state reset
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        // Return empty string or today's date if input is invalid
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`; // Default to today if invalid
    }
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Initial form data structure including categorization fields
const initialFormData = {
    date: formatDateForInput(new Date()), // Default to today
    description: '',
    amount: '',
    modeOfPayment: '' as ModeOfPayment | '',
    frequency: '' as TransactionFrequency | '', // Add frequency
    variability: '' as TransactionVariability | '', // Add variability
};

export default function TransactionsPage() {
  // Use context for transaction state management
  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactions();

  // Local state for dialogs, editing, deleting, and form data
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [formData, setFormData] = useState(initialFormData);
  const { toast } = useToast();

  // Reset form data when dialogs close
  useEffect(() => {
    if (!isAddDialogOpen && !isEditDialogOpen) { // Changed condition to !isEditDialogOpen
        setFormData(initialFormData);
        setEditingTransaction(null); // Ensure editing state is also cleared
    }
  }, [isAddDialogOpen, isEditDialogOpen]);

  // --- CRUD Operations using Context ---

  // CREATE
  const handleAddTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const { date, description, amount, modeOfPayment, frequency, variability } = formData;

    // Add validation for new fields if they are mandatory
    if (!date || !description || !amount || !modeOfPayment /* || !frequency || !variability */) {
      toast({ title: 'Missing Information', description: 'Please fill out required fields (Date, Desc, Amount, Mode).', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
      return;
    }

    addTransaction({
      date: new Date(date + 'T00:00:00'), // Use local time
      description: description,
      amount: parsedAmount,
      modeOfPayment: modeOfPayment as ModeOfPayment, // Ensure correct type
      frequency: frequency || undefined, // Pass undefined if empty
      variability: variability || undefined, // Pass undefined if empty
    });

    setIsAddDialogOpen(false); // Close dialog
    toast({ title: 'Transaction Added', description: 'Successfully added.' });
  };

  // UPDATE
  const handleEditClick = (transaction: TransactionWithId) => {
    setEditingTransaction(transaction);
    setFormData({
      date: formatDateForInput(transaction.date),
      description: transaction.description,
      amount: transaction.amount.toString(),
      modeOfPayment: transaction.modeOfPayment,
      frequency: transaction.frequency || '', // Handle potentially undefined values
      variability: transaction.variability || '', // Handle potentially undefined values
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTransaction) return;

    const { date, description, amount, modeOfPayment, frequency, variability } = formData;
    // Add validation for new fields if they are mandatory
    if (!date || !description || !amount || !modeOfPayment /* || !frequency || !variability */) {
      toast({ title: 'Missing Information', description: 'Please fill out required fields (Date, Desc, Amount, Mode).', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
      return;
    }

    updateTransaction({
        ...editingTransaction, // Keep the original ID
        date: new Date(date + 'T00:00:00'),
        description,
        amount: parsedAmount,
        modeOfPayment: modeOfPayment as ModeOfPayment, // Ensure correct type
        frequency: frequency || undefined, // Update frequency
        variability: variability || undefined, // Update variability
    });

    setIsEditDialogOpen(false); // Close dialog
    toast({ title: 'Transaction Updated', description: 'Successfully updated.' });
  };

  // DELETE
  const handleDeleteClick = (transaction: TransactionWithId) => {
    setTransactionToDelete(transaction);
    // AlertDialogTrigger will open the confirmation dialog
  };

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null); // Close the dialog implicitly
    toast({ title: 'Transaction Deleted', description: 'Successfully removed.' });
  };

  // --- Other Handlers ---

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Updated to handle all select changes
  const handleSelectChange = (name: string, value: string) => {
     setFormData(prev => ({ ...prev, [name]: value }));
  };

   // Generate unique IDs for mock data - consider moving to a utility file if needed elsewhere
    const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;


  // --- Formatting ---

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Helper to format categorization labels nicely
  const formatCategory = (value: string | undefined) => {
      if (!value) return <span className="text-muted-foreground italic">N/A</span>;
      // Capitalize first letter
      return value.charAt(0).toUpperCase() + value.slice(1);
  }

  // --- Export Functionality ---
  const handleExportCsv = useCallback(() => {
    if (transactions.length === 0) {
      toast({ title: "No data to export", description: "Add transactions to export a CSV file.", variant: "default" });
      return;
    }

    const csvRows = [];
    // Define explicit headers for CSV
    const headers = ['Date', 'Description', 'Amount (KES)', 'Mode of Payment', 'Frequency', 'Variability'];
    csvRows.push(headers.join(','));

    for (const tx of transactions) {
      // Sanitize description to prevent CSV injection issues (basic example: remove quotes)
      const sanitizedDescription = tx.description.replace(/"/g, "''");

      const values = [
        format(tx.date, 'yyyy-MM-dd'), // Format the date consistently
        `"${sanitizedDescription}"`, // Enclose description in quotes
        tx.amount,
        tx.modeOfPayment,
        tx.frequency || '', // Handle undefined
        tx.variability || '' // Handle undefined
      ].join(',');
      csvRows.push(values);
    }

    const csvData = csvRows.join('\n');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' }); // Specify charset
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transactions_export.csv'; // Use a more descriptive name
    document.body.appendChild(link); // Needed for Firefox
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up the object URL

    toast({ title: "CSV Exported", description: "Successfully downloaded transaction data." });
  }, [transactions, toast]); // Removed formatDate dependency as format from date-fns is used directly


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
        <div className="flex gap-2 flex-wrap"> {/* Added flex-wrap for smaller screens */}
          {/* Add Transaction Dialog */}
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
              {/* Changed form onSubmit handler */}
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
                    {/* Use DialogClose for cancellation */}
                   <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                   </DialogClose>
                  <Button type="submit">Add Transaction</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

           {/* Import Button - Links to Import Page */}
           <Button asChild variant="default">
             <Link href="/transactions/import">
               <FileUp className="mr-2 h-4 w-4" /> Import File
             </Link>
           </Button>
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
                           {/* Edit Button - Opens Edit Dialog */}
                           <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(tx)}>
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit</span>
                           </Button>{/* Delete Button & Confirmation Dialog */}
                           {/* Manage AlertDialog open state externally */}
                           <AlertDialog open={transactionToDelete?.id === tx.id} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(tx)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </AlertDialogTrigger>
                             <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This action cannot be undone. This will permanently delete the transaction: <br/>
                                     <strong>{formatDate(tx.date)} - {tx.description} ({formatCurrency(tx.amount)})</strong>
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Cancel</AlertDialogCancel>
                                   <AlertDialogAction onClick={confirmDeleteTransaction}>Delete</AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                           </AlertDialog>
                         </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      {/* Adjust colspan */}
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

      {/* Edit Transaction Dialog */}
      {/* Use controlled Dialog component */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
         <DialogContent className="sm:max-w-[425px]">
           <DialogHeader>
             <DialogTitle>Edit Transaction</DialogTitle>
             <DialogDescription>Update the details below.</DialogDescription>
           </DialogHeader>
           {/* Changed form onSubmit handler */}
           <form onSubmit={handleUpdateTransactionSubmit} className="grid gap-4 py-4">
            {/* Input Fields */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="edit-date" className="text-right">Date</Label>
               <Input id="edit-date" name="date" type="date" value={formData.date} onChange={handleInputChange} className="col-span-3" required />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="edit-description" className="text-right">Description</Label>
               <Input id="edit-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" required />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="edit-amount" className="text-right">Amount (KES)</Label>
               <Input id="edit-amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleInputChange} className="col-span-3" required />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-modeOfPayment" className="text-right">Payment Mode</Label>
              <Select name="modeOfPayment" value={formData.modeOfPayment} onValueChange={(value) => handleSelectChange('modeOfPayment', value)} required>
                <SelectTrigger id="edit-modeOfPayment" className="col-span-3">
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
              <Label htmlFor="edit-frequency" className="text-right">Frequency</Label>
               <Select name="frequency" value={formData.frequency} onValueChange={(value) => handleSelectChange('frequency', value)}>
                <SelectTrigger id="edit-frequency" className="col-span-3">
                  <SelectValue placeholder="Optional: Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="one-time">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-variability" className="text-right">Variability</Label>
               <Select name="variability" value={formData.variability} onValueChange={(value) => handleSelectChange('variability', value)}>
                <SelectTrigger id="edit-variability" className="col-span-3">
                  <SelectValue placeholder="Optional: Select variability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="variable">Variable</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <DialogFooter>
                {/* Use DialogClose for cancellation */}
                <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
               <Button type="submit">Save Changes</Button>
             </DialogFooter>
           </form>
         </DialogContent>
       </Dialog>

    </div>
  );
}
