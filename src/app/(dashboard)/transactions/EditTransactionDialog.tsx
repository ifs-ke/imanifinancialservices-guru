// src/app/(dashboard)/transactions/EditTransactionDialog.tsx
'use client';

import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { useTransactionsStore } from '@/store/transactionsStore';
import type { TransactionWithId, BudgetItem } from '@/lib/types';
import { TransactionFormDataSchema } from '@/lib/schemas';
import type { TransactionFormData } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, parse, isValid } from 'date-fns';

interface EditTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionWithId;
  allBudgetItems: BudgetItem[]; 
}

const NONE_CATEGORY_VALUE = "__NONE_CATEGORY__"; 
const NO_ITEMS_PLACEHOLDER_VALUE = "__NO_BUDGET_ITEMS_PLACEHOLDER__"; 

// Helper to format Date to YYYY-MM-DD for input[type=date]
// Ensures that if an invalid date is passed, it doesn't just default to today
// but tries to maintain the original invalidity or a sensible default like epoch start.
const formatDateForInput = (date: Date | string | undefined | null): string => {
    if (date instanceof Date) {
        if (isValid(date)) {
            return format(date, 'yyyy-MM-dd');
        }
        // console.warn(`Invalid Date object passed to formatDateForInput. Defaulting to epoch start.`);
        return format(new Date(0), 'yyyy-MM-dd'); 
    }
    if (typeof date === 'string') {
        // Attempt to parse common date string formats
        let parsedDate = new Date(date); // General purpose parsing for ISO strings etc.
        if (isValid(parsedDate)) {
            return format(parsedDate, 'yyyy-MM-dd');
        }
        // Try specific format if general parsing fails
        parsedDate = parse(date, 'yyyy-MM-dd', new Date());
        if (isValid(parsedDate)) {
            return format(parsedDate, 'yyyy-MM-dd');
        }
        // console.warn(`Unparseable date string: ${date}. Defaulting to epoch start.`);
        return format(new Date(0), 'yyyy-MM-dd');
    }
    // Fallback for undefined, null, or other types
    // console.warn(`Invalid date type or value for formatDateForInput. Defaulting to epoch start.`);
    return format(new Date(0), 'yyyy-MM-dd');
};


const EditTransactionDialog: React.FC<EditTransactionDialogProps> = ({
  isOpen,
  onClose,
  transaction,
  allBudgetItems,
}) => {
  const { updateTransaction } = useTransactionsStore();
  const { toast } = useToast();

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(TransactionFormDataSchema),
    defaultValues: { // Default values for a new form, overridden by useEffect for editing
      date: formatDateForInput(new Date()), // Default to today if no transaction
      description: '',
      amount: 0,
      modeOfPayment: 'Bank',
      frequency: undefined,
      variability: undefined,
      categoryName: NONE_CATEGORY_VALUE, 
    },
  });

  const transactionDateStr = form.watch('date');

  const budgetItemsForSelectedMonth = useMemo(() => {
    if (!transactionDateStr) return [];
    try {
      const transactionDate = parse(transactionDateStr, 'yyyy-MM-dd', new Date());
      if (!isValid(transactionDate)) return [];
      const periodKey = format(transactionDate, 'yyyy-MM');
      return allBudgetItems.filter(item => 
        item.period === periodKey && 
        item.category !== 'income' &&
        item.description && item.description.trim() !== '' // Ensure description is not empty
      );
    } catch (e) {
      // console.error("Error filtering budget items for month:", e);
      return [];
    }
  }, [transactionDateStr, allBudgetItems]);

  useEffect(() => {
    if (transaction && isOpen) {
      form.reset({
        date: formatDateForInput(transaction.date),
        description: transaction.description,
        amount: transaction.amount,
        modeOfPayment: transaction.modeOfPayment,
        frequency: transaction.frequency || undefined,
        variability: transaction.variability || undefined,
        categoryName: transaction.categoryName || NONE_CATEGORY_VALUE, 
      });
    }
  }, [transaction, isOpen, form]);

  const onSubmit = (data: TransactionFormData) => {
    try {
      const processedCategoryName = data.categoryName === NONE_CATEGORY_VALUE ? null : data.categoryName;
      updateTransaction({
        ...transaction, // Spreads the original transaction ID and other potentially unedited fields
        date: parse(data.date, 'yyyy-MM-dd', new Date()), // Ensure date is parsed back to Date object
        description: data.description,
        amount: data.amount,
        modeOfPayment: data.modeOfPayment,
        frequency: data.frequency,
        variability: data.variability,
        categoryName: processedCategoryName, 
      });
      toast({ title: 'Transaction Updated', description: 'Successfully updated.' });
      onClose();
    } catch (error) {
      // console.error("Error updating transaction:", error);
      toast({ title: 'Error Updating', description: 'Could not update the transaction.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]"> 
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>Update the details for this transaction.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right col-span-1">Date</FormLabel>
                  <FormControl className="col-span-3">
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right col-span-1">Description</FormLabel>
                  <FormControl className="col-span-3">
                    <Input {...field} placeholder="e.g., Groceries" />
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
                  <FormLabel className="text-right col-span-1">Amount (KES)</FormLabel>
                  <FormControl className="col-span-3">
                    <Input type="number" step="0.01" {...field} 
                      onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="e.g., -500 or 10000"
                    />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="modeOfPayment"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right col-span-1">Payment Mode</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="Mpesa">Mpesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="categoryName"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right col-span-1">Budget Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || NONE_CATEGORY_VALUE}>
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue placeholder="Optional: Link to budget item" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value={NONE_CATEGORY_VALUE}>None</SelectItem>
                       {budgetItemsForSelectedMonth.length > 0 ? (
                        budgetItemsForSelectedMonth.map(item => (
                           item.description && item.description.trim() !== '' && (
                            <SelectItem key={item.id} value={item.description}>
                              {item.description} ({item.category})
                            </SelectItem>
                          )
                        ))
                      ) : (
                        <SelectItem value={NO_ITEMS_PLACEHOLDER_VALUE} disabled>No budget items for selected month</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right col-span-1">Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue placeholder="Optional: Select frequency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="recurring">Recurring</SelectItem>
                      <SelectItem value="one-time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="variability"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right col-span-1">Variability</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue placeholder="Optional: Select variability" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="variable">Variable</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={() => {form.reset(); onClose();}}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTransactionDialog;
