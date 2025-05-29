
// src/app/(dashboard)/transactions/page.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore } from '@/store/budgetStore';
import type { TransactionWithId, BudgetItem } from '@/lib/types';
import EditTransactionDialog from './EditTransactionDialog';
import BatchUpdateTransactionDialog from './BatchUpdateTransactionDialog';
import { DataTable } from '@/components/ui/data-table';
import { getColumns } from './columns';
import Papa from 'papaparse';
import { format, parse, isValid as isDateValid } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReceiptText, PlusCircle, FileUp, FileDown, Edit3, XCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';


// Helper to format Date to YYYY-MM-DD for input[type=date]
const formatDateForInput = (date: Date | string | undefined | null): string => {
  if (date instanceof Date) {
    if (isDateValid(date)) {
      return format(date, 'yyyy-MM-dd');
    }
    return format(new Date(0), 'yyyy-MM-dd'); 
  }
  if (typeof date === 'string') {
    let parsedDate = new Date(date); 
    if (isDateValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
    }
    // Attempt to parse if it's already in yyyy-MM-dd
    parsedDate = parse(date, 'yyyy-MM-dd', new Date());
    if (isDateValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
    }
    return format(new Date(0), 'yyyy-MM-dd');
  }
  return format(new Date(0), 'yyyy-MM-dd'); 
};


export default function TransactionsPage() {
  const { transactions, deleteTransaction, deleteSelectedTransactions, batchUpdateTransactions } = useTransactionsStore();
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const { toast } = useToast();

  const [isEditTransactionDialogOpen, setIsEditTransactionDialogOpen] = useState(false);
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
    setEditingTransaction(null); 
    setIsEditTransactionDialogOpen(true);
  };

  const handleEditClick = useCallback((transaction: TransactionWithId) => {
    setEditingTransaction(transaction);
    setIsEditTransactionDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((transaction: TransactionWithId) => {
    setTransactionToDelete(transaction);
  }, []);
  
  const handleEditTransactionDialogClose = () => {
    setIsEditTransactionDialogOpen(false);
    setEditingTransaction(null);
  };

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null); 
    toast({ title: 'Transaction Deleted', description: 'Successfully removed transaction.' });
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

  const selectedTransactionIds = useMemo(() => {
    if (typeof rowSelection !== 'object' || rowSelection === null || !table) {
      return [];
    }
    return table.getSelectedRowModel().rows.map(row => row.original.id);
  }, [rowSelection, table]);

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


  const handleExportCsv = useCallback(() => {
    if (transactions.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    
    const dataToExport = transactions.map(({ id, date, ...rest }) => ({
      date: formatDateForInput(date),
      ...rest,
      frequency: rest.frequency || '',
      variability: rest.variability || '',
      categoryName: rest.categoryName || '',
    }));

    const csv = Papa.unparse(dataToExport, {
        header: true,
        columns: ['date', 'description', 'amount', 'modeOfPayment', 'frequency', 'variability', 'categoryName'] 
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
    <div className="flex flex-col min-h-screen py-4 md:py-6">
       <PageHeader
          title="Transactions"
          description="Manage your financial transactions."
          icon={<ReceiptText className="h-6 w-6" />}
        >
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleAddClick}><PlusCircle className="mr-2 h-4 w-4" /> Add Transaction</Button>
            <Button asChild variant="default"><Link href="/transactions/import"><FileUp className="mr-2 h-4 w-4" /> Import CSV</Link></Button>
            <Button variant="secondary" onClick={handleExportCsv} disabled={transactions.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
          </div>
        </PageHeader>
      
      <main className="flex-1 px-4 md:px-6 lg:px-8">
        <Card className="shadow-sm">
           <CardHeader className="p-4 md:p-6 border-b">
            <CardTitle>Transaction List</CardTitle>
            <CardDescription>View, edit, and manage your transactions.</CardDescription>
             {selectedTransactionIds.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center border-t pt-4">
                    <span className="text-sm text-muted-foreground mb-2 sm:mb-0">{selectedTransactionIds.length} selected</span>
                    <div className="flex flex-wrap gap-2">
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
                </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
              <div className="py-4 md:py-6 px-4 md:px-6 lg:px-8">
                <DataTable
                  columns={columns}
                  data={transactions} 
                  table={table}
                  searchColumn="description"
                  searchPlaceholder="Search descriptions..."
                />
              </div>
          </CardContent>
        </Card>
      </main>

      {(editingTransaction || (isEditTransactionDialogOpen && !editingTransaction)) && (
        <EditTransactionDialog
          isOpen={isEditTransactionDialogOpen}
          onClose={handleEditTransactionDialogClose}
          transaction={editingTransaction!} 
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
                <strong>{transactionToDelete.description} ({formatCurrency(transactionToDelete.amount)})</strong>
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
