// src/app/(dashboard)/budget/page.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Save, Edit, PieChart as PieChartIcon, PlusCircle, Trash2, DollarSign, TrendingDown, Target, MinusCircle } from 'lucide-react'; // Added more icons
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useBudget } from '@/contexts/BudgetContext';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import BudgetItemFormSheet from '@/components/budget/BudgetItemFormSheet'; // Import the item form sheet

// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Category configuration
const budgetCategories: { name: string; key: BudgetItemCategory; icon: React.ElementType }[] = [
    { name: 'Income', key: 'income', icon: DollarSign },
    { name: 'Recurring Expenses', key: 'recurring-expense', icon: TrendingDown },
    { name: 'One-Time Expenses', key: 'one-time-expense', icon: MinusCircle },
    { name: 'Goals', key: 'goal', icon: Target },
];

export default function BudgetPage() {
  const { toast } = useToast();
  const {
      budgetItems,
      // addBudgetItem, // No direct add here, handled by sheet
      // updateBudgetItem, // No direct update here, handled by sheet
      deleteBudgetItem,
      totalIncome,
      totalRecurringExpenses,
      totalOneTimeExpenses,
      totalGoals,
      totalExpenses,
      netBudgeted,
  } = useBudget();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<BudgetItem | null>(null);
  const [categoryForNewItem, setCategoryForNewItem] = useState<BudgetItemCategory>('recurring-expense'); // Default category for adding

  // --- Handlers for CRUD operations ---

  const handleAddClick = (category: BudgetItemCategory) => {
      setCategoryForNewItem(category); // Set the category for the new item
      setEditingItem(null); // Clear editing state
      setIsFormSheetOpen(true);
  };

  const handleEditClick = (item: BudgetItem) => {
      setEditingItem(item);
      setIsFormSheetOpen(true);
  };

  const handleFormSheetClose = () => {
      setIsFormSheetOpen(false);
      setEditingItem(null); // Clear editing state on close
  };

  const handleDeleteClick = (item: BudgetItem) => {
      setItemToDelete(item);
      // AlertDialogTrigger below will open the confirmation dialog
  };

  const confirmDeleteItem = () => {
      if (!itemToDelete) return;
      deleteBudgetItem(itemToDelete.id);
      setItemToDelete(null);
      toast({ title: 'Budget Item Deleted', description: 'Successfully removed item.' });
  };

  // Group items by category for display
  const groupedBudgetItems = useMemo(() => {
      const groups: Record<BudgetItemCategory, BudgetItem[]> = {
          income: [],
          'recurring-expense': [],
          'one-time-expense': [],
          goal: [],
      };
      budgetItems.forEach(item => {
          if (groups[item.category]) {
              groups[item.category].push(item);
          }
      });
      return groups;
  }, [budgetItems]);

  // Calculate totals for each group
   const groupTotals = useMemo(() => {
       const totals: Record<BudgetItemCategory, number> = {
           income: 0,
           'recurring-expense': 0,
           'one-time-expense': 0,
           goal: 0,
       };
       Object.entries(groupedBudgetItems).forEach(([category, items]) => {
           totals[category as BudgetItemCategory] = items.reduce((sum, item) => sum + item.amount, 0);
       });
       return totals;
   }, [groupedBudgetItems]);


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <PieChartIcon className="h-6 w-6 text-primary" /> Budget Management
        </h1>
        <p className="text-muted-foreground">Plan your monthly finances item by item.</p>
      </header>

      {/* Budget Summary Card - Moved to Top */}
      <Card className="mb-6 shadow-md">
        <CardHeader>
            <CardTitle>Budget Summary</CardTitle>
            <CardDescription>Overview of your planned budget.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
             <div className="flex flex-col p-3 rounded-md border bg-accent/10">
                <span className="text-muted-foreground mb-1">Total Budgeted Income</span>
                <span className="font-bold text-lg font-mono text-accent">{formatCurrency(totalIncome)}</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-destructive/10">
                <span className="text-muted-foreground mb-1">Total Budgeted Expenses</span>
                 <span className="font-bold text-lg font-mono text-destructive">{formatCurrency(totalExpenses)}</span>
                 <span className="text-xs text-muted-foreground">(Recurring: {formatCurrency(totalRecurringExpenses)}, One-Time: {formatCurrency(totalOneTimeExpenses)})</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-primary/10">
                <span className="text-muted-foreground mb-1">Total Budgeted Goals</span>
                <span className="font-bold text-lg font-mono text-primary">{formatCurrency(totalGoals)}</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-muted">
                <span className="text-muted-foreground mb-1">Expected Net (Income - Exp - Goals)</span>
                 <span className={cn("font-bold text-lg font-mono", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>
                    {formatCurrency(netBudgeted)}
                </span>
                 {netBudgeted !== 0 && (
                     <p className={cn("text-xs mt-1", netBudgeted > 0 ? 'text-primary' : 'text-destructive')}>
                         {netBudgeted > 0 ? `${formatCurrency(netBudgeted)} Left Over` : `${formatCurrency(Math.abs(netBudgeted))} Shortfall`}
                     </p>
                 )}
            </div>
        </CardContent>
      </Card>


      <main className="flex-1 grid gap-6 md:grid-cols-1 lg:grid-cols-2"> {/* Grid for budget category cards */}

         {budgetCategories.map(({ name, key, icon: Icon }) => (
             <Card key={key} className="flex flex-col shadow-sm"> {/* Added flex-col */}
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                     <CardTitle className="text-base font-medium flex items-center gap-2">
                         <Icon className="h-4 w-4" /> {name}
                     </CardTitle>
                     <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleAddClick(key)}>
                         <PlusCircle className="mr-1 h-3 w-3" /> Add {name}
                     </Button>
                 </CardHeader>
                 <CardContent className="p-0 flex-grow"> {/* Remove padding, allow content to grow */}
                      <ScrollArea className="h-[250px] w-full"> {/* Set a fixed height for scroll */}
                         <Table>
                             <TableHeader>
                                 <TableRow>
                                     <TableHead>Description</TableHead>
                                     <TableHead className="text-right">Amount (KES)</TableHead>
                                     <TableHead className="text-right w-[70px]">Actions</TableHead>
                                 </TableRow>
                             </TableHeader>
                             <TableBody>
                                {groupedBudgetItems[key].length > 0 ? (
                                     groupedBudgetItems[key].map((item) => (
                                         <TableRow key={item.id}>
                                             <TableCell className="font-medium max-w-[150px] truncate" title={item.description}>{item.description}</TableCell>
                                             <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                                             <TableCell className="text-right py-1"> {/* Reduced vertical padding */}
                                                 {/* Edit Button */}
                                                 <Button variant="ghost" size="icon" className="mr-1 h-6 w-6" onClick={() => handleEditClick(item)}>
                                                     <Edit className="h-3 w-3" />
                                                     <span className="sr-only">Edit</span>
                                                 </Button>
                                                 {/* Delete Button Trigger */}
                                                 {/* This button now only sets the itemToDelete state */}
                                                 <AlertDialogTrigger asChild>
                                                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-6 w-6" onClick={() => handleDeleteClick(item)}>
                                                          <Trash2 className="h-3 w-3" />
                                                          <span className="sr-only">Delete</span>
                                                      </Button>
                                                 </AlertDialogTrigger>
                                             </TableCell>
                                         </TableRow>
                                     ))
                                 ) : (
                                     <TableRow>
                                         <TableCell colSpan={3} className="h-20 text-center text-muted-foreground text-sm">
                                             No {name.toLowerCase()} items budgeted yet.
                                         </TableCell>
                                     </TableRow>
                                 )}
                             </TableBody>
                         </Table>
                     </ScrollArea>
                 </CardContent>
                  {/* Footer to show category total */}
                  {groupedBudgetItems[key].length > 0 && (
                     <CardFooter className="p-3 border-t bg-muted/50 text-sm">
                         <div className="flex justify-between w-full">
                             <span className="font-semibold">Total {name}</span>
                             <span className="font-bold font-mono">{formatCurrency(groupTotals[key])}</span>
                         </div>
                     </CardFooter>
                 )}
             </Card>
         ))}

         {/* Alert Dialog for Delete Confirmation (Placed once outside the map) */}
         {/* This AlertDialog now controls the visibility based on itemToDelete */}
          <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
            <AlertDialogContent>
                {itemToDelete && ( // Conditionally render content only if itemToDelete exists
                    <>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the budget item: <br />
                                <strong>{itemToDelete.description} ({formatCurrency(itemToDelete.amount)})</strong>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </>
                )}
            </AlertDialogContent>
        </AlertDialog>


          {/* Budget Item Form Sheet (for Add/Edit) */}
         <BudgetItemFormSheet
             isOpen={isFormSheetOpen}
             onClose={handleFormSheetClose}
             item={editingItem}
             initialCategory={categoryForNewItem} // Pass the category for new items
         />

      </main>
    </div>
  );
}
    
