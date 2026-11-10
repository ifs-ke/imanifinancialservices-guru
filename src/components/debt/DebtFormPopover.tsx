// src/components/debt/DebtFormPopover.tsx
'use client';

import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { useDebtStore } from '@/store/debtStore';
import type { DebtItem } from '@/lib/types';
import { DebtItemFormDataSchema, type DebtItemFormData } from '@/lib/schemas';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { formatCurrency } from '@/lib/utils';
import { calculateMonthlyInterest } from '@/lib/debtUtils';
import { AlertCircle } from 'lucide-react';

interface DebtFormPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtItem | null;
  trigger?: React.ReactNode;
}

export default function DebtFormPopover({ isOpen, onClose, debt, trigger }: DebtFormPopoverProps) {
  const { addDebt, updateDebt } = useDebtStore();
  const { toast } = useToast();

  const getTodayDateString = () => new Date().toISOString().split('T')[0];

  const form = useForm<DebtItemFormData>({
    resolver: zodResolver(DebtItemFormDataSchema),
    defaultValues: {
      date: getTodayDateString(),
      dueDate: '',
      description: '',
      classification: 'personal',
      principal: 0,
      interestRate: 0,
      minPayment: 0,
      term: 'short',
      status: 'active',
      securityType: 'unsecured',
      securityDescription: '',
      notes: '',
    },
  });

  const watchedValues = form.watch();

  useEffect(() => {
    if (isOpen) {
      if (debt) {
        form.reset({
          date: debt.date || getTodayDateString(),
          dueDate: debt.dueDate || '',
          description: debt.description,
          classification: debt.classification || 'personal',
          principal: debt.principal,
          interestRate: debt.interestRate !== undefined && debt.interestRate !== null ? debt.interestRate : 0,
          minPayment: debt.minPayment,
          term: debt.term,
          status: debt.status || 'active',
          securityType: debt.securityType || 'unsecured',
          securityDescription: debt.securityDescription || '',
          notes: debt.notes || '',
        });
      } else {
        form.reset({
          date: getTodayDateString(),
          dueDate: '',
          description: '',
          classification: 'personal',
          principal: 0,
          interestRate: 0,
          minPayment: 0,
          term: 'short',
          status: 'active',
          securityType: 'unsecured',
          securityDescription: '',
          notes: '',
        });
      }
    }
  }, [debt, isOpen, form]);

  const monthlyInterest = useMemo(() => {
    const p = Number(watchedValues.principal) || 0;
    const r = Number(watchedValues.interestRate) || 0;
    return calculateMonthlyInterest(p, r);
  }, [watchedValues.principal, watchedValues.interestRate]);

  const isUnderpayingInterest = useMemo(() => {
    const minPay = Number(watchedValues.minPayment) || 0;
    return monthlyInterest > 0 && minPay > 0 && minPay <= monthlyInterest;
  }, [monthlyInterest, watchedValues.minPayment]);

  const onSubmit = (data: DebtItemFormData) => {
    try {
      const sanitizedData = {
        ...data,
        securityType: data.securityType || 'unsecured',
        securityDescription: data.securityType === 'secured' && data.securityDescription && data.securityDescription.trim() !== ''
          ? data.securityDescription.trim()
          : null,
        dueDate: data.dueDate && data.dueDate.trim() !== '' ? data.dueDate.trim() : null,
        interestRate: data.interestRate !== undefined && data.interestRate !== null && !isNaN(data.interestRate) ? data.interestRate : 0,
        notes: data.notes && data.notes.trim() !== '' ? data.notes.trim() : null,
      };

      if (debt) {
        updateDebt({ ...debt, ...sanitizedData });
        toast({ 
          title: 'Debt Updated', 
          description: `"${data.description}" has been updated.` 
        });
      } else {
        addDebt(sanitizedData);
        toast({ 
          title: 'Debt Added', 
          description: `"${data.description}" has been added to your portfolio.` 
        });
      }
      onClose();
    } catch (error) {
      console.error("Error saving debt:", error);
      toast({ 
        title: 'Error Saving Debt', 
        description: 'Could not save the debt entry. Please check your inputs.', 
        variant: 'destructive' 
      });
    }
  };

  const renderFormContent = () => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel className="text-xs font-medium text-foreground">
                Description / Lender <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g. NCBA Bank Loan, Brother Kevin" 
                  className="h-9 text-xs" 
                  {...field} 
                />
              </FormControl>
              <FormMessage className="text-[11px]" />
            </FormItem>
          )}
        />

        {/* Classification & Term */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="classification"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs font-medium text-foreground">Classification</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Classification" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="personal" className="text-xs">Personal (Friends / Family)</SelectItem>
                    <SelectItem value="institutional" className="text-xs">Institutional (Bank / SACCO)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="term"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs font-medium text-foreground">Term</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Term" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="short" className="text-xs">Short Term (&le; 1 Year)</SelectItem>
                    <SelectItem value="long" className="text-xs">Long Term (&gt; 1 Year)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />
        </div>

        {/* Secured vs Unsecured Structure & Dynamic Security Description */}
        <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <FormField
              control={form.control}
              name="securityType"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs font-medium text-foreground">Security Structure</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || 'unsecured'}>
                    <FormControl>
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue placeholder="Select loan security" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="unsecured" className="text-xs">Unsecured (Clean / Signature Loan)</SelectItem>
                      <SelectItem value="secured" className="text-xs">Secured (Collateral / Asset Backed)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-[10px] text-muted-foreground">
                    Whether this obligation is pledged against collateral.
                  </FormDescription>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            {watchedValues.securityType === 'secured' && (
              <FormField
                control={form.control}
                name="securityDescription"
                render={({ field }) => (
                  <FormItem className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <FormLabel className="text-xs font-medium text-foreground">
                      Security Description / Collateral <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g. Logbook KCA 123X, Title Deed 45/67, Guarantor Pledge"
                        className="h-9 text-xs bg-background"
                        value={field.value || ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription className="text-[10px] text-muted-foreground">
                      Pledged asset or lien details.
                    </FormDescription>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />
            )}
          </div>
        </div>

        {/* Principal & Interest */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="principal"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs font-medium text-foreground">
                  Principal Balance (KES) <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    placeholder="0.00"
                    className="h-9 text-xs font-mono"
                    value={field.value === 0 && !debt ? '' : field.value} 
                    onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  />
                </FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="interestRate"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs font-medium text-foreground">Interest Rate (%)</FormLabel>
                  <span className="text-[10px] text-muted-foreground">0 for interest-free</span>
                </div>
                <FormControl>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    placeholder="0.00" 
                    className="h-9 text-xs font-mono"
                    value={field.value === undefined || field.value === null ? '' : field.value} 
                    onChange={e => {
                      const val = e.target.value;
                      field.onChange(val === '' ? 0 : parseFloat(val));
                    }}
                  />
                </FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />
        </div>

        {/* Min Monthly Payment & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="minPayment"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs font-medium text-foreground">
                  Min. Monthly Payment (KES) <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    placeholder="0.00"
                    className="h-9 text-xs font-mono"
                    value={field.value === 0 && !debt ? '' : field.value} 
                    onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  />
                </FormControl>
                {isUnderpayingInterest && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Payment is below monthly interest ({formatCurrency(monthlyInterest)})
                  </p>
                )}
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs font-medium text-foreground">Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="active" className="text-xs">Active</SelectItem>
                    <SelectItem value="in_grace" className="text-xs">In Grace Period</SelectItem>
                    <SelectItem value="overdue" className="text-xs">Overdue</SelectItem>
                    <SelectItem value="paid_off" className="text-xs">Paid Off</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />
        </div>

        {/* Origination Date & Due Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs font-medium text-foreground">
                  Origination Date <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input 
                    type="date" 
                    className="h-9 text-xs font-mono" 
                    {...field} 
                  />
                </FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs font-medium text-foreground">Due Date</FormLabel>
                  <span className="text-[10px] text-muted-foreground">Optional</span>
                </div>
                <FormControl>
                  <Input 
                    type="date" 
                    className="h-9 text-xs font-mono" 
                    value={field.value || ''} 
                    onChange={e => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )}
          />
        </div>

        {/* Notes (Optional) */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center justify-between">
                <FormLabel className="text-xs font-medium text-foreground">Notes</FormLabel>
                <span className="text-[10px] text-muted-foreground">Optional</span>
              </div>
              <FormControl>
                <Textarea 
                  placeholder="Collateral, payment details, or special terms..." 
                  className="min-h-[60px] text-xs resize-none" 
                  value={field.value || ''}
                  onChange={e => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage className="text-[11px]" />
            </FormItem>
          )}
        />

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={onClose} 
            className="h-8 text-xs cursor-pointer"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            size="sm" 
            disabled={form.formState.isSubmitting} 
            className="h-8 text-xs cursor-pointer font-medium"
          >
            {form.formState.isSubmitting ? "Saving..." : (debt ? 'Save Changes' : 'Add Debt')}
          </Button>
        </div>
      </form>
    </Form>
  );

  if (debt) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Edit Debt Instrument</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Update balance, interest rate, repayment terms, or dates.
            </DialogDescription>
          </DialogHeader>
          {renderFormContent()}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent align="end" className="w-[340px] sm:w-[440px] p-4 shadow-lg border border-border bg-popover rounded-xl z-50">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Add New Debt</h4>
            <p className="text-xs text-muted-foreground">Enter liability details and repayment terms.</p>
          </div>
          {renderFormContent()}
        </div>
      </PopoverContent>
    </Popover>
  );
}
