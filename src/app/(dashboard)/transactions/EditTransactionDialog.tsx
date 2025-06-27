
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
import type { TransactionWithId, BudgetItem, IncomeCategory } from '@/lib/types';
import { TransactionFormDataSchema } from '@/lib/schemas';
import type { TransactionFormData } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, parse, isValid } from 'date-fns';

interface EditTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionWithId | null; // Null for "Add" mode
  allBudgetItems: BudgetItem[];
}

const NONE_CATEGORY_VALUE = "__NONE_CATEGORY__";
const NO_ITEMS_PLACEHOLDER_VALUE = "__NO_BUDGET_ITEMS_PLACEHOLDER__";

const formatDateForInput = (date: Date | string | undefined | null): string => {
    if (date instanceof Date) {
        return isValid(date) ? format(date, 'yyyy-MM-dd') : ''; // Return empty for invalid Date object
    }
    if (typeof date === 'string') {
        // Try parsing as ISO or other common formats
        const parsedDate = new Date(date);
        if (isValid(parsedDate)) {
            return format(parsedDate, 'yyyy-MM-dd');
        }
        // If direct parsing fails, specifically try 'yyyy-MM-dd'
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const specificParse = parse(date, 'yyyy-MM-dd', new Date());
            if (isValid(specificParse)) {
                return format(specificParse, 'yyyy-MM-dd');
            }
        }
        return ''; // Return empty for unparsable string
    }
    return ''; // Default to empty if date is undefined/null or not a string/Date
};


const EditTransactionDialog: React.FC<EditTransactionDialogProps> = ({
  isOpen,
  onClose,
  transaction,
  allBudgetItems,
}) => {
  const { addTransaction, updateTransaction } = useTransactionsStore();
  const { toast } = useToast();

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(TransactionFormDataSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'), // Sensible default for add
      description: '',
      amount: 0,
      modeOfPayment: 'Bank',
      frequency: undefined,
      variability: undefined,
      categoryName: NONE_CATEGORY_VALUE,
      incomeCategory: undefined,
    },
  });

  const transactionDateStr = form.watch('date');
  const transactionAmount = form.watch('amount');

  const budgetItemsForSelectedMonth = useMemo(() => {
    if (!transactionDateStr) return [];
    try {
      const transactionDate = parse(transactionDateStr, 'yyyy-MM-dd', new Date());
      if (!isValid(transactionDate)) return [];
      const periodKey = format(transactionDate, 'yyyy-MM');

      return allBudgetItems.filter(item =>
        item.period === periodKey &&
        (transactionAmount >= 0 ? item.category === 'income' : item.category !== 'income') &&
        item.description && item.description.trim() !== ''
      );
    } catch (e) {
      return [];
    }
  }, [transactionDateStr, transactionAmount, allBudgetItems]);

  useEffect(() => {
    if (isOpen) {
      if (transaction) {
        const initialDate = formatDateForInput(transaction.date);
        form.reset({
          date: initialDate, // Will be empty if transaction.date is invalid, Zod will catch
          description: transaction.description,
          amount: transaction.amount,
          modeOfPayment: transaction.modeOfPayment,
          frequency: transaction.frequency || undefined,
          variability: transaction.variability || undefined,
          categoryName: transaction.categoryName || NONE_CATEGORY_VALUE,
          incomeCategory: transaction.incomeCategory || undefined,
        });
      } else {
        form.reset({
          date: format(new Date(), 'yyyy-MM-dd'), // Always use current date for new transactions
          description: '',
          amount: 0,
          modeOfPayment: 'Bank',
          frequency: undefined,
          variability: undefined,
          categoryName: NONE_CATEGORY_VALUE,
          incomeCategory: undefined,
        });
      }
    }
  }, [transaction, isOpen, form]);

  const onSubmit = (data: TransactionFormData) => {
    try {
      const processedCategoryName = data.categoryName === NONE_CATEGORY_VALUE ? null : data.categoryName;
      const transactionPayload = {
        date: parse(data.date, 'yyyy-MM-dd', new Date()), // data.date is validated by Zod to be 'yyyy-MM-dd'
        description: data.description,
        amount: data.amount,
        modeOfPayment: data.modeOfPayment,
        frequency: data.frequency,
        variability: data.variability,
        categoryName: processedCategoryName,
        incomeCategory: data.incomeCategory,
      };

      if (transaction) {
        updateTransaction({
          ...transaction,
          ...transactionPayload,
        });
        toast({ title: 'Transaction Updated', description: 'Successfully updated.' });
      } else {
        addTransaction(transactionPayload);
        toast({ title: 'Transaction Added', description: 'Successfully added.' });
      }
      onClose();
    } catch (error) {
      toast({ title: 'Error Saving', description: 'Could not save the transaction.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{transaction ? 'Edit Transaction' : 'Add New Transaction'}</DialogTitle>
          <DialogDescription>
            {transaction ? 'Update the details for this transaction.' : 'Enter the details for the new transaction.'}
          </DialogDescription>
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
                              {item.description} ({item.category === 'income' ? 'Income' : 'Expense/Goal/Debt'})
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
            {transactionAmount > 0 && (
              <FormField
                control={form.control}
                name="incomeCategory"
                render={({ field }) => (
                  <FormItem className="grid grid-cols-4 items-center gap-4">
                    <FormLabel className="text-right col-span-1">Income Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl className="col-span-3">
                        <SelectTrigger>
                          <SelectValue placeholder="Optional: Select income type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        <SelectItem value="earned">Earned</SelectItem>
                        <SelectItem value="profit">Profit</SelectItem>
                        <SelectItem value="interest">Interest</SelectItem>
                        <SelectItem value="dividend">Dividend</SelectItem>
                        <SelectItem value="rental">Rental</SelectItem>
                        <SelectItem value="capital gains">Capital Gains</SelectItem>
                        <SelectItem value="intellectual">Intellectual Property</SelectItem>
                        <SelectItem value="savings">Savings / Transfer In</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="col-span-4 text-right" />
                  </FormItem>
                )}
              />
            )}
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
                {form.formState.isSubmitting ? "Saving..." : (transaction ? "Save Changes" : "Add Transaction")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTransactionDialog;
