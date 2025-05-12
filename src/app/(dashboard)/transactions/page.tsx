// src/app/(dashboard)/transactions/page.tsx
'use client';

import React, { useState, type ChangeEvent, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, FileUp, FileDown, PackageSearch } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
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
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore } from '@/store/budgetStore'; 
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability, BudgetItem } from '@/lib/types';
import Link from 'next/link';
import { format, parse, isValid } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import EditTransactionDialog from './EditTransactionDialog';
import { Badge } from '@/components/ui/badge';

const formatDateForInput = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? parse(date, 'yyyy-MM-dd', new Date()) : date;
    if (!isValid(dateObj)) {
        const today = new Date();
        return format(today, 'yyyy-MM-dd');
    }
    return format(dateObj, 'yyyy-MM-dd');
};

const initialFormData = {
    date: formatDateForInput(new Date()),
    description: '',
    amount: '',
    modeOfPayment: '' as ModeOfPayment | '',
    frequency: '' as TransactionFrequency | '',
    variability: '' as TransactionVariability | '',
    categoryName: '' as string | '', 
};

export default function TransactionsPage() {
  const { transactions, addTransaction, deleteTransaction } = useTransactionsStore(); 
  const allBudgetItems = useBudgetStore(state => state.budgetItems);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false); 
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [formData, setFormData] = useState(initialFormData);
  const { toast } = useToast();

  const budgetItemsForSelectedMonth = useMemo(() => {
    if (!formData.date) return [];
    try {
        const transactionDate = parse(formData.date, 'yyyy-MM-dd', new Date());
        if (!isValid(transactionDate)) return [];
        const periodKey = format(transactionDate, 'yyyy-MM');
        return allBudgetItems.filter(item => item.period === periodKey && item.category !== 'income'); 
    } catch(e) {
        return [];
    }
  }, [formData.date, allBudgetItems]);


  useEffect(() => {
    if (!isAddDialogOpen) {
        setFormData(initialFormData);
    }
  }, [isAddDialogOpen]);

  useEffect(() => {
      if (!isEditDialogOpen) {
          setEditingTransaction(null);
      }
  }, [isEditDialogOpen]);

  const handleAddTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const { date, description, amount, modeOfPayment, frequency, variability, categoryName } = formData;

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
      date: parse(date, 'yyyy-MM-dd', new Date()), 
      description: description,
      amount: parsedAmount,
      modeOfPayment: modeOfPayment as ModeOfPayment,
      frequency: frequency || undefined,
      variability: variability || undefined,
      categoryName: categoryName || null, 
    });

    setIsAddDialogOpen(false);
    toast({ title: 'Transaction Added', description: 'Successfully added.' });
  };

  const handleEditClick = (transaction: TransactionWithId) => {
    setEditingTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (transaction: TransactionWithId) => {
    setTransactionToDelete(transaction);
  };

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null);
    toast({ title: 'Transaction Deleted', description: 'Successfully removed.' });
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
     setFormData(prev => ({ ...prev, [name]: value }));
  };

  const formatDateDisplay = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? parse(date, 'yyyy-MM-dd', new Date()) : date;
      if (!isValid(dateObj)) return 'Invalid Date';
    return format(dateObj, 'PP'); 
  };

  const formatCategoryDisplay = (freq?: TransactionFrequency | null, vari?: TransactionVariability | null) => {
    if (!freq && !vari) return <Badge variant="outline" className="text-xs font-normal">N/A</Badge>;
    let badges = [];
    if (freq) {
      badges.push(<Badge key="freq" variant={freq === 'recurring' ? 'secondary' : 'outline'} className="text-xs font-normal mr-1">{freq.charAt(0).toUpperCase() + freq.slice(1)}</Badge>);
    }
    if (vari) {
      badges.push(<Badge key="vari" variant={vari === 'fixed' ? 'secondary' : 'outline'} className="text-xs font-normal">{vari.charAt(0).toUpperCase() + vari.slice(1)}</Badge>);
    }
    return <div className="flex items-center gap-1">{badges}</div>;
  };

  const handleExportCsv = useCallback(() => {
    if (transactions.length === 0) {
      toast({ title: "No data to export", description: "Add transactions to export a CSV file.", variant: "default" });
      return;
    }

    const csvRows = [];
    const headers = ['Date', 'Description', 'Amount (KES)', 'Mode of Payment', 'Frequency', 'Variability', 'Budget Category'];
    csvRows.push(headers.join(','));

    for (const tx of transactions) {
      const sanitizedDescription = tx.description.replace(/"/g, "''");
      const dateObj = tx.date instanceof Date ? tx.date : new Date(tx.date);
      const values = [
        !isValid(dateObj) ? 'Invalid Date' : format(dateObj, 'yyyy-MM-dd'),
        `"${sanitizedDescription}"`,
        tx.amount,
        tx.modeOfPayment,
        tx.frequency || '',
        tx.variability || '',
        tx.categoryName || '' 
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
    <div className="flex flex-col min-h-screen min-w-100 p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center">
             <PackageSearch className="h-6 w-6 mr-2 text-primary" /> Transactions
          </h1>
          <p className="text-muted-foreground">
            View, import, and manage your financial transactions.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]"> 
              <DialogHeader>
                <DialogTitle>Add New Transaction</DialogTitle>
                <DialogDescription>Manually enter details below.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddTransactionSubmit} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-date" className="text-right col-span-1">Date</Label>
                  <Input id="add-date" name="date" type="date" value={formData.date} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-description" className="text-right col-span-1">Description</Label>
                  <Input id="add-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Coffee" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-amount" className="text-right col-span-1">Amount (KES)</Label>
                  <Input id="add-amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleInputChange} className="col-span-3" placeholder="e.g., -550 or 10000" required />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-modeOfPayment" className="text-right col-span-1">Payment Mode</Label>
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
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-categoryName" className="text-right col-span-1">Budget Category</Label>
                  <Select name="categoryName" value={formData.categoryName || ''} onValueChange={(value) => handleSelectChange('categoryName', value === '' ? '' : value)}>
                    <SelectTrigger id="add-categoryName" className="col-span-3">
                      <SelectValue placeholder="Optional: Link to budget item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {budgetItemsForSelectedMonth.length > 0 ? (
                        budgetItemsForSelectedMonth.map(item => (
                          <SelectItem key={item.id} value={item.description}>
                            {item.description} ({item.category})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="" disabled>No budget items for selected month</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-frequency" className="text-right col-span-1">Frequency</Label>
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
                  <Label htmlFor="add-variability" className="text-right col-span-1">Variability</Label>
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
                <DialogFooter className="pt-4">
                   <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                   </DialogClose>
                  <Button type="submit">Add Transaction</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

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
          <CardHeader className="p-6">
            <CardTitle className="text-lg">Transaction History</CardTitle>
            <CardDescription>Your recent financial activities.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px] pl-6 pr-3">Date</TableHead>
                    <TableHead className="px-3">Description</TableHead>
                    <TableHead className="w-[90px] px-3">Mode</TableHead>
                    <TableHead className="w-[150px] px-3">Recurrence</TableHead>
                    <TableHead className="w-[150px] px-3">Budget Category</TableHead>
                    <TableHead className="text-right w-[140px] px-3">Amount (KES)</TableHead>
                    <TableHead className="text-right w-[100px] pr-6 pl-3">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length > 0 ? (
                    transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-medium pl-6 pr-3">{formatDateDisplay(tx.date)}</TableCell>
                        <TableCell className="max-w-[200px] sm:max-w-[250px] truncate px-3" title={tx.description}>{tx.description}</TableCell>
                        <TableCell className="px-3">{tx.modeOfPayment}</TableCell>
                        <TableCell className="px-3">{formatCategoryDisplay(tx.frequency, tx.variability)}</TableCell>
                        <TableCell className="px-3 text-xs text-muted-foreground">{tx.categoryName || 'N/A'}</TableCell>
                        <TableCell className={cn('text-right font-mono px-3', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>
                          {formatCurrency(tx.amount)}
                        </TableCell>
                        <TableCell className="text-right pr-6 pl-3">
                           <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(tx)}>
                             <Edit className="h-4 w-4" />
                             <span className="sr-only">Edit</span>
                           </Button>
                           <AlertDialog open={transactionToDelete?.id === tx.id} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
                             <AlertDialogTrigger asChild>
                               <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(tx)}>
                                 <Trash2 className="h-4 w-4" />
                                 <span className="sr-only">Delete</span>
                               </Button>
                             </AlertDialogTrigger>
                             {transactionToDelete && transactionToDelete.id === tx.id && ( 
                               <AlertDialogContent>
                                   <AlertDialogHeader>
                                     <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                     <AlertDialogDescription>
                                       This action cannot be undone. This will permanently delete the transaction: <br/>
                                       <strong>{formatDateDisplay(transactionToDelete.date)} - {transactionToDelete.description} ({formatCurrency(transactionToDelete.amount)})</strong>
                                     </AlertDialogDescription>
                                   </AlertDialogHeader>
                                   <AlertDialogFooter>
                                     <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Cancel</AlertDialogCancel>
                                     <AlertDialogAction onClick={confirmDeleteTransaction}>Delete</AlertDialogAction>
                                   </AlertDialogFooter>
                               </AlertDialogContent>
                                )}
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

      {editingTransaction && (
          <EditTransactionDialog
              isOpen={isEditDialogOpen}
              onClose={() => setIsEditDialogOpen(false)}
              transaction={editingTransaction}
              allBudgetItems={allBudgetItems}
          />
      )}

    </div>
  );
}
