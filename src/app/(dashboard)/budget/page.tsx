// src/app/(dashboard)/budget/page.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // Assuming Button is used
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Edit, PieChart as PieChartIcon, PlusCircle, Trash2, DollarSign, TrendingDown, Target, MinusCircle, Coins, FileUp, FileDown, History, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useBudgetStore, selectCurrentBudgetPeriod, selectBudgetItemsForCurrentPeriod, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import BudgetItemFormSheet from './BudgetItemFormSheet'; 
import * as Papa from 'papaparse';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // Assuming Popover, PopoverContent, PopoverTrigger are used
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, addMonths, subMonths } from 'date-fns';


const budgetCategories: { name: string; key: BudgetItemCategory; icon: React.ElementType }[] = [
    { name: 'Income', key: 'income', icon: DollarSign },
    { name: 'Recurring Expenses', key: 'recurring-expense', icon: TrendingDown },
    { name: 'One-Time Expenses', key: 'one-time-expense', icon: MinusCircle },
    { name: 'Goals', key: 'goal', icon: Target },
    { name: 'Debt Allocation', key: 'debt', icon: Coins },
];

const formatPeriodForDisplay = (period: string): string => {
    try {
        const [year, month] = period.split('-').map(Number);
        if (!year || !month) return "Invalid Period";
        const date = new Date(year, month - 1); 
        return format(date, 'MMMM yyyy');
    } catch {
        return "Invalid Period";
    }
}

const formatToPeriodKey = (date: Date): string => {
    return format(date, 'yyyy-MM');
}

