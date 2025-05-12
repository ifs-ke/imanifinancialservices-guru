// src/app/(dashboard)/transactions/page.tsx
'use client';

import React, { useState, type ChangeEvent, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Label is still used in Add Transaction Dialog
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, FileUp, FileDown, PackageSearch, Edit, Trash2, XSquare } from 'lucide-react';
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
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability, BudgetItem, TransactionFormData as SharedTransactionFormData } from '@/lib/types';
import Link from 'next/link';
import { format, parse, isValid } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import EditTransactionDialog from './EditTransactionDialog';
import BatchUpdateTransactionDialog from './BatchUpdateTransactionDialog'; 
import { DataTable } from '@/components/ui/data-table'; 
import { getColumns } from './columns'; 
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type RowSelectionState, 
} from '@tanstack/react-table';

const NONE_CATEGORY_VALUE = "__NONE_CATEGORY__"; 
const NO_ITEMS_PLACEHOLDER_VALUE = "__NO_BUDGET_ITEMS_PLACEHOLDER__"; 

const formatDateForInput = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? parse(date, 'yyyy-MM-dd', new Date()) : date;
    if (!isValid(dateObj)) {
        const today = new Date();
        return format(today, 'yyyy-MM-dd');
    }
    return format(dateObj, 'yyyy-MM-dd');
};

const initialFormData: SharedTransactionFormData = { 
    date: formatDateForInput(new Date()),
    description: '',
    amount: 0,
    modeOfPayment: 'Bank', 
    frequency: undefined, 
    variability: undefined, 
    categoryName: null, 
};

