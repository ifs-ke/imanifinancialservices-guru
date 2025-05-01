// src/app/(dashboard)/statements/page.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter as UiTableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, TrendingUp, TrendingDown, Scale, DollarSign, Landmark, PlusCircle, Save, XCircle } from 'lucide-react';
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

// Interface for statement items
interface StatementItem {
  id: string;
  description: string;
  amount: number;
}

// Generate unique IDs
const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Initial Mock Data (values in KES)
const initialIncome: StatementItem[] = [
  { id: generateId(), description: 'Salary', amount: 300000 },
  { id: generateId(), description: 'Freelance Work', amount: 50000 },
];

const initialExpenses: StatementItem[] = [
  { id: generateId(), description: 'Rent', amount: 120000 },
  { id: generateId(), description: 'Groceries', amount: 35000 },
  { id: generateId(), description: 'Utilities', amount: 15000 },
  { id: generateId(), description: 'Transportation', amount: 10000 },
  { id: generateId(), description: 'Debt Payments', amount: 60000 },
  { id: generateId(), description: 'Entertainment', amount: 20000 },
];

const initialAssets: StatementItem[] = [
  { id: generateId(), description: 'Checking Account', amount: 250000 },
  { id: generateId(), description: 'Savings Account', amount: 1000000 },
  { id: generateId(), description: 'Car (Estimated Value)', amount: 800000 },
  { id: generateId(), description: 'Investments', amount: 500000 },
];

const initialLiabilities: StatementItem[] = [
  { id: generateId(), description: 'Credit Card Debt', amount: 300000 },
  { id: generateId(), description: 'Student Loan', amount: 1500000 },
  { id: generateId(), description: 'Car Loan', amount: 700000 },
];

// Calculation Function
const calculateTotal = (items: StatementItem[]) => items.reduce((sum, item) => sum + item.amount, 0);

// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
  }).format(amount);
};

