// src/app/(dashboard)/transactions/page.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
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
import { 
  Plus, 
  FileUp, 
  FileDown, 
  Search, 
  SlidersHorizontal, 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Trash2, 
  Edit3, 
  X, 
  Calendar as CalendarIcon, 
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore } from '@/store/budgetStore';
import type { TransactionWithId } from '@/lib/types';
import EditTransactionDialog from './EditTransactionDialog';
import BatchUpdateTransactionDialog from './BatchUpdateTransactionDialog';
import { getColumns } from './columns';
import Papa from 'papaparse';
import { 
  format, 
  subMonths, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  startOfDay, 
  endOfDay, 
  isWithinInterval, 
  parseISO,
  isValid 
} from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, cn } from '@/lib/utils';

export type TransactionDatePreset = 'this-month' | 'last-month' | 'last-30' | 'last-90' | 'ytd' | 'all' | 'custom';
export type TransactionTypeFilter = 'all' | 'income' | 'expense';
export type TransactionClassificationFilter = 'all' | 'recurring' | 'one-off' | 'fixed' | 'variable';

const COLUMN_LABELS: Record<string, string> = {
  date: 'Date',
  description: 'Description',
  modeOfPayment: 'Payment mode',
  recurrence: 'Classification',
  categoryName: 'Category',
  amount: 'Amount',
};