export default function TransactionsPage() {
  const { 
    transactions, 
    addTransaction, 
    deleteTransaction,
    batchUpdateTransactions, // Keep this store action
    deleteSelectedTransactions, // Keep this store action
  } = useTransactionsStore(); 
  const allBudgetItems = useBudgetStore(state => state.budgetItems);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false); 
  const [isBatchUpdateDialogOpen, setIsBatchUpdateDialogOpen] = useState(false); 
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [addFormData, setAddFormData] = useState<SharedTransactionFormData>(initialFormData); 
  const { toast } = useToast();

  // TanStack Table state
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const columns = React.useMemo(() => getColumns(handleEditClick, handleDeleteClick), []);

  const table = useReactTable({
    data: transactions,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      globalFilter,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const getSelectedTransactionIdsFromTable = (): string[] => {
    return table.getSelectedRowModel().rows.map(row => row.original.id);
  };

  const handleEditClick = (transaction: TransactionWithId) => {
    setEditingTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (transaction: TransactionWithId) => {
    setTransactionToDelete(transaction);
  };

  const budgetItemsForSelectedMonth = useMemo(() => {
    if (!addFormData.date) return [];
    try {
        const transactionDate = parse(addFormData.date, 'yyyy-MM-dd', new Date());
        if (!isValid(transactionDate)) return [];
        const periodKey = format(transactionDate, 'yyyy-MM');
        return allBudgetItems.filter(item => 
            item.period === periodKey && 
            item.category !== 'income' &&
            item.description && item.description.trim() !== '' 
        ); 
    } catch(e) {
        return [];
    }
  }, [addFormData.date, allBudgetItems]);

  useEffect(() => {
    if (!isAddDialogOpen) {
        setAddFormData(initialFormData);
    }
  }, [isAddDialogOpen]);

  useEffect(() => {
      if (!isEditDialogOpen) {
          setEditingTransaction(null);
      }
  }, [isEditDialogOpen]);

  const handleAddTransactionSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const { date, description, amount, modeOfPayment, frequency, variability, categoryName } = addFormData;

    if (!date || !description || amount === undefined || amount === null || !modeOfPayment) { 
      toast({ title: 'Missing Information', description: 'Please fill out required fields (Date, Desc, Amount, Mode).', variant: 'destructive' });
      return;
    }
    
    const processedCategoryName = categoryName === NONE_CATEGORY_VALUE ? null : categoryName;

    addTransaction({
      date: parse(date, 'yyyy-MM-dd', new Date()), 
      description: description,
      amount: amount,
      modeOfPayment: modeOfPayment as ModeOfPayment,
      frequency: frequency || undefined,
      variability: variability || undefined,
      categoryName: processedCategoryName, 
    });

    setIsAddDialogOpen(false);
    toast({ title: 'Transaction Added', description: 'Successfully added.' });
  };

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null);
    toast({ title: 'Transaction Deleted', description: 'Successfully removed.' });
  };

  const handleAddInputChange = (event: ChangeEvent<HTMLInputElement>) => { 
    const { name, value, type } = event.target;
    setAddFormData(prev => ({ 
        ...prev, 
        [name]: type === 'number' ? (value === '' ? 0 : parseFloat(value)) : value 
    }));
  };

  const handleAddSelectChange = (name: string, value: string) => { 
     setAddFormData(prev => ({ ...prev, [name]: value }));
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
  
  const handleDeleteSelectedClick = () => {
    const idsToDelete = getSelectedTransactionIdsFromTable();
    if (idsToDelete.length === 0) {
        toast({ title: "No Selection", description: "Please select transactions to delete.", variant: "default" });
        return;
    }
    deleteSelectedTransactions(idsToDelete); // Call store action
    table.resetRowSelection(); 
    toast({ title: "Transactions Deleted", description: `${idsToDelete.length} transaction(s) deleted successfully.` });
  };

  const handleBatchUpdateClick = () => {
    const idsToUpdate = getSelectedTransactionIdsFromTable();
    if (idsToUpdate.length === 0) {
      toast({ title: "No Selection", description: "Please select transactions to update.", variant: "default" });
      return;
    }
    setIsBatchUpdateDialogOpen(true); 
  };
  
  const clearTableSelection = () => {
      table.resetRowSelection();
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
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
                  <Input id="add-date" name="date" type="date" value={addFormData.date} onChange={handleAddInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-description" className="text-right col-span-1">Description</Label>
                  <Input id="add-description" name="description" value={addFormData.description} onChange={handleAddInputChange} className="col-span-3" placeholder="e.g., Coffee" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-amount" className="text-right col-span-1">Amount (KES)</Label>
                  <Input id="add-amount" name="amount" type="number" step="0.01" value={addFormData.amount.toString()} onChange={handleAddInputChange} className="col-span-3" placeholder="e.g., -550 or 10000" required />
                </div>
                 <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-modeOfPayment" className="text-right col-span-1">Payment Mode</Label>
                  <Select name="modeOfPayment" value={addFormData.modeOfPayment} onValueChange={(value) => handleAddSelectChange('modeOfPayment', value)} required>
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
                  <Select name="categoryName" value={addFormData.categoryName || NONE_CATEGORY_VALUE} onValueChange={(value) => handleAddSelectChange('categoryName', value)}>
                    <SelectTrigger id="add-categoryName" className="col-span-3">
                      <SelectValue placeholder="Optional: Link to budget item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_CATEGORY_VALUE}>None</SelectItem>
                      {budgetItemsForSelectedMonth.length > 0 ? (
                        budgetItemsForSelectedMonth.map(item => (
                          item.description && item.description.trim() !== '' && (
                            <SelectItem key={item.id} value={item.description}>
                              {item.description} ({item.category})
                            </SelectItem>
                          )
                        ))
                      ) : (
                        <SelectItem value={NO_ITEMS_PLACEHOLDER_VALUE} disabled>No budget items for selected month</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-frequency" className="text-right col-span-1">Frequency</Label>
                   <Select name="frequency" value={addFormData.frequency || ''} onValueChange={(value) => handleAddSelectChange('frequency', value)}>
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
                   <Select name="variability" value={addFormData.variability || ''} onValueChange={(value) => handleAddSelectChange('variability', value)}>
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
       {getSelectedTransactionIdsFromTable().length > 0 && (
        <div className="mb-4 p-3 border rounded-md bg-accent/10 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{getSelectedTransactionIdsFromTable().length} transaction(s) selected.</p>
            <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleBatchUpdateClick}>
                    <Edit className="mr-1 h-3 w-3" /> Batch Update
                </Button>
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                            <Trash2 className="mr-1 h-3 w-3" /> Delete Selected
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete Selected Transactions?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete {getSelectedTransactionIdsFromTable().length} selected transaction(s)? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteSelectedClick}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                 </AlertDialog>
                <Button size="sm" variant="ghost" onClick={clearTableSelection} className="text-muted-foreground">
                    <XSquare className="mr-1 h-3 w-3"/> Clear Selection
                </Button>
            </div>
        </div>
       )}

      <main className="flex-1">
        <Card>
            <CardHeader className="p-4 md:p-6">
                <CardTitle className="text-lg">Transaction History</CardTitle>
                <CardDescription>Your recent financial activities.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
                 <DataTable
                    columns={columns}
                    data={transactions}
                    searchColumn="description"
                    searchPlaceholder="Search descriptions..."
                    table={table} // Pass the table instance
                />
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
       {isBatchUpdateDialogOpen && (
         <BatchUpdateTransactionDialog
            isOpen={isBatchUpdateDialogOpen}
            onClose={() => setIsBatchUpdateDialogOpen(false)}
            transactionIds={getSelectedTransactionIdsFromTable()}
            allBudgetItems={allBudgetItems}
            onComplete={() => table.resetRowSelection()}
         />
       )}

      <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
        {transactionToDelete && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the transaction: <br/>
                <strong>{format(transactionToDelete.date, 'PP')} - {transactionToDelete.description} ({formatCurrency(transactionToDelete.amount)})</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteTransaction}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
