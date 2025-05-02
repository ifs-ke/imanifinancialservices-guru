
// src/components/budget/IncomeBudgetForm.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, Tag } from 'lucide-react';
import type { BudgetItems } from '@/contexts/BudgetContext'; // Assuming BudgetItems is exported

interface IncomeBudgetFormProps {
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

const IncomeBudgetForm: React.FC<IncomeBudgetFormProps> = ({
  budget,
  isEditing,
  handleInputChange,
  formatCurrency,
}) => {

    const totalIncome = budget.recurringFixedIncome + budget.recurringVariableIncome + budget.oneTimeIncome;

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-accent" /> Income Budget
        </CardTitle>
        <CardDescription>Plan your monthly income sources.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderBudgetInputRow('recurringFixedIncome', 'Recurring - Fixed', Tag, 'e.g., Salary', budget, isEditing, handleInputChange)}
        {renderBudgetInputRow('recurringVariableIncome', 'Recurring - Variable', Tag, 'e.g., Side Hustle', budget, isEditing, handleInputChange)}
        {renderBudgetInputRow('oneTimeIncome', 'One-Time', Tag, 'e.g., Bonus, Gifts', budget, isEditing, handleInputChange)}

        {/* Display Total Budgeted Income */}
        <div className="flex justify-between items-center pt-2 border-t mt-3">
            <Label className="font-semibold">Total Budgeted Income</Label>
            <span className="font-bold font-mono">{formatCurrency(totalIncome)}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default IncomeBudgetForm;
