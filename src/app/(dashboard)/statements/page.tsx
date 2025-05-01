
// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter as UiTableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, TrendingUp, TrendingDown, Scale, DollarSign, Landmark, PlusCircle, Save, XCircle, Info, Calendar as CalendarIcon, CircleDollarSign } from 'lucide-react'; // Added CircleDollarSign
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
import { useTransactions } from '@/contexts/TransactionsContext'; // Import useTransactions hook
import { useDebt } from '@/contexts/DebtContext'; // Import useDebt hook
import type { StatementItem, DebtItem } from '@/lib/types'; // Import StatementItem and DebtItem types

// Generate unique IDs
const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Initial Mock Data for Assets (values in KES) - Liabilities are now derived from DebtContext
const initialAssets: StatementItem[] = [
  { id: generateId(), description: 'Checking Account', amount: 250000 },
  { id: generateId(), description: 'Savings Account', amount: 1000000 },
  { id: generateId(), description: 'Car (Estimated Value)', amount: 800000 },
  { id: generateId(), description: 'Investments', amount: 500000 },
];

// Calculation Function
const calculateTotal = (items: StatementItem[]) => items.reduce((sum, item) => sum + item.amount, 0);
const calculateDebtTotal = (items: DebtItem[]) => items.reduce((sum, item) => sum + item.principal, 0);


// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0, // Adjust as needed, set to 0 for no decimals
    maximumFractionDigits: 0,
  }).format(amount);
};

// Helper to format Date for display
const formatDate = (date: Date | undefined) => {
    return date ? format(date, "LLL dd, y") : <span>Pick a date</span>;
};


