// src/components/investments/InvestmentFormPopover.tsx
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { useInvestmentStore } from '@/store/investmentStore';
import type { InvestmentItem } from '@/lib/types';
import { InvestmentFormDataSchema, type InvestmentFormData } from '@/lib/schemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, parse, isValid as isDateValid } from 'date-fns';

export const ASSET_CLASSES = [
  'Equities / Stocks',
  'Fixed Income / Bonds',
  'Real Estate',
  'Mutual Funds / ETFs',
  'Crypto',
  'Cash / Cash Equivalents',
  'Alternatives'
] as const;

const formatDateForInput = (date: Date | string | undefined | null): string => {
    if (date instanceof Date) {
        return isDateValid(date) ? format(date, 'yyyy-MM-dd') : '';
    }
    if (typeof date === 'string') {
        const parsedDate = new Date(date);
        if (isDateValid(parsedDate)) return format(parsedDate, 'yyyy-MM-dd');
        const parsedFromFormat = parse(date, 'yyyy-MM-dd', new Date());
        if (isDateValid(parsedFromFormat)) return format(parsedFromFormat, 'yyyy-MM-dd');
    }
    return '';
};

interface InvestmentFormPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  item: InvestmentItem | null;
  trigger?: React.ReactNode;
}

export default function InvestmentFormPopover({ isOpen, onClose, item, trigger }: InvestmentFormPopoverProps) {
  const { addInvestmentItem, updateInvestmentItem } = useInvestmentStore();
  const { toast } = useToast();

  const form = useForm<InvestmentFormData>({
    resolver: zodResolver(InvestmentFormDataSchema),
    defaultValues: {
      name: '',
      type: 'Equities / Stocks',
      purchaseDate: formatDateForInput(new Date()),
      quantity: 1,
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
          type: 'Equities / Stocks',
          purchaseDate: formatDateForInput(new Date()),
          quantity: 1,
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
        toast({ title: 'Invalid Date', description: 'Please provide a valid purchase date.', variant: 'destructive' });
        form.setError('purchaseDate', { type: 'manual', message: 'Invalid purchase date' });
        return;
      }

      const investmentData = { ...data, purchaseDate };

      if (item) {
        updateInvestmentItem({ ...item, ...investmentData });
        toast({ title: 'Investment Updated', description: `Successfully updated "${data.name}".` });
      } else {
        addInvestmentItem(investmentData);
        toast({ title: 'Investment Added', description: `Successfully added "${data.name}".` });
      }
      onClose();
    } catch (error) {
      console.error("Error saving investment:", error);
      toast({ title: 'Error Saving Investment', description: 'Could not save the investment item. Please try again.', variant: 'destructive' });
    }
  };

  const renderFormFields = () => (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold text-xs text-foreground tracking-tight">
          {item ? 'Edit Investment' : 'Add New Investment'}
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {item ? 'Modify investment position details.' : 'Log a new asset position in your portfolio.'}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Asset Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Safaricom PLC" className="h-8 text-xs px-2.5 rounded-lg" {...field} />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Asset Class</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 text-xs px-2.5 rounded-lg">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ASSET_CLASSES.map((cls) => (
                        <SelectItem key={cls} value={cls} className="text-xs">
                          {cls}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Purchase Date</FormLabel>
                  <FormControl>
                    <Input type="date" className="h-8 text-xs px-2.5 rounded-lg font-mono" {...field} />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Currency</FormLabel>
                  <FormControl>
                    <Input placeholder="KES" className="h-8 text-xs px-2.5 rounded-lg font-mono uppercase" {...field} />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Quantity</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="any"
                      min="0.00000001"
                      className="h-8 text-xs px-2 rounded-lg font-mono" 
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
              name="purchasePrice"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Price/Unit</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="any"
                      min="0.01"
                      className="h-8 text-xs px-2 rounded-lg font-mono" 
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
              name="currentValue"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-[11px] font-semibold text-foreground">Total Value</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="any"
                      min="0"
                      className="h-8 text-xs px-2 rounded-lg font-mono font-semibold" 
                      {...field} 
                      onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="text-[10px]" />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-[11px] font-semibold text-foreground">Notes (Optional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Portfolio allocation thoughts..." className="min-h-[50px] max-h-[80px] text-xs px-2.5 py-1.5 rounded-lg resize-none" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )}
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <Button type="button" variant="ghost" size="xs" onClick={onClose} className="h-8 text-xs px-3 rounded-lg">
              Cancel
            </Button>
            <Button type="submit" size="xs" disabled={form.formState.isSubmitting} className="h-8 text-xs px-3 rounded-lg">
              {form.formState.isSubmitting ? "Saving..." : (item ? 'Save Changes' : 'Add Asset')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );

  if (item) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="w-[90%] sm:max-w-[420px] p-4 rounded-xl border border-border/60 bg-background shadow-lg z-50">
          <DialogTitle className="sr-only">Edit Asset Details</DialogTitle>
          {renderFormFields()}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent align="end" className="w-[320px] md:w-[380px] p-4 shadow-lg border border-border/60 bg-popover rounded-xl z-50">
        {renderFormFields()}
      </PopoverContent>
    </Popover>
  );
}