export default function BudgetPage() {
  const { toast } = useToast();
  const budgetPeriod = useBudgetStore(selectCurrentBudgetPeriod);
  const setBudgetPeriod = useBudgetStore(state => state.setBudgetPeriod);
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const { deleteBudgetItem, importBudgetsBatch } = useBudgetStore(); 

  const totalIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalRecurringExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const totalOneTimeExpenses = useBudgetStore(selectTotalOneTimeExpenses);
  const totalGoals = useBudgetStore(selectTotalGoals);
  const totalExpenses = useBudgetStore(selectTotalBudgetedExpenses);
  const totalDebtAllocation = useBudgetStore(selectTotalBudgetedDebt);
  const netBudgeted = useBudgetStore(selectNetBudgeted);

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<BudgetItem | null>(null);
  const [categoryForNewItem, setCategoryForNewItem] = useState<BudgetItemCategory>('recurring-expense');
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());

  useEffect(() => {
      setBudgetPeriod(formatToPeriodKey(selectedMonthDate)); // Moved inside useEffect as per linting
  }, []); 

  const budgetItemsForPeriod = useMemo(() => {
      return allBudgetItems.filter(item => item.period === budgetPeriod);
  }, [allBudgetItems, budgetPeriod]);

  const handleAddClick = (category: BudgetItemCategory) => {
      setCategoryForNewItem(category);
      setEditingItem(null);
      setIsFormSheetOpen(true);
  };

  const handleEditClick = (item: BudgetItem) => {
      setEditingItem(item);
      setIsFormSheetOpen(true);
  };

  const handleFormSheetClose = () => {
      setIsFormSheetOpen(false);
      setEditingItem(null);
  };

  const handleDeleteClick = (item: BudgetItem) => {
      setItemToDelete(item);
  };

  const confirmDeleteItem = () => {
      if (!itemToDelete) return;
      deleteBudgetItem(itemToDelete.id);
      setItemToDelete(null);
      toast({ title: 'Budget Item Deleted', description: 'Successfully removed item.' });
  };

   const handleMonthSelect = (date: Date | undefined) => {
       if (date) {
           const newPeriod = formatToPeriodKey(date);
           setSelectedMonthDate(date); 
           setBudgetPeriod(newPeriod);
       }
   };

    const changeMonth = (direction: 'prev' | 'next') => {
        const newDate = direction === 'prev' ? subMonths(selectedMonthDate, 1) : addMonths(selectedMonthDate, 1);
        handleMonthSelect(newDate);
    };

  const groupedBudgetItems = useMemo(() => {
      const groups: Record<BudgetItemCategory, BudgetItem[]> = {
          income: [], 'recurring-expense': [], 'one-time-expense': [], goal: [], debt: [],
      };
      budgetItemsForPeriod.forEach(item => {
          if (groups[item.category]) {
              groups[item.category].push(item);
          }
      });
      return groups;
  }, [budgetItemsForPeriod]);

   const groupTotals = useMemo(() => {
       const totals: Record<BudgetItemCategory, number> = {
           income: 0, 'recurring-expense': 0, 'one-time-expense': 0, goal: 0, debt: 0,
       };
       Object.entries(groupedBudgetItems).forEach(([category, items]) => {
           totals[category as BudgetItemCategory] = items.reduce((sum, item) => sum + item.amount, 0);
       });
       return totals;
   }, [groupedBudgetItems]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
           toast({ title: 'CSV Parsing Error', description: results.errors.map(error => `Row ${error.row}: ${error.message}`).join('\n'), variant: 'destructive' });
           return;
         }

        const importedItems = results.data as Record<string, string>[];
        let importedCount = 0;
        let errorCount = 0;
        const itemsToAdd: Omit<BudgetItem, 'id' | 'period'>[] = [];
 
        importedItems.forEach((item, index) => {
            const category = item.category?.toLowerCase() as BudgetItemCategory;
            const description = item.description;
            const amountStr = item.amount?.replace(/,/g, '');
            const amount = parseFloat(amountStr);
            
            const isValidCategory = category && ['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt'].includes(category);
            const isValidDescription = description && typeof description === 'string' && description.trim().length > 0;
            const isValidAmount = !isNaN(amount) && amount >= 0;

          if (isValidCategory && isValidDescription && isValidAmount) {
             itemsToAdd.push({ category, description: description.trim(), amount });
           } else {
             errorCount++;
             toast({ title: 'Data Error', description: `Invalid data in CSV row ${index + 2}. Skipping row.`, variant: 'destructive' });
           }
        });

         if (itemsToAdd.length > 0) {
             try {
                 importBudgetsBatch(itemsToAdd); 
                 importedCount = itemsToAdd.length;
             } catch (error) {
                 toast({ title: 'Import Failed', description: 'Could not save imported items.', variant: 'destructive' });
             }
         }

         toast({ title: 'CSV Import Complete', description: `${importedCount} items imported to ${formatPeriodForDisplay(budgetPeriod)}. ${errorCount} rows skipped.` });
        e.target.value = ''; 
      },
       error: (error) => {
         toast({ title: 'CSV Parsing Failed', description: `Could not parse the file: ${error.message}`, variant: 'destructive' });
         e.target.value = '';
       }
    });
  };

  const handleExport = () => {
    if(budgetItemsForPeriod.length === 0) {
        toast({ title: "No Data", description: `Add budget items for ${formatPeriodForDisplay(budgetPeriod)} before exporting.` });
        return;
    }
    const dataToExport = budgetItemsForPeriod.map(({ id, period, ...rest }) => rest); 
    const csvData = Papa.unparse(dataToExport, {
      header: true,
       columns: ['category', 'description', 'amount']
    });

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `budget_${budgetPeriod}.csv`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "CSV Exported", description: `Budget for ${formatPeriodForDisplay(budgetPeriod)} exported.` });
  };

  const triggerFileInput = () => {
    document.getElementById('budget-csv-import')?.click();
  };

  return (
    <div className="flex flex-col min-h-screen w-full py-4 md:py-6 lg:py-8">
      <header className="mb-6 px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <PieChartIcon className="h-6 w-6 text-primary" /> Budget Management
            </h1>
             <p className="text-sm text-muted-foreground">Plan your finances for a specific month.</p>
        </div>
         <div className="flex gap-2 items-center flex-wrap">
             <div className="flex items-center gap-1 border rounded-md px-2 py-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => changeMonth('prev')}><ChevronLeft size={16} /></Button>
                 <Popover>
                     <PopoverTrigger asChild>
                         <Button variant="ghost" className="h-7 px-2 text-sm font-semibold">
                             <CalendarIcon className="mr-2 h-4 w-4" />
                             {formatPeriodForDisplay(budgetPeriod)}
                         </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0">
                         <Calendar
                             mode="single"
                             selected={selectedMonthDate}
                             onSelect={handleMonthSelect}
                             captionLayout="dropdown-buttons"
                             fromYear={2020}
                             toYear={new Date().getFullYear() + 5}
                             initialFocus
                         />
                     </PopoverContent>
                 </Popover>
                 <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => changeMonth('next')}><ChevronRight size={16} /></Button>
             </div>
              <Input type="file" id="budget-csv-import" accept=".csv" onChange={handleImport} className="hidden" />
              <Button onClick={triggerFileInput} variant="outline" size="sm"><FileUp className="mr-2 h-4 w-4" /> Import CSV</Button>
              <Button onClick={handleExport} variant="secondary" size="sm" disabled={budgetItemsForPeriod.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
         </div>
      </header>

      <Card className="mb-6 mx-4 md:mx-6 lg:mx-8 shadow-md">
        <CardHeader className="p-6">
            <CardTitle>Budget Summary for {formatPeriodForDisplay(budgetPeriod)}</CardTitle>
            <CardDescription>Overview of your planned budget for the selected month.</CardDescription>
        </CardHeader>
         <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 text-sm p-6">
             <div className="flex flex-col p-3 rounded-md border bg-accent/10">
                <span className="text-muted-foreground mb-1">Total Income</span>
                <span className="font-bold text-lg font-mono text-accent">{formatCurrency(totalIncome)}</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-destructive/10">
                <span className="text-muted-foreground mb-1">Total Expenses</span>
                 <span className="font-bold text-lg font-mono text-destructive">{formatCurrency(totalExpenses)}</span>
                 <span className="text-xs text-muted-foreground">(Recurring: {formatCurrency(totalRecurringExpenses)}, One-Time: {formatCurrency(totalOneTimeExpenses)})</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-primary/10">
                <span className="text-muted-foreground mb-1">Total Goals</span>
                <span className="font-bold text-lg font-mono text-primary">{formatCurrency(totalGoals)}</span>
            </div>
            <div className="flex flex-col p-3 rounded-md border bg-destructive/5">
                <span className="text-muted-foreground mb-1">Total Debt Allocation</span>
                <span className="font-bold text-lg font-mono text-destructive/80">{formatCurrency(totalDebtAllocation)}</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-muted">
                <span className="text-muted-foreground mb-1">Expected Net</span>
                 <span className={cn("font-bold text-lg font-mono", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>{formatCurrency(netBudgeted)}</span>
                  {netBudgeted !== 0 && (<span className={cn("text-xs mt-1", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>{netBudgeted > 0 ? `${formatCurrency(netBudgeted)} Left Over` : `${formatCurrency(Math.abs(netBudgeted))} Shortfall`}</span>)}
             </div>
         </CardContent>
      </Card>

      <main className="flex-1 grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 px-4 md:px-6 lg:px-8">
         {budgetCategories.map(({ name, key, icon: Icon }) => (
             <Card key={key} className={cn("flex flex-col shadow-sm", key === 'debt' && 'lg:col-span-1 xl:col-span-1')}>
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b p-4">
                     <CardTitle className="text-base font-medium flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{name}</CardTitle>
                     <Button variant="ghost" size="sm" onClick={() => handleAddClick(key)} className="h-7 px-2"><PlusCircle className="mr-1 h-3 w-3" />Add {key === 'debt' ? 'Allocation' : name.replace(/s$/, '')}</Button>
                 </CardHeader>
                  <CardContent className="p-0 flex-grow">
                      <ScrollArea className="h-[350px] w-full">
                         <Table>
                            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm"><TableRow><TableHead className="pl-4 pr-2">Description</TableHead><TableHead className="text-right px-2">Amount (KES)</TableHead><TableHead className="w-[60px] pr-4 pl-2"></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {groupedBudgetItems[key].length > 0 ? (
                                    groupedBudgetItems[key].map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium max-w-[150px] truncate pl-4 pr-2" title={item.description}>{item.description}</TableCell>
                                             <TableCell className="text-right font-mono px-2">{formatCurrency(item.amount)}</TableCell>
                                             <TableCell className="text-right pr-4 pl-2 py-1">
                                                <div className="flex justify-end items-center gap-0.5">
                                                     <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditClick(item)}><Edit className="h-3 w-3" /><span className="sr-only">Edit</span></Button>
                                                     <AlertDialog open={itemToDelete?.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
                                                        <AlertDialogTrigger asChild>
                                                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-6 w-6" onClick={() => handleDeleteClick(item)}>
                                                                  <Trash2 className="h-3 w-3" /><span className="sr-only">Delete</span>
                                                              </Button>
                                                         </AlertDialogTrigger>
                                                         {itemToDelete && itemToDelete.id === item.id && (
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                                    <AlertDialogDescription>Delete: <strong>{itemToDelete.description} ({formatCurrency(itemToDelete.amount)})</strong> for {formatPeriodForDisplay(itemToDelete.period)}?</AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter><AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction></AlertDialogFooter>
                                                            </AlertDialogContent>
                                                         )}
                                                    </AlertDialog>
                                                </div>
                                             </TableCell>
                                        </TableRow>
                                    ))
                                 ) : (
                                     <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No {name.toLowerCase()} items budgeted for {formatPeriodForDisplay(budgetPeriod)}.</TableCell></TableRow>
                                 )}
                            </TableBody>
                         </Table>
                      </ScrollArea>
                  </CardContent>
                  {groupedBudgetItems[key].length > 0 && (
                      <CardFooter className="p-4 border-t text-sm">
                          <div className="flex justify-between w-full"><span className="font-semibold">Total {name}</span><span className="font-bold font-mono">{formatCurrency(groupTotals[key])}</span></div>
                      </CardFooter>
                  )}
             </Card>
         ))}
      </main>

        <Separator className="my-8 mx-4 md:mx-6 lg:mx-8" />
        <Card className="shadow-sm mx-4 md:mx-6 lg:mx-8">
            <CardHeader className="p-6"><CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Budget History</CardTitle><CardDescription>View snapshots of your saved budgets from previous months. (Feature coming soon)</CardDescription></CardHeader>
            <CardContent className="p-6"><div className="text-center text-muted-foreground py-10"><p>Budget history snapshots will be listed here once saved.</p></div></CardContent>
        </Card>

        <BudgetItemFormSheet isOpen={isFormSheetOpen} onClose={handleFormSheetClose} item={editingItem} initialCategory={categoryForNewItem} />
    </div>
  );
}
