
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, AlertTriangle, CheckCircle, XCircle, PieChart as PieChartIcon, TrendingUp, TrendingDown, Tag, Info, Save, PiggyBank, Target } from 'lucide-react'; // Added Save, PiggyBank, Target icons
import { useTransactions } from '@/contexts/TransactionsContext'; // Import useTransactions hook
import { useBudget } from '@/contexts/BudgetContext'; // Import useBudget hook
import type { TransactionWithId } from '@/lib/types'; // Import shared types
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge'; // Import Badge
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"; // Import Accordion


// Formatting Function (consider moving to utils)
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Helper to format category badges (copied from expenses/income)
const formatCategoryBadge = (value: string | undefined) => {
    if (!value) return null;
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="text-xs font-normal">{text}</Badge>;
}

// Accordion Trigger Component with Sum (copied from statements)
const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; budgetedSum?: number }
>(({ label, sum, budgetedSum, children, ...props }, ref) => (
  <AccordionTrigger ref={ref} {...props}>
    <div className="flex justify-between items-center w-full pr-2">
      <span className="flex items-center gap-1">
          {label}
           {budgetedSum !== undefined && (
                <span className="text-xs text-muted-foreground">(Budget: {formatCurrency(budgetedSum)})</span>
           )}
      </span>
      <span className="font-semibold font-mono">{formatCurrency(sum)}</span>
    </div>
    {children}
  </AccordionTrigger>
));
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


