
'use client';

import React, {useState, useEffect} from 'react';
import {Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter} from '@/components/ui/card'; // Added CardFooter import
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {ScrollArea} from '@/components/ui/scroll-area';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, AlertTriangle, CheckCircle, XCircle, PieChart as PieChartIcon } from 'lucide-react'; // Added PieChartIcon
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
import {useBudget} from '@/contexts/BudgetContext'; // Import useBudget hook
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


export default function BudgetPage() {
  const { transactions } = useTransactions();
  const { incomeBudget: contextIncomeBudget, expensesBudget: contextExpensesBudget, setIncomeBudget, setExpensesBudget } = useBudget(); // Get context values and setters

  // Local state for editing, initialized with context values
  const [localIncomeBudget, setLocalIncomeBudget] = useState<number>(contextIncomeBudget);
  const [localExpensesBudget, setLocalExpensesBudget] = useState<number>(contextExpensesBudget);

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');

  // Effect to update local state if context changes externally (e.g., loaded from storage later)
  useEffect(() => {
    setLocalIncomeBudget(contextIncomeBudget);
    setLocalExpensesBudget(contextExpensesBudget);
  }, [contextIncomeBudget, contextExpensesBudget]);

  // Handle input changes to local state
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const parsedValue = parseFloat(value) || 0;

    if (name === 'incomeBudget') {
        setLocalIncomeBudget(parsedValue);
    } else if (name === 'expensesBudget') {
        setLocalExpensesBudget(parsedValue);
    }
     setError(''); // Clear error on input change
  };

  const handleEditToggle = () => {
    if (isEditing) {
        // If cancelling edit, revert local state to context state
        setLocalIncomeBudget(contextIncomeBudget);
        setLocalExpensesBudget(contextExpensesBudget);
        setError(''); // Clear any errors
    }
    setIsEditing(!isEditing);
  };

  const handleSaveClick = () => {
    // Validate inputs
    if (localIncomeBudget < 0 || localExpensesBudget < 0) {
      setError('Budgets cannot be negative');
      return;
    }

    // Save local state to context (which handles persistence)
    setIncomeBudget(localIncomeBudget);
    setExpensesBudget(localExpensesBudget);

    setError('');
    setIsEditing(false);
    // Persistence is handled by the BudgetProvider context
    alert('Budget saved!');
  };

  // Calculate total actual income and expenses from transactions
  const totalIncome = transactions
    .filter(tx => tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpenses = transactions
    .filter(tx => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Calculate variance using context budgets
  const incomeVariance = contextIncomeBudget - totalIncome;
  const expensesVariance = contextExpensesBudget - totalExpenses;

  // Determine variance status (Surplus/Deficit)
  const incomeVarianceStatus = incomeVariance >= 0 ? 'Surplus' : 'Deficit';
  const expensesVarianceStatus = expensesVariance >= 0 ? 'Under Budget' : 'Over Budget';

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
         <PieChartIcon className="h-6 w-6 text-primary"/> Budget
        </h1>
        <p className="text-muted-foreground">Plan your income and expenses, and track your variance.</p>
      </header>
      <main className="flex-1 grid gap-6 md:grid-cols-2">
        {/* Budget Input Card */}
        <Card>
          <CardHeader>
            <CardTitle>Set Budget</CardTitle>
            <CardDescription>Enter your planned monthly income and expenses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14}/> {error}</p>}
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="incomeBudget">Income Budget (KES)</Label>
              <Input
                id="incomeBudget"
                name="incomeBudget"
                type="number"
                step="0.01"
                value={isEditing ? localIncomeBudget : contextIncomeBudget} // Show context value normally, local when editing
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
                value={isEditing ? localExpensesBudget : contextExpensesBudget} // Show context value normally, local when editing
                onChange={handleInputChange}
                disabled={!isEditing}
                placeholder="Enter expenses budget"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
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
            <CardDescription>Compare your budget with actual income and spending.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
             {/* Income Section */}
            <div className="space-y-1 border-b pb-3">
                 <h4 className="text-sm font-medium text-muted-foreground">Income</h4>
                 <div className="flex justify-between">
                     <span>Budgeted Income:</span>
                     <strong className="font-mono">{formatCurrency(contextIncomeBudget)}</strong>
                 </div>
                 <div className="flex justify-between">
                     <span>Actual Income:</span>
                     <strong className="font-mono">{formatCurrency(totalIncome)}</strong>
                 </div>
                 <div className="flex justify-between">
                     <span>Income Variance:</span>
                      <strong className={cn("font-mono", incomeVariance >= 0 ? 'text-accent' : 'text-destructive')}>
                         {formatCurrency(incomeVariance)} ({incomeVarianceStatus})
                     </strong>
                 </div>
             </div>

              {/* Expenses Section */}
             <div className="space-y-1 border-b pb-3">
                 <h4 className="text-sm font-medium text-muted-foreground">Expenses</h4>
                 <div className="flex justify-between">
                     <span>Budgeted Expenses:</span>
                     <strong className="font-mono">{formatCurrency(contextExpensesBudget)}</strong>
                 </div>
                 <div className="flex justify-between">
                     <span>Actual Expenses:</span>
                     <strong className="font-mono">{formatCurrency(totalExpenses)}</strong>
                 </div>
                 <div className="flex justify-between">
                     <span>Expenses Variance:</span>
                      <strong className={cn("font-mono", expensesVariance >= 0 ? 'text-accent' : 'text-destructive')}>
                         {formatCurrency(expensesVariance)} ({expensesVarianceStatus})
                      </strong>
                 </div>
             </div>

              {/* Net Summary Section */}
             <div className="space-y-1 pt-2">
                 <h4 className="text-sm font-medium text-muted-foreground">Net Summary</h4>
                  <div className="flex justify-between">
                     <span>Budgeted Net (Income - Expenses):</span>
                     <strong className={cn("font-mono", (contextIncomeBudget - contextExpensesBudget) >= 0 ? 'text-primary' : 'text-destructive')}>
                         {formatCurrency(contextIncomeBudget - contextExpensesBudget)}
                     </strong>
                 </div>
                  <div className="flex justify-between">
                     <span>Actual Net (Income - Expenses):</span>
                     <strong className={cn("font-mono", (totalIncome - totalExpenses) >= 0 ? 'text-accent' : 'text-destructive')}>
                         {formatCurrency(totalIncome - totalExpenses)}
                     </strong>
                 </div>
             </div>

          </CardContent>
        </Card>
      </main>
    </div>
  );
}


    