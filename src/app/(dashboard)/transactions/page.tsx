
'use client';

import React, { useState, type ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Upload, Edit, Trash2 } from 'lucide-react';
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactions } from '@/contexts/TransactionsContext'; // Import useTransactions hook
import type { TransactionWithId, ModeOfPayment } from '@/lib/types'; // Import shared types

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

// Initial form data structure
const initialFormData = {
    date: formatDateForInput(new Date()), // Default to today
    description: '',
    amount: '',
    modeOfPayment: '' as ModeOfPayment | ''
};

export default function TransactionsPage() {
  // Use context for transaction state management
  const { transactions, addTransaction, updateTransaction, deleteTransaction, importTransactionsBatch } = useTransactions();

  // Local state for dialogs, editing, deleting, and form data
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();

  // Reset form data when dialogs close
  useEffect(() => {
    if (!isAddDialogOpen && !isEditDialogOpen) {
        setFormData(initialFormData);
        setEditingTransaction(null); // Ensure editing state is also cleared
    }
  }, [isAddDialogOpen, isEditDialogOpen]);

  // --- CRUD Operations using Context ---

  // CREATE
  const handleAddTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const { date, description, amount, modeOfPayment } = formData;

    if (!date || !description || !amount || !modeOfPayment) {
      toast({ title: 'Missing Information', description: 'Please fill out all fields.', variant: 'destructive' });
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
      modeOfPayment: modeOfPayment,
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
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTransaction) return;

    const { date, description, amount, modeOfPayment } = formData;
    if (!date || !description || !amount || !modeOfPayment) {
      toast({ title: 'Missing Information', description: 'Please fill out all fields.', variant: 'destructive' });
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
        modeOfPayment
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

  const handleSelectChange = (value: string) => {
     setFormData(prev => ({ ...prev, modeOfPayment: value as ModeOfPayment }));
  };

   // Generate unique IDs for mock data - consider moving to a utility file if needed elsewhere
    const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;


  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      // Placeholder for actual import logic - Should use a service function
      // For now, simulate with mock data
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing

      // TODO: Replace with actual file parsing logic (e.g., using a library like PapaParse for CSV)
      // This mock import adds a few example transactions
      const importedData: Omit<TransactionWithId, 'id'>[] = [
        { date: new Date(2024, 6, 5), description: `Imported: ${file.name} Item 1`, amount: -1200.50, modeOfPayment: 'Mpesa' },
        { date: new Date(2024, 6, 6), description: `Imported: ${file.name} Item 2`, amount: 50000, modeOfPayment: 'Bank' },
      ];

      const newTransactionsWithIds = importedData.map(tx => ({ id: generateId(), ...tx }));

      importTransactionsBatch(newTransactionsWithIds); // Use context function for batch import

      toast({ title: 'Import Successful', description: `${file.name} processed.`, variant: 'default' });
    } catch (error) {
      console.error('Import failed:', error);
      toast({ title: 'Import Failed', description: 'Could not import file.', variant: 'destructive' });
    } finally {
      setIsImporting(false);
      event.target.value = ''; // Clear the file input
    }
  };

  // --- Formatting ---

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
  };

  const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
                  <Select name="modeOfPayment" value={formData.modeOfPayment} onValueChange={handleSelectChange} required>
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

           {/* Import Button */}
           <Button asChild variant="default" disabled={isImporting}>
             <Label htmlFor="file-upload" className="cursor-pointer flex items-center"> {/* Added flex items-center */}
               <Upload className="mr-2 h-4 w-4" /> {isImporting ? 'Importing...' : 'Import File'}
               <Input id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept=".csv,.xlsx,.ofx,.qif" disabled={isImporting} />
             </Label>
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
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[100px]">Mode</TableHead>
                    <TableHead className="text-right w-[150px]">Amount (KES)</TableHead>
                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length > 0 ? (
                    transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-medium">{formatDate(tx.date)}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell>{tx.modeOfPayment}</TableCell>
                        <TableCell className={`text-right font-mono ${tx.amount >= 0 ? 'text-accent' : 'text-destructive'}`}>
                          {formatCurrency(tx.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                           {/* Edit Button - Opens Edit Dialog */}
                           <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(tx)}>
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit</span>
                           </Button>

                           {/* Delete Button & Confirmation Dialog */}
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
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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
              <Select name="modeOfPayment" value={formData.modeOfPayment} onValueChange={handleSelectChange} required>
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
