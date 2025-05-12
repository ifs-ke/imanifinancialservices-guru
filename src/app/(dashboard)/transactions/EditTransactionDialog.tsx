// src/app/(dashboard)/transactions/EditTransactionDialog.tsx
'use client';

import React, { useEffect } from 'react';
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
import type { TransactionWithId } from '@/lib/types';
import { TransactionFormValidationSchema, type TransactionFormData } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";


interface EditTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionWithId;
}

const formatDateForInput = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }
    return dateObj.toISOString().split('T')[0];
};

const EditTransactionDialog: React.FC<EditTransactionDialogProps> = ({
  isOpen,
  onClose,
  transaction,
}) => {
  const { updateTransaction } = useTransactionsStore();
  const { toast } = useToast();

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(TransactionFormValidationSchema),
    defaultValues: {
      date: '',
      description: '',
      amount: 0,
      modeOfPayment: 'Bank',
      frequency: undefined,
      variability: undefined,
    },
  });

  useEffect(() => {
    if (transaction && isOpen) {
      form.reset({
        date: formatDateForInput(transaction.date),
        description: transaction.description,
        amount: transaction.amount,
        modeOfPayment: transaction.modeOfPayment,
        frequency: transaction.frequency || undefined,
        variability: transaction.variability || undefined,
      });
    }
  }, [transaction, isOpen, form]);

  const onSubmit = (data: TransactionFormData) => {
    try {
      updateTransaction({
        ...transaction,
        date: new Date(data.date + 'T00:00:00'),
        description: data.description,
        amount: data.amount,
        modeOfPayment: data.modeOfPayment,
        frequency: data.frequency,
        variability: data.variability,
      });
      toast({ title: 'Transaction Updated', description: 'Successfully updated.' });
      onClose();
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast({ title: 'Error Updating', description: 'Could not update the transaction.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
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
              name="frequency"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right col-span-1">Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}> {/* Handle undefined value */}
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
                  <Select onValueChange={field.onChange} value={field.value || ''}> {/* Handle undefined value */}
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
                <Button type="button" variant="outline" onClick={() => form.reset()}>Cancel</Button>
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
