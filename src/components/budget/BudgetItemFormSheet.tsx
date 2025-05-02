
// src/components/budget/BudgetItemFormSheet.tsx
'use client';

import React, { useState, useEffect, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from '@/hooks/use-toast';
import { useBudgetStore } from '@/store/budgetStore'; // Import Zustand store hook
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';

interface BudgetItemFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  item: BudgetItem | null; // Null for Add, object for Edit
  initialCategory?: BudgetItemCategory; // Optional initial category for Add
}

// Initial form data structure
const initialFormData: Omit<BudgetItem, 'id'> = {
    description: '',
    amount: 0,
    category: 'recurring-expense' // Default category
};

const BudgetItemFormSheet: React.FC<BudgetItemFormSheetProps> = ({
  isOpen,
  onClose,
  item,
  initialCategory = 'recurring-expense' // Default if not provided
}) => {
  // Use Zustand store hook for budget state management
  const { addBudgetItem, updateBudgetItem } = useBudgetStore();
  const { toast } = useToast();
  const [formData, setFormData] = useState<Omit<BudgetItem, 'id'>>(initialFormData);

  // Effect to populate form when editing or setting initial category for adding
  useEffect(() => {
    if (isOpen) { // Only run when the sheet is open
        if (item) { // Editing existing item
            setFormData({
                description: item.description,
                amount: item.amount,
                category: item.category,
            });
        } else { // Adding new item
            setFormData({ ...initialFormData, category: initialCategory });
        }
    }
  }, [item, initialCategory, isOpen]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

   const handleSelectChange = (value: BudgetItemCategory) => {
     setFormData(prev => ({ ...prev, category: value }));
   };

   const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const { description, amount, category } = formData;

    if (!description || amount < 0 || !category) {
      toast({ title: 'Invalid Input', description: 'Please fill out description, category, and use a non-negative amount.', variant: 'destructive' });
      return;
    }

    try {
        if (item) {
            // Update existing item using Zustand action
            updateBudgetItem({ ...item, ...formData });
            toast({ title: 'Budget Item Updated', description: 'Successfully updated.' });
        } else {
            // Add new item using Zustand action
            addBudgetItem(formData);
            toast({ title: 'Budget Item Added', description: 'Successfully added.' });
        }
        onClose(); // Close the sheet on success
    } catch (error) {
         console.error("Error saving budget item:", error);
         toast({ title: 'Error Saving Item', description: 'Could not save the budget item. Please try again.', variant: 'destructive' });
    }
   };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{item ? 'Edit Budget Item' : 'Add New Budget Item'}</SheetTitle>
          <SheetDescription>
            {item ? 'Update the details for this budget item.' : 'Enter the details for the new budget item.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-category" className="text-right">Category</Label>
                 <Select name="category" value={formData.category} onValueChange={handleSelectChange} required>
                    <SelectTrigger id="form-category" className="col-span-3">
                    <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="recurring-expense">Recurring Expense</SelectItem>
                        <SelectItem value="one-time-expense">One-Time Expense</SelectItem>
                        <SelectItem value="goal">Goal</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-description" className="text-right">Description</Label>
                <Input id="form-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Salary, Rent, Savings" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-amount" className="text-right">Amount (KES)</Label>
                <Input id="form-amount" name="amount" type="number" step="0.01" min="0" value={formData.amount} onChange={handleInputChange} className="col-span-3" required />
            </div>

          <SheetFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{item ? 'Save Changes' : 'Add Item'}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default BudgetItemFormSheet;

