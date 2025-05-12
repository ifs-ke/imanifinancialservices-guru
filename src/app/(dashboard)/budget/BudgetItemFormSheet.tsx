// src/app/(dashboard)/budget/BudgetItemFormSheet.tsx
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label'; // Still used for basic layout styling
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { useToast } from '@/hooks/use-toast';
import { useBudgetStore } from '@/store/budgetStore';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { BudgetItemFormDataSchema, type BudgetItemFormData } from '@/lib/schemas'; // Import Zod schema
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";


interface BudgetItemFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  item: BudgetItem | null;
  initialCategory?: BudgetItemCategory;
}

const BudgetItemFormSheet: React.FC<BudgetItemFormSheetProps> = ({
  isOpen,
  onClose,
  item,
  initialCategory = 'recurring-expense'
}) => {
  const { addBudgetItem, updateBudgetItem } = useBudgetStore();
  const { toast } = useToast();

  const form = useForm<BudgetItemFormData>({
    resolver: zodResolver(BudgetItemFormDataSchema),
    defaultValues: {
      description: '',
      amount: 0,
      category: initialCategory,
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (item) {
        form.reset({
          description: item.description,
          amount: item.amount,
          category: item.category,
        });
      } else {
        form.reset({
          description: '',
          amount: 0,
          category: initialCategory,
        });
      }
    }
  }, [item, initialCategory, isOpen, form]);

  const onSubmit = (data: BudgetItemFormData) => {
    try {
      if (item) {
        updateBudgetItem({ ...item, ...data });
        toast({ title: 'Budget Item Updated', description: 'Successfully updated.' });
      } else {
        addBudgetItem(data); // `addBudgetItem` now takes Omit<BudgetItem, 'id' | 'period'>
        toast({ title: 'Budget Item Added', description: 'Successfully added to current period.' });
      }
      onClose();
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
            {item ? 'Update the details for this budget item.' : 'Enter the details for the new budget item for the selected period.'}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="recurring-expense">Recurring Expense</SelectItem>
                      <SelectItem value="one-time-expense">One-Time Expense</SelectItem>
                      <SelectItem value="goal">Goal</SelectItem>
                      <SelectItem value="debt">Debt Allocation</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Description</FormLabel>
                  <FormControl className="col-span-3">
                    <Input placeholder="e.g., Salary, Rent, Savings" {...field} />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Amount (KES)</FormLabel>
                  <FormControl className="col-span-3">
                    <Input type="number" step="0.01" min="0" {...field} 
                      onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <SheetFooter className="mt-4">
              <SheetClose asChild>
                <Button type="button" variant="outline" onClick={() => form.reset()}>Cancel</Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : (item ? 'Save Changes' : 'Add Item')}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};

export default BudgetItemFormSheet;