export default function StatementsPage() {
  // Get transactions from context
  const { transactions } = useTransactions();
  // Get debts from context
  const { debts } = useDebt();

  // State for Assets (still managed locally, but liabilities are derived)
  const [assetItems, setAssetItems] = useState<StatementItem[]>(initialAssets);

  const [isEditing, setIsEditing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: StatementItem; type: 'asset' } | null>(null); // Only assets are deletable here

  // State for date range filtering
  const defaultEndDate = endOfMonth(new Date());
  const defaultStartDate = startOfMonth(defaultEndDate); // Start of the current month
  const [startDate, setStartDate] = useState<Date | undefined>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date | undefined>(defaultEndDate);

  // Temporary state for edits (only Assets)
  const [editingAssets, setEditingAssets] = useState<StatementItem[]>([]);

  const { toast } = useToast();

  // --- Derived Calculations ---

  // Filter transactions based on the selected date range
  const filteredTransactions = useMemo(() => {
    const start = startDate ? startDate.getTime() : 0;
    // Set end date to the end of the day
    const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Date.now();
    return transactions.filter(tx => {
        // Ensure transaction date is valid before comparing
        if (!tx.date || isNaN(tx.date.getTime())) return false;
        const txTime = tx.date.getTime();
        return txTime >= start && txTime <= end;
    });
  }, [transactions, startDate, endDate]);


  // Derive Income and Expense items from *filtered* transactions
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
      .map(tx => ({ id: tx.id, description: tx.description, amount: Math.abs(tx.amount) })) // Store as positive for display logic
      .sort((a, b) => b.amount - a.amount),
    [filteredTransactions]
  );

  const totalIncome = useMemo(() => calculateTotal(derivedIncomeItems), [derivedIncomeItems]);
  const totalExpenses = useMemo(() => calculateTotal(derivedExpenseItems), [derivedExpenseItems]);
  const cashFlow = totalIncome - totalExpenses;

  // Derive Liability items from DebtContext
  const derivedLiabilityItems = useMemo(() =>
    debts.map(debt => ({
      id: debt.id,
      description: debt.description,
      amount: debt.principal, // Use principal as the amount for the liability statement
    })).sort((a, b) => b.amount - a.amount), // Optional: sort derived liabilities
    [debts] // Depends on debts from context
  );

  // Asset total (use editing state if active)
  const totalAssets = useMemo(() => calculateTotal(isEditing ? editingAssets : assetItems), [isEditing, editingAssets, assetItems]);
  // Liability total (always derived from context)
  const totalLiabilities = useMemo(() => calculateDebtTotal(debts), [debts]); // Directly use debts context
  const netWorth = totalAssets - totalLiabilities;

  // --- Handlers ---

  const handleEditToggle = () => {
    if (!isEditing) {
      // Entering edit mode: copy current asset state to editing state
      setEditingAssets([...assetItems.map(item => ({ ...item }))]);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveChanges = () => {
    // Save changes from editing state to main state (only Assets)
    setAssetItems(editingAssets);
    setIsEditing(false);
    toast({ title: 'Changes Saved', description: 'Your Assets have been updated.' });
  };

  const handleCancelEdit = () => {
    // Discard changes and exit edit mode
    setIsEditing(false);
    toast({ title: 'Edit Cancelled', description: 'No changes were saved.', variant: 'default' });
  };

  // Updated handler for Asset item changes
  const handleItemChange = (
    e: ChangeEvent<HTMLInputElement>,
    id: string,
    // type: 'asset', // Only handle assets now
    field: 'description' | 'amount'
  ) => {
    const value = field === 'amount' ? parseFloat(e.target.value) || 0 : e.target.value;
    // const setState = setEditingAssets; // Only assets are editable here

    setEditingAssets(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  // Updated handler for adding Asset items
  const handleAddItem = (/* type: 'asset' */) => {
    const newItem: StatementItem = { id: generateId(), description: '', amount: 0 };
    // const setState = setEditingAssets; // Only add assets
    setEditingAssets(prev => [...prev, newItem]);
  };

  // Updated handler for delete click (only Assets)
  const handleDeleteClick = (item: StatementItem /*, type: 'asset' */) => {
     setItemToDelete({ item, type: 'asset' });
  };

  const confirmDeleteItem = () => {
    if (!itemToDelete || itemToDelete.type !== 'asset') return; // Ensure it's an asset
    const { item: itemToRemove } = itemToDelete;
    // const setState = setEditingAssets; // Only delete assets

    setEditingAssets(prev => prev.filter(item => item.id !== itemToRemove.id));
    setItemToDelete(null);
    toast({ title: 'Asset Item Deleted', description: 'Successfully removed.' });
  };

  // --- Render Functions ---

  // Updated render function for Asset items (editable)
  const renderEditableAssetRow = (item: StatementItem) => (
    <TableRow key={item.id}>
      <TableCell className="pl-6">
        {isEditing ? (
          <Input
            type="text"
            value={item.description}
            onChange={(e) => handleItemChange(e, item.id, 'description')}
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
            onChange={(e) => handleItemChange(e, item.id, 'amount')}
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
                 onClick={() => handleDeleteClick(item)} // Pass only item
               >
                 <Trash2 className="h-4 w-4" />
                 <span className="sr-only">Delete Item</span>
               </Button>
             </AlertDialogTrigger>
             <AlertDialogContent>
               <AlertDialogHeader>
                 <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                 <AlertDialogDescription>
                   This action cannot be undone. This will permanently delete the asset: <br/>
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

   // Render function for derived Liability items (read-only in this view)
   const renderDerivedLiabilityRow = (item: StatementItem) => (
    <TableRow key={item.id}>
        <TableCell className="pl-6">{item.description}</TableCell>
        {/* Display liabilities as positive in the list, negative in total */}
        <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
        {/* No edit/delete actions for derived liabilities here */}
        {isEditing && <TableCell></TableCell>}
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
             Cash flow derived from transactions. Liabilities derived from Debts page. Edit Assets only.
            </p>
        </div>
         <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel Edit
              </Button>
              <Button onClick={handleSaveChanges}>
                <Save className="mr-2 h-4 w-4" /> Save Assets
              </Button>
            </>
          ) : (
            <Button onClick={handleEditToggle}>
              Edit Assets
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 grid gap-6 md:grid-cols-2">
        {/* Cash Flow Statement Card (Read-Only) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
            {cashFlow >= 0 ? <TrendingUp className="text-accent" /> : <TrendingDown className="text-destructive" />}
            Cash Flow Statement
            </CardTitle>
             <CardDescription className="flex items-center gap-1 text-xs pt-2">
                <Info size={14} className="text-muted-foreground"/> Derived from Transactions page within the selected date range.
            </CardDescription>
             {/* Date Range Pickers moved below title and description */}
             <div className="flex flex-col sm:flex-row items-center gap-2 text-sm pt-4">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                        variant={"outline"}
                        className={cn(
                            "w-full sm:w-[180px] justify-start text-left font-normal h-8", // Full width on small screens
                            !startDate && "text-muted-foreground"
                        )}
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDate(startDate)}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
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
                            "w-full sm:w-[180px] justify-start text-left font-normal h-8 mt-2 sm:mt-0", // Full width on small screens, margin top
                            !endDate && "text-muted-foreground"
                        )}
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                         {formatDate(endDate)}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
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
                  {/* No edit column for cash flow */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Income Section (Derived) */}
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

                 {/* Expenses Section (Derived) */}
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
             <CardDescription>Assets vs. Liabilities {isEditing ? '(Editing Assets)' : ''}</CardDescription>
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
                {(isEditing ? editingAssets : assetItems).map(item => renderEditableAssetRow(item))}
                 {isEditing && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-2">
                            <Button variant="ghost" size="sm" onClick={handleAddItem}>
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

                 {/* Liabilities Section (Derived from Debt Context) */}
                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                   <TableCell className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4"/>Liabilities (from Debts)</TableCell>
                   <TableCell></TableCell>
                   {isEditing && <TableCell></TableCell>} {/* Keep column alignment */}
                </TableRow>
                 {derivedLiabilityItems.length > 0 ? (
                    derivedLiabilityItems.map(item => renderDerivedLiabilityRow(item))
                 ) : (
                     <TableRow><TableCell colSpan={isEditing ? 3 : 2} className="text-center text-muted-foreground h-16">No debts recorded. Add them on the Debts page.</TableCell></TableRow>
                 )}
                 {/* Add Liability Item button removed - managed on Debt page */}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Liabilities</TableCell>
                    {/* Display total liabilities as negative */}
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
                     colSpan={isEditing ? 2 : 1} // Adjust colspan when editing
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
