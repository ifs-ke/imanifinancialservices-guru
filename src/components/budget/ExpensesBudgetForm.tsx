
// src/components/budget/ExpensesBudgetForm.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingDown, Tag } from 'lucide-react';
import type { BudgetItems } from '@/contexts/BudgetContext'; // Assuming BudgetItems is exported

interface ExpensesBudgetFormProps {
  budget: BudgetItems;
  isEditing: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formatCurrency: (amount: number) => string;
}

// Reusable input row renderer function (specific to this form)
const renderBudgetInputRow = (
    id: keyof BudgetItems,
    label: string,
    icon: React.ElementType,
    description: string | undefined,
    budget: BudgetItems,
    isEditing: boolean,
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
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
            value={budget[id]} // Use passed budget state
            onChange={handleInputChange}
            disabled={!isEditing}
            placeholder="0"
            className="col-span-1 sm:col-span-2 h-8 text-right" // Align text right
        />
        {description && <p className="col-span-3 text-xs text-muted-foreground pl-6 sm:pl-0 sm:text-left sm:col-start-2 sm:col-span-2">{description}</p>}
    </div>
);

const ExpensesBudgetForm: React.FC<ExpensesBudgetFormProps> = ({
  budget,
  isEditing,
  handleInputChange,
  formatCurrency,
}) => {

    const totalExpenses = budget.recurringFixedExpenses + budget.recurringVariableExpenses + budget.oneTimeFixedExpenses + budget.oneTimeVariableExpenses;

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-destructive" /> Expenses Budget
        </CardTitle>
        <CardDescription>Plan your monthly spending categories.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderBudgetInputRow('recurringFixedExpenses', 'Recurring - Fixed', Tag, 'e.g., Rent, Subscriptions', budget, isEditing, handleInputChange)}
        {renderBudgetInputRow('recurringVariableExpenses', 'Recurring - Variable', Tag, 'e.g., Groceries, Utilities', budget, isEditing, handleInputChange)}
        {renderBudgetInputRow('oneTimeFixedExpenses', 'One-Time - Fixed', Tag, 'e.g., Specific purchase', budget, isEditing, handleInputChange)}
        {renderBudgetInputRow('oneTimeVariableExpenses', 'One-Time - Variable', Tag, 'e.g., Dining out', budget, isEditing, handleInputChange)}

        {/* Display Total Budgeted Expenses */}
        <div className="flex justify-between items-center pt-2 border-t mt-3">
            <Label className="font-semibold">Total Budgeted Expenses</Label>
            <span className="font-bold font-mono">{formatCurrency(totalExpenses)}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExpensesBudgetForm;
