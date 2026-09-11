// src/components/debt/DebtFormPopover.tsx
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { useDebtStore } from '@/store/debtStore';
import type { DebtItem } from '@/lib/types';
import { DebtItemFormDataSchema, type DebtItemFormData } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface DebtFormPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtItem | null;
  trigger?: React.ReactNode;
}

export default function DebtFormPopover({ isOpen, onClose, debt, trigger }: DebtFormPopoverProps) {
  const { addDebt, updateDebt } = useDebtStore();
  const { toast } = useToast();

  const form = useForm<DebtItemFormData>({
    resolver: zodResolver(DebtItemFormDataSchema),
    defaultValues: {
      description: '',
      principal: 0,
      interestRate: 0,
      minPayment: 0,
      term: 'long',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (debt) {
        form.reset({
          description: debt.description,
          principal: debt.principal,
          interestRate: debt.interestRate,
          minPayment: debt.minPayment,
          term: debt.term,
        });
      } else {
        form.reset({
          description: '',
          principal: 0,
          interestRate: 0,
          minPayment: 0,
          term: 'long',
        });
      }
    }
  }, [debt, isOpen, form]);

  const onSubmit = (data: DebtItemFormData) => {
    try {
      if (debt) {
        updateDebt({ ...debt, ...data });
        toast({ title: 'Debt Updated', description: 'Successfully updated debt item.' });
      } else {
        addDebt(data);
        toast({ title: 'Debt Added', description: 'Successfully added new debt item.' });
      }
      onClose();
    } catch (error) {
      console.error("Error saving debt:", error);
      toast({ title: 'Error Saving Debt', description: 'Could not save the debt item. Please try again.', variant: 'destructive' });
    }
  };

  const renderFormFields = () => (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold text-xs text-foreground tracking-tight">
          {debt ? 'Edit Debt Item' : 'Add New Debt Item'}
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {debt ? 'Update the details below.' : 'Enter the details of the debt below.'}
        </p>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-[11px] font-semibold text-foreground">Description</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Car Loan" className="h-8 text-xs px-2.5 rounded-lg" {...field} />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="principal"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Principal (KES)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      className="h-8 text-xs px-2.5 rounded-lg font-mono"
                      {...field} 
                      onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interestRate"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Interest Rate (%)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      placeholder="e.g., 12.5" 
                      className="h-8 text-xs px-2.5 rounded-lg font-mono"
                      {...field} 
                      onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="minPayment"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Min Payment (KES)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      className="h-8 text-xs px-2.5 rounded-lg font-mono"
                      {...field} 
                      onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="term"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Term</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 text-xs px-2.5 rounded-lg">
                        <SelectValue placeholder="Select term" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="short" className="text-xs">Short Term</SelectItem>
                      <SelectItem value="long" className="text-xs">Long Term</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <Button type="button" variant="ghost" size="xs" onClick={onClose} className="h-8 text-xs px-3 rounded-lg">
              Cancel
            </Button>
            <Button type="submit" size="xs" disabled={form.formState.isSubmitting} className="h-8 text-xs px-3 rounded-lg">
              {form.formState.isSubmitting ? "Saving..." : (debt ? 'Save Changes' : 'Add Debt')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );

  if (debt) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="w-[90%] sm:max-w-[400px] p-4 rounded-xl border border-border/60 bg-background shadow-lg z-50">
          <DialogTitle className="sr-only">Edit Debt Details</DialogTitle>
          {renderFormFields()}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent align="end" className="w-[320px] md:w-[360px] p-4 shadow-lg border border-border/60 bg-popover rounded-xl z-50">
        {renderFormFields()}
      </PopoverContent>
    </Popover>
  );
}
