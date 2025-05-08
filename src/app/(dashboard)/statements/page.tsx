// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, TrendingUp, TrendingDown, Scale, Landmark, PlusCircle, Save, XCircle, Info, Calendar as CalendarIcon, Coins, MinusCircle, Tag, ChevronDown, ChevronRight, AlertTriangle, PieChart as PieChartIcon, CheckCircle, Target } from 'lucide-react';
import { Label } from '@/components/ui/label';
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
import { format, startOfMonth, endOfMonth, parse } from 'date-fns'; // Removed differenceInDays, Added parse
import { cn } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
// Import period-aware selectors and the current period selector
import { useBudgetStore, selectCurrentBudgetPeriod, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { StatementItem, DebtItem, OtherLiabilityItem, TransactionWithId, BudgetItem, BudgetItemCategory } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


// Calculation Function
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: DebtItem[]) => items.reduce((sum, item) => sum + item.principal, 0);


// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
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
    if (!value) return null;
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="ml-2 text-xs font-normal">{text}</Badge>;
}

// Accordion Trigger Component with Sum
const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; budgetedSum?: number | null; variance?: number | null }
>(({ label, sum, budgetedSum, variance, children, ...props }, ref) => {
    const hasBudget = budgetedSum !== undefined && budgetedSum !== null;
    const hasVariance = variance !== undefined && variance !== null;
    let varianceColor = 'text-muted-foreground';
    if (hasVariance && variance > 0) varianceColor = 'text-accent'; // Favorable
    if (hasVariance && variance < 0) varianceColor = 'text-destructive'; // Unfavorable

  return (
      <AccordionTrigger ref={ref} {...props} className='hover:no-underline'>
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
      </AccordionTrigger>
  );
});
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


