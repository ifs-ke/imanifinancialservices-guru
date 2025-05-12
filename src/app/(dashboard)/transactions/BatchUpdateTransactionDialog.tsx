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
import { useBudgetStore } from '@/store/budgetStore';
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability, BudgetItem } from '@/lib/types';
import { BatchUpdateTransactionFormDataSchema, type BatchUpdateTransactionFormData } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, parse, isValid } from 'date-fns';

const NONE_CATEGORY_VALUE = "__NONE_CATEGORY__";
const NO_ITEMS_PLACEHOLDER_VALUE = "__NO_BUDGET_ITEMS_PLACEHOLDER__";

interface BatchUpdateTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transactionIds: string[];
  allBudgetItems: BudgetItem[]; 
}

const BatchUpdateTransactionDialog: React.FC<BatchUpdateTransactionDialogProps> = ({
  isOpen,
  onClose,
  transactionIds,
  allBudgetItems,
}) => {
  const { batchUpdateTransactions } = useTransactionsStore();
  const { toast } = useToast();

  const form = useForm<BatchUpdateTransactionFormData>({
    resolver: zodResolver(BatchUpdateTransactionFormDataSchema),
    defaultValues: {
      modeOfPayment: undefined,
      frequency: undefined,
      variability: undefined,
      categoryName: undefined,
    },
  });

  const [referenceDateForBudgetItems, setReferenceDateForBudgetItems] = useState<string | null>(null);
  
  // Get the first selected transaction to use its date for populating budget items
  const firstSelectedTransaction = useTransactionsStore(state => 
    state.transactions.find(tx => transactionIds.includes(tx.id))
  );

  useEffect(() => {
    if (firstSelectedTransaction?.date) {
        const dateObj = firstSelectedTransaction.date instanceof Date ? firstSelectedTransaction.date : new Date(firstSelectedTransaction.date);
        if (isValid(dateObj)) {
          setReferenceDateForBudgetItems(format(dateObj, 'yyyy-MM'));
        } else {
          setReferenceDateForBudgetItems(null);
        }
    } else {
        setReferenceDateForBudgetItems(null);
    }
  }, [firstSelectedTransaction, isOpen]);


  const budgetItemsForSelectedMonth = useMemo(() => {
    if (!referenceDateForBudgetItems) return [];
    try {
        // referenceDateForBudgetItems is already in 'yyyy-MM' format
        return allBudgetItems.filter(item => item.period === referenceDateForBudgetItems && item.category !== 'income');
    } catch(e) {
        return [];
    }
  }, [referenceDateForBudgetItems, allBudgetItems]);

  const onSubmit = (data: BatchUpdateTransactionFormData) => {
    try {
      const updatesToApply: Partial<TransactionFormData> = {};
      if (data.modeOfPayment) updatesToApply.modeOfPayment = data.modeOfPayment;
      if (data.frequency) updatesToApply.frequency = data.frequency;
      if (data.variability) updatesToApply.variability = data.variability;
      // Handle categoryName: if "None" is selected, explicitly set to null. Otherwise, use the selected value.
      if (data.categoryName !== undefined) { // Check if user interacted with the category field
        updatesToApply.categoryName = data.categoryName === NONE_CATEGORY_VALUE ? null : data.categoryName;
      }


      if (Object.keys(updatesToApply).length === 0) {
        toast({ title: 'No Changes', description: 'Please select at least one field to update.', variant: 'default' });
        return;
      }

      const batchUpdates = transactionIds.map(id => ({ id, data: updatesToApply }));
      batchUpdateTransactions(batchUpdates);

      toast({ title: 'Batch Update Successful', description: `${transactionIds.length} transaction(s) updated.` });
      onClose();
      form.reset(); // Reset form after successful submission
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
                  <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Leave unchanged</SelectItem>
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
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value="">Leave unchanged</SelectItem>
                       <SelectItem value={NONE_CATEGORY_VALUE}>None (Clear Category)</SelectItem>
                       {budgetItemsForSelectedMonth.length > 0 ? (
                        budgetItemsForSelectedMonth.map(item => (
                          <SelectItem key={item.id} value={item.description}>
                            {item.description} ({item.category})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value={NO_ITEMS_PLACEHOLDER_VALUE} disabled>
                            No budget items for transaction month(s)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Leave unchanged</SelectItem>
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
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Leave unchanged" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Leave unchanged</SelectItem>
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
                <Button type="button" variant="outline" onClick={() => form.reset()}>Cancel</Button>
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
