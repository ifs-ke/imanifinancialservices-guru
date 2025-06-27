// src/app/(dashboard)/transactions/BatchUpdateTransactionDialog.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability, BudgetItem, TransactionFormData as SharedTransactionFormData, IncomeCategory } from '@/lib/types';
import { BatchUpdateTransactionFormDataSchema, type BatchUpdateTransactionFormData } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, parse, isValid } from 'date-fns';

const LEAVE_UNCHANGED_VALUE = "__LEAVE_UNCHANGED__";
const NONE_CATEGORY_VALUE = "__NONE_CATEGORY__";
const NO_ITEMS_PLACEHOLDER_VALUE = "__NO_BUDGET_ITEMS_PLACEHOLDER__";

interface BatchUpdateTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transactionIds: string[];
  allBudgetItems: BudgetItem[]; 
  onComplete?: () => void; 
}

const BatchUpdateTransactionDialog: React.FC<BatchUpdateTransactionDialogProps> = ({
  isOpen,
  onClose,
  transactionIds,
  allBudgetItems,
  onComplete,
}) => {
  const { batchUpdateTransactions, transactions: allStoreTransactions } = useTransactionsStore();
  const { toast } = useToast();

  const form = useForm<BatchUpdateTransactionFormData>({
    resolver: zodResolver(BatchUpdateTransactionFormDataSchema),
    defaultValues: {
      modeOfPayment: LEAVE_UNCHANGED_VALUE as ModeOfPayment | typeof LEAVE_UNCHANGED_VALUE,
      frequency: LEAVE_UNCHANGED_VALUE as TransactionFrequency | typeof LEAVE_UNCHANGED_VALUE,
      variability: LEAVE_UNCHANGED_VALUE as TransactionVariability | typeof LEAVE_UNCHANGED_VALUE,
      categoryName: LEAVE_UNCHANGED_VALUE, 
      incomeCategory: LEAVE_UNCHANGED_VALUE,
    },
  });

  const [referenceDateForBudgetItems, setReferenceDateForBudgetItems] = useState<string | null>(null);
  const [isIncomeBatch, setIsIncomeBatch] = useState<boolean | null>(null); // null if mixed, true if all income, false if all expense

  useEffect(() => {
    if (isOpen && transactionIds.length > 0) {
      form.reset({ 
        modeOfPayment: LEAVE_UNCHANGED_VALUE as ModeOfPayment | typeof LEAVE_UNCHANGED_VALUE,
        frequency: LEAVE_UNCHANGED_VALUE as TransactionFrequency | typeof LEAVE_UNCHANGED_VALUE,
        variability: LEAVE_UNCHANGED_VALUE as TransactionVariability | typeof LEAVE_UNCHANGED_VALUE,
        categoryName: LEAVE_UNCHANGED_VALUE,
        incomeCategory: LEAVE_UNCHANGED_VALUE,
      });

      const selectedTransactions = allStoreTransactions.filter(tx => transactionIds.includes(tx.id));
      if (selectedTransactions.length > 0) {
        const firstTx = selectedTransactions[0];
        const dateObj = firstTx.date instanceof Date ? firstTx.date : new Date(firstTx.date);
        if (isValid(dateObj)) {
          setReferenceDateForBudgetItems(format(dateObj, 'yyyy-MM'));
        } else {
          setReferenceDateForBudgetItems(format(new Date(), 'yyyy-MM')); // Default to current month if first tx date is invalid
        }

        const allPositive = selectedTransactions.every(tx => tx.amount >= 0);
        const allNegative = selectedTransactions.every(tx => tx.amount < 0);

        if (allPositive) setIsIncomeBatch(true);
        else if (allNegative) setIsIncomeBatch(false);
        else setIsIncomeBatch(null); // Mixed signs

      } else {
        setReferenceDateForBudgetItems(format(new Date(), 'yyyy-MM')); // Default if no transactions found (should not happen)
        setIsIncomeBatch(null);
      }
    }
  }, [isOpen, transactionIds, allStoreTransactions, form]);


  const budgetItemsForSelectedMonth = useMemo(() => {
    if (!referenceDateForBudgetItems) return [];
    try {
        return allBudgetItems.filter(item => 
            item.period === referenceDateForBudgetItems &&
            (isIncomeBatch === true ? item.category === 'income' : isIncomeBatch === false ? item.category !== 'income' : true) && // If mixed, show all
            item.description && item.description.trim() !== '' 
        );
    } catch(e) {
        return [];
    }
  }, [referenceDateForBudgetItems, allBudgetItems, isIncomeBatch]);

  const onSubmit = (data: BatchUpdateTransactionFormData) => {
    try {
      const updatesToApply: Partial<SharedTransactionFormData> = {};
      
      if (data.modeOfPayment !== LEAVE_UNCHANGED_VALUE) updatesToApply.modeOfPayment = data.modeOfPayment;
      if (data.frequency !== LEAVE_UNCHANGED_VALUE) updatesToApply.frequency = data.frequency;
      if (data.variability !== LEAVE_UNCHANGED_VALUE) updatesToApply.variability = data.variability;
      
      if (data.categoryName !== LEAVE_UNCHANGED_VALUE) {
        updatesToApply.categoryName = data.categoryName === NONE_CATEGORY_VALUE ? null : data.categoryName;
      }
      if (data.incomeCategory !== LEAVE_UNCHANGED_VALUE) {
        updatesToApply.incomeCategory = data.incomeCategory === NONE_CATEGORY_VALUE ? null : data.incomeCategory;
      }

      if (Object.keys(updatesToApply).length === 0) {
        toast({ title: 'No Changes', description: 'Please select at least one field to update.', variant: 'default' });
        return;
      }

      const batchUpdates = transactionIds.map(id => ({ id, data: updatesToApply }));
      batchUpdateTransactions(batchUpdates);

      toast({ title: 'Batch Update Successful', description: `${transactionIds.length} transaction(s) updated.` });
      if(onComplete) onComplete(); 
      onClose();
    } catch (error) {
      toast({ title: 'Error Updating', description: 'Could not update transactions.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Batch Update Transactions</DialogTitle>
          <DialogDescription>
            Update fields for {transactionIds.length} selected transaction(s). Only fields with new values will be updated.
            {isIncomeBatch === null && <p className="text-xs text-yellow-600 mt-1">Warning: Selected transactions have mixed signs (income/expense). Budget category linking might be less precise.</p>}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2 pb-4">
            <FormField
              control={form.control}
              name="modeOfPayment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode of Payment</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || LEAVE_UNCHANGED_VALUE}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={LEAVE_UNCHANGED_VALUE}>Leave unchanged</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank</SelectItem>
                      <SelectItem value="Mpesa">Mpesa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || LEAVE_UNCHANGED_VALUE}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value={LEAVE_UNCHANGED_VALUE}>Leave unchanged</SelectItem>
                       <SelectItem value={NONE_CATEGORY_VALUE}>None (Clear Category)</SelectItem>
                       {budgetItemsForSelectedMonth.length > 0 ? (
                        budgetItemsForSelectedMonth.map(item => (
                          item.description && item.description.trim() !== '' && ( // Ensure description is not empty
                            <SelectItem key={item.id} value={item.description}>
                              {item.description} ({item.category === 'income' ? 'Income' : 'Expense/Goal/Debt'})
                            </SelectItem>
                          )
                        ))
                      ) : (
                        <SelectItem value={NO_ITEMS_PLACEHOLDER_VALUE} disabled>
                            No {isIncomeBatch === true ? "income" : isIncomeBatch === false ? "expense/goal/debt" : ""} budget items for transaction month(s)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isIncomeBatch !== false && (
              <FormField
                control={form.control}
                name="incomeCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Income Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || LEAVE_UNCHANGED_VALUE}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Leave unchanged" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={LEAVE_UNCHANGED_VALUE}>Leave unchanged</SelectItem>
                        <SelectItem value={NONE_CATEGORY_VALUE}>None (Clear Type)</SelectItem>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || LEAVE_UNCHANGED_VALUE}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={LEAVE_UNCHANGED_VALUE}>Leave unchanged</SelectItem>
                      <SelectItem value="recurring">Recurring</SelectItem>
                      <SelectItem value="one-time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="variability"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Variability</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || LEAVE_UNCHANGED_VALUE}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={LEAVE_UNCHANGED_VALUE}>Leave unchanged</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="variable">Variable</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={() => { form.reset(); onClose();}}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting || transactionIds.length === 0}>
                {form.formState.isSubmitting ? "Updating..." : "Update Selected"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BatchUpdateTransactionDialog;