export default function StatementsPage() {
  // Zustand store hooks
  const transactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const {
      assetItems, otherLiabilityItems, setAssetItems, setOtherLiabilityItems,
      deleteAssetItem, deleteOtherLiabilityItem, updateAssetItem, updateOtherLiabilityItem,
      addAssetItem, addOtherLiabilityItem, startDate, endDate, setStartDate, setEndDate
  } = useStatementStore();
  const allBudgetItems = useBudgetStore(state => state.budgetItems); // Get all budget items
  const budgetPeriod = useBudgetStore(selectCurrentBudgetPeriod); // Get the active budget period (YYYY-MM)

  // State for edit mode and temporary edits
  const [isEditing, setIsEditing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: StatementItem | OtherLiabilityItem; type: 'asset' | 'otherLiability' } | null>(null);
  const [editingAssets, setEditingAssets] = useState<StatementItem[]>([]);
  const [editingOtherLiabilities, setEditingOtherLiabilities] = useState<OtherLiabilityItem[]>([]);

  const { toast } = useToast();

  // --- Derived Calculations ---

  const filteredTransactions = useMemo(() => {
    const start = startDate || startOfMonth(new Date());
    const end = endDate || endOfMonth(new Date());
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

    return transactions.filter(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return false;
        const txTime = txDate.getTime();
        return txTime >= start.getTime() && txTime <= endOfDay.getTime();
    });
  }, [transactions, startDate, endDate]);


  const derivedIncomeItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount > 0)
      .map(tx => ({ id: tx.id, description: tx.description, amount: tx.amount, frequency: tx.frequency, variability: tx.variability }))
      .sort((a, b) => b.amount - a.amount),
    [filteredTransactions]
  );

  const derivedExpenseItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount < 0)
      .map(tx => ({ id: tx.id, description: tx.description, amount: Math.abs(tx.amount), frequency: tx.frequency, variability: tx.variability }))
      .sort((a, b) => b.amount - a.amount),
    [filteredTransactions]
  );

  const totalActualIncome = useMemo(() => calculateTotal(derivedIncomeItems), [derivedIncomeItems]);
  const totalActualExpenses = useMemo(() => calculateTotal(derivedExpenseItems), [derivedExpenseItems]);
  const cashFlow = totalActualIncome - totalActualExpenses;

  const shortTermDebts = useMemo(() => debts.filter(debt => debt.term === 'short'), [debts]);
  const longTermDebts = useMemo(() => debts.filter(debt => debt.term === 'long'), [debts]);

  const totalShortTermDebt = useMemo(() => calculateDebtTotal(shortTermDebts), [shortTermDebts]);
  const totalLongTermDebt = useMemo(() => calculateDebtTotal(longTermDebts), [longTermDebts]);

  const totalAssets = useMemo(() => calculateTotal(isEditing ? editingAssets : assetItems), [isEditing, editingAssets, assetItems]);
  const totalOtherLiabilities = useMemo(() => calculateTotal(isEditing ? editingOtherLiabilities : otherLiabilityItems), [isEditing, editingOtherLiabilities, otherLiabilityItems]);
  const totalLiabilities = totalShortTermDebt + totalLongTermDebt + totalOtherLiabilities;
  const netWorth = totalAssets - totalLiabilities;

   // --- Budget Variance Calculation - Updated to use Budget Period ---
   const actualSpendingByCategory = useMemo(() => {
       const actuals: Record<string, { amount: number; count: number }> = {};
       filteredTransactions.forEach(tx => {
           const category: BudgetItemCategory | null =
               tx.amount > 0 ? 'income' :
               tx.frequency === 'recurring' ? 'recurring-expense' :
               tx.frequency === 'one-time' ? 'one-time-expense' :
               null;
           if (category) {
               const descKey = tx.description.toLowerCase();
               const groupKey = `${category}-${descKey}`;
               const amount = Math.abs(tx.amount);
               if (!actuals[groupKey]) actuals[groupKey] = { amount: 0, count: 0 };
               actuals[groupKey].amount += amount;
               actuals[groupKey].count += 1;
           }
       });
       return actuals;
   }, [filteredTransactions]);

   // Generate Variance Data using the selected budgetPeriod
   const varianceDataByCategory = useMemo(() => {
        const varianceByCategory: Record<BudgetItemCategory, { description: string; budgeted: number; actual: number | null }[]> = {
            income: [], 'recurring-expense': [], 'one-time-expense': [], goal: [], debt: [],
        };
        const actualsTracked: Set<string> = new Set();

        // Filter budget items for the *selected budget period*
        const budgetItemsForSelectedPeriod = allBudgetItems.filter(item => item.period === budgetPeriod);

       // 1. Iterate through budget items for the selected period
       budgetItemsForSelectedPeriod.forEach(item => {
           const descKey = item.description.toLowerCase();
           const groupKey = `${item.category}-${descKey}`;
           const actualGroup = actualSpendingByCategory[groupKey];
           const actualAmount = actualGroup ? actualGroup.amount : null;
           // No need to prorate, use the budget item amount directly
           const budgetAmount = item.amount;

            if (!varianceByCategory[item.category]) return; // Skip if category invalid

           varianceByCategory[item.category].push({
               description: item.description,
               budgeted: budgetAmount,
               actual: actualAmount,
           });
           if (actualGroup) actualsTracked.add(groupKey);
       });

       // 2. Add actual transactions (within statement date range) that didn't match a budget item for the selected budget period
       Object.entries(actualSpendingByCategory).forEach(([groupKey, data]) => {
           if (!actualsTracked.has(groupKey)) {
                const [categoryStr, descKey] = groupKey.split(/-(.*)/s);
                const category = categoryStr as BudgetItemCategory;
                if (!varianceByCategory[category]) return; // Skip if category invalid

                const originalTx = filteredTransactions.find(tx => {
                    const txCategory: BudgetItemCategory | null = tx.amount > 0 ? 'income' : tx.frequency === 'recurring' ? 'recurring-expense' : tx.frequency === 'one-time' ? 'one-time-expense' : null;
                    return tx.description.toLowerCase() === descKey && txCategory === category;
                });
                const displayDescription = originalTx ? originalTx.description : descKey;

                varianceByCategory[category].push({ description: `* ${displayDescription}`, budgeted: 0, actual: data.amount });
           }
       });

       // Sort within each category
       Object.values(varianceByCategory).forEach(categoryItems => {
           categoryItems.sort((a, b) => {
               const aUnbudgeted = a.description.startsWith('* ');
               const bUnbudgeted = b.description.startsWith('* ');
               if (aUnbudgeted && !bUnbudgeted) return 1;
               if (!aUnbudgeted && bUnbudgeted) return -1;
               return a.description.localeCompare(b.description);
           });
       });

       return varianceByCategory;
   }, [allBudgetItems, budgetPeriod, actualSpendingByCategory, filteredTransactions]); // Depend on budgetPeriod

   // Calculate totals based on the categorized variance data for the selected budget period
   const varianceTotalsByCategory = useMemo(() => {
        const totals: Record<BudgetItemCategory, { budgeted: number; actual: number }> = {
            income: { budgeted: 0, actual: 0 }, 'recurring-expense': { budgeted: 0, actual: 0 },
            'one-time-expense': { budgeted: 0, actual: 0 }, goal: { budgeted: 0, actual: 0 },
            debt: { budgeted: 0, actual: 0 },
        };

        Object.entries(varianceDataByCategory).forEach(([category, items]) => {
            const catKey = category as BudgetItemCategory;
            items.forEach(item => {
                totals[catKey].budgeted += item.budgeted; // Summing budgets for the period
                totals[catKey].actual += item.actual ?? 0; // Summing actuals (from statement range)
            });
        });

       const totalBudgetedIncome = totals.income.budgeted;
       const totalActualIncome = totals.income.actual; // Actual from statement range
       const totalBudgetedExpenses = totals['recurring-expense'].budgeted + totals['one-time-expense'].budgeted;
       const totalActualExpenses = totals['recurring-expense'].actual + totals['one-time-expense'].actual; // Actual from statement range
       const totalBudgetedGoals = totals.goal.budgeted;
       const totalActualGoals = totals.goal.actual; // Actual from statement range
       const totalBudgetedDebt = totals.debt.budgeted;
       const totalActualDebt = totals.debt.actual; // Actual from statement range

       // Calculate net values based on the *actuals within the statement range* vs *budget for the selected period*
       const netBudgeted = totalBudgetedIncome - totalBudgetedExpenses - totalBudgetedGoals - totalBudgetedDebt;
       const netActual = totalActualIncome - totalActualExpenses - totalActualGoals - totalActualDebt; // Actual net flow for statement range
       const overallVariance = netActual - netBudgeted; // Actual Net (stmt range) - Budgeted Net (budget period)

       return { ...totals, netBudgeted, netActual, overallVariance };
   }, [varianceDataByCategory]);


  // --- Handlers ---
  const handleEditToggle = () => {
    if (!isEditing) {
      setEditingAssets([...assetItems.map(item => ({ ...item }))]);
      setEditingOtherLiabilities([...otherLiabilityItems.map(item => ({ ...item }))]);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveChanges = () => {
    setAssetItems(editingAssets);
    setOtherLiabilityItems(editingOtherLiabilities);
    setIsEditing(false);
    toast({ title: 'Changes Saved', description: 'Assets and Other Liabilities have been updated.' });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    toast({ title: 'Edit Cancelled', description: 'No changes were saved.', variant: 'default' });
  };

  const handleItemChange = ( e: ChangeEvent<HTMLInputElement>, id: string, type: 'asset' | 'otherLiability', field: 'description' | 'amount' ) => {
    const value = field === 'amount' ? parseFloat(e.target.value) || 0 : e.target.value;
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleAddItemClick = (type: 'asset' | 'otherLiability') => {
    const newItem: StatementItem | OtherLiabilityItem = { id: `temp_${type}_${Date.now()}`, description: '', amount: 0 };
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => [...prev, newItem]);
  };

  const handleDeleteClick = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => {
     setItemToDelete({ item, type });
  };

  const confirmDeleteItem = () => {
    if (!itemToDelete) return;
    const { item: itemToRemove, type } = itemToDelete;
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => prev.filter(item => item.id !== itemToRemove.id));
    setItemToDelete(null);
    toast({ title: `${type === 'asset' ? 'Asset' : 'Liability'} Item Removed`, description: 'Save changes to persist.' });
  };

  // --- Render Functions ---
  const renderEditableRow = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => (
    <TableRow key={item.id} className="text-sm">
      <TableCell className="pl-2 py-1.5">
        {isEditing ? (<Input type="text" value={item.description} onChange={(e) => handleItemChange(e, item.id, type, 'description')} placeholder="Description" className="h-8"/>) : (item.description)}
      </TableCell>
      <TableCell className="text-right font-mono py-1.5">
        {isEditing ? (<Input type="number" step="0.01" value={item.amount.toString()} onChange={(e) => handleItemChange(e, item.id, type, 'amount')} placeholder="Amount" className="h-8 text-right w-32"/>) : (formatCurrency(item.amount))}
      </TableCell>
      {isEditing && (
         <TableCell className="w-[50px] py-1.5 pr-2 text-right">
           <AlertDialog open={itemToDelete?.item.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
             <AlertDialogTrigger asChild>
               <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(item, type)}>
                 <Trash2 className="h-4 w-4" /><span className="sr-only">Delete Item</span>
               </Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>Delete: <strong>{item.description || '(No description)'} ({formatCurrency(item.amount)})</strong>?</AlertDialogDescription></AlertDialogHeader>
               <AlertDialogFooter><AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction></AlertDialogFooter>
             </AlertDialogContent>
           </AlertDialog>
         </TableCell>
      )}
    </TableRow>
  );

   const renderDerivedItemRow = (item: TransactionWithId, type: 'income' | 'expense') => (
       <TableRow key={item.id} className="text-sm">
         <TableCell className="pl-2 py-1.5">{item.description}{formatCategoryBadge(item.frequency)}{formatCategoryBadge(item.variability)}</TableCell>
         <TableCell className="text-right font-mono py-1.5">{formatCurrency(type === 'income' ? item.amount : Math.abs(item.amount))}</TableCell>
       </TableRow>
   );

    const renderDerivedDebtRow = (debt: DebtItem) => (
        <TableRow key={debt.id} className="text-sm">
            <TableCell className="pl-2 py-1.5">{debt.description}</TableCell>
            <TableCell className="text-right font-mono py-1.5">{formatCurrency(debt.principal)}</TableCell>
            {isEditing && <TableCell></TableCell>}
        </TableRow>
    );

    const renderVarianceRow = (item: { description: string; budgeted: number; actual: number | null }) => {
         const actualValue = item.actual ?? 0;
         const budgetedValue = item.budgeted;
         const isUnbudgetedActual = item.description.startsWith('* ');
         const displayDescription = isUnbudgetedActual ? item.description.substring(2) : item.description;
         const isIncome = varianceDataByCategory.income.some(i => i.description === item.description || `* ${i.description}` === item.description);
         let variance = actualValue - budgetedValue; // Default: Actual - Budget
         if (!isIncome) variance = budgetedValue - actualValue; // For expenses/goals/debt: Budget - Actual

         let statusText = '-';
         let statusColor = 'text-muted-foreground';
         const isFavorable = (isIncome && variance >= 0) || (!isIncome && variance >= 0); // Favorable if income >= budget or non-income <= budget

          if (item.actual === null && budgetedValue === 0) statusText = '-';
          else if (isUnbudgetedActual) { statusText = `${isIncome ? '+' : '-'}${formatCurrency(actualValue)} (Unbudgeted)`; statusColor = isIncome ? 'text-accent' : 'text-destructive'; }
          else if (item.actual === null) { statusText = `${isIncome ? '-' : '+'}${formatCurrency(budgetedValue)} (Not ${isIncome ? 'Received' : 'Spent'})`; statusColor = isIncome ? 'text-destructive' : 'text-accent'; }
          else {
             const threshold = Math.max(Math.abs(budgetedValue * 0.01), 50);
             if (Math.abs(variance) <= threshold) { statusText = 'On Track'; statusColor = 'text-primary'; } // Neutral/primary for on track
             else if (isFavorable) { statusText = `+${formatCurrency(Math.abs(variance))} (Favorable)`; statusColor = 'text-accent'; }
             else { statusText = `-${formatCurrency(Math.abs(variance))} (Unfavorable)`; statusColor = 'text-destructive'; }
         }

        return (
            <TableRow key={item.description} className="text-sm">
                 <TableCell className={cn("pl-2 py-1.5", isUnbudgetedActual && "pl-6 italic text-muted-foreground")}>{displayDescription}</TableCell>
                 <TableCell className="text-right font-mono py-1.5">{budgetedValue > 0 ? formatCurrency(budgetedValue) : '-'}</TableCell>
                 <TableCell className="text-right font-mono py-1.5">{item.actual !== null ? formatCurrency(item.actual) : '-'}</TableCell>
                 <TableCell className={cn("text-right font-mono text-xs py-1.5", statusColor)}>{statusText}</TableCell>
            </TableRow>
        );
    };


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight text-foreground">Financial Statements</h1><p className="text-muted-foreground">Review your financial position and performance. Edit Assets and Other Liabilities only.</p></div>
         <div className="flex gap-2">{isEditing ? (<><Button variant="outline" onClick={handleCancelEdit}><XCircle className="mr-2 h-4 w-4" /> Cancel Edit</Button><Button onClick={handleSaveChanges}><Save className="mr-2 h-4 w-4" /> Save Changes</Button></>) : (<Button onClick={handleEditToggle}>Edit Assets/Liabilities</Button>)}</div>
      </header>

      <div className="flex flex-col sm:flex-row items-center gap-2 text-sm mb-6 p-4 border rounded-lg bg-card">
          <Label className="font-semibold">Select Date Range:</Label>
           <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-[180px] justify-start text-left font-normal h-8",!startDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{formatDate(startDate)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus/></PopoverContent></Popover>
           <span className="text-muted-foreground hidden sm:inline">-</span>
           <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-[180px] justify-start text-left font-normal h-8 mt-2 sm:mt-0",!endDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{formatDate(endDate)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={endDate} onSelect={setEndDate} disabled={(date) => startDate ? date < startDate : false} initialFocus/></PopoverContent></Popover>
       </div>

      <main className="flex-1 grid gap-6 lg:grid-cols-2">
        {/* Cash Flow Statement Card */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2">{cashFlow >= 0 ? <TrendingUp className="text-accent" /> : <TrendingDown className="text-destructive" />}Cash Flow Statement</CardTitle><CardDescription className="flex items-center gap-1 text-xs pt-2"><Info size={14} className="text-muted-foreground"/> Derived from Transactions within the selected date range.</CardDescription></CardHeader>
           <CardContent>
             <Accordion type="multiple" className="w-full">
                <AccordionItem value="income"><AccordionTriggerWithSum label="Income" sum={totalActualIncome} /><AccordionContent>{derivedIncomeItems.length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableBody>{derivedIncomeItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'income'))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No income in selected range.</p>)}</AccordionContent></AccordionItem>
                 <AccordionItem value="expenses" className="border-b-0"><AccordionTriggerWithSum label="Expenses" sum={totalActualExpenses} /><AccordionContent>{derivedExpenseItems.length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableBody>{derivedExpenseItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'expense'))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No expenses in selected range.</p>)}</AccordionContent></AccordionItem>
            </Accordion>
             <div className="mt-4 pt-4 border-t border-border"><div className="flex justify-between items-center text-lg font-bold"><span>Net Cash Flow</span><span className={`font-mono ${cashFlow >= 0 ? 'text-accent' : 'text-destructive'}`}>{formatCurrency(cashFlow)}</span></div></div>
          </CardContent>
        </Card>

        {/* Net Worth Statement Card */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="text-primary" />Net Worth Statement</CardTitle><CardDescription>Assets vs. Liabilities {isEditing ? '(Editing Assets & Other Liabilities)' : ''}</CardDescription></CardHeader>
           <CardContent>
             <Accordion type="multiple" className="w-full">
                 <AccordionItem value="assets"><AccordionTriggerWithSum label="Assets" sum={totalAssets} /><AccordionContent><ScrollArea className="h-[200px] w-full pr-3"><Table><TableBody>{(isEditing ? editingAssets : assetItems).map(item => renderEditableRow(item, 'asset'))}</TableBody></Table></ScrollArea>{isEditing && (<div className="text-center py-2 border-t border-dashed mt-2"><Button variant="ghost" size="sm" onClick={() => handleAddItemClick('asset')}><PlusCircle className="mr-2 h-4 w-4" /> Add Asset Item</Button></div>)}{(isEditing ? editingAssets : assetItems).length === 0 && !isEditing && (<p className="text-center text-muted-foreground py-4 text-sm">No assets recorded.</p>)}</AccordionContent></AccordionItem>
                 <AccordionItem value="liabilities" className="border-b-0"><AccordionTrigger className="text-base font-semibold hover:no-underline"><div className="flex justify-between w-full pr-2"><span>Liabilities</span><span className="font-semibold font-mono">({formatCurrency(totalLiabilities)})</span></div></AccordionTrigger><AccordionContent><ScrollArea className="h-[200px] w-full pr-3"><Accordion type="multiple" className="w-full pl-4 border-l ml-2"><AccordionItem value="short-term-debts"><AccordionTriggerWithSum label="Short-Term Debts" sum={totalShortTermDebt} className="text-sm font-medium text-muted-foreground hover:no-underline py-2" /><AccordionContent className="pb-2">{shortTermDebts.length > 0 ? (<Table><TableBody>{shortTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>) : (<p className="text-center text-muted-foreground py-2 text-xs">No short-term debts.</p>)}</AccordionContent></AccordionItem><AccordionItem value="long-term-debts"><AccordionTriggerWithSum label="Long-Term Debts" sum={totalLongTermDebt} className="text-sm font-medium text-muted-foreground hover:no-underline py-2" /><AccordionContent className="pb-2">{longTermDebts.length > 0 ? (<Table><TableBody>{longTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>) : (<p className="text-center text-muted-foreground py-2 text-xs">No long-term debts.</p>)}</AccordionContent></AccordionItem><AccordionItem value="other-liabilities" className="border-b-0"><AccordionTriggerWithSum label="Other Liabilities" sum={totalOtherLiabilities} className="text-sm font-medium text-muted-foreground hover:no-underline py-2" /><AccordionContent className="pb-2"><Table><TableBody>{(isEditing ? editingOtherLiabilities : otherLiabilityItems).map(item => renderEditableRow(item, 'otherLiability'))}</TableBody></Table>{isEditing && (<div className="text-center py-2 border-t border-dashed mt-2"><Button variant="ghost" size="sm" onClick={() => handleAddItemClick('otherLiability')}><MinusCircle className="mr-2 h-4 w-4" /> Add Other Liability</Button></div>)}{(isEditing ? editingOtherLiabilities : otherLiabilityItems).length === 0 && !isEditing && (<p className="text-center text-muted-foreground py-4 text-sm">No other liabilities.</p>)}</AccordionContent></AccordionItem></Accordion></ScrollArea></AccordionContent></AccordionItem>
            </Accordion>
             <div className="mt-4 pt-4 border-t border-border"><div className="flex justify-between items-center text-lg font-bold"><span>Net Worth</span><span className={`font-mono ${netWorth >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCurrency(netWorth)}</span></div></div>
          </CardContent>
        </Card>

         {/* Budget Variance Report Card */}
         <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><PieChartIcon className="h-5 w-5 text-primary"/>Budget Variance Report</CardTitle>
                 {/* Updated description */}
                 <CardDescription>Compares the budget for <span className='font-semibold'>{format(parse(budgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy')}</span> with actual transactions from <span className='font-semibold'>{formatDate(startDate)}</span> to <span className='font-semibold'>{formatDate(endDate)}</span>.</CardDescription>
                 <p className='text-xs text-muted-foreground pt-2 flex items-center gap-1'><Info size={14}/>Actuals marked with * are unbudgeted. Variance = Actual Net - Budgeted Net (for the respective periods).</p>
            </CardHeader>
            <CardContent>
                 <Accordion type="multiple" className="w-full">
                      {/* Income Variance */}
                      <AccordionItem value="income-variance">
                         <AccordionTriggerWithSum label="Income" sum={varianceTotalsByCategory.income.actual} budgetedSum={varianceTotalsByCategory.income.budgeted} variance={varianceTotalsByCategory.income.actual - varianceTotalsByCategory.income.budgeted} className="text-accent" />
                          <AccordionContent>{varianceDataByCategory.income.length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[150px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.income.map(renderVarianceRow)}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No income data.</p>)}</AccordionContent>
                      </AccordionItem>

                      {/* Expenses Variance */}
                     <AccordionItem value="expenses-variance">
                          <AccordionTriggerWithSum label="Expenses" sum={varianceTotalsByCategory['recurring-expense'].actual + varianceTotalsByCategory['one-time-expense'].actual} budgetedSum={varianceTotalsByCategory['recurring-expense'].budgeted + varianceTotalsByCategory['one-time-expense'].budgeted} variance={(varianceTotalsByCategory['recurring-expense'].budgeted + varianceTotalsByCategory['one-time-expense'].budgeted) - (varianceTotalsByCategory['recurring-expense'].actual + varianceTotalsByCategory['one-time-expense'].actual)} className="text-destructive" />
                          <AccordionContent>{(varianceDataByCategory['recurring-expense'].length > 0 || varianceDataByCategory['one-time-expense'].length > 0) ? (<ScrollArea className="h-[300px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[150px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['recurring-expense'].map(renderVarianceRow)}{varianceDataByCategory['one-time-expense'].map(renderVarianceRow)}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No expense data.</p>)}</AccordionContent>
                     </AccordionItem>

                     {/* Goals Variance */}
                     <AccordionItem value="goals-variance">
                          <AccordionTriggerWithSum label="Goals" sum={varianceTotalsByCategory.goal.actual} budgetedSum={varianceTotalsByCategory.goal.budgeted} variance={varianceTotalsByCategory.goal.budgeted - varianceTotalsByCategory.goal.actual} className="text-primary" />
                          <AccordionContent>{varianceDataByCategory.goal.length > 0 ? (<ScrollArea className="h-[150px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[150px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.goal.map(renderVarianceRow)}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No goal data.</p>)}</AccordionContent>
                     </AccordionItem>

                      {/* Debt Allocation Variance */}
                       <AccordionItem value="debt-variance" className="border-b-0">
                         <AccordionTriggerWithSum label="Debt Allocation" sum={varianceTotalsByCategory.debt.actual} budgetedSum={varianceTotalsByCategory.debt.budgeted} variance={varianceTotalsByCategory.debt.budgeted - varianceTotalsByCategory.debt.actual} className="text-destructive/80" />
                         <AccordionContent>{varianceDataByCategory.debt.length > 0 ? (<ScrollArea className="h-[150px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[150px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.debt.map(renderVarianceRow)}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No debt allocation data.</p>)}</AccordionContent>
                     </AccordionItem>
                 </Accordion>

                 <div className="mt-6 pt-4 border-t border-border">
                     <Table>
                         <TableFooter>
                             <TableRow className="bg-muted/30 font-bold text-lg">
                                 <TableCell>Net Totals</TableCell>
                                 <TableCell className="text-right font-mono">{formatCurrency(varianceTotalsByCategory.netBudgeted)}</TableCell>
                                 <TableCell className="text-right font-mono">{formatCurrency(varianceTotalsByCategory.netActual)}</TableCell>
                                 <TableCell className={cn("text-right font-mono text-sm", varianceTotalsByCategory.overallVariance >= 0 ? 'text-accent' : 'text-destructive')}>
                                     {varianceTotalsByCategory.overallVariance >= 0 ? '+' : ''}{formatCurrency(varianceTotalsByCategory.overallVariance)}
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
