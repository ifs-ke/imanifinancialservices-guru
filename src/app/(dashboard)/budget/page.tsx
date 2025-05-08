
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
import { Input } from '@/components/ui/input'; // Import Input

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
      skipEmptyLines: true, // Skip empty lines
      complete: (results) => {
        if (results.errors.length > 0) {
           // console.error("CSV Parsing Errors:", results.errors);
           toast({
             title: 'CSV Parsing Error',
             description: results.errors.map(error => `Row ${error.row}: ${error.message}`).join('\n'),
             variant: 'destructive',
           });
           return;
         }

        const importedItems = results.data as any[];
        let importedCount = 0;
        let errorCount = 0;

        importedItems.forEach((item: any, index: number) => {
            // Basic validation
            const category = item.category?.toLowerCase() as BudgetItemCategory;
            const description = item.description;
            const amountStr = item.amount?.replace(/,/g, ''); // Remove commas
            const amount = parseFloat(amountStr);

            const isValidCategory = category && ['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt'].includes(category);
            const isValidDescription = description && typeof description === 'string' && description.trim().length > 0;
            const isValidAmount = !isNaN(amount) && amount >= 0; // Ensure non-negative

          if (isValidCategory && isValidDescription && isValidAmount) {
             try {
               const newItem: Omit<BudgetItem, 'id'> = {
                 category: category,
                 description: description.trim(),
                 amount: amount,
               };
               addBudgetItem(newItem);
               importedCount++;
             } catch (error) {
                 errorCount++;
                 // console.error(`Error adding budget item from row ${index + 2}:`, error); // +2 for header and 0-index
             }
           } else {
             errorCount++;
             // console.warn(`Skipping invalid data in CSV row ${index + 2}:`, item);
             toast({
               title: 'Data Error',
               description: `Invalid data in CSV row ${index + 2}: Category='${item.category}', Desc='${item.description}', Amount='${item.amount}'. Skipping row.`,
               variant: 'destructive',
             });
           }
        });

         toast({
           title: 'CSV Import Complete',
           description: `${importedCount} budget items imported. ${errorCount} rows skipped due to errors.`,
         });
        // Reset file input
        e.target.value = '';
      },
       error: (error) => {
         // console.error("CSV Parsing Failed:", error);
         toast({
           title: 'CSV Parsing Failed',
           description: `Could not parse the file: ${error.message}`,
           variant: 'destructive',
         });
         e.target.value = '';
       }
    });
  };

  const handleExport = () => {
    if(budgetItems.length === 0) {
        toast({ title: "No Data", description: "Add budget items before exporting." });
        return;
    }
    const csvData = Papa.unparse(budgetItems, {
      header: true,
       columns: ['category', 'description', 'amount'] // Specify columns and order
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
    toast({ title: "CSV Exported", description: "Budget items exported successfully." });
  };

  // Trigger file input click
  const triggerFileInput = () => {
    const fileInput = document.getElementById('budget-csv-import');
    fileInput?.click();
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <PieChartIcon className="h-6 w-6 text-primary" /> Budget Management
            </h1>
            <p className="text-muted-foreground">Plan your monthly finances item by item.</p>
        </div>
        {/* Import/Export Buttons */}
         <div className="flex gap-2 flex-wrap">
             <Input
                 type="file"
                 id="budget-csv-import"
                 accept=".csv"
                 onChange={handleImport}
                 className="hidden" // Hide the default input
             />
             <Button onClick={triggerFileInput} variant="outline">
                 <FileUp className="mr-2 h-4 w-4" /> Import CSV
             </Button>
             <Button onClick={handleExport} variant="secondary" disabled={budgetItems.length === 0}>
                 <FileDown className="mr-2 h-4 w-4" /> Export CSV
             </Button>
         </div>
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
                 <span className={cn("font-bold text-lg font-mono", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>
                    {formatCurrency(netBudgeted)}
                 </span>
                  {netBudgeted !== 0 && (
                     <span className={cn("text-xs mt-1", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>
                         {netBudgeted > 0 ? `${formatCurrency(netBudgeted)} Left Over` : `${formatCurrency(Math.abs(netBudgeted))} Shortfall`}
                     </span>
                 )}
             </div>
         </CardContent>
      </Card>

      {/* Adjusted grid for potentially 5 categories */}
      <main className="flex-1 grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
         {budgetCategories.map(({ name, key, icon: Icon }) => (
             <Card key={key} className={cn("flex flex-col shadow-sm", key === 'debt' && 'lg:col-span-1 xl:col-span-1')}> {/* Assign specific span if needed */}
                 <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b p-4"> {/* Adjusted padding */}
                     <CardTitle className="text-base font-medium flex items-center gap-2">
                         <Icon className="h-4 w-4 text-muted-foreground" />
                         {name}
                     </CardTitle>
                     <Button variant="ghost" size="sm" onClick={() => handleAddClick(key)} className="h-7 px-2"> {/* Adjusted size/padding */}
                         <PlusCircle className="mr-1 h-3 w-3" />
                         Add {key === 'debt' ? 'Allocation' : name} {/* Adjust button text */}
                     </Button>
                 </CardHeader>
                  <CardContent className="p-0 flex-grow"> {/* Remove padding, let table handle spacing */}
                      <ScrollArea className="h-[350px] w-full"> {/* Adjust height as needed */}
                         <Table>
                            <TableHeader>
                                <TableRow>
                                     <TableHead className="pl-4 pr-2">Description</TableHead> {/* Add padding */}
                                     <TableHead className="text-right px-2">Amount (KES)</TableHead> {/* Add padding */}
                                     <TableHead className="w-[60px] pr-4 pl-2"></TableHead> {/* Add padding for actions */}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedBudgetItems[key].length > 0 ? (
                                    groupedBudgetItems[key].map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium max-w-[150px] truncate pl-4 pr-2" title={item.description}>{item.description}</TableCell> {/* Add padding */}
                                             <TableCell className="text-right font-mono px-2">{formatCurrency(item.amount)}</TableCell> {/* Add padding */}
                                             <TableCell className="text-right pr-4 pl-2 py-1"> {/* Add padding and vert align */}
                                                {/* Actions aligned to the right */}
                                                <div className="flex justify-end items-center gap-0.5"> {/* Use flex end */}
                                                     <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditClick(item)}> {/* Reduced size */}
                                                         <Edit className="h-3 w-3" />
                                                         <span className="sr-only">Edit</span>
                                                     </Button>
                                                     {/* Delete Confirmation Dialog */}
                                                     <AlertDialog open={itemToDelete?.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
                                                        <AlertDialogTrigger asChild>
                                                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-6 w-6" onClick={() => handleDeleteClick(item)}>
                                                                  <Trash2 className="h-3 w-3" />
                                                                  <span className="sr-only">Delete</span>
                                                              </Button>
                                                         </AlertDialogTrigger>
                                                         {/* AlertDialogContent needs to be conditionally rendered or always present but controlled by 'open' */}
                                                         {itemToDelete && itemToDelete.id === item.id && (
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        This will permanently delete the budget item: <br/>
                                                                        <strong>{itemToDelete.description} ({formatCurrency(itemToDelete.amount)})</strong>
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                         )}
                                                    </AlertDialog>
                                                </div>
                                             </TableCell>
                                        </TableRow>
                                    ))
                                 ) : (
                                     <TableRow>
                                         <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                             No {name.toLowerCase()} items budgeted yet.
                                         </TableCell>
                                     </TableRow>
                                 )}
                            </TableBody>
                         </Table>
                      </ScrollArea>
                      {/* Moved total display to CardFooter */}
                  </CardContent>
                  {groupedBudgetItems[key].length > 0 && (
                      <CardFooter className="p-4 border-t text-sm">
                          <div className="flex justify-between w-full">
                              <span className="font-semibold">Total {name}</span>
                              <span className="font-bold font-mono">{formatCurrency(groupTotals[key])}</span>
                          </div>
                      </CardFooter>
                  )}
             </Card>
         ))}
      </main>

        {/* Add/Edit Sheet */}
        <BudgetItemFormSheet
            isOpen={isFormSheetOpen}
            onClose={handleFormSheetClose}
            item={editingItem}
            initialCategory={categoryForNewItem}
        />
    </div>
  );
}
