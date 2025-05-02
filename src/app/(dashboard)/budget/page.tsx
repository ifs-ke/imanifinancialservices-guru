
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Save, Edit, PieChart as PieChartIcon } from 'lucide-react';
import { useBudget } from '@/contexts/BudgetContext';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import IncomeBudgetForm from '@/components/budget/IncomeBudgetForm'; // New component
import ExpensesBudgetForm from '@/components/budget/ExpensesBudgetForm'; // New component
import GoalsBudgetForm from '@/components/budget/GoalsBudgetForm'; // New component

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
  const { toast } = useToast();
  const { budget: contextBudget, setBudget, totalBudgetedIncome, totalBudgetedExpenses, totalBudgetedNet } = useBudget();

  const [localBudget, setLocalBudget] = useState(contextBudget);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');

  // Effect to update local state if context changes externally
  useEffect(() => {
    setLocalBudget(contextBudget);
  }, [contextBudget]);

  // Handle input changes to local state
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const parsedValue = parseFloat(value) || 0;

    setLocalBudget(prev => ({
        ...prev,
        [name]: parsedValue,
    }));
    setError(''); // Clear error on input change
  };

  const handleEditToggle = () => {
    if (isEditing) {
        // If cancelling edit, revert local state to context state
        setLocalBudget(contextBudget);
        setError(''); // Clear any errors
    }
    setIsEditing(!isEditing);
  };

  const handleSaveClick = () => {
    const negativeValues = Object.entries(localBudget).filter(([, value]) => value < 0);
    if (negativeValues.length > 0) {
      setError(`Budget values cannot be negative (${negativeValues.map(([key]) => key).join(', ')})`);
      return;
    }

    setBudget(localBudget);
    setError('');
    setIsEditing(false);
    toast({ title: 'Budget Saved', description: 'Your budget has been updated successfully.' });
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <PieChartIcon className="h-6 w-6 text-primary"/> Budget Management
            </h1>
            <p className="text-muted-foreground">Plan your monthly finances and track goals.</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </header>

      <main className="flex-1 grid gap-6 md:grid-cols-1 lg:grid-cols-3"> {/* Updated grid */}

        {/* Income Form Card */}
        <IncomeBudgetForm
          budget={isEditing ? localBudget : contextBudget}
          isEditing={isEditing}
          handleInputChange={handleInputChange}
          formatCurrency={formatCurrency}
        />

        {/* Expenses Form Card */}
        <ExpensesBudgetForm
          budget={isEditing ? localBudget : contextBudget}
          isEditing={isEditing}
          handleInputChange={handleInputChange}
          formatCurrency={formatCurrency}
        />

        {/* Goals Form Card & Summary */}
        <div className="space-y-6 lg:col-span-1">
            <GoalsBudgetForm
              budget={isEditing ? localBudget : contextBudget}
              isEditing={isEditing}
              handleInputChange={handleInputChange}
              formatCurrency={formatCurrency}
            />

            {/* Budget Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle>Budget Summary</CardTitle>
                <CardDescription>Read-only overview of your planned budget.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                 {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14}/> {error}</p>}
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
                <div className="flex justify-between text-sm font-semibold mt-1 border-t pt-2">
                  <span>Remaining after Expenses & Goals:</span>
                  {/* Calculate based on *budgeted* values */}
                  <span className={cn("font-mono", (totalBudgetedNet - contextBudget.savingsGoal - contextBudget.extraDebtPayment) >= 0 ? 'text-accent' : 'text-destructive')}>
                    {formatCurrency(totalBudgetedNet - contextBudget.savingsGoal - contextBudget.extraDebtPayment)}
                  </span>
                </div>
              </CardContent>
            </Card>
        </div>

      </main>
    </div>
  );
}
