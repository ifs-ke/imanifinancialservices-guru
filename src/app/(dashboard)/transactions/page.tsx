// src/app/(dashboard)/transactions/page.tsx
'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore } from '@/store/budgetStore';
import type { TransactionWithId, BudgetItem } from '@/lib/types';
import EditTransactionDialog from './EditTransactionDialog';
import BatchUpdateTransactionDialog from './BatchUpdateTransactionDialog';
import { DataTable } from '@/components/ui/data-table';
import { getColumns } from './columns';
import Papa from 'papaparse';
import { format, parse, isValid as isDateValid, startOfMonth, endOfMonth } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReceiptText, PlusCircle, FileUp, FileDown, Edit3, XCircle, Trash2, TrendingUp, TrendingDown, Scale, Calendar as CalendarIcon } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';
import { useStatementStore } from '@/store/statementStore';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";


// Helper for the date picker display
const formatDateForPicker = (date: Date | undefined) => {
    if (!date || !isDateValid(date)) return <span>Pick a date</span>;
    return format(date, "LLL dd, y");
};

// Helper to ensure date is valid before formatting
const ensureValidDate = (date: Date | string): Date => {
    const d = date instanceof Date ? date : new Date(date);
    return isDateValid(d) ? d : new Date();
};


export default function TransactionsPage() {
  const { transactions, deleteTransaction, deleteSelectedTransactions, batchUpdateTransactions } = useTransactionsStore();
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const { toast } = useToast();

  const {
      startDate,
      endDate,
      setStartDate,
      setEndDate,
      isHydrated,
  } = useStatementStore();


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

  // Effect to set default dates on initial load if they aren't already set
  useEffect(() => {
    if (isHydrated) {
        if (!startDate) {
            setStartDate(startOfMonth(new Date()));
        }
        if (!endDate) {
            setEndDate(endOfMonth(new Date()));
        }
    }
  }, [isHydrated, startDate, endDate, setStartDate, setEndDate]);

  // Filter transactions based on the selected date range
  const filteredTransactions = useMemo(() => {
      if (!startDate || !endDate || !isHydrated) {
          return [];
      }
      const start = startDate.getTime();
      const end = new Date(endDate).setHours(23, 59, 59, 999);

      return transactions.filter(tx => {
          const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
          if (!isDateValid(txDate)) return false;
          const txTime = txDate.getTime();
          return txTime >= start && txTime <= end;
      });
  }, [transactions, startDate, endDate, isHydrated]);


  const metrics = useMemo(() => {
    const totalIncome = filteredTransactions // Use filtered transactions
      .filter((tx) => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalExpenses = filteredTransactions // Use filtered transactions
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + tx.amount, 0); // Keep it negative

    const netFlow = totalIncome + totalExpenses;

    return {
      totalIncome,
      totalExpenses: Math.abs(totalExpenses), // Make positive for display
      netFlow,
    };
  }, [filteredTransactions]); // Depend on filteredTransactions

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
    data: filteredTransactions, // Use filtered data for the table
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    autoResetPageIndex: false,
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
    const dataToExport = filteredTransactions.length > 0 ? filteredTransactions : transactions;
    if (dataToExport.length === 0) {
      toast({ title: "No data to export" });
      return;
    }

    const csvRows = dataToExport.map(({ id, date, ...rest }) => ({
      date: format(ensureValidDate(date), 'yyyy-MM-dd'),
      ...rest,
      frequency: rest.frequency || '',
      variability: rest.variability || '',
      categoryName: rest.categoryName || '',
    }));

    const csv = Papa.unparse(csvRows, {
        header: true,
        columns: ['date', 'description', 'amount', 'modeOfPayment', 'frequency', 'variability', 'categoryName']
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = filteredTransactions.length > 0 && startDate && endDate
        ? `transactions_export_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.csv`
        : 'transactions_export_all.csv';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "CSV Exported", description: `${filteredTransactions.length > 0 ? 'Filtered transactions' : 'All transactions'} exported successfully.` });
  }, [filteredTransactions, transactions, toast, startDate, endDate]);


  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
       <PageHeader
          title="Transactions"
          description="View and manage your financial transactions. Use the date filter to narrow your view."
          icon={ReceiptText}
        >
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleAddClick}><PlusCircle className="mr-2 h-4 w-4" /> Add Transaction</Button>
            <Button asChild variant="default"><Link href="/transactions/import"><FileUp className="mr-2 h-4 w-4" /> Import CSV</Link></Button>
            <Button variant="secondary" onClick={handleExportCsv} disabled={transactions.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
          </div>
        </PageHeader>
        
        {/* Date Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-2 text-sm mb-6 px-4 md:px-6 lg:px-8">
          <Label className="font-semibold shrink-0">Filter Period:</Label>
           <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn("w-full sm:w-auto justify-start text-left font-normal h-9 min-w-[150px]", !startDate && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDateForPicker(startDate)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(date) => {
                            setStartDate(date);
                            if (endDate && date && date > endDate) setEndDate(date);
                        }}
                        initialFocus
                    />
                </PopoverContent>
           </Popover>
           <span className="text-muted-foreground hidden sm:inline">-</span>
           <Popover>
                <PopoverTrigger asChild>
                     <Button
                        variant={"outline"}
                        className={cn("w-full sm:w-auto justify-start text-left font-normal h-9 min-w-[150px] mt-2 sm:mt-0", !endDate && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDateForPicker(endDate)}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={(date) => {
                            setEndDate(date);
                            if (startDate && date && date < startDate) setStartDate(date);
                        }}
                        disabled={(date) => startDate ? date < startDate : false}
                        initialFocus
                    />
                </PopoverContent>
           </Popover>
        </div>

        <section className="mb-6 px-4 md:px-6 lg:px-8 grid gap-4 md:grid-cols-3">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-sm font-medium">Income (Period)</CardTitle>
                <TrendingUp className="h-4 w-4 text-accent" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold text-accent">{formatCurrency(metrics.totalIncome)}</div>
                <p className="text-xs text-muted-foreground">For selected date range</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-sm font-medium">Expenses (Period)</CardTitle>
                <TrendingDown className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold text-destructive">{formatCurrency(metrics.totalExpenses)}</div>
                <p className="text-xs text-muted-foreground">For selected date range</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-sm font-medium">Net Flow (Period)</CardTitle>
                <Scale className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className={cn("text-2xl font-bold", metrics.netFlow >= 0 ? 'text-accent' : 'text-destructive')}>
                  {formatCurrency(metrics.netFlow)}
                </div>
                <p className="text-xs text-muted-foreground">Income - Expenses</p>
              </CardContent>
            </Card>
        </section>

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
          <CardContent className="p-4 md:p-6">
            <DataTable
              columns={columns}
              data={filteredTransactions}
              table={table}
              searchColumn="description"
              searchPlaceholder="Search descriptions..."
            />
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
