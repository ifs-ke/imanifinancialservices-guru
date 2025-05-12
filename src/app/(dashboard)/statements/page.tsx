// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, TrendingUp, TrendingDown, Scale, Landmark, PlusCircle, Save, XCircle, Info, Calendar as CalendarIcon, Coins, MinusCircle, Target as TargetIcon, AlertTriangle as AlertTriangleIcon, PieChart as PieChartIcon, CheckCircle } from 'lucide-react';
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
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, parse, differenceInDays, getDaysInMonth, isEqual, isValid as isDateValid } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore, selectCurrentBudgetPeriod } from '@/store/budgetStore';
import { BudgetItemCategorySchema } from '@/lib/schemas';
import type { StatementItem, DebtItem, OtherLiabilityItem, TransactionWithId, BudgetItem, BudgetItemCategory } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


// Calculation Function
const calculateTotal = (items: { amount: number }[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: DebtItem[]) => items.reduce((sum, item) => sum + item.principal, 0);


// Helper to format Date for display
const formatDateForStatements = (date: Date | undefined) => {
    if (!date || !isDateValid(date)) return <span>Pick a date</span>;
    return format(date, "LLL dd, y");
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
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; budgetedSum?: number | null; variance?: number | null; itemCount?: number, icon?: React.ElementType }
>(({ label, sum, budgetedSum, variance, itemCount, icon: Icon, children, className, ...props }, ref) => {
    const hasBudget = budgetedSum !== undefined && budgetedSum !== null;
    const hasVariance = variance !== undefined && variance !== null;
    let varianceColor = 'text-muted-foreground';
    if (hasVariance && variance > 0) varianceColor = 'text-accent'; // Favorable
    if (hasVariance && variance < 0) varianceColor = 'text-destructive'; // Unfavorable

  return (
      <AccordionTrigger ref={ref} {...props} className={cn('hover:no-underline py-3 px-4 data-[state=open]:border-b data-[state=closed]:border-b-0', className)}>
        <div className="flex justify-between items-center w-full">
            <span className="flex items-center gap-2 text-base font-semibold">
               {Icon && <Icon className="h-4 w-4" />}
              {label}
               {hasBudget && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">(Budget: {formatCurrency(budgetedSum)})</span>
               )}
            </span>
            <div className="flex items-center gap-2">
                {itemCount !== undefined && itemCount > 0 && <span className="text-xs text-muted-foreground">({itemCount} items)</span>}
                {hasVariance && (
                    <Badge variant={isFinite(variance) ? (variance >=0 ? "default" : "destructive") : "outline"} className={cn("text-xs font-mono", varianceColor)}>
                      {variance >= 0 ? '+' : ''}{isFinite(variance) ? formatCurrency(variance) : 'N/A'}
                    </Badge>
                )}
                <span className="font-semibold font-mono text-base">{formatCurrency(sum)}</span>
            </div>
        </div>
      </AccordionTrigger>
  );
});
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