export default function BudgetPage() {
  const { transactions } = useTransactions();
  // Use Budget context for state management
  const { budget: contextBudget, setBudget, totalBudgetedIncome, totalBudgetedExpenses, totalBudgetedNet } = useBudget();

  // Local state for editing, initialized with context values
  const [localBudget, setLocalBudget] = useState(contextBudget);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');

  // Effect to update local state if context changes externally (e.g., initial load)
  useEffect(() => {
    setLocalBudget(contextBudget);
  }, [contextBudget]);

  // Handle input changes to local state
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const parsedValue = parseFloat(value) || 0;

    // Update the corresponding field in localBudget
    setLocalBudget(prev => ({
        ...prev,
        [name]: parsedValue, // Dynamically update the field based on input name
    }));

    setError(''); // Clear error on input change
  };

  const handleEditToggle = () => {
    if (isEditing) {
        // If cancelling edit, revert local state to context state
        setLocalBudget(contextBudget);
        setError(''); // Clear any errors
    }
    // Entering edit mode, local state already synced via useEffect or is current context state
    setIsEditing(!isEditing);
  };

  const handleSaveClick = () => {
    // Basic validation: check for negative numbers
     const negativeValues = Object.entries(localBudget).filter(([key, value]) => value < 0);
     if (negativeValues.length > 0) {
       setError(`Budget values cannot be negative (${negativeValues.map(([key]) => key).join(', ')})`);
       return;
     }

    // Save local state to context (which handles persistence via localStorage)
    setBudget(localBudget);

    setError('');
    setIsEditing(false);
    alert('Budget saved!'); // Simple confirmation
  };

  // --- Actual Income/Expense Calculations ---

  // Categorize actual transactions
  const categorizedTransactions = useMemo(() => {
    const categories = {
      // Income
      recurringFixedIncome: [] as TransactionWithId[],
      recurringVariableIncome: [] as TransactionWithId[],
      oneTimeIncome: [] as TransactionWithId[],
      uncategorizedIncome: [] as TransactionWithId[], // For income without categorization
      // Expenses
      recurringFixedExpenses: [] as TransactionWithId[],
      recurringVariableExpenses: [] as TransactionWithId[],
      oneTimeFixedExpenses: [] as TransactionWithId[],
      oneTimeVariableExpenses: [] as TransactionWithId[],
      uncategorizedExpenses: [] as TransactionWithId[], // For expenses without categorization
    };

    transactions.forEach(tx => {
      if (tx.amount > 0) { // Income
        if (tx.frequency === 'recurring' && tx.variability === 'fixed') categories.recurringFixedIncome.push(tx);
        else if (tx.frequency === 'recurring' && tx.variability === 'variable') categories.recurringVariableIncome.push(tx);
        else if (tx.frequency === 'one-time') categories.oneTimeIncome.push(tx); // Group all one-time income
        else categories.uncategorizedIncome.push(tx);
      } else if (tx.amount < 0) { // Expense
        if (tx.frequency === 'recurring' && tx.variability === 'fixed') categories.recurringFixedExpenses.push(tx);
        else if (tx.frequency === 'recurring' && tx.variability === 'variable') categories.recurringVariableExpenses.push(tx);
        else if (tx.frequency === 'one-time' && tx.variability === 'fixed') categories.oneTimeFixedExpenses.push(tx);
        else if (tx.frequency === 'one-time' && tx.variability === 'variable') categories.oneTimeVariableExpenses.push(tx);
        else categories.uncategorizedExpenses.push(tx);
      }
    });
     // Sort within categories by date descending (optional for variance report but good practice)
    Object.values(categories).forEach(category => category.sort((a, b) => b.date.getTime() - a.date.getTime()));

    return categories;
  }, [transactions]);

  // Calculate total actual income and expenses
   const calculateTotal = (items: TransactionWithId[], type: 'income' | 'expense') =>
      items.reduce((sum, item) => sum + (type === 'income' ? item.amount : Math.abs(item.amount)), 0);


   const actualTotals = useMemo(() => ({
        recurringFixedIncome: calculateTotal(categorizedTransactions.recurringFixedIncome, 'income'),
        recurringVariableIncome: calculateTotal(categorizedTransactions.recurringVariableIncome, 'income'),
        oneTimeIncome: calculateTotal(categorizedTransactions.oneTimeIncome, 'income'),
        uncategorizedIncome: calculateTotal(categorizedTransactions.uncategorizedIncome, 'income'),
        recurringFixedExpenses: calculateTotal(categorizedTransactions.recurringFixedExpenses, 'expense'),
        recurringVariableExpenses: calculateTotal(categorizedTransactions.recurringVariableExpenses, 'expense'),
        oneTimeFixedExpenses: calculateTotal(categorizedTransactions.oneTimeFixedExpenses, 'expense'),
        oneTimeVariableExpenses: calculateTotal(categorizedTransactions.oneTimeVariableExpenses, 'expense'),
        uncategorizedExpenses: calculateTotal(categorizedTransactions.uncategorizedExpenses, 'expense'),
   }), [categorizedTransactions]);

   const totalActualIncome = useMemo(() =>
       actualTotals.recurringFixedIncome + actualTotals.recurringVariableIncome + actualTotals.oneTimeIncome + actualTotals.uncategorizedIncome,
       [actualTotals]
   );

   const totalActualExpenses = useMemo(() =>
       actualTotals.recurringFixedExpenses + actualTotals.recurringVariableExpenses + actualTotals.oneTimeFixedExpenses + actualTotals.oneTimeVariableExpenses + actualTotals.uncategorizedExpenses,
       [actualTotals]
   );

   const totalActualNet = totalActualIncome - totalActualExpenses;

    // Render function for budget input rows
    const renderBudgetInputRow = (
        id: keyof typeof localBudget,
        label: string,
        icon: React.ElementType,
        description?: string
    ) => (
        <div className="grid grid-cols-3 items-center gap-2 sm:gap-4">
            <Label htmlFor={id} className="col-span-2 sm:col-span-1 flex items-center gap-1 text-sm sm:text-right">
                <icon className="h-4 w-4 text-muted-foreground" />
                 <span>{label}</span>
             </Label>
             <Input
                id={id}
                name={id}
                type="number"
                step="0.01"
                min="0" // Ensure non-negative
                value={isEditing ? localBudget[id] : contextBudget[id]}
                onChange={handleInputChange}
                disabled={!isEditing}
                placeholder="0"
                className="col-span-1 sm:col-span-2 h-8 text-right" // Align text right
             />
             {description && <p className="col-span-3 text-xs text-muted-foreground pl-6 sm:pl-0 sm:text-left sm:col-start-2 sm:col-span-2">{description}</p>}
         </div>
    );

    // Render function for variance report rows
    const renderVarianceRow = (label: string, budgeted: number, actual: number) => {
        const variance = budgeted - actual;
        const isIncome = label.toLowerCase().includes('income');
        const isExpense = !isIncome; // Assume anything not income is expense-like for color coding
        let statusText = '';
        let statusColor = 'text-muted-foreground'; // Default color

        if (isIncome) {
            if (variance < 0) { // Actual > Budget
                statusText = `+${formatCurrency(Math.abs(variance))} (Favorable)`;
                statusColor = 'text-accent';
            } else if (variance > 0) { // Actual < Budget
                statusText = `-${formatCurrency(variance)} (Unfavorable)`;
                statusColor = 'text-destructive';
            } else {
                statusText = 'On Target';
            }
        } else { // Expenses or Goals
             if (variance > 0) { // Actual < Budget (Under Budget)
                statusText = `+${formatCurrency(variance)} (Favorable)`;
                statusColor = 'text-accent';
             } else if (variance < 0) { // Actual > Budget (Over Budget)
                 statusText = `-${formatCurrency(Math.abs(variance))} (Unfavorable)`;
                 statusColor = 'text-destructive';
             } else {
                statusText = 'On Target';
             }
        }

        return (
            <TableRow>
                 <TableCell>{label}</TableCell>
                 <TableCell className="text-right font-mono">{formatCurrency(budgeted)}</TableCell>
                 <TableCell className="text-right font-mono">{formatCurrency(actual)}</TableCell>
                 <TableCell className={cn("text-right font-mono text-sm", statusColor)}>
                     {statusText}
                </TableCell>
            </TableRow>
        );
    };


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
         <PieChartIcon className="h-6 w-6 text-primary"/> Budget Management
        </h1>
        <p className="text-muted-foreground">Plan your monthly finances, track goals, and monitor variance.</p>
      </header>
      <main className="flex-1 grid gap-6 md:grid-cols-1 lg:grid-cols-2"> {/* Changed grid layout */}
        {/* Budget Input Card */}
        <Card className="lg:col-span-1"> {/* Takes full width on smaller, half on larger */}
          <CardHeader>
            <CardTitle>Set Your Budget</CardTitle>
            <CardDescription>Enter your planned monthly amounts for each category.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14}/> {error}</p>}

             {/* Income Section */}
            <Accordion type="single" collapsible defaultValue='income'>
                <AccordionItem value="income">
                 <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                     <span className='flex items-center gap-2'><TrendingUp className='h-5 w-5 text-accent'/> Income</span>
                </AccordionTrigger>
                 <AccordionContent className="space-y-3 pl-4 pt-2">
                     {renderBudgetInputRow('recurringFixedIncome', 'Recurring - Fixed', Tag, 'e.g., Salary')}
                     {renderBudgetInputRow('recurringVariableIncome', 'Recurring - Variable', Tag, 'e.g., Side Hustle')}
                     {renderBudgetInputRow('oneTimeIncome', 'One-Time', Tag, 'e.g., Bonus, Gifts')}
                     {/* Display Total Budgeted Income */}
                     <div className="flex justify-between items-center pt-2 border-t mt-2">
                         <Label className="font-semibold">Total Budgeted Income</Label>
                         <span className="font-bold font-mono">{formatCurrency(totalBudgetedIncome)}</span>
                     </div>
                 </AccordionContent>
                 </AccordionItem>
            </Accordion>

             {/* Expenses Section */}
             <Accordion type="single" collapsible defaultValue='expenses'>
                <AccordionItem value="expenses">
                 <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                     <span className='flex items-center gap-2'><TrendingDown className='h-5 w-5 text-destructive'/> Expenses</span>
                 </AccordionTrigger>
                 <AccordionContent className="space-y-3 pl-4 pt-2">
                     {renderBudgetInputRow('recurringFixedExpenses', 'Recurring - Fixed', Tag, 'e.g., Rent, Subscriptions')}
                     {renderBudgetInputRow('recurringVariableExpenses', 'Recurring - Variable', Tag, 'e.g., Groceries, Utilities')}
                     {renderBudgetInputRow('oneTimeFixedExpenses', 'One-Time - Fixed', Tag, 'e.g., Specific purchase')}
                     {renderBudgetInputRow('oneTimeVariableExpenses', 'One-Time - Variable', Tag, 'e.g., Dining out')}
                    {/* Display Total Budgeted Expenses */}
                     <div className="flex justify-between items-center pt-2 border-t mt-2">
                         <Label className="font-semibold">Total Budgeted Expenses</Label>
                         <span className="font-bold font-mono">{formatCurrency(totalBudgetedExpenses)}</span>
                     </div>
                 </AccordionContent>
                 </AccordionItem>
             </Accordion>

              {/* Goals Section */}
             <Accordion type="single" collapsible>
                <AccordionItem value="goals">
                 <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                     <span className='flex items-center gap-2'><Target className='h-5 w-5 text-primary'/> Goals</span>
                 </AccordionTrigger>
                 <AccordionContent className="space-y-3 pl-4 pt-2">
                     {renderBudgetInputRow('savingsGoal', 'Savings Goal', PiggyBank, 'Amount to save this month')}
                     {renderBudgetInputRow('extraDebtPayment', 'Extra Debt Payment', Coins, 'Additional amount towards debts')}
                 </AccordionContent>
                 </AccordionItem>
             </Accordion>

             {/* Budget Summary (Read-only) */}
            <div className='mt-4 pt-4 border-t'>
                 <h3 className="text-md font-semibold mb-2">Budget Summary</h3>
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Budgeted Income:</span>
                    <span className="font-mono">{formatCurrency(totalBudgetedIncome)}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Budgeted Expenses:</span>
                    <span className="font-mono">{formatCurrency(totalBudgetedExpenses)}</span>
                 </div>
                 <div className="flex justify-between text-sm font-semibold">
                    <span>Expected Net (Income - Expenses):</span>
                    <span className={cn("font-mono", totalBudgetedNet >= 0 ? 'text-primary' : 'text-destructive')}>
                         {formatCurrency(totalBudgetedNet)}
                     </span>
                 </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Savings Goal:</span>
                    <span className="font-mono">{formatCurrency(isEditing ? localBudget.savingsGoal : contextBudget.savingsGoal)}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Extra Debt Payment Goal:</span>
                    <span className="font-mono">{formatCurrency(isEditing ? localBudget.extraDebtPayment : contextBudget.extraDebtPayment)}</span>
                 </div>
                  <div className="flex justify-between text-sm font-semibold mt-1">
                    <span>Remaining after Expenses & Goals:</span>
                    <span className={cn("font-mono", (totalBudgetedNet - contextBudget.savingsGoal - contextBudget.extraDebtPayment) >= 0 ? 'text-accent' : 'text-destructive')}>
                         {formatCurrency(totalBudgetedNet - contextBudget.savingsGoal - contextBudget.extraDebtPayment)}
                     </span>
                 </div>
             </div>


          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleEditToggle}>
                  Cancel
                </Button>
                <Button onClick={handleSaveClick}>
                    <Save className="mr-2 h-4 w-4"/> Save Budget
                 </Button>
              </>
            ) : (
              <Button onClick={handleEditToggle}>
                 <Edit className="mr-2 h-4 w-4"/> Edit Budget
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Budget Variance Report */}
        <Card className="lg:col-span-1"> {/* Takes full width on smaller, half on larger */}
          <CardHeader>
            <CardTitle>Budget Variance Report</CardTitle>
            <CardDescription>Compare your budgeted amounts with actual income and spending from transactions.</CardDescription>
             <p className='text-xs text-muted-foreground pt-2 flex items-center gap-1'><Info size={14}/> Actuals are based on categorized transactions. Uncategorized transactions are listed separately.</p>
          </CardHeader>
          <CardContent>
             <ScrollArea className="h-[600px] w-full"> {/* Adjust height as needed */}
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Budgeted (KES)</TableHead>
                            <TableHead className="text-right">Actual (KES)</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {/* Income Section */}
                        <TableRow className="bg-muted/30 font-semibold">
                            <TableCell colSpan={4} className="py-2"><TrendingUp className="inline h-4 w-4 mr-1 text-accent"/>Income</TableCell>
                         </TableRow>
                         {renderVarianceRow('Recurring - Fixed Income', contextBudget.recurringFixedIncome, actualTotals.recurringFixedIncome)}
                         {renderVarianceRow('Recurring - Variable Income', contextBudget.recurringVariableIncome, actualTotals.recurringVariableIncome)}
                         {renderVarianceRow('One-Time Income', contextBudget.oneTimeIncome, actualTotals.oneTimeIncome)}
                         {actualTotals.uncategorizedIncome > 0 && (
                            <TableRow>
                                 <TableCell className='pl-6 text-muted-foreground'>Uncategorized Income</TableCell>
                                 <TableCell className="text-right font-mono">-</TableCell>
                                 <TableCell className="text-right font-mono">{formatCurrency(actualTotals.uncategorizedIncome)}</TableCell>
                                 <TableCell className="text-right font-mono text-xs text-muted-foreground">(Not budgeted)</TableCell>
                             </TableRow>
                         )}
                         {/* Income Subtotal */}
                         <TableRow className="border-t">
                             <TableCell className='font-semibold'>Total Income</TableCell>
                             <TableCell className="text-right font-bold font-mono">{formatCurrency(totalBudgetedIncome)}</TableCell>
                             <TableCell className="text-right font-bold font-mono">{formatCurrency(totalActualIncome)}</TableCell>
                             <TableCell className={cn("text-right font-bold font-mono", (totalActualIncome - totalBudgetedIncome) >= 0 ? 'text-accent' : 'text-destructive')}>
                                 {formatCurrency(totalActualIncome - totalBudgetedIncome)}
                             </TableCell>
                         </TableRow>

                         {/* Expenses Section */}
                         <TableRow className="bg-muted/30 font-semibold mt-4">
                             <TableCell colSpan={4} className="py-2"><TrendingDown className="inline h-4 w-4 mr-1 text-destructive"/>Expenses</TableCell>
                         </TableRow>
                         {renderVarianceRow('Recurring - Fixed Expenses', contextBudget.recurringFixedExpenses, actualTotals.recurringFixedExpenses)}
                         {renderVarianceRow('Recurring - Variable Expenses', contextBudget.recurringVariableExpenses, actualTotals.recurringVariableExpenses)}
                         {renderVarianceRow('One-Time - Fixed Expenses', contextBudget.oneTimeFixedExpenses, actualTotals.oneTimeFixedExpenses)}
                         {renderVarianceRow('One-Time - Variable Expenses', contextBudget.oneTimeVariableExpenses, actualTotals.oneTimeVariableExpenses)}
                         {actualTotals.uncategorizedExpenses > 0 && (
                             <TableRow>
                                 <TableCell className='pl-6 text-muted-foreground'>Uncategorized Expenses</TableCell>
                                 <TableCell className="text-right font-mono">-</TableCell>
                                 <TableCell className="text-right font-mono">{formatCurrency(actualTotals.uncategorizedExpenses)}</TableCell>
                                  <TableCell className="text-right font-mono text-xs text-destructive">(Over Budget)</TableCell>
                             </TableRow>
                         )}
                          {/* Expenses Subtotal */}
                         <TableRow className="border-t">
                             <TableCell className='font-semibold'>Total Expenses</TableCell>
                             <TableCell className="text-right font-bold font-mono">{formatCurrency(totalBudgetedExpenses)}</TableCell>
                             <TableCell className="text-right font-bold font-mono">{formatCurrency(totalActualExpenses)}</TableCell>
                              <TableCell className={cn("text-right font-bold font-mono", (totalBudgetedExpenses - totalActualExpenses) >= 0 ? 'text-accent' : 'text-destructive')}>
                                 {formatCurrency(totalBudgetedExpenses - totalActualExpenses)}
                             </TableCell>
                         </TableRow>

                          {/* Net Summary Section */}
                          <TableRow className="bg-primary/10 font-bold text-lg border-t-2 border-primary">
                              <TableCell>Net (Income - Expenses)</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(totalBudgetedNet)}</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(totalActualNet)}</TableCell>
                              <TableCell className={cn("text-right font-mono", (totalActualNet - totalBudgetedNet) >= 0 ? 'text-accent' : 'text-destructive')}>
                                  {formatCurrency(totalActualNet - totalBudgetedNet)}
                              </TableCell>
                          </TableRow>

                         {/* Goals Variance (Optional - Depends if you track actual savings/debt payments separately) */}
                         {/*
                         <TableRow className="bg-muted/30 font-semibold mt-4">
                             <TableCell colSpan={4} className="py-2"><Target className="inline h-4 w-4 mr-1 text-primary"/>Goals</TableCell>
                         </TableRow>
                         {renderVarianceRow('Savings Goal', contextBudget.savingsGoal, actualSavings)}
                         {renderVarianceRow('Extra Debt Payment Goal', contextBudget.extraDebtPayment, actualExtraDebtPayment)}
                         */}

                    </TableBody>
                 </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
