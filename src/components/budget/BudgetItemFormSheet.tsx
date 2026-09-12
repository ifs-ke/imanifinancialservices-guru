// src/components/budget/BudgetItemFormSheet.tsx
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { useBudgetStore } from '@/store/budgetStore';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { BudgetItemFormDataSchema, type BudgetItemFormData } from '@/lib/schemas';
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
        addBudgetItem(data);
        toast({ title: 'Budget Item Added', description: 'Successfully added to current period.' });
      }
      onClose();
    } catch (error) {
      console.error("Error saving budget item:", error);
      toast({ title: 'Error Saving Item', description: 'Could not save the budget item. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl border border-border/50 shadow-lg p-6">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-base font-bold tracking-tight">
            {item ? 'Edit Budget Item' : 'Add New Budget Item'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {item ? 'Update the details for this target allocation.' : 'Enter the details for the new budget item for the selected period.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-3">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-bold text-foreground">Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-9 rounded-lg border-border/60 text-xs font-semibold focus:ring-primary">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl border border-border/50 shadow-md">
                      <SelectItem value="income" className="text-xs">Income</SelectItem>
                      <SelectItem value="recurring-expense" className="text-xs">Recurring Expense</SelectItem>
                      <SelectItem value="one-time-expense" className="text-xs">One-Time Expense</SelectItem>
                      <SelectItem value="goal" className="text-xs">Goal</SelectItem>
                      <SelectItem value="debt" className="text-xs">Debt Allocation</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[10px] font-semibold text-rose-500" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-bold text-foreground">Description</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Salary, Rent, Savings" 
                      className="h-9 rounded-lg border-border/60 text-xs font-semibold focus:ring-primary" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-[10px] font-semibold text-rose-500" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-bold text-foreground">Amount (KES)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      className="h-9 rounded-lg border-border/60 font-mono text-xs font-semibold focus:ring-primary"
                      {...field} 
                      onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px] font-semibold text-rose-500" />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 pt-4 sm:space-x-0 border-t border-border/40 mt-2">
              <DialogClose asChild>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => form.reset()}
                  className="rounded-lg h-9 text-xs font-bold border-border/50 hover:bg-muted/10"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button 
                type="submit" 
                size="sm"
                disabled={form.formState.isSubmitting}
                className="rounded-lg h-9 text-xs font-bold shadow-sm"
              >
                {form.formState.isSubmitting ? "Saving..." : (item ? 'Save Changes' : 'Add Item')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BudgetItemFormSheet;
