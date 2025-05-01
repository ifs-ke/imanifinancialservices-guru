'use client';

import React, { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { Transaction } from '@/services/transaction-importer';
import { PlusCircle, Upload, Edit, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

// Adding ID to transaction interface and mock data
interface TransactionWithId extends Transaction {
  id: string; // Using string ID for flexibility, could be number
}

// Generate unique IDs for mock data
const generateId = () => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Mock initial transactions (values in KES) with IDs
const initialTransactions: TransactionWithId[] = [
  { id: generateId(), date: new Date(2024, 5, 15), description: 'Salary Deposit', amount: 300000 },
  { id: generateId(), date: new Date(2024, 5, 16), description: 'Groceries - Naivas', amount: -8550 },
  { id: generateId(), date: new Date(2024, 5, 17), description: 'Rent Payment', amount: -120000 },
  { id: generateId(), date: new Date(2024, 5, 18), description: 'Coffee Shop', amount: -525 },
  { id: generateId(), date: new Date(2024, 5, 20), description: 'Utility Bill - KPLC', amount: -7500 },
  { id: generateId(), date: new Date(2024, 5, 22), description: 'Dinner Out - Artcaffe', amount: -6000 },
];

// Helper to format Date to YYYY-MM-DD for input[type=date]
const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};


export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionWithId[]>(initialTransactions);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [formData, setFormData] = useState({ date: '', description: '', amount: '' });
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();


  // --- CRUD Operations ---

  // CREATE
  const handleAddTransaction = (event: React.FormEvent) => {
    event.preventDefault();
    const { date, description, amount } = formData;

    if (!date || !description || !amount) {
      toast({ title: 'Missing Information', description: 'Please fill out all fields.', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
      return;
    }

    const newTransaction: TransactionWithId = {
      id: generateId(),
      date: new Date(date + 'T00:00:00'), // Ensure date parsing considers local time
      description: description,
      amount: parsedAmount,
    };

    setTransactions(prev => [newTransaction, ...prev].sort((a, b) => b.date.getTime() - a.date.getTime()));
    setFormData({ date: '', description: '', amount: '' });
    setIsAddDialogOpen(false);
    toast({ title: 'Transaction Added', description: 'Successfully added.' });
  };

  // UPDATE
  const handleEditClick = (transaction: TransactionWithId) => {
    setEditingTransaction(transaction);
    setFormData({
      date: formatDateForInput(transaction.date),
      description: transaction.description,
      amount: transaction.amount.toString(),
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateTransaction = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTransaction) return;

    const { date, description, amount } = formData;
    if (!date || !description || !amount) {
      toast({ title: 'Missing Information', description: 'Please fill out all fields.', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
      return;
    }

    setTransactions(prev =>
      prev.map(tx =>
        tx.id === editingTransaction.id
          ? { ...tx, date: new Date(date + 'T00:00:00'), description, amount: parsedAmount }
          : tx
      ).sort((a, b) => b.date.getTime() - a.date.getTime())
    );

    setEditingTransaction(null);
    setFormData({ date: '', description: '', amount: '' });
    setIsEditDialogOpen(false);
    toast({ title: 'Transaction Updated', description: 'Successfully updated.' });
  };

  // DELETE
  const handleDeleteClick = (transaction: TransactionWithId) => {
    setTransactionToDelete(transaction);
    // The AlertDialogTrigger will open the confirmation dialog
  };

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;

    setTransactions(prev => prev.filter(tx => tx.id !== transactionToDelete.id));
    setTransactionToDelete(null); // Close the dialog implicitly by resetting the state
    toast({ title: 'Transaction Deleted', description: 'Successfully removed.' });
  };

  // --- Other Handlers ---

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const imported: TransactionWithId[] = [
        { id: generateId(), date: new Date(), description: 'Imported from ' + file.name, amount: Math.random() > 0.5 ? 15000 : -5000 },
      ];
      setTransactions(prev => [...prev, ...imported].sort((a, b) => b.date.getTime() - a.date.getTime()));
      toast({ title: 'Import Successful', description: `${file.name} imported.`, variant: 'default' });
    } catch (error) {
      console.error('Import failed:', error);
      toast({ title: 'Import Failed', description: 'Could not import file.', variant: 'destructive' });
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  // --- Formatting ---

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
              <form onSubmit={handleAddTransaction} className="grid gap-4 py-4">
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
                <DialogFooter>
                  <Button type="submit">Add Transaction</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

           {/* Import Button */}
           <Button asChild variant="default" disabled={isImporting}>
             <Label htmlFor="file-upload" className="cursor-pointer">
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
                        <TableCell className={`text-right font-mono ${tx.amount >= 0 ? 'text-accent' : 'text-destructive'}`}>
                          {formatCurrency(tx.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                           {/* Edit Button */}
                           <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(tx)}>
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit</span>
                           </Button>

                           {/* Delete Button & Confirmation Dialog */}
                           <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(tx)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </AlertDialogTrigger>
                             {/* Conditional rendering might be better if many rows cause perf issues */}
                             {transactionToDelete && transactionToDelete.id === tx.id && (
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
                                   <AlertDialogAction onClick={() => confirmDeleteTransaction()}>Delete</AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             )}
                           </AlertDialog>
                         </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
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
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
         <DialogContent className="sm:max-w-[425px]">
           <DialogHeader>
             <DialogTitle>Edit Transaction</DialogTitle>
             <DialogDescription>Update the details below.</DialogDescription>
           </DialogHeader>
           <form onSubmit={handleUpdateTransaction} className="grid gap-4 py-4">
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
             <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingTransaction(null); }}>Cancel</Button>
               <Button type="submit">Save Changes</Button>
             </DialogFooter>
           </form>
         </DialogContent>
       </Dialog>

    </div>
  );
}

