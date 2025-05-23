
// src/app/(dashboard)/transactions/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, FileUp, FileDown, Edit3, XCircle, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTrigger as ShadAlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore } from '@/store/budgetStore';
import type { TransactionWithId } from '@/lib/types';
import EditTransactionDialog from './EditTransactionDialog';
import BatchUpdateTransactionDialog from './BatchUpdateTransactionDialog';
import { DataTable } from '@/components/ui/data-table';
import { getColumns } from './columns';
import Papa from 'papaparse';

// Helper to format Date to YYYY-MM-DD for input[type=date]
const formatDateForInput = (date: Date | string): string => {
  if (date instanceof Date) {
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return new Date(0).toISOString().split('T')[0]; // Return epoch if invalid
    }
    return date.toISOString().split('T')[0];
  }
  try {
    const parsedDate = new Date(date);
    // Check if parsedDate is valid
    if (isNaN(parsedDate.getTime())) {
      return new Date(0).toISOString().split('T')[0]; // Return epoch if invalid
    }
    return parsedDate.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0]; // Fallback to current date on parsing error
  }
};


export default function TransactionsPage() {
  const { transactions, addTransaction, updateTransaction, deleteTransaction, importTransactionsBatch, deleteSelectedTransactions, batchUpdateTransactions } = useTransactionsStore();
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const { toast } = useToast();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [isBatchUpdateDialogOpen, setIsBatchUpdateDialogOpen] = useState(false);
  const [isMassDeleteDialogOpen, setIsMassDeleteDialogOpen] = useState(false);

  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const handleAddClick = () => {
    setEditingTransaction(null); // Ensure we are in "add" mode
    setIsFormSheetOpen(true);
  };

  const handleEditClick = useCallback((transaction: TransactionWithId) => {
    setEditingTransaction(transaction);
    setIsFormSheetOpen(true);
  }, []);

  const handleDeleteClick = useCallback((transaction: TransactionWithId) => {
    setTransactionToDelete(transaction);
  }, []);
  
  const handleFormSheetClose = () => {
    setIsFormSheetOpen(false);
    setEditingTransaction(null);
  };

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null); // Close the dialog by clearing the state
    toast({ title: 'Transaction Deleted', description: 'Successfully removed transaction.' });
  };

  const selectedTransactionIds = useMemo(() => {
    // Ensure rowSelection is an object before trying to get its keys
    if (typeof rowSelection !== 'object' || rowSelection === null) {
      return [];
    }
    return Object.keys(rowSelection).filter(key => rowSelection[key]);
  }, [rowSelection]);

  const handleBatchUpdateClick = () => {
    if (selectedTransactionIds.length === 0) {
      toast({ title: 'No Selection', description: 'Please select transactions to update.', variant: 'default' });
      return;
    }
    setIsBatchUpdateDialogOpen(true);
  };

  const handleMassDeleteClick = () => {
     if (selectedTransactionIds.length === 0) {
       toast({ title: 'No Selection', description: 'Please select transactions to delete.', variant: 'default' });
       return;
     }
     setIsMassDeleteDialogOpen(true);
  };

  const confirmMassDelete = () => {
    if (selectedTransactionIds.length > 0) {
      deleteSelectedTransactions(selectedTransactionIds);
      toast({ title: 'Batch Delete Successful', description: `${selectedTransactionIds.length} transaction(s) deleted.` });
      setRowSelection({}); // Clear selection
    }
    setIsMassDeleteDialogOpen(false);
  };


  const columns = React.useMemo(() => getColumns(handleEditClick, handleDeleteClick), [handleEditClick, handleDeleteClick]);

  const table = useReactTable({
    data: transactions,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleExportCsv = useCallback(() => {
    if (transactions.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    // Exclude 'id' for export, format date
    const dataToExport = transactions.map(({ id, date, ...rest }) => ({
      date: formatDateForInput(date),
      ...rest,
      // Ensure frequency and variability are strings or empty, not null/undefined for CSV
      frequency: rest.frequency || '',
      variability: rest.variability || '',
      categoryName: rest.categoryName || '',
    }));

    const csv = Papa.unparse(dataToExport, {
        header: true,
        columns: ['date', 'description', 'amount', 'modeOfPayment', 'frequency', 'variability', 'categoryName'] // Specify exact column order
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'transactions_export.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "CSV Exported", description: "Transactions exported successfully." });
  }, [transactions, toast]);


  return (
    <div className="flex flex-col min-h-screen py-4 md:py-6 lg:py-8"> {/* Root div has no horizontal padding */}
      <header className="mb-6 px-2 md:px-3 lg:px-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"> {/* Reduced horizontal padding */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ReceiptText className="h-6 w-6 text-primary"/> Transactions
          </h1>
          <p className="text-muted-foreground">Manage your financial transactions.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleAddClick}><PlusCircle className="mr-2 h-4 w-4" /> Add Transaction</Button>
          <Button asChild variant="default"><Link href="/transactions/import"><FileUp className="mr-2 h-4 w-4" /> Import CSV</Link></Button>
          <Button variant="secondary" onClick={handleExportCsv} disabled={transactions.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
        </div>
      </header>
      
      <main className="flex-1 px-2 md:px-3 lg:px-4"> {/* Reduced horizontal padding */}
        <Card className="shadow-sm">
          <CardHeader className="p-4 md:p-6"> {/* Adjusted card header padding */}
            <CardTitle>Transaction List</CardTitle>
            <CardDescription>View, edit, and manage your transactions.</CardDescription>
             {selectedTransactionIds.length > 0 && (
                <div className="mt-4 flex gap-2 items-center border-t pt-4">
                    <span className="text-sm text-muted-foreground">{selectedTransactionIds.length} selected</span>
                    <Button size="sm" variant="outline" onClick={handleBatchUpdateClick}>
                        <Edit3 className="mr-2 h-4 w-4" /> Batch Update
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleMassDeleteClick}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
                        <XCircle className="mr-2 h-4 w-4" /> Clear Selection
                    </Button>
                </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="py-4 md:py-6 px-2 md:px-3 lg:px-4"> {/* Reduced horizontal padding around DataTable */}
                <DataTable
                  columns={columns}
                  data={transactions} 
                  table={table}
                  searchColumn="description"
                  searchPlaceholder="Search descriptions..."
                />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>

      {editingTransaction && (
        <EditTransactionDialog
          isOpen={isFormSheetOpen}
          onClose={handleFormSheetClose}
          transaction={editingTransaction}
          allBudgetItems={allBudgetItems}
        />
      )}
      {!editingTransaction && isFormSheetOpen && (
         <EditTransactionDialog
          isOpen={isFormSheetOpen}
          onClose={handleFormSheetClose}
          transaction={null} // Pass null for adding new transaction
          allBudgetItems={allBudgetItems}
        />
      )}


      <BatchUpdateTransactionDialog
        isOpen={isBatchUpdateDialogOpen}
        onClose={() => {
            setIsBatchUpdateDialogOpen(false);
            setRowSelection({}); 
        }}
        transactionIds={selectedTransactionIds}
        allBudgetItems={allBudgetItems}
        onComplete={() => setRowSelection({})} 
      />

      <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
        {transactionToDelete && (
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the transaction: <br />
                <strong>{transactionToDelete.description} ({transactionToDelete.amount})</strong>
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteTransaction}>Delete</AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        )}
      </AlertDialog>

      <AlertDialog open={isMassDeleteDialogOpen} onOpenChange={setIsMassDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedTransactionIds.length} selected transaction(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMassDelete}>Delete Selected</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