export default function StatementsPage() {
  const transactions = useTransactionsStore(state => state.transactions);
  const debts = useDebtStore(state => state.debts);
  const {
      assetItems, otherLiabilityItems,
      startDate, endDate, setStartDate, setEndDate,
  } = useStatementStore();
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const budgetPeriod = useBudgetStore(selectCurrentBudgetPeriod);

  const [isEditing, setIsEditing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: StatementItem | OtherLiabilityItem; type: 'asset' | 'otherLiability' } | null>(null);
  const [editingAssets, setEditingAssets] = useState<StatementItem[]>([]);
  const [editingOtherLiabilities, setEditingOtherLiabilities] = useState<OtherLiabilityItem[]>([]);

  const { toast } = useToast();

  const filteredTransactions = useMemo(() => {
    const start = startDate && isDateValid(startDate) ? startDate : dfnsStartOfMonth(new Date());
    const end = endDate && isDateValid(endDate) ? endDate : dfnsEndOfMonth(new Date());
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);

    return transactions.filter(tx => {
        const txDate = tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date);
        if (!isDateValid(txDate)) return false;
        const txTime = txDate.getTime();
        return txTime >= start.getTime() && txTime <= endOfDay.getTime();
    });
  }, [transactions, startDate, endDate]);

  const derivedIncomeItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount > 0)
      .map(tx => ({ ...tx, date: tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date) }))
      .sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)),
    [filteredTransactions]
  );

  const derivedExpenseItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount < 0)
      .map(tx => ({ ...tx, amount: Math.abs(tx.amount), date: tx.date instanceof Date && isDateValid(tx.date) ? tx.date : new Date(tx.date) }))
      .sort((a, b) => (b.date instanceof Date ? b.date.getTime() : 0) - (a.date instanceof Date ? a.date.getTime() : 0)),
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

   const actualSpendingByCategory = useMemo(() => {
        const actuals: Record<string, { amount: number; count: number, category: BudgetItemCategory | 'unplanned-expense', originalDescription: string }> = {};
        const budgetItemsForSelectedPeriod = allBudgetItems.filter(item => item.period === budgetPeriod);

        filteredTransactions.forEach(tx => {
            if (tx.amount === 0) return; 

            const isIncome = tx.amount > 0;
            let matchedBudgetItem: BudgetItem | undefined = undefined;

            if (!isIncome) {
                matchedBudgetItem = budgetItemsForSelectedPeriod.find(
                    bi => bi.description.toLowerCase() === tx.description.toLowerCase() &&
                          (BudgetItemCategorySchema.options as ReadonlyArray<string>).includes(bi.category) && 
                          bi.category !== 'income' 
                );
            }

            const category: BudgetItemCategory | 'unplanned-expense' = isIncome
                ? 'income'
                : matchedBudgetItem
                  ? matchedBudgetItem.category
                  : 'unplanned-expense';

            const keyDescription = matchedBudgetItem ? matchedBudgetItem.description : tx.description;
            const groupKey = `${category}-${keyDescription.toLowerCase()}`; 
            const amount = Math.abs(tx.amount);

            if (!actuals[groupKey]) {
                actuals[groupKey] = { amount: 0, count: 0, category, originalDescription: keyDescription };
            }
            actuals[groupKey].amount += amount;
            actuals[groupKey].count += 1;
        });
        return actuals;
    }, [filteredTransactions, allBudgetItems, budgetPeriod]);


    const varianceDataByCategory = useMemo(() => {
        const initialVarianceByCategory: Record<BudgetItemCategory | 'unplanned-expense', { description: string; budgeted: number; actual: number | null }[]> = {
            income: [],
            'recurring-expense': [],
            'one-time-expense': [],
            goal: [],
            debt: [],
            'unplanned-expense': [],
        };
        const actualsTracked: Set<string> = new Set();
        const budgetItemsForSelectedPeriod = allBudgetItems.filter(item => item.period === budgetPeriod);

        const stmtStart = startDate && isDateValid(startDate) ? startDate : dfnsStartOfMonth(new Date());
        const stmtEnd = endDate && isDateValid(endDate) ? endDate : dfnsEndOfMonth(new Date());
        const budgetMonthDate = parse(budgetPeriod, 'yyyy-MM', new Date());
        const budgetMonthStart = dfnsStartOfMonth(budgetMonthDate);
        const budgetMonthEnd = dfnsEndOfMonth(budgetMonthDate);
        const daysInBudgetMonth = getDaysInMonth(budgetMonthDate);

        budgetItemsForSelectedPeriod.forEach(item => {
            const descKey = item.description.toLowerCase();
            const categoryKey = item.category;
            const actualGroupKey = `${categoryKey}-${descKey}`;
            
            const actualGroup = actualSpendingByCategory[actualGroupKey];
            const actualAmount = actualGroup ? actualGroup.amount : null;

            let budgetAmountToCompare = item.amount;
            const statementOverlapsBudgetMonth = (stmtStart <= budgetMonthEnd && stmtEnd >= budgetMonthStart);

            if (statementOverlapsBudgetMonth && !(isEqual(stmtStart, budgetMonthStart) && isEqual(stmtEnd, budgetMonthEnd)) && daysInBudgetMonth > 0) {
                const overlapStart = stmtStart > budgetMonthStart ? stmtStart : budgetMonthStart;
                const overlapEnd = stmtEnd < budgetMonthEnd ? stmtEnd : budgetMonthEnd;
                let effectiveDaysInStatementForBudget = 0;
                if (overlapEnd >= overlapStart) {
                     effectiveDaysInStatementForBudget = differenceInDays(overlapEnd, overlapStart) + 1;
                }
                budgetAmountToCompare = effectiveDaysInStatementForBudget > 0 ? (item.amount / daysInBudgetMonth) * effectiveDaysInStatementForBudget : 0;
            } else if (!statementOverlapsBudgetMonth) {
                 budgetAmountToCompare = 0;
            }
            
            if (initialVarianceByCategory[categoryKey]) {
                initialVarianceByCategory[categoryKey].push({ description: item.description, budgeted: budgetAmountToCompare, actual: actualAmount });
                if (actualGroup) actualsTracked.add(actualGroupKey);
            }
        });

        Object.entries(actualSpendingByCategory).forEach(([groupKey, data]) => {
            if (!actualsTracked.has(groupKey)) {
                 const targetCategoryArray = initialVarianceByCategory[data.category];
                if (targetCategoryArray) { // Check if the category exists in initialVarianceByCategory
                     targetCategoryArray.push({
                         description: `* ${data.originalDescription}`,
                         budgeted: 0,
                         actual: data.amount,
                     });
                 } else if (data.category === 'unplanned-expense') { // Explicitly handle unplanned-expense if somehow missed
                      initialVarianceByCategory['unplanned-expense'].push({
                          description: `* ${data.originalDescription}`,
                          budgeted: 0,
                          actual: data.amount,
                      });
                 }
            }
        });

       Object.keys(initialVarianceByCategory).forEach(key => {
           const catKey = key as BudgetItemCategory | 'unplanned-expense';
            if (initialVarianceByCategory[catKey]) { // Check if category array exists before sorting
                initialVarianceByCategory[catKey].sort((a, b) => {
                    const aUnbudgeted = a.description.startsWith('* ');
                    const bUnbudgeted = b.description.startsWith('* ');
                    if (aUnbudgeted && !bUnbudgeted) return 1;
                    if (!aUnbudgeted && bUnbudgeted) return -1;
                    return a.description.localeCompare(b.description);
                });
            }
       });
       return initialVarianceByCategory;
   }, [allBudgetItems, budgetPeriod, actualSpendingByCategory, startDate, endDate]);


   const varianceTotalsByCategory = useMemo(() => {
        const totals: Record<BudgetItemCategory | 'unplanned-expense', { budgeted: number; actual: number }> = {
            income: { budgeted: 0, actual: 0 },
            'recurring-expense': { budgeted: 0, actual: 0 },
            'one-time-expense': { budgeted: 0, actual: 0 },
            goal: { budgeted: 0, actual: 0 },
            debt: { budgeted: 0, actual: 0 },
            'unplanned-expense': { budgeted: 0, actual: 0 },
        };

        Object.entries(varianceDataByCategory).forEach(([categoryStringKey, items]) => {
            const catKey = categoryStringKey as BudgetItemCategory | 'unplanned-expense';
            if (totals[catKey]) { 
                items.forEach(item => {
                    totals[catKey].budgeted += (item.budgeted || 0);
                    totals[catKey].actual += (item.actual ?? 0);
                });
            }
        });
       const netBudgeted = totals.income.budgeted - totals['recurring-expense'].budgeted - totals['one-time-expense'].budgeted - totals.goal.budgeted - totals.debt.budgeted;
       const netActual = totals.income.actual - totals['recurring-expense'].actual - totals['one-time-expense'].actual - totals.goal.actual - totals.debt.actual - totals['unplanned-expense'].actual;
       const overallVariance = netActual - netBudgeted;
       return { ...totals, netBudgeted, netActual, overallVariance };
   }, [varianceDataByCategory]);


  const handleEditToggle = () => {
    if (!isEditing) {
      setEditingAssets([...assetItems.map(item => ({ ...item }))]);
      setEditingOtherLiabilities([...otherLiabilityItems.map(item => ({ ...item }))]);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveChanges = () => {
    useStatementStore.getState().setAssetItems(editingAssets);
    useStatementStore.getState().setOtherLiabilityItems(editingOtherLiabilities);
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

    const renderVarianceRow = (category: BudgetItemCategory | 'unplanned-expense', description: string, budgeted: number, actual: number | null) => {
         const actualValue = actual ?? 0;
         const budgetedValue = budgeted;
         const isUnbudgetedActual = description.startsWith('* ');
         const displayDescription = isUnbudgetedActual ? description.substring(2) : description;
         const isIncome = category === 'income';
         
         let variance = isIncome ? actualValue - budgetedValue : budgetedValue - actualValue;
    
         let statusText = '-';
         let statusColor = 'text-muted-foreground';
         const isFavorable = variance >= 0; 
    
          if (actual === null && budgetedValue === 0 && !isUnbudgetedActual) statusText = '-';
          else if (isUnbudgetedActual) { statusText = `${isIncome ? '+' : '-'}${formatCurrency(actualValue)} (Unbudgeted)`; statusColor = isIncome ? 'text-accent' : 'text-destructive'; }
          else if (actual === null) { statusText = `${isIncome ? '-' : '+'}${formatCurrency(budgetedValue)} (Not ${isIncome ? 'Received' : 'Spent'})`; statusColor = isIncome ? 'text-destructive' : 'text-accent'; }
          else {
             const threshold = Math.max(Math.abs(budgetedValue * 0.05), 50); 
             if (Math.abs(variance) <= threshold) { statusText = 'On Track'; statusColor = 'text-primary'; }
             else if (isFavorable) { statusText = `+${formatCurrency(Math.abs(variance))} (Favorable)`; statusColor = 'text-accent'; }
             else { statusText = `-${formatCurrency(Math.abs(variance))} (Unfavorable)`; statusColor = 'text-destructive'; }
         }
    
        return (
            <TableRow key={`${category}-${description}`} className="text-sm">
                 <TableCell className={cn("pl-2 py-1.5", isUnbudgetedActual && "pl-6 italic text-muted-foreground")}>{displayDescription}</TableCell>
                 <TableCell className="text-right font-mono py-1.5">{budgetedValue > 0 ? formatCurrency(budgetedValue) : (isUnbudgetedActual || actual === null ? '-' : formatCurrency(0))}</TableCell>
                 <TableCell className="text-right font-mono py-1.5">{actual !== null ? formatCurrency(actual) : '-'}</TableCell>
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
           <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-[180px] justify-start text-left font-normal h-8",!startDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{formatDateForStatements(startDate)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus/></PopoverContent></Popover>
           <span className="text-muted-foreground hidden sm:inline">-</span>
           <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full sm:w-[180px] justify-start text-left font-normal h-8 mt-2 sm:mt-0",!endDate && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{formatDateForStatements(endDate)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={endDate} onSelect={setEndDate} disabled={(date) => startDate ? date < startDate : false} initialFocus/></PopoverContent></Popover>
       </div>

      <main className="flex-1 grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2">{cashFlow >= 0 ? <TrendingUp className="text-accent" /> : <TrendingDown className="text-destructive" />}Cash Flow Statement</CardTitle><CardDescription className="flex items-center gap-1 text-xs pt-2"><Info size={14} className="text-muted-foreground"/> Derived from Transactions within the selected date range.</CardDescription></CardHeader>
           <CardContent>
             <Accordion type="multiple" className="w-full" defaultValue={[]}>
                <AccordionItem value="income"><AccordionTriggerWithSum label="Income" sum={totalActualIncome} itemCount={derivedIncomeItems.length} icon={TrendingUp} className="text-accent hover:text-accent-foreground data-[state=closed]:border-b" /><AccordionContent>{derivedIncomeItems.length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableBody>{derivedIncomeItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'income'))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No income in selected range.</p>)}</AccordionContent></AccordionItem>
                 <AccordionItem value="expenses"><AccordionTriggerWithSum label="Expenses" sum={totalActualExpenses} itemCount={derivedExpenseItems.length} icon={TrendingDown} className="text-destructive hover:text-destructive-foreground data-[state=closed]:border-b" /><AccordionContent>{derivedExpenseItems.length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableBody>{derivedExpenseItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'expense'))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No expenses in selected range.</p>)}</AccordionContent></AccordionItem>
            </Accordion>
             <CardFooter className="mt-4 pt-4 border-t border-border"><div className="flex justify-between items-center text-lg font-bold"><span>Net Cash Flow</span><span className={`font-mono ${cashFlow >= 0 ? 'text-accent' : 'text-destructive'}`}>{formatCurrency(cashFlow)}</span></div></CardFooter>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="text-primary" />Net Worth Statement</CardTitle><CardDescription>Assets vs. Liabilities {isEditing ? '(Editing Assets & Other Liabilities)' : ''}</CardDescription></CardHeader>
           <CardContent>
             <Accordion type="multiple" className="w-full" defaultValue={[]}>
                 <AccordionItem value="assets"><AccordionTriggerWithSum label="Assets" sum={totalAssets} itemCount={(isEditing ? editingAssets : assetItems).length} icon={Landmark} className="text-primary hover:text-primary-foreground data-[state=closed]:border-b" /><AccordionContent><ScrollArea className="h-[200px] w-full pr-3"><Table><TableBody>{(isEditing ? editingAssets : assetItems).map(item => renderEditableRow(item, 'asset'))}</TableBody></Table></ScrollArea>{isEditing && (<div className="text-center py-2 border-t border-dashed mt-2"><Button variant="ghost" size="sm" onClick={() => handleAddItemClick('asset')}><PlusCircle className="mr-2 h-4 w-4" /> Add Asset Item</Button></div>)}{(isEditing ? editingAssets : assetItems).length === 0 && !isEditing && (<p className="text-center text-muted-foreground py-4 text-sm">No assets recorded.</p>)}</AccordionContent></AccordionItem>
                 <AccordionItem value="liabilities"><AccordionTrigger className="text-base font-semibold hover:no-underline text-destructive hover:text-destructive-foreground data-[state=closed]:border-b"><div className="flex justify-between items-center w-full pr-2"><span className='flex items-center gap-2'><Coins className="h-4 w-4" />Liabilities</span><span className="font-semibold font-mono">({formatCurrency(totalLiabilities)})</span></div></AccordionTrigger><AccordionContent><ScrollArea className="h-[200px] w-full pr-3"><Accordion type="multiple" className="w-full pl-4 border-l ml-2" defaultValue={[]}><AccordionItem value="short-term-debts"><AccordionTriggerWithSum label="Short-Term Debts" sum={totalShortTermDebt} itemCount={shortTermDebts.length} className="text-sm font-medium text-muted-foreground hover:no-underline py-2 data-[state=closed]:border-b" /><AccordionContent className="pb-2">{shortTermDebts.length > 0 ? (<Table><TableBody>{shortTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>) : (<p className="text-center text-muted-foreground py-2 text-xs">No short-term debts.</p>)}</AccordionContent></AccordionItem><AccordionItem value="long-term-debts"><AccordionTriggerWithSum label="Long-Term Debts" sum={totalLongTermDebt} itemCount={longTermDebts.length} className="text-sm font-medium text-muted-foreground hover:no-underline py-2 data-[state=closed]:border-b" /><AccordionContent className="pb-2">{longTermDebts.length > 0 ? (<Table><TableBody>{longTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>) : (<p className="text-center text-muted-foreground py-2 text-xs">No long-term debts.</p>)}</AccordionContent></AccordionItem><AccordionItem value="other-liabilities"><AccordionTriggerWithSum label="Other Liabilities" sum={totalOtherLiabilities} itemCount={(isEditing ? editingOtherLiabilities : otherLiabilityItems).length} className="text-sm font-medium text-muted-foreground hover:no-underline py-2 data-[state=closed]:border-b" /><AccordionContent className="pb-2"><Table><TableBody>{(isEditing ? editingOtherLiabilities : otherLiabilityItems).map(item => renderEditableRow(item, 'otherLiability'))}</TableBody></Table>{isEditing && (<div className="text-center py-2 border-t border-dashed mt-2"><Button variant="ghost" size="sm" onClick={() => handleAddItemClick('otherLiability')}><MinusCircle className="mr-2 h-4 w-4" /> Add Other Liability</Button></div>)}{(isEditing ? editingOtherLiabilities : otherLiabilityItems).length === 0 && !isEditing && (<p className="text-center text-muted-foreground py-4 text-sm">No other liabilities.</p>)}</AccordionContent></AccordionItem></Accordion></ScrollArea></AccordionContent></AccordionItem>
            </Accordion>
             <CardFooter className="mt-4 pt-4 border-t border-border"><div className="flex justify-between items-center text-lg font-bold"><span>Net Worth</span><span className={`font-mono ${netWorth >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCurrency(netWorth)}</span></div></CardFooter>
          </CardContent>
        </Card>

         <Card className="lg:col-span-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><PieChartIcon className="h-5 w-5 text-primary"/>Budget Variance Report</CardTitle>
                 <CardDescription>Compares the budget for <span className='font-semibold'>{budgetPeriod && isDateValid(parse(budgetPeriod, 'yyyy-MM', new Date())) ? format(parse(budgetPeriod, 'yyyy-MM', new Date()), 'MMMM yyyy') : 'Selected Period'}</span> with actual transactions from <span className='font-semibold'>{formatDateForStatements(startDate)}</span> to <span className='font-semibold'>{formatDateForStatements(endDate)}</span>.</CardDescription>
                 <p className='text-xs text-muted-foreground pt-2 flex items-center gap-1'><Info size={14}/>Actuals marked with * are unbudgeted. Variance is (Actual Net - Budgeted Net).</p>
            </CardHeader>
            <CardContent>
                 <Accordion type="multiple" className="w-full" defaultValue={[]}>
                      <AccordionItem value="income-variance">
                         <AccordionTriggerWithSum label="Income" icon={TrendingUp} sum={varianceTotalsByCategory.income.actual} budgetedSum={varianceTotalsByCategory.income.budgeted} variance={varianceTotalsByCategory.income.actual - varianceTotalsByCategory.income.budgeted} className="text-accent hover:text-accent-foreground data-[state=closed]:border-b" />
                          <AccordionContent>{varianceDataByCategory.income.length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[180px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.income.map(item => renderVarianceRow('income', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No income data for variance.</p>)}</AccordionContent>
                      </AccordionItem>

                     <AccordionItem value="recurring-expense-variance">
                          <AccordionTriggerWithSum label="Recurring Expenses" icon={TrendingDown} sum={varianceTotalsByCategory['recurring-expense'].actual} budgetedSum={varianceTotalsByCategory['recurring-expense'].budgeted} variance={varianceTotalsByCategory['recurring-expense'].budgeted - varianceTotalsByCategory['recurring-expense'].actual} className="text-destructive hover:text-destructive-foreground data-[state=closed]:border-b" />
                          <AccordionContent>{varianceDataByCategory['recurring-expense'].length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[180px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['recurring-expense'].map(item => renderVarianceRow('recurring-expense', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No recurring expense data for variance.</p>)}</AccordionContent>
                     </AccordionItem>
                     
                     <AccordionItem value="one-time-expense-variance">
                          <AccordionTriggerWithSum label="One-Time Expenses" icon={MinusCircle} sum={varianceTotalsByCategory['one-time-expense'].actual} budgetedSum={varianceTotalsByCategory['one-time-expense'].budgeted} variance={varianceTotalsByCategory['one-time-expense'].budgeted - varianceTotalsByCategory['one-time-expense'].actual} className="text-destructive hover:text-destructive-foreground data-[state=closed]:border-b" />
                          <AccordionContent>{varianceDataByCategory['one-time-expense'].length > 0 ? (<ScrollArea className="h-[200px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[180px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['one-time-expense'].map(item => renderVarianceRow('one-time-expense', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No one-time expense data for variance.</p>)}</AccordionContent>
                     </AccordionItem>

                      <AccordionItem value="unplanned-expense-variance">
                          <AccordionTriggerWithSum label="Unplanned Expenses" icon={AlertTriangleIcon} sum={varianceTotalsByCategory['unplanned-expense'].actual} budgetedSum={0} variance={0 - varianceTotalsByCategory['unplanned-expense'].actual} className="text-destructive hover:text-destructive-foreground data-[state=closed]:border-b" />
                          <AccordionContent>{varianceDataByCategory['unplanned-expense'].length > 0 ? (<ScrollArea className="h-[150px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[180px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory['unplanned-expense'].map(item => renderVarianceRow('unplanned-expense', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No unplanned expenses.</p>)}</AccordionContent>
                      </AccordionItem>

                     <AccordionItem value="goal-variance">
                          <AccordionTriggerWithSum label="Goals" icon={TargetIcon} sum={varianceTotalsByCategory.goal.actual} budgetedSum={varianceTotalsByCategory.goal.budgeted} variance={varianceTotalsByCategory.goal.budgeted - varianceTotalsByCategory.goal.actual} className="text-primary hover:text-primary-foreground data-[state=closed]:border-b" />
                          <AccordionContent>{varianceDataByCategory.goal.length > 0 ? (<ScrollArea className="h-[150px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[180px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.goal.map(item => renderVarianceRow('goal', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No goal data for variance.</p>)}</AccordionContent>
                     </AccordionItem>

                       <AccordionItem value="debt-variance" className="border-b-0">
                         <AccordionTriggerWithSum label="Debt Allocation" icon={Coins} sum={varianceTotalsByCategory.debt.actual} budgetedSum={varianceTotalsByCategory.debt.budgeted} variance={varianceTotalsByCategory.debt.budgeted - varianceTotalsByCategory.debt.actual} className="text-destructive/80 hover:text-destructive-foreground/80 data-[state=closed]:border-b" />
                         <AccordionContent>{varianceDataByCategory.debt.length > 0 ? (<ScrollArea className="h-[150px] w-full pr-3"><Table><TableHeader className="sticky top-0 bg-background z-10"><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right w-[180px]">Variance</TableHead></TableRow></TableHeader><TableBody>{varianceDataByCategory.debt.map(item => renderVarianceRow('debt', item.description, item.budgeted, item.actual))}</TableBody></Table></ScrollArea>) : (<p className="text-center text-muted-foreground py-4 text-sm">No debt allocation data for variance.</p>)}</AccordionContent>
                     </AccordionItem>
                 </Accordion>

                 <CardFooter className="mt-6 pt-4 border-t border-border">
                     <Table>
                         <TableFooter>
                             <TableRow className="bg-muted/30 font-bold text-lg">
                                 <TableCell>Net Budgeted</TableCell>
                                 <TableCell className="text-right font-mono" colSpan={2}>{formatCurrency(varianceTotalsByCategory.netBudgeted)}</TableCell>
                                 <TableCell className="text-right font-mono">&nbsp;</TableCell> 
                              </TableRow>
                              <TableRow className="font-bold text-lg">
                                 <TableCell>Net Actual</TableCell>
                                 <TableCell className="text-right font-mono" colSpan={2}>{formatCurrency(varianceTotalsByCategory.netActual)}</TableCell>
                                 <TableCell className="text-right font-mono">&nbsp;</TableCell>
                              </TableRow>
                             <TableRow className="bg-muted/30 font-bold text-xl border-t-2 border-primary">
                                 <TableCell>Overall Variance</TableCell>
                                 <TableCell colSpan={2}>&nbsp;</TableCell>
                                 <TableCell className={cn("text-right font-mono", varianceTotalsByCategory.overallVariance >= 0 ? 'text-accent' : 'text-destructive')}>
                                     {varianceTotalsByCategory.overallVariance >= 0 ? '+' : ''}{formatCurrency(varianceTotalsByCategory.overallVariance)}
                                 </TableCell>
                              </TableRow>
                          </TableFooter>
                     </Table>
                  </CardFooter>
             </CardContent>
         </Card>
      </main>
    </div>
  );
}