export default function StatementsPage() {
  const [incomeItems, setIncomeItems] = useState<StatementItem[]>(initialIncome);
  const [expenseItems, setExpenseItems] = useState<StatementItem[]>(initialExpenses);
  const [assetItems, setAssetItems] = useState<StatementItem[]>(initialAssets);
  const [liabilityItems, setLiabilityItems] = useState<StatementItem[]>(initialLiabilities);

  const [isEditing, setIsEditing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: StatementItem; type: 'income' | 'expense' | 'asset' | 'liability' } | null>(null);

  // Temporary state for edits
  const [editingIncome, setEditingIncome] = useState<StatementItem[]>([]);
  const [editingExpenses, setEditingExpenses] = useState<StatementItem[]>([]);
  const [editingAssets, setEditingAssets] = useState<StatementItem[]>([]);
  const [editingLiabilities, setEditingLiabilities] = useState<StatementItem[]>([]);

  const { toast } = useToast();

  // Derived Calculations - Recalculate whenever items change
  const totalIncome = calculateTotal(isEditing ? editingIncome : incomeItems);
  const totalExpenses = calculateTotal(isEditing ? editingExpenses : expenseItems);
  const cashFlow = totalIncome - totalExpenses;

  const totalAssets = calculateTotal(isEditing ? editingAssets : assetItems);
  const totalLiabilities = calculateTotal(isEditing ? editingLiabilities : liabilityItems);
  const netWorth = totalAssets - totalLiabilities;

  // Handlers
  const handleEditToggle = () => {
    if (!isEditing) {
      // Entering edit mode: copy current state to editing state
      setEditingIncome([...incomeItems.map(item => ({ ...item }))]);
      setEditingExpenses([...expenseItems.map(item => ({ ...item }))]);
      setEditingAssets([...assetItems.map(item => ({ ...item }))]);
      setEditingLiabilities([...liabilityItems.map(item => ({ ...item }))]);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveChanges = () => {
    // Save changes from editing state to main state
    setIncomeItems(editingIncome);
    setExpenseItems(editingExpenses);
    setAssetItems(editingAssets);
    setLiabilityItems(editingLiabilities);
    setIsEditing(false);
    toast({ title: 'Changes Saved', description: 'Your statements have been updated.' });
  };

  const handleCancelEdit = () => {
    // Discard changes and exit edit mode
    setIsEditing(false);
    // No need to reset editing state here as it's re-initialized on next edit
    toast({ title: 'Edit Cancelled', description: 'No changes were saved.', variant: 'default' });
  };

  const handleItemChange = (
    e: ChangeEvent<HTMLInputElement>,
    id: string,
    type: 'income' | 'expense' | 'asset' | 'liability',
    field: 'description' | 'amount'
  ) => {
    const value = field === 'amount' ? parseFloat(e.target.value) || 0 : e.target.value;
    const setState = type === 'income' ? setEditingIncome :
                     type === 'expense' ? setEditingExpenses :
                     type === 'asset' ? setEditingAssets :
                     setEditingLiabilities;

    setState(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleAddItem = (type: 'income' | 'expense' | 'asset' | 'liability') => {
    const newItem: StatementItem = { id: generateId(), description: '', amount: 0 };
    const setState = type === 'income' ? setEditingIncome :
                     type === 'expense' ? setEditingExpenses :
                     type === 'asset' ? setEditingAssets :
                     setEditingLiabilities;
    setState(prev => [...prev, newItem]);
  };

  const handleDeleteClick = (item: StatementItem, type: 'income' | 'expense' | 'asset' | 'liability') => {
    setItemToDelete({ item, type });
  };

  const confirmDeleteItem = () => {
    if (!itemToDelete) return;
    const { item: itemToRemove, type } = itemToDelete;
    const setState = type === 'income' ? setEditingIncome :
                     type === 'expense' ? setEditingExpenses :
                     type === 'asset' ? setEditingAssets :
                     setEditingLiabilities;

    setState(prev => prev.filter(item => item.id !== itemToRemove.id));
    setItemToDelete(null);
    toast({ title: 'Item Deleted', description: 'Successfully removed.' });
  };

  const renderItemRow = (item: StatementItem, type: 'income' | 'expense' | 'asset' | 'liability') => (
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
            value={item.amount}
            onChange={(e) => handleItemChange(e, item.id, type, 'amount')}
            placeholder="Amount"
            className="h-8 text-right"
          />
        ) : (
          type === 'income' || type === 'asset' ? formatCurrency(item.amount) : `(${formatCurrency(item.amount)})`
        )}
      </TableCell>
      {isEditing && (
         <TableCell className="w-[50px] pr-2">
           <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive h-7 w-7"
                // Remove the onClick handler from here to prevent premature state update
                // onClick={() => handleDeleteClick(item, type)} // Pass type here
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            {/* Conditionally render content based on the item to delete */}
            {/* This approach is less efficient. Better to keep the dialog content outside the map */}
            {/* Consider moving AlertDialog outside the map and controlling its open state */}
             {/* Update: Moved onClick to trigger, simplified dialog logic */}
             <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the item: <br/>
                    <strong>{item.description || '(No description)'} ({formatCurrency(item.amount)})</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
                  {/* Ensure confirmDeleteItem uses the correct item state */}
                  <AlertDialogAction onClick={() => { handleDeleteClick(item, type); confirmDeleteItem(); }}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
           </AlertDialog>
         </TableCell>
      )}
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
            Review and manage your cash flow and net worth.
            </p>
        </div>
         <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>
                <XCircle className="mr-2 h-4 w-4" /> Cancel
              </Button>
              <Button onClick={handleSaveChanges}>
                <Save className="mr-2 h-4 w-4" /> Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={handleEditToggle}>
              Edit Statements
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
            <CardDescription>Income vs. Expenses {isEditing ? '(Editing)' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isEditing && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                  <TableCell>Income</TableCell>
                  <TableCell></TableCell>
                   {isEditing && <TableCell></TableCell>}
                </TableRow>
                {(isEditing ? editingIncome : incomeItems).map(item => renderItemRow(item, 'income'))}
                 {isEditing && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-2">
                            <Button variant="ghost" size="sm" onClick={() => handleAddItem('income')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Income Item
                            </Button>
                        </TableCell>
                    </TableRow>
                 )}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Income</TableCell>
                    <TableCell className="text-right font-semibold font-mono">{formatCurrency(totalIncome)}</TableCell>
                    {isEditing && <TableCell></TableCell>}
                  </TableRow>

                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                  <TableCell>Expenses</TableCell>
                  <TableCell></TableCell>
                  {isEditing && <TableCell></TableCell>}
                </TableRow>
                {(isEditing ? editingExpenses : expenseItems).map(item => renderItemRow(item, 'expense'))}
                 {isEditing && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-2">
                            <Button variant="ghost" size="sm" onClick={() => handleAddItem('expense')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense Item
                            </Button>
                        </TableCell>
                    </TableRow>
                 )}
                 <TableRow>
                    <TableCell className="font-medium pl-6">Total Expenses</TableCell>
                    <TableCell className="text-right font-semibold font-mono">({formatCurrency(totalExpenses)})</TableCell>
                    {isEditing && <TableCell></TableCell>}
                  </TableRow>
              </TableBody>
              <UiTableFooter>
                <TableRow className="text-lg">
                  <TableHead>Net Cash Flow</TableHead>
                  <TableHead
                    className={`text-right font-bold font-mono ${
                      cashFlow >= 0 ? 'text-accent' : 'text-destructive'
                    }`}
                    colSpan={isEditing ? 2 : 1} // Adjust colspan when editing
                  >
                    {formatCurrency(cashFlow)}
                  </TableHead>
                   {isEditing && <TableHead></TableHead>}
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
             <CardDescription>Assets vs. Liabilities {isEditing ? '(Editing)' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                 <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                   {isEditing && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                   <TableCell className="flex items-center gap-2"><Landmark className="h-4 w-4"/>Assets</TableCell>
                  <TableCell></TableCell>
                  {isEditing && <TableCell></TableCell>}
                </TableRow>
                {(isEditing ? editingAssets : assetItems).map(item => renderItemRow(item, 'asset'))}
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

                 <TableRow className="font-semibold bg-secondary/50 dark:bg-secondary/20">
                   <TableCell className="flex items-center gap-2"><DollarSign className="h-4 w-4"/>Liabilities</TableCell>
                   <TableCell></TableCell>
                   {isEditing && <TableCell></TableCell>}
                </TableRow>
                {(isEditing ? editingLiabilities : liabilityItems).map(item => renderItemRow(item, 'liability'))}
                 {isEditing && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center py-2">
                            <Button variant="ghost" size="sm" onClick={() => handleAddItem('liability')}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Liability Item
                            </Button>
                        </TableCell>
                    </TableRow>
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
