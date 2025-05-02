'use client';

import React, {useState, useEffect} from 'react';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {ScrollArea} from '@/components/ui/scroll-area';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, AlertTriangle, CheckCircle, XCircle} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {useTransactions} from '@/contexts/TransactionsContext'; // Import useTransactions hook
import type {TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability} from '@/lib/types'; // Import shared types
import {format} from 'date-fns';
import {cn} from '@/lib/utils';
import Link from 'next/link';

// Formatting Function (copied from other pages, consider moving to utils)
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const initialBudgetData = {
  incomeBudget: 0,
  expensesBudget: 0,
};

export default function BudgetPage() {
  const {transactions} = useTransactions();
  const [budgetData, setBudgetData] = useState(initialBudgetData);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const {name, value} = e.target;
    setBudgetData({...budgetData, [name]: parseFloat(value) || 0});
  };

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  const handleSaveClick = () => {
    // Validate inputs
    if (budgetData.incomeBudget < 0 || budgetData.expensesBudget < 0) {
      setError('Budgets cannot be negative');
      return;
    }

    setError('');
    setIsEditing(false);
    // In a real app, you'd save the budget data to localStorage, a database, etc.
    alert('Budget saved!');
  };

  // Calculate total income and expenses
  const totalIncome = transactions
    .filter(tx => tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpenses = transactions
    .filter(tx => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Calculate variance
  const incomeVariance = budgetData.incomeBudget - totalIncome;
  const expensesVariance = budgetData.expensesBudget - totalExpenses;

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Budget</h1>
        <p className="text-muted-foreground">Plan and track your spending.</p>
      </header>
      <main className="flex-1 grid gap-6 md:grid-cols-2">
        {/* Budget Input Card */}
        <Card>
          <CardHeader>
            <CardTitle>Set Budget</CardTitle>
            <CardDescription>Enter your planned income and expenses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="incomeBudget">Income Budget (KES)</Label>
              <Input
                id="incomeBudget"
                name="incomeBudget"
                type="number"
                step="0.01"
                value={budgetData.incomeBudget}
                onChange={handleInputChange}
                disabled={!isEditing}
                placeholder="Enter income budget"
              />
            </div>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="expensesBudget">Expenses Budget (KES)</Label>
              <Input
                id="expensesBudget"
                name="expensesBudget"
                type="number"
                step="0.01"
                value={budgetData.expensesBudget}
                onChange={handleInputChange}
                disabled={!isEditing}
                placeholder="Enter expenses budget"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleEditToggle}>
                  Cancel
                </Button>
                <Button onClick={handleSaveClick}>Save</Button>
              </>
            ) : (
              <Button onClick={handleEditToggle}>Edit</Button>
            )}
          </CardFooter>
        </Card>

        {/* Budget Variance Report */}
        <Card>
          <CardHeader>
            <CardTitle>Budget Variance Report</CardTitle>
            <CardDescription>Track the difference between your budget and actual spending.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              Total Income: <strong>{formatCurrency(totalIncome)}</strong>
            </p>
            <p>
              Budgeted Income: <strong>{formatCurrency(budgetData.incomeBudget)}</strong>
            </p>
            <p>
              Income Variance: <strong>{formatCurrency(incomeVariance)}</strong>
            </p>
            <p>
              Total Expenses: <strong>{formatCurrency(totalExpenses)}</strong>
            </p>
            <p>
              Budgeted Expenses: <strong>{formatCurrency(budgetData.expensesBudget)}</strong>
            </p>
            <p>
              Expenses Variance: <strong>{formatCurrency(expensesVariance)}</strong>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
