'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Save, Edit, PieChart as PieChartIcon, PlusCircle, Trash2, DollarSign, TrendingDown, Target, MinusCircle, Coins, FileUp, FileDown } from 'lucide-react'; // Added FileUp and FileDown
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted, selectTotalBudgetedDebt } from '@/store/budgetStore'; // Added selectTotalBudgetedDebt
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import BudgetItemFormSheet from '@/components/budget/BudgetItemFormSheet';
import * as Papa from 'papaparse';

// Category configuration - Added Debt
const budgetCategories: { name: string; key: BudgetItemCategory; icon: React.ElementType }[] = [
    { name: 'Income', key: 'income', icon: DollarSign },
    { name: 'Recurring Expenses', key: 'recurring-expense', icon: TrendingDown },
    { name: 'One-Time Expenses', key: 'one-time-expense', icon: MinusCircle },
    { name: 'Goals', key: 'goal', icon: Target },
    { name: 'Debt Allocation', key: 'debt', icon: Coins }, // Added Debt category
];

export default function BudgetPage() {
  const { toast } = useToast();
  const { budgetItems, deleteBudgetItem, addBudgetItem } = useBudgetStore();
  const totalIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalRecurringExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const totalOneTimeExpenses = useBudgetStore(selectTotalOneTimeExpenses);
  const totalGoals = useBudgetStore(selectTotalGoals);
  const totalExpenses = useBudgetStore(selectTotalBudgetedExpenses);
  const totalDebtAllocation = useBudgetStore(selectTotalBudgetedDebt); // Get total debt allocation
  const netBudgeted = useBudgetStore(selectNetBudgeted);

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<BudgetItem | null>(null);
  const [categoryForNewItem, setCategoryForNewItem] = useState<BudgetItemCategory>('recurring-expense');

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

  const groupedBudgetItems = useMemo(() => {
      const groups: Record<BudgetItemCategory, BudgetItem[]> = {
          income: [],
          'recurring-expense': [],
          'one-time-expense': [],
          goal: [],
          debt: [], // Initialize debt group
      };
      budgetItems.forEach(item => {
          if (groups[item.category]) {
              groups[item.category].push(item);
          }
      });
      return groups;
  }, [budgetItems]);

   const groupTotals = useMemo(() => {
       const totals: Record<BudgetItemCategory, number> = {
           income: 0,
           'recurring-expense': 0,
           'one-time-expense': 0,
           goal: 0,
           debt: 0, // Initialize debt total
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
      complete: (results) => {
        if (results.errors.length > 0) {
          toast({
            title: 'CSV Parsing Error',
            description: results.errors.map(error => error.message).join('\n'),
            variant: 'destructive',
          });
          return;
        }

        const importedItems = results.data as any[];
        importedItems.forEach((item: any) => {
          try {
            const newItem: Omit<BudgetItem, 'id'> = {
              category: item.category as BudgetItemCategory,
              description: item.description,
              amount: parseFloat(item.amount),
            };
            addBudgetItem(newItem);
          } catch (error) {
            toast({
              title: 'Data Error',
              description: `Invalid data in CSV: ${JSON.stringify(item)}`,
              variant: 'destructive',
            });
          }
        });

        toast({
          title: 'CSV Imported',
          description: `${importedItems.length} budget items imported.`,
        });
      },
    });
  };

  const handleExport = () => {
    const csvData = Papa.unparse(budgetItems, {
      header: true,
    });

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'budget_items.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <PieChartIcon className="h-6 w-6 text-primary" /> Budget Management
        </h1>
        <p className="text-muted-foreground">Plan your monthly finances item by item.</p>
      </header>

      {/* Budget Summary Card */}
      <Card className="mb-6 shadow-md">
        <CardHeader>
            <CardTitle>Budget Summary</CardTitle>
            <CardDescription>Overview of your planned budget.</CardDescription>
        </CardHeader>
         {/* Updated grid for 5 columns */}
         <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 text-sm">
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
            {/* Added Debt Allocation Summary */}
            <div className="flex flex-col p-3 rounded-md border bg-destructive/5">
                <span className="text-muted-foreground mb-1">Total Debt Allocation</span>
                <span className="font-bold text-lg font-mono text-destructive/80">{formatCurrency(totalDebtAllocation)}</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-muted">
                <span className="text-muted-foreground mb-1">Expected Net</span>
                 <span={cn("font-bold text-lg font-mono", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>
                    {formatCurrency(netBudgeted)}
                
                 {netBudgeted !== 0 && (
                     
                         {netBudgeted > 0 ? `${formatCurrency(netBudgeted)} Left Over` : `${formatCurrency(Math.abs(netBudgeted))} Shortfall`}
                     
                 )}
            
        
      

      {/* Adjusted grid for potentially 5 categories */}
      <main className="flex-1 grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
         {budgetCategories.map(({ name, key, icon: Icon }) => (
             <Card key={key} className={cn("flex flex-col shadow-sm", key === 'debt' && 'lg:col-span-1 xl:col-span-1')}> {/* Assign specific span if needed */}
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b p-4"> {/* Adjusted padding */}
                     <CardTitle className="text-base font-medium flex items-center gap-2">
                         {name}
                     
                     
                         Add {key === 'debt' ? 'Allocation' : name} {/* Adjust button text */}
                     
                 
                 
                      No {name.toLowerCase()} items budgeted yet.
                 
                 
                     
                         
                             
                                 
                                     {formatCurrency(groupTotals[key])}
                             
                         
                     
                 
             
         

         
             isOpen={isFormSheetOpen}
             onClose={handleFormSheetClose}
             item={editingItem}
             initialCategory={categoryForNewItem}
         
      
      <input type="file" accept=".csv" onChange={handleImport} />
      <Button onClick={handleExport}>Export to CSV</Button>
    
  );
}
