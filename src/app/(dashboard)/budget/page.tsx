'use client';

import React, { useState, useEffect, useCallback, ChangeEvent, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Coins, FileText, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactions } from '@/contexts/TransactionsContext'; // Import useTransactions hook
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types'; // Import shared types
import { format, getMonth, getYear } from 'date-fns'; // For date formatting
import { cn } from '@/lib/utils'; // For conditional classes

// Mock Budget Item Interface
interface BudgetItem {
    id: string;
    category: string; // e.g., "Rent", "Groceries", "Salary"
    amount: number;  // Budgeted amount
    month: number;    // Month (0-11)
    year: number;     // Year
    frequency?: TransactionFrequency;
    variability?: TransactionVariability;
}

// Initial form data structure for Budget Items
const initialFormData = {
    category: '',
    amount: '',
    month: getMonth(new Date()),
    year: getYear(new Date()),
    frequency: '' as TransactionFrequency | '', // Optional Categorization
    variability: '' as TransactionVariability | '', // Optional Categorization
};

// Formatting Function (consider moving to utils)
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES', // Use KES
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function BudgetPage() {
    const { transactions } = useTransactions(); // Access transactions for variance analysis
    const { toast } = useToast();

    // States for managing budgets
    const [budgets, setBudgets] = useState<BudgetItem[]>([]);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<BudgetItem | null>(null);
    const [budgetToDelete, setBudgetToDelete] = useState<BudgetItem | null>(null);
    const [formData, setFormData] = useState(initialFormData);


     // Reset form data when dialogs close
    useEffect(() => {
        if (!isAddDialogOpen && !isEditDialogOpen) {
            setFormData(initialFormData);
            setEditingBudget(null);
        }
    }, [isAddDialogOpen, isEditDialogOpen]);

    // --- Handlers ---

     const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormData(prev => ({ ...prev, [name]: value }));
     };

    // Generic handler for select changes
    const handleSelectChange = (name: string, value: string) => {
       setFormData(prev => ({ ...prev, [name]: value }));
    };

    // CREATE
    const handleAddBudgetSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const { category, amount, month, year, frequency, variability } = formData;

        if (!category || !amount || !month || !year ) {
             toast({ title: 'Missing Information', description: 'Please fill out required fields (Category, Amount, Month, Year).', variant: 'destructive' });
             return;
        }
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount)) {
            toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
            return;
        }
        const newBudgetItem: BudgetItem = {
          id: `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          category: category,
          amount: parsedAmount,
          month: Number(month), // Ensure it's a number
          year: Number(year),  // Ensure it's a number
          frequency: frequency || undefined,
          variability: variability || undefined,
        };

        setBudgets(prev => [...prev, newBudgetItem]);
        setIsAddDialogOpen(false);
        toast({ title: 'Budget Added', description: 'Successfully added.' });
    };


    // UPDATE
    const handleEditClick = (budget: BudgetItem) => {
        setEditingBudget(budget);
        setFormData({
          category: budget.category,
          amount: budget.amount.toString(),
          month: budget.month,
          year: budget.year,
          frequency: budget.frequency || '',
          variability: budget.variability || '',
        });
        setIsEditDialogOpen(true);
    };

    const handleUpdateBudgetSubmit = (event: React.FormEvent) => {
      event.preventDefault();
       if (!editingBudget) return;
      const { category, amount, month, year, frequency, variability } = formData;

       if (!category || !amount || !month || !year) {
           toast({ title: 'Missing Information', description: 'Please fill out required fields (Category, Amount, Month, Year).', variant: 'destructive' });
           return;
       }
       const parsedAmount = parseFloat(amount);
       if (isNaN(parsedAmount)) {
           toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
           return;
       }

        updateBudget({
            ...editingBudget, // Keep the original ID
            category,
            amount: parsedAmount,
            month: Number(month),
            year: Number(year),
            frequency: frequency || undefined,
            variability: variability || undefined,
        });
        setIsEditDialogOpen(false);
        toast({ title: 'Budget Updated', description: 'Successfully updated.' });
    };

      const updateBudget = (updatedBudget: BudgetItem) => {
        setBudgets(prev =>
           prev.map(budget => budget.id === updatedBudget.id ? {
             ...budget,
             category: updatedBudget.category,
             amount: updatedBudget.amount,
             month: updatedBudget.month,
             year: updatedBudget.year,
             frequency: updatedBudget.frequency,
             variability: updatedBudget.variability,
         } : budget)
       );
    };

    // DELETE
    const handleDeleteClick = (budget: BudgetItem) => {
        setBudgetToDelete(budget);
    };

    const confirmDeleteBudget = () => {
        if (!budgetToDelete) return;
        deleteBudget(budgetToDelete.id);
        setBudgetToDelete(null);
        toast({ title: 'Budget Deleted', description: 'Successfully removed.' });
    };

    const deleteBudget = (id: string) => {
        setBudgets(prev => prev.filter(tx => tx.id !== id));
    };

    // --- Budget Variance Report Logic ---

    const generateBudgetVarianceReport = useCallback(() => {
       // For simplicity, filter based on current month/year
       const currentMonth = getMonth(new Date());
       const currentYear = getYear(new Date());

       const relevantBudgets = budgets.filter(b => b.month === currentMonth && b.year === currentYear);

       // Now also consider expense categories during filtering
       const relevantTransactions = transactions.filter(tx => {
            const txMonth = getMonth(tx.date);
            const txYear = getYear(tx.date);
            return txMonth === currentMonth && txYear === currentYear && tx.amount < 0;
       });

        const report = relevantBudgets.map(budget => {
          const actualExpenses = relevantTransactions
             .filter(tx => tx.description.toLowerCase().includes(budget.category.toLowerCase()))
             .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

           const variance = budget.amount - actualExpenses;

           return {
                budgetItem: budget,
                actualExpenses,
                variance
           };
        });
      return report;
     }, [budgets, transactions]);

     const budgetVarianceReport = useMemo(() => generateBudgetVarianceReport(), [generateBudgetVarianceReport]);

     // Render Functions
     const renderBudgetRow = (budget: BudgetItem) => (
        <TableRow key={budget.id}>
            <TableCell className="font-medium">{budget.category}</TableCell>
            <TableCell>{formatCurrency(budget.amount)}</TableCell>
            <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(budget)}>
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                </Button>
                <AlertDialog open={budgetToDelete?.id === budget.id} onOpenChange={(open) => !open && setBudgetToDelete(null)}>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(budget)}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the budget: <br />
                                <strong>{budget.category} ({formatCurrency(budget.amount)})</strong>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setBudgetToDelete(null)}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDeleteBudget}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </TableCell>
        </TableRow>
    );

     const renderBudgetVarianceRow = (item: { budgetItem: BudgetItem, actualExpenses: number, variance: number }) => (
         <TableRow key={item.budgetItem.id}>
            <TableCell className="font-medium">{item.budgetItem.category}</TableCell>
             <TableCell>{formatCurrency(item.budgetItem.amount)}</TableCell>
             <TableCell>{formatCurrency(item.actualExpenses)}</TableCell>
             <TableCell className={cn(item.variance >= 0 ? 'text-accent' : 'text-destructive')}>
                 {formatCurrency(item.variance)}
             </TableCell>
         </TableRow>
     );

    return (
      <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
        <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Coins className="h-6 w-6 text-primary"/> Budget Management
            </h1>
            <p className="text-muted-foreground">
              Create and manage your budgets.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Add Budget Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Budget
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Budget Item</DialogTitle>
                  <DialogDescription>Enter the details of the budget below.</DialogDescription>
                </DialogHeader>
                {/* Changed form onSubmit handler */}
                <form onSubmit={handleAddBudgetSubmit} className="grid gap-4 py-4">
                    {/* Input Fields */}
                    <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="add-category" className="text-right">Category</Label>
                         <Input id="add-category" name="category" value={formData.category} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Rent" required />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="add-amount" className="text-right">Amount (KES)</Label>
                        <Input id="add-amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 5000" required />
                    </div>
                     <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="add-month" className="text-right">Month</Label>
                         <Select name="month" value={formData.month} onValueChange={(value) => handleSelectChange('month', value)} required>
                            <SelectTrigger id="add-month" className="col-span-3">
                                 <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                             <SelectContent>
                                 {Array.from({ length: 12 }, (_, i) => {
                                     const monthName = format(new Date(2024, i, 1), 'MMMM'); // Get month name
                                     return <SelectItem key={i} value={i}>{monthName}</SelectItem>;
                                 })}
                             </SelectContent>
                         </Select>
                     </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="add-year" className="text-right">Year</Label>
                        <Input id="add-year" name="year" type="number" value={formData.year} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 2024" required />
                    </div>
                    <DialogFooter>
                        {/* Use DialogClose for cancellation */}
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button type="submit">Add Budget</Button>
                    </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <main className="flex-1 grid gap-6 md:grid-cols-2">
          {/* Budget List Card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Budget Items</CardTitle>
              <CardDescription>Your configured budget items.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount (KES)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgets.length > 0 ? (
                       budgets.map(renderBudgetRow)
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          No budgets yet. Add one to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Budget Variance Report Card */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Budget Variance Report</CardTitle>
              <CardDescription>Compares budgeted amounts to actual expenses.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Budgeted (KES)</TableHead>
                      <TableHead>Actual (KES)</TableHead>
                      <TableHead>Variance (KES)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budgetVarianceReport.length > 0 ? (
                      budgetVarianceReport.map(renderBudgetVarianceRow)
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          No budget variance data to display. Add budget items and transactions for the current month.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </main>

          {/* Edit Budget Dialog */}
         <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
                 <DialogHeader>
                    <DialogTitle>Edit Budget Item</DialogTitle>
                    <DialogDescription>Update the details below.</DialogDescription>
                 </DialogHeader>
                 {/* Changed form onSubmit handler */}
                 <form onSubmit={handleUpdateBudgetSubmit} className="grid gap-4 py-4">
                    {/* Input Fields */}
                    <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-category" className="text-right">Category</Label>
                         <Input id="edit-category" name="category" value={formData.category} onChange={handleInputChange} className="col-span-3" required />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="edit-amount" className="text-right">Amount (KES)</Label>
                         <Input id="edit-amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleInputChange} className="col-span-3" required />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="edit-month" className="text-right">Month</Label>
                        <Select name="month" value={formData.month} onValueChange={(value) => handleSelectChange('month', value)} required>
                            <SelectTrigger id="edit-month" className="col-span-3">
                                <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                            <SelectContent>
                                {Array.from({ length: 12 }, (_, i) => {
                                    const monthName = format(new Date(2024, i, 1), 'MMMM'); // Get month name
                                    return <SelectItem key={i} value={i}>{monthName}</SelectItem>;
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="edit-year" className="text-right">Year</Label>
                        <Input id="edit-year" name="year" type="number" value={formData.year} onChange={handleInputChange} className="col-span-3" required />
                    </div>
                    <DialogFooter>
                         {/* Use DialogClose for cancellation */}
                        <DialogClose asChild>
                             <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button type="submit">Save Changes</Button>
                    </DialogFooter>
                 </form>
            </DialogContent>
         </Dialog>
      </div>
    );
}
