
// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter as UiTableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, TrendingUp, TrendingDown, Scale, DollarSign, Landmark, PlusCircle, Save, XCircle, Info, Calendar as CalendarIcon, Coins, MinusCircle } from 'lucide-react'; // Added Coins, MinusCircle
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
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTransactions } from '@/contexts/TransactionsContext';
import { useDebt } from '@/contexts/DebtContext';
import type { StatementItem, DebtItem, OtherLiabilityItem } from '@/lib/types'; // Import all needed types

// Generate unique IDs
const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Initial Mock Data for Assets (values in KES)
const initialAssets: StatementItem[] = [
  { id: generateId(), description: 'Checking Account', amount: 250000 },
  { id: generateId(), description: 'Savings Account', amount: 1000000 },
  { id: generateId(), description: 'Car (Estimated Value)', amount: 800000 },
  { id: generateId(), description: 'Investments', amount: 500000 },
];

// Initial Mock Data for Other Liabilities (values in KES)
const initialOtherLiabilities: OtherLiabilityItem[] = [
    { id: generateId(), description: 'Unpaid Bill (Phone)', amount: 5000 },
    { id: generateId(), description: 'Personal Loan (Friend)', amount: 20000 },
];

// Calculation Function
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


export default function StatementsPage() {
  // Context hooks
  const { transactions } = useTransactions();
  const { debts } = useDebt();

  // State for editable items
  const [assetItems, setAssetItems] = useState<StatementItem[]>(initialAssets);
  const [otherLiabilityItems, setOtherLiabilityItems] = useState<OtherLiabilityItem[]>(initialOtherLiabilities);

  const [isEditing, setIsEditing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: StatementItem | OtherLiabilityItem; type: 'asset' | 'otherLiability' } | null>(null);

  // State for date range filtering
  const defaultEndDate = endOfMonth(new Date());
  const defaultStartDate = startOfMonth(defaultEndDate);
  const [startDate, setStartDate] = useState<Date | undefined>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date | undefined>(defaultEndDate);

  // Temporary state for edits
  const [editingAssets, setEditingAssets] = useState<StatementItem[]>([]);
  const [editingOtherLiabilities, setEditingOtherLiabilities] = useState<OtherLiabilityItem[]>([]);

  const { toast } = useToast();

  // --- Derived Calculations ---

  const filteredTransactions = useMemo(() => {
    const start = startDate ? startDate.getTime() : 0;
    const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Date.now();
    return transactions.filter(tx => {
        if (!tx.date || isNaN(tx.date.getTime())) return false;
        const txTime = tx.date.getTime();
        return txTime >= start && txTime <= end;
    });
  }, [transactions, startDate, endDate]);


  const derivedIncomeItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount > 0)
      .map(tx => ({ id: tx.id, description: tx.description, amount: tx.amount }))
      .sort((a, b) => b.amount - a.amount),
    [filteredTransactions]
  );

  const derivedExpenseItems = useMemo(() =>
    filteredTransactions
      .filter(tx => tx.amount < 0)
      .map(tx => ({ id: tx.id, description: tx.description, amount: Math.abs(tx.amount) }))
      .sort((a, b) => b.amount - a.amount),
    [filteredTransactions]
  );

  const totalIncome = useMemo(() => calculateTotal(derivedIncomeItems), [derivedIncomeItems]);
  const totalExpenses = useMemo(() => calculateTotal(derivedExpenseItems), [derivedExpenseItems]);
  const cashFlow = totalIncome - totalExpenses;

  // Separate debts by term
   const shortTermDebts = useMemo(() => debts.filter(debt => debt.term === 'short'), [debts]);
   const longTermDebts = useMemo(() => debts.filter(debt => debt.term === 'long'), [debts]);

   const totalShortTermDebt = useMemo(() => calculateDebtTotal(shortTermDebts), [shortTermDebts]);
   const totalLongTermDebt = useMemo(() => calculateDebtTotal(longTermDebts), [longTermDebts]);

  // Asset total (use editing state if active)
  const totalAssets = useMemo(() => calculateTotal(isEditing ? editingAssets : assetItems), [isEditing, editingAssets, assetItems]);
  // Other Liability total (use editing state if active)
   const totalOtherLiabilities = useMemo(() => calculateTotal(isEditing ? editingOtherLiabilities : otherLiabilityItems), [isEditing, editingOtherLiabilities, otherLiabilityItems]);
  // Total Liability calculation
  const totalLiabilities = totalShortTermDebt + totalLongTermDebt + totalOtherLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  // --- Handlers ---

  const handleEditToggle = () => {
    if (!isEditing) {
      // Entering edit mode: copy current states to editing states
      setEditingAssets([...assetItems.map(item => ({ ...item }))]);
      setEditingOtherLiabilities([...otherLiabilityItems.map(item => ({ ...item }))]);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveChanges = () => {
    // Save changes from editing states to main states
    setAssetItems(editingAssets);
    setOtherLiabilityItems(editingOtherLiabilities);
    setIsEditing(false);
    toast({ title: 'Changes Saved', description: 'Assets and Other Liabilities have been updated.' });
  };

  const handleCancelEdit = () => {
    // Discard changes and exit edit mode
    setIsEditing(false);
    toast({ title: 'Edit Cancelled', description: 'No changes were saved.', variant: 'default' });
  };

  // Generic handler for item changes (Assets or Other Liabilities)
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

  // Generic handler for adding items
  const handleAddItem = (type: 'asset' | 'otherLiability') => {
    const newItem: StatementItem | OtherLiabilityItem = { id: generateId(), description: '', amount: 0 };
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => [...prev, newItem]);
  };

  // Generic handler for delete click
  const handleDeleteClick = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => {
     setItemToDelete({ item, type });
  };

  const confirmDeleteItem = () => {
    if (!itemToDelete) return;
    const { item: itemToRemove, type } = itemToDelete;
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;

    setState(prev => prev.filter(item => item.id !== itemToRemove.id));
    setItemToDelete(null);
    toast({ title: `${type === 'asset' ? 'Asset' : 'Liability'} Item Deleted`, description: 'Successfully removed.' });
  };

  // --- Render Functions ---

  // Updated render function for editable rows (Assets or Other Liabilities)
  const renderEditableRow = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => (
    <TableRow key={item.id}>
      <TableCell className="pl-6">
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
      <TableCell className="text-right font-mono">
        {isEditing ? (
          <Input
            type="number"
            step="0.01"
            value={item.amount.toString()}
            onChange={(e) => handleItemChange(e, item.id, type, 'amount')}
            placeholder="Amount"
            className="h-8 text-right"
          />
        ) : (
           formatCurrency(item.amount)
        )}
      </TableCell>
      {isEditing && (
         <TableCell className="w-[50px] pr-2">
           <AlertDialog open={itemToDelete?.item.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
             <AlertDialogTrigger asChild>
               <Button
                 variant="ghost"
                 size="icon"
                 className="text-destructive hover:text-destructive h-7 w-7"
                 onClick={() => handleDeleteClick(item, type)}
               >
                 <Trash2 className="h-4 w-4" />
                 <span className="sr-only">Delete Item</span>
               </Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                 <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                 <AlertDialogDescription>
                   This action cannot be undone. This will permanently delete the {type === 'asset' ? 'asset' : 'liability'}: <br/>
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

  // Render function for derived Income/Expense items (read-only)
  const renderDerivedItemRow = (item: StatementItem, type: 'income' | 'expense') => (
      <TableRow key={item.id}>
      <TableCell className="pl-6">{item.description}</TableCell>
      <TableCell className="text-right font-mono">
          {type === 'income' ? formatCurrency(item.amount) : `(${formatCurrency(item.amount)})`}
      </TableCell>
      </TableRow>
  );

   // Render function for derived Debt items (read-only in this view)
   const renderDerivedDebtRow = (debt: DebtItem) => (
    <TableRow key={debt.id}>
        <TableCell className="pl-6">{debt.description}</TableCell>
        <TableCell className="text-right font-mono">{formatCurrency(debt.principal)}</TableCell>
        {isEditing && <TableCell></TableCell>} {/* Keep alignment */}
    </TableRow>
    );


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Financial Statements
            </h1>
            <p className="text-muted-foreground">
             Cash flow & Debts are derived. Edit Assets and Other Liabilities only.
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

      <main className="flex-1 grid gap-6 md:grid-cols-2">
        {/* Cash Flow Statement Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
            {cashFlow >= 0 ? <TrendingUp className="text-accent" /> : <TrendingDown className="text-destructive" />}
            Cash Flow Statement
            </CardTitle>
             <CardDescription className="flex items-center gap-1 text-xs pt-2">
                <Info size={14} className="text-muted-foreground"/> Derived from Transactions within the selected date range.
            </CardDescription>
             {/* Date Range Pickers */}
             <div className="flex flex-col sm:flex-row items-center gap-2 text-sm pt-4">
                 {/* Improved responsiveness: Popovers take full width on small screens */}
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
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Income Section */}
                <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                  <TableCell>Income</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {derivedIncomeItems.length > 0 ? (
                  derivedIncomeItems.map(item => renderDerivedItemRow(item, 'income'))
                ) : (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-16">No income in selected range.</TableCell></TableRow>
                )}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Income</TableCell>
                    <TableCell className="text-right font-semibold font-mono">{formatCurrency(totalIncome)}</TableCell>
                  </TableRow>

                 {/* Expenses Section */}
                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                  <TableCell>Expenses</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                 {derivedExpenseItems.length > 0 ? (
                    derivedExpenseItems.map(item => renderDerivedItemRow(item, 'expense'))
                ) : (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-16">No expenses in selected range.</TableCell></TableRow>
                )}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Expenses</TableCell>
                    <TableCell className="text-right font-semibold font-mono">({formatCurrency(totalExpenses)})</TableCell>
                  </TableRow>
              </TableBody>
              <UiTableFooter>
                <TableRow className="text-lg">
                  <TableHead>Net Cash Flow</TableHead>
                  <TableHead
                    className={`text-right font-bold font-mono ${
                      cashFlow >= 0 ? 'text-accent' : 'text-destructive'
                    }`}
                  >
                    {formatCurrency(cashFlow)}
                  </TableHead>
                </TableRow>
              </UiTableFooter>
            </Table>
          </CardContent>
        </Card>

        {/* Net Worth Statement Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="text-primary" />
              Net Worth Statement
            </CardTitle>
             <CardDescription>Assets vs. Liabilities {isEditing ? '(Editing Assets & Other Liabilities)' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                 <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                   {isEditing && <TableHead className="w-[50px]">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                 {/* Assets Section (Editable) */}
                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                   <TableCell className="flex items-center gap-2"><Landmark className="h-4 w-4"/>Assets</TableCell>
                  <TableCell></TableCell>
                  {isEditing && <TableCell></TableCell>}
                </TableRow>
                {(isEditing ? editingAssets : assetItems).map(item => renderEditableRow(item, 'asset'))}
                 {isEditing && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-2">
                            <Button variant="ghost" size="sm" onClick={() => handleAddItem('asset')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Asset Item
                            </Button>
                        </TableCell>
                    </TableRow>
                 )}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Assets</TableCell>
                    <TableCell className="text-right font-semibold font-mono">{formatCurrency(totalAssets)}</TableCell>
                    {isEditing && <TableCell></TableCell>}
                  </TableRow>

                 {/* Liabilities Section (Grouped) */}
                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                   <TableCell className="flex items-center gap-2"><Coins className="h-4 w-4"/>Liabilities</TableCell>
                   <TableCell></TableCell>
                   {isEditing && <TableCell></TableCell>}
                </TableRow>
                {/* Short-Term Debts (Derived) */}
                {shortTermDebts.length > 0 && (
                    <TableRow className="font-medium text-muted-foreground">
                        <TableCell className="pl-6">Short-Term Debts (from Debts)</TableCell>
                        <TableCell></TableCell>
                        {isEditing && <TableCell></TableCell>}
                    </TableRow>
                )}
                {shortTermDebts.map(debt => renderDerivedDebtRow(debt))}

                 {/* Long-Term Debts (Derived) */}
                 {longTermDebts.length > 0 && (
                    <TableRow className="font-medium text-muted-foreground">
                        <TableCell className="pl-6">Long-Term Debts (from Debts)</TableCell>
                        <TableCell></TableCell>
                        {isEditing && <TableCell></TableCell>}
                    </TableRow>
                 )}
                 {longTermDebts.map(debt => renderDerivedDebtRow(debt))}

                 {/* Other Liabilities (Editable) */}
                  <TableRow className="font-medium text-muted-foreground">
                        <TableCell className="pl-6">Other Liabilities</TableCell>
                        <TableCell></TableCell>
                        {isEditing && <TableCell></TableCell>}
                    </TableRow>
                  {(isEditing ? editingOtherLiabilities : otherLiabilityItems).map(item => renderEditableRow(item, 'otherLiability'))}
                  {isEditing && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-2">
                            <Button variant="ghost" size="sm" onClick={() => handleAddItem('otherLiability')}>
                            <MinusCircle className="mr-2 h-4 w-4" /> Add Other Liability
                            </Button>
                        </TableCell>
                    </TableRow>
                 )}

                 {(shortTermDebts.length === 0 && longTermDebts.length === 0 && (isEditing ? editingOtherLiabilities : otherLiabilityItems).length === 0) && (
                     <TableRow><TableCell colSpan={isEditing ? 3 : 2} className="text-center text-muted-foreground h-16">No liabilities recorded.</TableCell></TableRow>
                 )}

                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Liabilities</TableCell>
                    <TableCell className="text-right font-semibold font-mono">({formatCurrency(totalLiabilities)})</TableCell>
                    {isEditing && <TableCell></TableCell>}
                  </TableRow>
              </TableBody>
               <UiTableFooter>
                <TableRow className="text-lg">
                  <TableHead>Net Worth</TableHead>
                  <TableHead
                    className={`text-right font-bold font-mono ${
                      netWorth >= 0 ? 'text-primary' : 'text-destructive'
                    }`}
                     colSpan={isEditing ? 2 : 1}
                  >
                    {formatCurrency(netWorth)}
                  </TableHead>
                  {isEditing && <TableHead></TableHead>}
                </TableRow>
              </UiTableFooter>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
