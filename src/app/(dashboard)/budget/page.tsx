
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit, Coins, AlertTriangle, CheckCircle, XCircle, PieChart as PieChartIcon, TrendingUp, TrendingDown, Tag, Save, PiggyBank, Target } from 'lucide-react';
import { useBudget } from '@/contexts/BudgetContext'; // Import useBudget hook
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


// Formatting Function (consider moving to utils)
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};


export default function BudgetPage() {
  // Use Budget context for state management
  const { budget: contextBudget, setBudget, totalBudgetedIncome, totalBudgetedExpenses, totalBudgetedNet } = useBudget();

  // Local state for editing, initialized with context values
  const [localBudget, setLocalBudget] = useState(contextBudget);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');

  // Effect to update local state if context changes externally (e.g., initial load or save)
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
    toast({ title: 'Budget Saved', description: 'Your budget has been updated successfully.' }); // Use toast for confirmation
  };


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

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
         <PieChartIcon className="h-6 w-6 text-primary"/> Budget Management
        </h1>
        <p className="text-muted-foreground">Plan your monthly finances and track goals.</p>
      </header>
      <main className="flex-1 grid gap-6 md:grid-cols-1 lg:grid-cols-1"> {/* Simplified grid layout */}
        {/* Budget Input Card */}
        <Card className="lg:col-span-1">
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
                    {/* Show local value if editing, otherwise context value */}
                    <span className="font-mono">{formatCurrency(isEditing ? localBudget.savingsGoal : contextBudget.savingsGoal)}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Extra Debt Payment Goal:</span>
                     {/* Show local value if editing, otherwise context value */}
                    <span className="font-mono">{formatCurrency(isEditing ? localBudget.extraDebtPayment : contextBudget.extraDebtPayment)}</span>
                 </div>
                  <div className="flex justify-between text-sm font-semibold mt-1">
                    <span>Remaining after Expenses & Goals:</span>
                    {/* Calculate based on *budgeted* values */}
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

        {/* Variance Report Section Removed */}

      </main>
    </div>
  );
}

// Need to import useToast hook for save confirmation
import { useToast } from '@/hooks/use-toast';
const { toast } = useToast(); // Call useToast at the top level of the component
