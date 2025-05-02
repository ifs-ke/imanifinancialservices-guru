
// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter as UiTableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, TrendingUp, TrendingDown, Scale, Landmark, PlusCircle, Save, XCircle, Info, Calendar as CalendarIcon, Coins, MinusCircle, Tag, ChevronDown, ChevronRight } from 'lucide-react'; // Added icons
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
import { useTransactions } from '@/contexts/TransactionsContext';
import { useDebt } from '@/contexts/DebtContext';
import { useStatement } from '@/contexts/StatementContext'; // Import Statement context
import type { StatementItem, DebtItem, OtherLiabilityItem, TransactionWithId } from '@/lib/types'; // Import all needed types
import { Badge } from '@/components/ui/badge'; // Import Badge
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; // Import Accordion


// Generate unique IDs
const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;


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
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number }
>(({ label, sum, children, ...props }, ref) => (
  <AccordionTrigger ref={ref} {...props}>
    <div className="flex justify-between w-full pr-2">
      <span>{label}</span>
      <span className="font-semibold font-mono">{formatCurrency(sum)}</span>
    </div>
    {/* Pass children through, typically the Chevron icon */}
    {children}
  </AccordionTrigger>
));
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


export default function StatementsPage() {
  // Context hooks
  const { transactions } = useTransactions();
  const { debts } = useDebt();
  // Use StatementContext for assets and other liabilities
  const { assetItems, otherLiabilityItems, setAssetItems, setOtherLiabilityItems } = useStatement();

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
    const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Date.now();
    return transactions.filter(tx => {
        if (!tx.date || isNaN(tx.date.getTime())) return false;
        const txTime = tx.date.getTime();
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

  const totalIncome = useMemo(() => calculateTotal(derivedIncomeItems), [derivedIncomeItems]);
  const totalExpenses = useMemo(() => calculateTotal(derivedExpenseItems), [derivedExpenseItems]);
  const cashFlow = totalIncome - totalExpenses;

  // Separate debts by term
   const shortTermDebts = useMemo(() => debts.filter(debt => debt.term === 'short'), [debts]);
   const longTermDebts = useMemo(() => debts.filter(debt => debt.term === 'long'), [debts]);

   const totalShortTermDebt = useMemo(() => calculateDebtTotal(shortTermDebts), [shortTermDebts]);
   const totalLongTermDebt = useMemo(() => calculateDebtTotal(longTermDebts), [longTermDebts]);

  // Totals now use the editing state if active, otherwise the context state
  const totalAssets = useMemo(() => calculateTotal(isEditing ? editingAssets : assetItems), [isEditing, editingAssets, assetItems]);
  const totalOtherLiabilities = useMemo(() => calculateTotal(isEditing ? editingOtherLiabilities : otherLiabilityItems), [isEditing, editingOtherLiabilities, otherLiabilityItems]);
  const totalLiabilities = totalShortTermDebt + totalLongTermDebt + totalOtherLiabilities;
  const netWorth = totalAssets - totalLiabilities;

  // --- Handlers ---

  const handleEditToggle = () => {
    if (!isEditing) {
      // Entering edit mode: copy current context states to temporary editing states
      setEditingAssets([...assetItems.map(item => ({ ...item }))]); // Deep copy needed
      setEditingOtherLiabilities([...otherLiabilityItems.map(item => ({ ...item }))]); // Deep copy needed
    }
    setIsEditing(!isEditing);
  };

  const handleSaveChanges = () => {
    // Save changes from temporary editing states back to context states (persistence handled by context)
    setAssetItems(editingAssets);
    setOtherLiabilityItems(editingOtherLiabilities);
    setIsEditing(false);
    toast({ title: 'Changes Saved', description: 'Assets and Other Liabilities have been updated.' });
  };

  const handleCancelEdit = () => {
    // Discard changes and exit edit mode - no need to reset context states
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
  const handleAddItem = (type: 'asset' | 'otherLiability') => {
    const newItem: StatementItem | OtherLiabilityItem = { id: generateId(type === 'asset' ? 'asset' : 'lia'), description: '', amount: 0 };
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
    toast({ title: `${type === 'asset' ? 'Asset' : 'Liability'} Item Deleted`, description: 'Successfully removed from edit view.' });
    // Note: Changes are only saved to context/localStorage on 'Save Changes'
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
           formatCurrency(item.amount) // Display context state value when not editing
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
             {formatCurrency(type === 'income' ? item.amount : item.amount)} {/* Show expense as positive in list */}
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


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Financial Statements
            </h1>
            <p className="text-muted-foreground">
             Cash flow & Debts are derived. Edit Assets and Other Liabilities only. Changes are saved locally.
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
                <Info size={14} className="text-muted-foreground"/> Derived from Transactions within the selected date range. Includes categories.
            </CardDescription>
             {/* Date Range Pickers */}
             <div className="flex flex-col sm:flex-row items-center gap-2 text-sm pt-4">
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
             <Accordion type="multiple" className="w-full"> {/* Allow multiple open */}
                 {/* Income Accordion */}
                <AccordionItem value="income">
                     <AccordionTriggerWithSum label="Income" sum={totalIncome} className="text-base font-semibold hover:no-underline" />
                     <AccordionContent>
                         {derivedIncomeItems.length > 0 ? (
                           <Table>
                             <TableBody>
                               {derivedIncomeItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'income'))}
                             </TableBody>
                           </Table>
                         ) : (
                           <p className="text-center text-muted-foreground py-4 text-sm">No income in selected range.</p>
                         )}
                     </AccordionContent>
                 </AccordionItem>

                 {/* Expenses Accordion */}
                 <AccordionItem value="expenses">
                     <AccordionTriggerWithSum label="Expenses" sum={totalExpenses} className="text-base font-semibold hover:no-underline" />
                     <AccordionContent>
                         {derivedExpenseItems.length > 0 ? (
                             <Table>
                               <TableBody>
                                 {derivedExpenseItems.map(item => renderDerivedItemRow(item as TransactionWithId, 'expense'))}
                               </TableBody>
                             </Table>
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="text-primary" />
              Net Worth Statement
            </CardTitle>
             <CardDescription>Assets vs. Liabilities {isEditing ? '(Editing Assets & Other Liabilities)' : ''}</CardDescription>
          </CardHeader>
           <CardContent>
             <Accordion type="multiple" className="w-full"> {/* Allow multiple open */}
                 {/* Assets Accordion */}
                 <AccordionItem value="assets">
                    <AccordionTriggerWithSum label="Assets" sum={totalAssets} className="text-base font-semibold hover:no-underline" />
                     <AccordionContent>
                         <Table>
                           <TableBody>
                             {/* Render rows based on editingAssets if editing, else assetItems */}
                             {(isEditing ? editingAssets : assetItems).map(item => renderEditableRow(item, 'asset'))}
                           </TableBody>
                         </Table>
                         {isEditing && (
                             <div className="text-center py-2 border-t border-dashed">
                                 <Button variant="ghost" size="sm" onClick={() => handleAddItem('asset')}>
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
                 <AccordionItem value="liabilities">
                     {/* Top-level Liabilities Trigger */}
                     <AccordionTrigger className="text-base font-semibold hover:no-underline">
                         <div className="flex justify-between w-full pr-2">
                            <span>Liabilities</span>
                             <span className="font-semibold font-mono">({formatCurrency(totalLiabilities)})</span>
                         </div>
                     </AccordionTrigger>
                     <AccordionContent>
                        <Accordion type="multiple" className="w-full pl-4 border-l ml-2"> {/* Nested Accordion */}
                            {/* Short-Term Debts Accordion */}
                            <AccordionItem value="short-term-debts">
                                <AccordionTriggerWithSum label="Short-Term Debts" sum={totalShortTermDebt} className="text-sm font-medium text-muted-foreground hover:no-underline" />
                                <AccordionContent>
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
                                <AccordionTriggerWithSum label="Long-Term Debts" sum={totalLongTermDebt} className="text-sm font-medium text-muted-foreground hover:no-underline" />
                                <AccordionContent>
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
                            <AccordionItem value="other-liabilities">
                                <AccordionTriggerWithSum label="Other Liabilities" sum={totalOtherLiabilities} className="text-sm font-medium text-muted-foreground hover:no-underline" />
                                <AccordionContent>
                                     <Table>
                                       <TableBody>
                                          {/* Render rows based on editingOtherLiabilities if editing, else otherLiabilityItems */}
                                          {(isEditing ? editingOtherLiabilities : otherLiabilityItems).map(item => renderEditableRow(item, 'otherLiability'))}
                                       </TableBody>
                                     </Table>
                                     {isEditing && (
                                        <div className="text-center py-2 border-t border-dashed">
                                             <Button variant="ghost" size="sm" onClick={() => handleAddItem('otherLiability')}>
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
      </main>
    </div>
  );
}

    