export default function TransactionsPage() {
  const { transactions, deleteTransaction, deleteSelectedTransactions } = useTransactionsStore();
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const { toast } = useToast();

  // Dialog states
  const [isEditTransactionDialogOpen, setIsEditTransactionDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithId | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<TransactionWithId | null>(null);
  const [isBatchUpdateDialogOpen, setIsBatchUpdateDialogOpen] = useState(false);
  const [isMassDeleteDialogOpen, setIsMassDeleteDialogOpen] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [classificationFilter, setClassificationFilter] = useState<TransactionClassificationFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<TransactionDatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Compute active date boundaries
  const { dateRange, dateLabel } = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = endOfDay(now);
    let label = 'This month';

    switch (datePreset) {
      case 'this-month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = 'This month';
        break;
      case 'last-month': {
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        label = 'Last month';
        break;
      }
      case 'last-30':
        start = startOfDay(subDays(now, 30));
        end = endOfDay(now);
        label = 'Last 30 days';
        break;
      case 'last-90':
        start = startOfDay(subDays(now, 90));
        end = endOfDay(now);
        label = 'Last 90 days';
        break;
      case 'ytd':
        start = startOfYear(now);
        end = endOfDay(now);
        label = 'YTD';
        break;
      case 'all':
        start = new Date(2000, 0, 1);
        end = new Date(2100, 0, 1);
        label = 'All time';
        break;
      case 'custom': {
        const parsedStart = parseISO(customStartDate);
        const parsedEnd = parseISO(customEndDate);
        start = isValid(parsedStart) ? startOfDay(parsedStart) : startOfMonth(now);
        end = isValid(parsedEnd) ? endOfDay(parsedEnd) : endOfMonth(now);
        label = 'Custom range';
        break;
      }
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        label = 'This month';
    }

    return { dateRange: { start, end }, dateLabel: label };
  }, [datePreset, customStartDate, customEndDate]);

  // Unique categories list for filter dropdown
  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    transactions.forEach(tx => {
      if (tx.categoryName) categories.add(tx.categoryName);
    });
    return Array.from(categories).sort();
  }, [transactions]);

  // Filtered transactions matching all active filter criteria
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // 1. Date filter
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (!isValid(txDate)) return false;
      if (!isWithinInterval(txDate, { start: dateRange.start, end: dateRange.end })) {
        return false;
      }

      // 2. Type filter
      if (typeFilter === 'income' && tx.amount <= 0) return false;
      if (typeFilter === 'expense' && tx.amount >= 0) return false;

      // 3. Classification filter
      if (classificationFilter === 'recurring' && tx.frequency !== 'recurring') return false;
      if (classificationFilter === 'one-off' && tx.frequency !== 'one-off') return false;
      if (classificationFilter === 'fixed' && tx.variability !== 'fixed') return false;
      if (classificationFilter === 'variable' && tx.variability !== 'variable') return false;

      // 4. Category filter
      if (categoryFilter !== 'all') {
        if (tx.categoryName !== categoryFilter) return false;
      }

      // 5. Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const descMatch = (tx.description || '').toLowerCase().includes(query);
        const categoryMatch = (tx.categoryName || '').toLowerCase().includes(query);
        const modeMatch = (tx.modeOfPayment || '').toLowerCase().includes(query);
        const amountMatch = tx.amount.toString().includes(query);
        if (!descMatch && !categoryMatch && !modeMatch && !amountMatch) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, dateRange, typeFilter, classificationFilter, categoryFilter, searchQuery]);

  // Metric aggregates for current filtered set
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    filteredTransactions.forEach(tx => {
      if (tx.amount > 0) {
        totalIncome += tx.amount;
        incomeCount++;
      } else if (tx.amount < 0) {
        totalExpenses += Math.abs(tx.amount);
        expenseCount++;
      }
    });

    const netFlow = totalIncome - totalExpenses;
    const percentageCashflow = totalIncome > 0 
      ? (netFlow / totalIncome) * 100 
      : (totalExpenses > 0 ? -100 : 0);

    return {
      totalIncome,
      totalExpenses,
      netFlow,
      percentageCashflow,
      incomeCount,
      expenseCount,
      totalCount: filteredTransactions.length,
    };
  }, [filteredTransactions]);

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

  const confirmDeleteTransaction = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null);
    toast({ title: 'Transaction deleted', description: 'Record removed successfully.' });
  };

  const columns = useMemo(() => getColumns(handleEditClick, handleDeleteClick), [handleEditClick, handleDeleteClick]);

  const table = useReactTable({
    data: filteredTransactions,
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
    initialState: {
      pagination: {
        pageSize: 15,
      },
    },
  });

  const selectedTransactionIds = useMemo(() => {
    if (typeof rowSelection !== 'object' || rowSelection === null || !table) {
      return [];
    }
    return table.getSelectedRowModel().rows.map(row => row.original.id);
  }, [rowSelection, table]);

  const handleBatchUpdateClick = () => {
    if (selectedTransactionIds.length === 0) return;
    setIsBatchUpdateDialogOpen(true);
  };

  const handleMassDeleteClick = () => {
    if (selectedTransactionIds.length === 0) return;
    setIsMassDeleteDialogOpen(true);
  };

  const confirmMassDelete = () => {
    if (selectedTransactionIds.length > 0) {
      deleteSelectedTransactions(selectedTransactionIds);
      toast({ 
        title: 'Batch delete successful', 
        description: `${selectedTransactionIds.length} transactions removed.` 
      });
      setRowSelection({});
    }
    setIsMassDeleteDialogOpen(false);
  };

  const handleExportCsv = useCallback(() => {
    const dataToExport = filteredTransactions.length > 0 ? filteredTransactions : transactions;
    if (dataToExport.length === 0) {
      toast({ title: 'No data to export', description: 'There are no transactions in the current view.' });
      return;
    }

    const csvRows = dataToExport.map(({ id, date, ...rest }) => {
      const validDate = date instanceof Date ? date : new Date(date);
      return {
        date: isValid(validDate) ? format(validDate, 'yyyy-MM-dd') : '',
        ...rest,
        frequency: rest.frequency || '',
        variability: rest.variability || '',
        categoryName: rest.categoryName || '',
      };
    });

    const csv = Papa.unparse(csvRows, {
      header: true,
      columns: ['date', 'description', 'amount', 'modeOfPayment', 'frequency', 'variability', 'categoryName'],
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ 
      title: 'CSV exported', 
      description: `${dataToExport.length} transactions downloaded.` 
    });
  }, [filteredTransactions, transactions, toast]);

  const hasActiveFilters = searchQuery !== '' || typeFilter !== 'all' || classificationFilter !== 'all' || categoryFilter !== 'all' || datePreset !== 'all';

  const resetAllFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setClassificationFilter('all');
    setCategoryFilter('all');
    setDatePreset('all');
  };

  return (
    <div className="flex flex-col w-full min-h-screen p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header section with actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Transactions
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Search, filter, and manage your financial records.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="h-9 gap-1.5 text-xs font-medium cursor-pointer">
            <FileDown className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium">
            <Link href="/transactions/import">
              <FileUp className="h-3.5 w-3.5" />
              <span>Import CSV</span>
            </Link>
          </Button>

          <Button size="sm" onClick={handleAddClick} className="h-9 gap-1.5 text-xs font-medium shadow-xs cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
            <span>Add transaction</span>
          </Button>
        </div>
      </div>

      {/* Summary strip cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border/60 shadow-xs bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Total income ({dateLabel.toLowerCase()})
              </div>
              <div className="text-xl md:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                +{formatCurrency(metrics.totalIncome)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {metrics.incomeCount} incoming records
              </div>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60 shadow-xs bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Total expenses ({dateLabel.toLowerCase()})
              </div>
              <div className="text-xl md:text-2xl font-bold font-mono text-destructive">
                -{formatCurrency(metrics.totalExpenses)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {metrics.expenseCount} outgoing records
              </div>
            </div>
            <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
              <TrendingDown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/60 shadow-xs bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Net cash flow ({dateLabel.toLowerCase()})
              </div>
              <div className={cn(
                "text-xl md:text-2xl font-bold font-mono",
                metrics.netFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}>
                {metrics.netFlow >= 0 ? `+${formatCurrency(metrics.netFlow)}` : `-${formatCurrency(Math.abs(metrics.netFlow))}`}
              </div>
              <div className={cn(
                "text-[11px] font-medium font-mono",
                metrics.netFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}>
                {metrics.percentageCashflow >= 0 ? `+${metrics.percentageCashflow.toFixed(1)}%` : `${metrics.percentageCashflow.toFixed(1)}%`} cash flow margin
              </div>
            </div>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Scale className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main card with interactive filter toolbar & data table */}
      <Card className="border border-border/60 shadow-xs bg-card overflow-hidden">
        {/* Controls and filters toolbar */}
        <div className="p-4 space-y-3 border-b border-border/40">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            
            {/* Search and filters */}
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search descriptions, mode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Type filter */}
              <Select value={typeFilter} onValueChange={(val) => setTypeFilter(val as TransactionTypeFilter)}>
                <SelectTrigger className="h-9 w-[120px] text-xs">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="income">Income only</SelectItem>
                  <SelectItem value="expense">Expenses only</SelectItem>
                </SelectContent>
              </Select>

              {/* Classification filter */}
              <Select value={classificationFilter} onValueChange={(val) => setClassificationFilter(val as TransactionClassificationFilter)}>
                <SelectTrigger className="h-9 w-[145px] text-xs">
                  <SelectValue placeholder="All classifications" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="all">All classifications</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="one-off">One-off</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="variable">Variable</SelectItem>
                </SelectContent>
              </Select>

              {/* Category filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-[145px] text-xs">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent className="text-xs max-h-56">
                  <SelectItem value="all">All categories</SelectItem>
                  {uniqueCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range presets & column selector */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center p-0.5 bg-muted/60 rounded-lg border border-border/50 text-xs">
                <button
                  type="button"
                  onClick={() => setDatePreset('this-month')}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium transition-all cursor-pointer",
                    datePreset === 'this-month' 
                      ? "bg-background text-foreground shadow-xs font-semibold" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  This month
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('last-month')}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium transition-all cursor-pointer",
                    datePreset === 'last-month' 
                      ? "bg-background text-foreground shadow-xs font-semibold" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Last month
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('last-30')}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium transition-all cursor-pointer",
                    datePreset === 'last-30' 
                      ? "bg-background text-foreground shadow-xs font-semibold" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  30 days
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('ytd')}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium transition-all cursor-pointer",
                    datePreset === 'ytd' 
                      ? "bg-background text-foreground shadow-xs font-semibold" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  YTD
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('all')}
                  className={cn(
                    "px-2 py-1 rounded-md font-medium transition-all cursor-pointer",
                    datePreset === 'all' 
                      ? "bg-background text-foreground shadow-xs font-semibold" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>

                {/* Custom date range popover */}
                <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "px-2 py-1 rounded-md font-medium transition-all flex items-center gap-1 cursor-pointer",
                        datePreset === 'custom' 
                          ? "bg-background text-foreground shadow-xs font-semibold" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <CalendarIcon className="h-3 w-3" />
                      <span>{datePreset === 'custom' ? 'Custom' : 'Custom...'}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="end">
                    <div className="space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <span className="font-semibold text-foreground">Select date range</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-1.5 text-[11px] text-muted-foreground"
                          onClick={() => {
                            setDatePreset('this-month');
                            setIsCustomOpen(false);
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Reset
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label htmlFor="custom-start-tx" className="text-[11px] text-muted-foreground">
                            Start date
                          </Label>
                          <Input
                            id="custom-start-tx"
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="custom-end-tx" className="text-[11px] text-muted-foreground">
                            End date
                          </Label>
                          <Input
                            id="custom-end-tx"
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end gap-2 border-t border-border/40">
                        <Button
                          size="sm"
                          className="h-8 text-xs font-medium w-full"
                          onClick={() => {
                            setDatePreset('custom');
                            setIsCustomOpen(false);
                          }}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Apply range
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Toggle columns visibility dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium cursor-pointer">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>View</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 text-xs">
                  <DropdownMenuLabel className="text-xs font-semibold">Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {table
                    .getAllColumns()
                    .filter(column => column.getCanHide())
                    .map(column => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="text-xs cursor-pointer"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {COLUMN_LABELS[column.id] || column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Reset active filters button */}
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetAllFilters} 
                  className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
              )}
            </div>

          </div>

          {/* Bulk selection action toolbar */}
          {selectedTransactionIds.length > 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60 border border-border/60 text-xs animate-in fade-in-50">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-semibold text-xs">
                  {selectedTransactionIds.length} selected
                </Badge>
                <span className="text-muted-foreground hidden sm:inline">
                  Perform actions on selected rows:
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleBatchUpdateClick} className="h-7 text-xs gap-1 cursor-pointer">
                  <Edit3 className="h-3 w-3" /> Batch update
                </Button>
                <Button size="sm" variant="destructive" onClick={handleMassDeleteClick} className="h-7 text-xs gap-1 cursor-pointer">
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRowSelection({})} className="h-7 text-xs cursor-pointer">
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} className="text-xs font-semibold text-muted-foreground">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(row => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className="py-2.5 text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-xs text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Filter className="h-6 w-6 text-muted-foreground/50" />
                      <span>No transactions found matching your criteria.</span>
                      {hasActiveFilters && (
                        <Button variant="outline" size="sm" onClick={resetAllFilters} className="h-7 text-xs mt-1">
                          Reset filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination controls footer */}
        <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              {table.getFilteredSelectedRowModel().rows.length} of{' '}
              {table.getFilteredRowModel().rows.length} row(s) selected
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger className="h-8 w-16 text-xs">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top" className="text-xs">
                  {[10, 15, 25, 50, 100].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-center font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount() || 1}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                className="h-8 w-8 p-0 cursor-pointer"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0 cursor-pointer"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0 cursor-pointer"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0 cursor-pointer"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Add / Edit Transaction Dialog */}
      {(editingTransaction || (isEditTransactionDialogOpen && !editingTransaction)) && (
        <EditTransactionDialog
          isOpen={isEditTransactionDialogOpen}
          onClose={() => {
            setIsEditTransactionDialogOpen(false);
            setEditingTransaction(null);
          }}
          transaction={editingTransaction!}
          allBudgetItems={allBudgetItems}
        />
      )}

      {/* Batch Update Dialog */}
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

      {/* Delete Single Transaction Confirmation Dialog */}
      <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
        {transactionToDelete && (
          <AlertDialogContent className="text-xs">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm">Delete transaction</AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                Are you sure you want to permanently delete this transaction? <br />
                <strong className="text-foreground">{transactionToDelete.description} ({formatCurrency(transactionToDelete.amount)})</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTransactionToDelete(null)} className="h-8 text-xs">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteTransaction} className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      {/* Mass Delete Confirmation Dialog */}
      <AlertDialog open={isMassDeleteDialogOpen} onOpenChange={setIsMassDeleteDialogOpen}>
        <AlertDialogContent className="text-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete selected transactions</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to delete {selectedTransactionIds.length} selected transaction(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMassDelete} className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
