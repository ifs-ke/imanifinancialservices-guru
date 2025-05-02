
// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, TrendingUp, TrendingDown, Scale, Landmark, PlusCircle, Save, XCircle, Info, Calendar as CalendarIcon, Coins, MinusCircle, Tag, ChevronDown, ChevronRight, AlertTriangle, PieChart as PieChartIcon, CheckCircle, Target } from 'lucide-react'; // Added icons
import { Label } from '@/components/ui/label'; // Import Label component
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore'; // Import Zustand store hook
import { useDebtStore } from '@/store/debtStore'; // Import Zustand store hook
import { useStatementStore } from '@/store/statementStore'; // Import Zustand store hook
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted } from '@/store/budgetStore'; // Import Zustand store hook and selectors
import type { StatementItem, DebtItem, OtherLiabilityItem, TransactionWithId, BudgetItem, BudgetItemCategory } from '@/lib/types'; // Import all needed types
import { Badge } from '@/components/ui/badge'; // Import Badge
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; // Import Accordion


// Generate unique IDs (moved to store)

// Calculation Function (totals are now derived from stores or selectors)
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: DebtItem[]) => items.reduce((sum, item) => sum + item.principal, 0);


// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES', // Use KES
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Helper to format Date for display
const formatDate = (date: Date | undefined) => {
    return date ? format(date, "LLL dd, y") : <span>Pick a date</span>;
};

// Helper to format category badges
const formatCategoryBadge = (value: string | undefined) => {
    if (!value) return null; // Don't render anything if no value
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="ml-2 text-xs font-normal">{text}</Badge>;
}

// Accordion Trigger Component with Sum
const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; budgetedSum?: number | null; variance?: number | null } // Allow null budgetedSum and variance
>(({ label, sum, budgetedSum, variance, children, ...props }, ref) => {
    const hasBudget = budgetedSum !== undefined && budgetedSum !== null;
    const hasVariance = variance !== undefined && variance !== null;
    let varianceColor = 'text-muted-foreground';
    if (hasVariance && variance > 0) varianceColor = 'text-accent';
    if (hasVariance && variance < 0) varianceColor = 'text-destructive';

  return (
      <AccordionTrigger ref={ref} {...props}>
        <div className="flex justify-between items-center w-full pr-2">
            <span className="flex items-center gap-1 text-base font-semibold">
              {label}
               {hasBudget && (
                    <span className="text-xs text-muted-foreground font-normal">(Budget: {formatCurrency(budgetedSum)})</span>
               )}
            </span>
            <div className="flex items-center gap-2">
                {hasVariance && (
                    <span className={cn("text-xs font-mono", varianceColor)}>
                      ({variance > 0 ? '+' : ''}{formatCurrency(variance)})
                    </span>
                )}
                <span className="font-semibold font-mono">{formatCurrency(sum)}</span>
            </div>
        </div>
        {children}
      </AccordionTrigger>
  );
});
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


