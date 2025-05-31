// src/app/(dashboard)/investments/InvestmentFormSheet.tsx
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { useToast } from '@/hooks/use-toast';
import { useInvestmentStore } from '@/store/investmentStore';
import type { InvestmentItem, InvestmentFormData } from '@/lib/types';
import { InvestmentFormDataSchema } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, parse, isValid as isDateValid } from 'date-fns';

const formatDateForInput = (date: Date | string | undefined | null): string => {
    if (date instanceof Date) {
        return isDateValid(date) ? format(date, 'yyyy-MM-dd') : '';
    }
    if (typeof date === 'string') {
        const parsedDate = new Date(date); // Try parsing directly
        if (isDateValid(parsedDate)) return format(parsedDate, 'yyyy-MM-dd');
        const parsedFromFormat = parse(date, 'yyyy-MM-dd', new Date()); // Try parsing specific format
        if (isDateValid(parsedFromFormat)) return format(parsedFromFormat, 'yyyy-MM-dd');
    }
    return ''; // Default to empty if invalid or undefined
};

interface InvestmentFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  item: InvestmentItem | null;
}

const InvestmentFormSheet: React.FC<InvestmentFormSheetProps> = ({ isOpen, onClose, item }) => {
  const { addInvestmentItem, updateInvestmentItem } = useInvestmentStore();
  const { toast } = useToast();

  const form = useForm<InvestmentFormData>({
    resolver: zodResolver(InvestmentFormDataSchema),
    defaultValues: {
      name: '',
      type: '',
      purchaseDate: formatDateForInput(new Date()),
      quantity: 0,
      purchasePrice: 0,
      currentValue: 0,
      currency: 'KES',
      notes: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (item) {
        form.reset({
          name: item.name,
          type: item.type,
          purchaseDate: formatDateForInput(item.purchaseDate),
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          currentValue: item.currentValue,
          currency: item.currency,
          notes: item.notes || '',
        });
      } else {
        form.reset({
          name: '',
          type: '',
          purchaseDate: formatDateForInput(new Date()),
          quantity: 0,
          purchasePrice: 0,
          currentValue: 0,
          currency: 'KES',
          notes: '',
        });
      }
    }
  }, [item, isOpen, form]);

  const onSubmit = (data: InvestmentFormData) => {
    try {
      const purchaseDate = parse(data.purchaseDate, 'yyyy-MM-dd', new Date());
      if (!isDateValid(purchaseDate)) {
          toast({ title: 'Invalid Date', description: 'Please provide a valid purchase date.', variant: 'destructive'});
          form.setError('purchaseDate', { type: 'manual', message: 'Invalid purchase date'});
          return;
      }

      const investmentData = { ...data, purchaseDate };

      if (item) {
        updateInvestmentItem({ ...item, ...investmentData });
        toast({ title: 'Investment Updated', description: 'Successfully updated investment.' });
      } else {
        addInvestmentItem(investmentData);
        toast({ title: 'Investment Added', description: 'Successfully added new investment.' });
      }
      onClose();
    } catch (error) {
      console.error("Error saving investment:", error);
      toast({ title: 'Error Saving Investment', description: 'Could not save the investment. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{item ? 'Edit Investment' : 'Add New Investment'}</SheetTitle>
          <SheetDescription>
            {item ? 'Update the details for this investment.' : 'Enter the details for the new investment.'}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g., Safaricom Shares" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem><FormLabel>Type</FormLabel><FormControl><Input placeholder="e.g., Stock, Bond, Real Estate" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="purchaseDate" render={({ field }) => (
                <FormItem><FormLabel>Purchase Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="quantity" render={({ field }) => (
                    <FormItem><FormLabel>Quantity</FormLabel><FormControl><Input type="number" step="any" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                    <FormItem><FormLabel>Purchase Price (per unit)</FormLabel><FormControl><Input type="number" step="any" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="currentValue" render={({ field }) => (
                    <FormItem><FormLabel>Total Current Value</FormLabel><FormControl><Input type="number" step="any" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="currency" render={({ field }) => (
                    <FormItem><FormLabel>Currency</FormLabel><FormControl><Input placeholder="e.g., KES" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Any additional notes..." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )}/>
            <SheetFooter className="mt-4">
              <SheetClose asChild><Button type="button" variant="outline" onClick={() => form.reset()}>Cancel</Button></SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : (item ? 'Save Changes' : 'Add Investment')}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};

export default InvestmentFormSheet;