export default function StatementsPage() {
  // Zustand store hooks
  const transactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const { assetItems, otherLiabilityItems, setAssetItems, setOtherLiabilityItems, deleteAssetItem, deleteOtherLiabilityItem, updateAssetItem, updateOtherLiabilityItem, addAssetItem, addOtherLiabilityItem } = useStatementStore();
  const budgetItems = useBudgetStore(state => state.budgetItems);


  // State for edit mode and temporary edits
  const [isEditing, setIsEditing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: StatementItem | OtherLiabilityItem; type: 'asset' | 'otherLiability' } | null>(null);
  // Temporary state for edits - initialize when entering edit mode
  const [editingAssets, setEditingAssets] = useState<StatementItem[]>([]);
  const [editingOtherLiabilities, setEditingOtherLiabilities] = useState<OtherLiabilityItem[]>([]);

  // State for date range filtering
  const defaultEndDate = endOfMonth(new Date());
  const defaultStartDate = startOfMonth(defaultEndDate);
  const [startDate, setStartDate] = useState<Date | undefined>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date | undefined>(defaultEndDate);


  const { toast } = useToast();

  // --- Derived Calculations ---

  const filteredTransactions = useMemo(() => {
    const start = startDate ? startDate.getTime() : 0;
    // Set end date to the very end of the selected day
    const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Date.now();
    return transactions.filter(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return false;
        const txTime = txDate.getTime();
        return txTime >= start && txTime <= end;
    });
  }, [transactions, startDate, endDate]);


  // Include frequency/variability in derived items
  const derivedIncomeItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount > 0)
      .map(tx => ({
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          frequency: tx.frequency,
          variability: tx.variability
      }))
      .sort((a, b) => b.amount - a.amount),
    [filteredTransactions]
  );

  const derivedExpenseItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount < 0)
      .map(tx => ({
          id: tx.id,
          description: tx.description,
          amount: Math.abs(tx.amount), // Use absolute amount for expenses list
          frequency: tx.frequency,
          variability: tx.variability
      }))
      .sort((a, b) => b.amount - a.amount),
    [filteredTransactions]
  );

  const totalActualIncome = useMemo(() => calculateTotal(derivedIncomeItems), [derivedIncomeItems]);
  const totalActualExpenses = useMemo(() => calculateTotal(derivedExpenseItems), [derivedExpenseItems]);
  const cashFlow = totalActualIncome - totalActualExpenses;

  // Separate debts by term
   const shortTermDebts = useMemo(() => debts.filter(debt => debt.term === 'short'), [debts]);
   const longTermDebts = useMemo(() => debts.filter(debt => debt.term === 'long'), [debts]);

   const totalShortTermDebt = useMemo(() => calculateDebtTotal(shortTermDebts), [shortTermDebts]);
   const totalLongTermDebt = useMemo(() => calculateDebtTotal(longTermDebts), [longTermDebts]);

  // Totals now use the editing state if active, otherwise the store state
  const totalAssets = useMemo(() => calculateTotal(isEditing ? editingAssets : assetItems), [isEditing, editingAssets, assetItems]);
  const totalOtherLiabilities = useMemo(() => calculateTotal(isEditing ? editingOtherLiabilities : otherLiabilityItems), [isEditing, editingOtherLiabilities, otherLiabilityItems]);
  const totalLiabilities = totalShortTermDebt + totalLongTermDebt + totalOtherLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  // --- Budget Variance Calculation Refactor (using data from stores) ---
  // Group actual transactions by description for comparison with budget items
    const actualSpendingByCategory = useMemo(() => {
        const actuals: Record<BudgetItemCategory, { [description: string]: { amount: number, count: number } }> = {
            income: {},
            'recurring-expense': {},
            'one-time-expense': {},
            goal: {}, // Goals might not have direct transactions, depending on implementation
        };

        filteredTransactions.forEach(tx => {
            const category: BudgetItemCategory | null =
                tx.amount > 0 ? 'income' :
                tx.frequency === 'recurring' ? 'recurring-expense' :
                tx.frequency === 'one-time' ? 'one-time-expense' : null; // Map transaction properties to budget categories

            if (category) {
                const descKey = tx.description.toLowerCase(); // Use lowercase description for grouping
                const amount = Math.abs(tx.amount);

                if (!actuals[category][descKey]) {
                    actuals[category][descKey] = { amount: 0, count: 0 };
                }
                actuals[category][descKey].amount += amount;
                actuals[category][descKey].count += 1;
            }
        });
        return actuals;
    }, [filteredTransactions]);

   // Generate Variance Data (now includes category grouping)
   const varianceDataByCategory = useMemo(() => {
        const varianceByCategory: Record<BudgetItemCategory, { description: string; budgeted: number; actual: number | null }[]> = {
            income: [],
            'recurring-expense': [],
            'one-time-expense': [],
            goal: [],
        };
        const actualsTracked: Set<string> = new Set(); // Keep track of actuals already listed

        // 1. Iterate through budgeted items (from budgetStore)
        budgetItems.forEach(item => {
            const descKey = item.description.toLowerCase();
            const actualGroup = actualSpendingByCategory[item.category]?.[descKey];
            const actualAmount = actualGroup ? actualGroup.amount : 0;

            varianceByCategory[item.category].push({
                description: item.description,
                budgeted: item.amount,
                actual: actualAmount, // Actual might be 0 if no matching transaction
            });
             if(actualGroup) actualsTracked.add(`${item.category}-${descKey}`); // Mark this actual as handled
        });

        // 2. Add actual transactions that *didn't* match a budget item description
        Object.entries(actualSpendingByCategory).forEach(([category, descriptions]) => {
             Object.entries(descriptions).forEach(([descKey, data]) => {
                const trackerKey = `${category}-${descKey}`;
                 if (!actualsTracked.has(trackerKey)) {
                     // Find the original description casing (take the first matching transaction)
                     const originalTx = filteredTransactions.find(tx =>
                         (tx.amount > 0 ? 'income' :
                          tx.frequency === 'recurring' ? 'recurring-expense' :
                          tx.frequency === 'one-time' ? 'one-time-expense' : null) === category &&
                          tx.description.toLowerCase() === descKey
                     );
                     const originalDescription = originalTx ? originalTx.description : descKey; // Fallback to lower key if not found

                     varianceByCategory[category as BudgetItemCategory].push({
                         description: `* ${originalDescription}`, // Mark as unbudgeted actual
                         budgeted: 0, // No budget allocated
                         actual: data.amount,
                     });
                 }
             });
         });

        // Sort within each category
        Object.values(varianceByCategory).forEach(categoryItems => {
            categoryItems.sort((a, b) => {
                 // Keep budgeted items before unbudgeted actuals (marked with *)
                if (a.description.startsWith('*') && !b.description.startsWith('*')) return 1;
                if (!a.description.startsWith('*') && b.description.startsWith('*')) return -1;
                 return a.description.localeCompare(b.description);
            });
        });

        return varianceByCategory;

    }, [budgetItems, actualSpendingByCategory, filteredTransactions]);

   // Calculate totals based on the categorized variance data
   const varianceTotalsByCategory = useMemo(() => {
        const totals: Record<BudgetItemCategory, { budgeted: number; actual: number }> = {
            income: { budgeted: 0, actual: 0 },
            'recurring-expense': { budgeted: 0, actual: 0 },
            'one-time-expense': { budgeted: 0, actual: 0 },
            goal: { budgeted: 0, actual: 0 },
        };

        Object.entries(varianceDataByCategory).forEach(([category, items]) => {
             items.forEach(item => {
                 totals[category as BudgetItemCategory].budgeted += item.budgeted;
                 totals[category as BudgetItemCategory].actual += item.actual ?? 0;
             });
         });

         // Calculate overall totals
        const totalBudgetedIncome = totals.income.budgeted;
        const totalActualIncome = totals.income.actual;
        const totalBudgetedExpenses = totals['recurring-expense'].budgeted + totals['one-time-expense'].budgeted;
        const totalActualExpenses = totals['recurring-expense'].actual + totals['one-time-expense'].actual;
        const totalBudgetedGoals = totals.goal.budgeted;
        const totalActualGoals = totals.goal.actual; // Likely 0 unless goals have actuals

         return {
             ...totals,
             totalBudgetedIncome,
             totalActualIncome,
             totalBudgetedExpenses,
             totalActualExpenses,
             totalBudgetedGoals,
             totalActualGoals,
             netBudgeted: totalBudgetedIncome - totalBudgetedExpenses - totalBudgetedGoals,
             netActual: totalActualIncome - totalActualExpenses - totalActualGoals,
         };
   }, [varianceDataByCategory]);

  // --- Handlers ---

  const handleEditToggle = () => {
    if (!isEditing) {
      // Entering edit mode: copy current store states to temporary editing states
      setEditingAssets([...assetItems.map(item => ({ ...item }))]); // Deep copy needed
      setEditingOtherLiabilities([...otherLiabilityItems.map(item => ({ ...item }))]); // Deep copy needed
    }
    setIsEditing(!isEditing);
  };

  const handleSaveChanges = () => {
    // Save changes from temporary editing states back to Zustand store
    setAssetItems(editingAssets);
    setOtherLiabilityItems(editingOtherLiabilities);
    setIsEditing(false);
    toast({ title: 'Changes Saved', description: 'Assets and Other Liabilities have been updated.' });
  };

  const handleCancelEdit = () => {
    // Discard changes and exit edit mode - no need to reset store states
    setIsEditing(false);
    toast({ title: 'Edit Cancelled', description: 'No changes were saved.', variant: 'default' });
  };

  // Generic handler for item changes (updates temporary editing state)
  const handleItemChange = (
    e: ChangeEvent<HTMLInputElement>,
    id: string,
    type: 'asset' | 'otherLiability',
    field: 'description' | 'amount'
  ) => {
    const value = field === 'amount' ? parseFloat(e.target.value) || 0 : e.target.value;
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;

    setState(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  // Generic handler for adding items (adds to temporary editing state)
  const handleAddItemClick = (type: 'asset' | 'otherLiability') => {
    const newItem: StatementItem | OtherLiabilityItem = { id: `temp_${type}_${Date.now()}`, description: '', amount: 0 }; // Use temp ID
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => [...prev, newItem]);
  };

  // Generic handler for delete click (sets itemToDelete for confirmation)
  const handleDeleteClick = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => {
     setItemToDelete({ item, type });
  };

  // Confirms deletion and updates temporary editing state
  const confirmDeleteItem = () => {
    if (!itemToDelete) return;
    const { item: itemToRemove, type } = itemToDelete;
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;

    setState(prev => prev.filter(item => item.id !== itemToRemove.id));
    setItemToDelete(null);
    toast({ title: `${type === 'asset' ? 'Asset' : 'Liability'} Item Removed`, description: 'Successfully removed from edit view. Save changes to persist.' });
    // Note: Changes are only saved to store on 'Save Changes'
  };

  // --- Render Functions ---

  // Renders editable row for Assets or Other Liabilities using temporary state
  const renderEditableRow = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => (
    <TableRow key={item.id} className="text-sm">
      <TableCell className="pl-2 py-1.5"> {/* Reduced padding */}
        {isEditing ? (
          <Input
            type="text"
            value={item.description}
            onChange={(e) => handleItemChange(e, item.id, type, 'description')}
            placeholder="Description"
            className="h-8"
          />
        ) : (
          item.description
        )}
      </TableCell>
      <TableCell className="text-right font-mono py-1.5"> {/* Reduced padding */}
        {isEditing ? (
          <Input
            type="number"
            step="0.01"
            value={item.amount.toString()} // Use temporary state value
            onChange={(e) => handleItemChange(e, item.id, type, 'amount')}
            placeholder="Amount"
            className="h-8 text-right w-32" // Fixed width
          />
        ) : (
           formatCurrency(item.amount) // Display store state value when not editing
        )}
      </TableCell>
      {isEditing && (
         <TableCell className="w-[50px] py-1.5 pr-2 text-right"> {/* Reduced padding */}
           <AlertDialog open={itemToDelete?.item.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
             <AlertDialogTrigger asChild>
               <Button
                 variant="ghost"
                 size="icon"
                 className="text-destructive hover:text-destructive h-7 w-7"
                 onClick={() => handleDeleteClick(item, type)} // Pass the item from temporary state
               >
                 <Trash2 className="h-4 w-4" />
                 <span className="sr-only">Delete Item</span>
               </Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                 <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                 <AlertDialogDescription>
                   This action cannot be undone from the current edit session. This will remove the {type === 'asset' ? 'asset' : 'liability'}: <br/>
                   <strong>{item.description || '(No description)'} ({formatCurrency(item.amount)})</strong>
                 </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                 <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
                 <AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction>
               </AlertDialogFooter>
             </AlertDialogContent>
           </AlertDialog>
         </TableCell>
      )}
    </TableRow>
  );

  // Render function for derived Income/Expense items (read-only) including category badges
   const renderDerivedItemRow = (item: TransactionWithId, type: 'income' | 'expense') => (
       <TableRow key={item.id} className="text-sm">
         <TableCell className="pl-2 py-1.5"> {/* Reduced padding */}
             {item.description}
             {/* Display category badges */}
             {formatCategoryBadge(item.frequency)}
             {formatCategoryBadge(item.variability)}
         </TableCell>
         <TableCell className="text-right font-mono py-1.5"> {/* Reduced padding */}
             {formatCurrency(type === 'income' ? item.amount : Math.abs(item.amount))} {/* Show expense as positive in list */}
         </TableCell>
       </TableRow>
   );

   // Render function for derived Debt items (read-only in this view)
    const renderDerivedDebtRow = (debt: DebtItem) => (
        <TableRow key={debt.id} className="text-sm">
            <TableCell className="pl-2 py-1.5">{debt.description}</TableCell> {/* Reduced padding */}
            <TableCell className="text-right font-mono py-1.5">{formatCurrency(debt.principal)}</TableCell> {/* Reduced padding */}
            {isEditing && <TableCell></TableCell>} {/* Keep alignment */}
        </TableRow>
    );

    // Render function for budget variance report rows
    const renderVarianceRow = (item: { description: string; budgeted: number; actual: number | null }) => {
        const variance = item.budgeted - (item.actual ?? 0);
        const isIncome = item.budgeted > 0 && (item.actual ?? 0) >= 0; // Crude check for income category, refine if needed
        let statusText = '-';
        let statusColor = 'text-muted-foreground';
        const isUnbudgetedActual = item.description.startsWith('* ');
        const displayDescription = isUnbudgetedActual ? item.description.substring(2) : item.description;

        if (item.actual === null && item.budgeted === 0) { // Neither budgeted nor actual
             statusText = '-';
             statusColor = 'text-muted-foreground';
        } else if (item.actual === null) { // Budgeted but no actual
            statusText = `${formatCurrency(item.budgeted)} (Unspent)`; // Show unspent budget
             statusColor = isIncome ? 'text-destructive' : 'text-accent'; // Favorable for expenses/goals, Unfavorable for income
        } else if (isUnbudgetedActual) { // Unbudgeted actual spending
             statusText = `-${formatCurrency(item.actual ?? 0)} (Unbudgeted)`; // Added null check
             statusColor = 'text-destructive';
        } else { // Both budgeted and actual exist
            // For variance calculation, we need to know the category type
            // Income: actual > budgeted is favorable (positive variance)
            // Expense/Goal: actual < budgeted is favorable (positive variance)
            // We'll calculate actual - budgeted for income, budgeted - actual for others
            // Let's assume based on the sign of budgeted amount for simplicity here
            // A more robust way would be passing the category type to this function
            let calculatedVariance: number;
             const actualValue = item.actual ?? 0; // Default actual to 0 if null

             // Determine category based on the description or other properties if needed
             // For simplicity, assume positive budget means income, otherwise expense/goal
             if (item.budgeted > 0 && varianceDataByCategory.income.some(i => i.description === item.description)) { // Check if it's in income category
                calculatedVariance = actualValue - item.budgeted;
             } else { // Assuming expenses/goals have positive budget values representing outflow
                calculatedVariance = item.budgeted - actualValue;
             }


             if (calculatedVariance > 0) {
                 statusText = `+${formatCurrency(calculatedVariance)} (Favorable)`;
                 statusColor = 'text-accent';
             } else if (calculatedVariance < 0) {
                 statusText = `-${formatCurrency(Math.abs(calculatedVariance))} (Unfavorable)`;
                 statusColor = 'text-destructive';
             } else {
                statusText = 'On Target';
             }
         }

        return (
            <TableRow key={item.description} className="text-sm">
                 <TableCell className={cn("pl-2 py-1.5", isUnbudgetedActual && "pl-6 italic text-muted-foreground")}>
                    {displayDescription}
                 </TableCell>
                 <TableCell className="text-right font-mono py-1.5">{item.budgeted > 0 ? formatCurrency(item.budgeted) : '-'}</TableCell>
                 <TableCell className="text-right font-mono py-1.5">{item.actual !== null ? formatCurrency(item.actual) : '-'}</TableCell>
                 <TableCell className={cn("text-right font-mono text-xs py-1.5", statusColor)}>
                     {statusText}
                </TableCell>
            </TableRow>
        );
    };


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Financial Statements
            </h1>
            <p className="text-muted-foreground">
             Review your financial position and performance. Edit Assets and Other Liabilities only.
            </p>
        </div>
         <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel Edit
              </Button>
              <Button onClick={handleSaveChanges}>
                <Save className="mr-2 h-4 w-4" /> Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={handleEditToggle}>
              Edit Assets/Liabilities
            </Button>
          )}
        </div>
      </header>

       {/* Date Range Pickers */}
      <div className="flex flex-col sm:flex-row items-center gap-2 text-sm mb-6 p-4 border rounded-lg bg-card">
          <Label className="font-semibold">Select Date Range:</Label>
           <Popover>
               <PopoverTrigger asChild>
                   <Button
                       variant={"outline"}
                       className={cn(
                           "w-full sm:w-[180px] justify-start text-left font-normal h-8",
                           !startDate && "text-muted-foreground"
                       )}
                   >
                       <CalendarIcon className="mr-2 h-4 w-4" />
                       {formatDate(startDate)}
                   </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0" align="start">
                   <Calendar
                       mode="single"
                       selected={startDate}
                       onSelect={setStartDate}
                       initialFocus
                   />
               </PopoverContent>
           </Popover>
           <span className="text-muted-foreground hidden sm:inline">-</span>
           <Popover>
               <PopoverTrigger asChild>
                   <Button
                       variant={"outline"}
                       className={cn(
                           "w-full sm:w-[180px] justify-start text-left font-normal h-8 mt-2 sm:mt-0",
                           !endDate && "text-muted-foreground"
                       )}
                   >
                       <CalendarIcon className="mr-2 h-4 w-4" />
                       {formatDate(endDate)}
                   </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0" align="start">
                   <Calendar
                       mode="single"
                       selected={endDate}
                       onSelect={setEndDate}
                       disabled={(date) =>
                           startDate ? date < startDate : false
                       }
                       initialFocus
                   />
               </PopoverContent>
           </Popover>
       </div>

      <main className="flex-1 grid gap-6 lg:grid-cols-2"> {/* Adjusted grid for large screens */}
        {/* Cash Flow Statement Card */}
        <Card className="lg:col-span-1"> {/* Takes half width on large screens */}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
            {cashFlow >= 0 ? <TrendingUp className="text-accent" /> : <TrendingDown className="text-destructive" />}
            Cash Flow Statement
            </CardTitle>
             <CardDescription className="flex items-center gap-1 text-xs pt-2">
                <Info size={14} className="text-muted-foreground"/> Derived from Transactions within the selected date range. Includes categories.
            </CardDescription>

          </CardHeader>
           <CardContent>
             <Accordion type="multiple" className="w-full" defaultValue={['income', 'expenses']}> {/* Allow multiple open, default open */}
                 {/* Income Accordion */}
                <AccordionItem value="income">
                     <AccordionTriggerWithSum label="Income" sum={totalActualIncome} budgetedSum={varianceTotalsByCategory.totalBudgetedIncome} variance={varianceTotalsByCategory.totalActualIncome - varianceTotalsByCategory.totalBudgetedIncome} className="hover:no-underline" />
                     <AccordionContent>
                         {derivedIncomeItems.length > 0 ? (
                           <ScrollArea className="h-[200px] w-full pr-3">
                             <Table>
                               <TableBody>
                                 {derivedIncomeItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'income'))}
                               </TableBody>
                             </Table>
                           </ScrollArea>
                         ) : (
                           <p className="text-center text-muted-foreground py-4 text-sm">No income in selected range.</p>
                         )}
                     </AccordionContent>
                 </AccordionItem>

                 {/* Expenses Accordion */}
                 <AccordionItem value="expenses" className="border-b-0">
                      <AccordionTriggerWithSum label="Expenses" sum={totalActualExpenses} budgetedSum={varianceTotalsByCategory.totalBudgetedExpenses} variance={varianceTotalsByCategory.totalBudgetedExpenses - varianceTotalsByCategory.totalActualExpenses} className="hover:no-underline" />
                     <AccordionContent>
                         {derivedExpenseItems.length > 0 ? (
                            <ScrollArea className="h-[200px] w-full pr-3">
                               <Table>
                                 <TableBody>
                                   {derivedExpenseItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'expense'))}
                                 </TableBody>
                               </Table>
                             </ScrollArea>
                         ) : (
                           <p className="text-center text-muted-foreground py-4 text-sm">No expenses in selected range.</p>
                         )}
                     </AccordionContent>
                 </AccordionItem>
            </Accordion>
             {/* Net Cash Flow Footer */}
             <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Net Cash Flow</span>
                  <span
                    className={`font-mono ${
                      cashFlow >= 0 ? 'text-accent' : 'text-destructive'
                    }`}
                  >
                    {formatCurrency(cashFlow)}
                  </span>
                </div>
             </div>
          </CardContent>
        </Card>

        {/* Net Worth Statement Card */}
        <Card className="lg:col-span-1"> {/* Takes half width on large screens */}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="text-primary" />
              Net Worth Statement
            </CardTitle>
             <CardDescription>Assets vs. Liabilities {isEditing ? '(Editing Assets & Other Liabilities)' : ''}</CardDescription>
          </CardHeader>
           <CardContent>
             <Accordion type="multiple" className="w-full" defaultValue={['assets', 'liabilities']}> {/* Allow multiple open, default open */}
                 {/* Assets Accordion */}
                 <AccordionItem value="assets">
                    <AccordionTriggerWithSum label="Assets" sum={totalAssets} className="hover:no-underline" />
                     <AccordionContent>
                         <ScrollArea className="h-[200px] w-full pr-3">
                             <Table>
                               <TableBody>
                                 {/* Render rows based on editingAssets if editing, else assetItems from store */}
                                 {(isEditing ? editingAssets : assetItems).map(item => renderEditableRow(item, 'asset'))}
                               </TableBody>
                             </Table>
                         </ScrollArea>
                          {isEditing && (
                             <div className="text-center py-2 border-t border-dashed mt-2">
                                 <Button variant="ghost" size="sm" onClick={() => handleAddItemClick('asset')}>
                                 <PlusCircle className="mr-2 h-4 w-4" /> Add Asset Item
                                 </Button>
                             </div>
                          )}
                          {(isEditing ? editingAssets : assetItems).length === 0 && !isEditing && (
                            <p className="text-center text-muted-foreground py-4 text-sm">No assets recorded.</p>
                          )}
                     </AccordionContent>
                 </AccordionItem>

                 {/* Liabilities Section (Uses Nested Accordions) */}
                 <AccordionItem value="liabilities" className="border-b-0">
                     {/* Top-level Liabilities Trigger */}
                     <AccordionTrigger className="text-base font-semibold hover:no-underline">
                         <div className="flex justify-between w-full pr-2">
                            <span>Liabilities</span>
                             <span className="font-semibold font-mono">({formatCurrency(totalLiabilities)})</span>
                         </div>
                     </AccordionTrigger>
                     <AccordionContent>
                         <ScrollArea className="h-[200px] w-full pr-3">
                            <Accordion type="multiple" className="w-full pl-4 border-l ml-2" defaultValue={['short-term-debts', 'long-term-debts', 'other-liabilities']}> {/* Nested Accordion */}
                                {/* Short-Term Debts Accordion */}
                                <AccordionItem value="short-term-debts">
                                    <AccordionTriggerWithSum label="Short-Term Debts" sum={totalShortTermDebt} className="text-sm font-medium text-muted-foreground hover:no-underline py-2" />
                                    <AccordionContent className="pb-2">
                                        {shortTermDebts.length > 0 ? (
                                        <Table>
                                            <TableBody>
                                                {shortTermDebts.map(debt => renderDerivedDebtRow(debt))}
                                            </TableBody>
                                        </Table>
                                        ) : (
                                        <p className="text-center text-muted-foreground py-2 text-xs">No short-term debts recorded.</p>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Long-Term Debts Accordion */}
                                <AccordionItem value="long-term-debts">
                                    <AccordionTriggerWithSum label="Long-Term Debts" sum={totalLongTermDebt} className="text-sm font-medium text-muted-foreground hover:no-underline py-2" />
                                    <AccordionContent className="pb-2">
                                        {longTermDebts.length > 0 ? (
                                            <Table>
                                            <TableBody>
                                                {longTermDebts.map(debt => renderDerivedDebtRow(debt))}
                                            </TableBody>
                                            </Table>
                                        ) : (
                                            <p className="text-center text-muted-foreground py-2 text-xs">No long-term debts recorded.</p>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Other Liabilities Accordion */}
                                <AccordionItem value="other-liabilities" className="border-b-0"> {/* Remove border for last item */}
                                    <AccordionTriggerWithSum label="Other Liabilities" sum={totalOtherLiabilities} className="text-sm font-medium text-muted-foreground hover:no-underline py-2" />
                                    <AccordionContent className="pb-2">
                                        <Table>
                                            <TableBody>
                                            {/* Render rows based on editingOtherLiabilities if editing, else otherLiabilityItems from store */}
                                            {(isEditing ? editingOtherLiabilities : otherLiabilityItems).map(item => renderEditableRow(item, 'otherLiability'))}
                                            </TableBody>
                                        </Table>
                                        {isEditing && (
                                            <div className="text-center py-2 border-t border-dashed mt-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleAddItemClick('otherLiability')}>
                                                <MinusCircle className="mr-2 h-4 w-4" /> Add Other Liability
                                                </Button>
                                            </div>
                                        )}
                                        {(isEditing ? editingOtherLiabilities : otherLiabilityItems).length === 0 && !isEditing && (
                                            <p className="text-center text-muted-foreground py-4 text-sm">No other liabilities recorded.</p>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                         </ScrollArea>
                     </AccordionContent>
                 </AccordionItem>
            </Accordion>
             {/* Net Worth Footer */}
             <div className="mt-4 pt-4 border-t border-border">
                 <div className="flex justify-between items-center text-lg font-bold">
                  <span>Net Worth</span>
                  <span
                    className={`font-mono ${
                      netWorth >= 0 ? 'text-primary' : 'text-destructive'
                    }`}
                  >
                    {formatCurrency(netWorth)}
                  </span>
                </div>
             </div>
          </CardContent>
        </Card>

         {/* Budget Variance Report Card - Updated to use Accordions */}
         <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><PieChartIcon className="h-5 w-5 text-primary"/>Budget Variance Report</CardTitle>
                <CardDescription>Compare budgeted amounts with actuals from transactions in the selected date range.</CardDescription>
                 <p className='text-xs text-muted-foreground pt-2 flex items-center gap-1'><Info size={14}/> Actuals are grouped by transaction description. Items marked with * are unbudgeted actuals.</p>
            </CardHeader>
            <CardContent>
                 <Accordion type="multiple" className="w-full" defaultValue={['income-variance', 'expenses-variance', 'goals-variance']}>
                      {/* Income Variance Accordion */}
                      <AccordionItem value="income-variance">
                         <AccordionTriggerWithSum
                             label="Income"
                             sum={varianceTotalsByCategory.income.actual}
                             budgetedSum={varianceTotalsByCategory.income.budgeted}
                             variance={varianceTotalsByCategory.totalActualIncome - varianceTotalsByCategory.totalBudgetedIncome}
                             className="hover:no-underline text-accent"
                         />
                          <AccordionContent>
                              {varianceDataByCategory.income.length > 0 ? (
                                  <ScrollArea className="h-[200px] w-full pr-3">
                                      <Table>
                                          <TableHeader className="sticky top-0 bg-background z-10">
                                              <TableRow>
                                                  <TableHead>Item / Description</TableHead>
                                                  <TableHead className="text-right">Budgeted</TableHead>
                                                  <TableHead className="text-right">Actual</TableHead>
                                                  <TableHead className="text-right w-[150px]">Variance</TableHead>
                                              </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                             {varianceDataByCategory.income.map(renderVarianceRow)}
                                         </TableBody>
                                     </Table>
                                  </ScrollArea>
                             ) : (
                                 <p className="text-center text-muted-foreground py-4 text-sm">No income budgeted or recorded in this period.</p>
                             )}
                         </AccordionContent>
                      </AccordionItem>

                      {/* Expenses Variance Accordion (Combining Recurring and One-Time) */}
                     <AccordionItem value="expenses-variance">
                          <AccordionTriggerWithSum
                             label="Expenses"
                             sum={varianceTotalsByCategory.totalActualExpenses}
                             budgetedSum={varianceTotalsByCategory.totalBudgetedExpenses}
                             variance={varianceTotalsByCategory.totalBudgetedExpenses - varianceTotalsByCategory.totalActualExpenses} // Favorable is positive
                             className="hover:no-underline text-destructive"
                         />
                          <AccordionContent>
                             {(varianceDataByCategory['recurring-expense'].length > 0 || varianceDataByCategory['one-time-expense'].length > 0) ? (
                                  <ScrollArea className="h-[300px] w-full pr-3">
                                      <Table>
                                         <TableHeader className="sticky top-0 bg-background z-10">
                                              <TableRow>
                                                  <TableHead>Item / Description</TableHead>
                                                  <TableHead className="text-right">Budgeted</TableHead>
                                                  <TableHead className="text-right">Actual</TableHead>
                                                  <TableHead className="text-right w-[150px]">Variance</TableHead>
                                              </TableRow>
                                          </TableHeader>
                                         <TableBody>
                                             {/* Optionally add subheadings for recurring/one-time if needed */}
                                             {varianceDataByCategory['recurring-expense'].map(renderVarianceRow)}
                                             {varianceDataByCategory['one-time-expense'].map(renderVarianceRow)}
                                         </TableBody>
                                     </Table>
                                 </ScrollArea>
                             ) : (
                                 <p className="text-center text-muted-foreground py-4 text-sm">No expenses budgeted or recorded in this period.</p>
                             )}
                         </AccordionContent>
                     </AccordionItem>


                     {/* Goals Variance Accordion */}
                     <AccordionItem value="goals-variance" className="border-b-0">
                          <AccordionTriggerWithSum
                             label="Goals"
                             sum={varianceTotalsByCategory.goal.actual} // Actual might be 0
                             budgetedSum={varianceTotalsByCategory.goal.budgeted}
                             variance={varianceTotalsByCategory.goal.budgeted - varianceTotalsByCategory.goal.actual} // Favorable is positive
                             className="hover:no-underline text-primary"
                         />
                          <AccordionContent>
                              {varianceDataByCategory.goal.length > 0 ? (
                                 <ScrollArea className="h-[150px] w-full pr-3">
                                      <Table>
                                          <TableHeader className="sticky top-0 bg-background z-10">
                                              <TableRow>
                                                  <TableHead>Item / Description</TableHead>
                                                  <TableHead className="text-right">Budgeted</TableHead>
                                                  <TableHead className="text-right">Actual</TableHead>
                                                  <TableHead className="text-right w-[150px]">Variance</TableHead>
                                              </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                              {varianceDataByCategory.goal.map(renderVarianceRow)}
                                          </TableBody>
                                      </Table>
                                  </ScrollArea>
                             ) : (
                                 <p className="text-center text-muted-foreground py-4 text-sm">No goals budgeted or recorded in this period.</p>
                             )}
                         </AccordionContent>
                     </AccordionItem>
                 </Accordion>

                  {/* Grand Totals Footer */}
                 <div className="mt-6 pt-4 border-t border-border">
                     <Table>
                         <TableFooter>
                             <TableRow className="bg-muted/30 font-bold text-lg">
                                 <TableCell>Net Totals (Income - Expenses - Goals)</TableCell>
                                 <TableCell className="text-right font-mono">{formatCurrency(varianceTotalsByCategory.netBudgeted)}</TableCell>
                                 <TableCell className="text-right font-mono">{formatCurrency(varianceTotalsByCategory.netActual)}</TableCell>
                                  <TableCell className={cn("text-right font-mono text-sm", (varianceTotalsByCategory.netActual - varianceTotalsByCategory.netBudgeted) >= 0 ? 'text-accent' : 'text-destructive')}>
                                     {varianceTotalsByCategory.netActual - varianceTotalsByCategory.netBudgeted >= 0 ? '+' : ''}{formatCurrency(varianceTotalsByCategory.netActual - varianceTotalsByCategory.netBudgeted)}
                                 </TableCell>
                              </TableRow>
                          </TableFooter>
                     </Table>
                  </div>
             </CardContent>
         </Card>


      </main>
    </div>
  );
}

