// src/components/debt/DebtFormSheet.tsx
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Label from ui/label is still fine for general layout
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { useToast } from '@/hooks/use-toast';
import { useDebtStore } from '@/store/debtStore';
import type { DebtItem } from '@/lib/types';
import { DebtItemFormDataSchema, type DebtItemFormData } from '@/lib/schemas'; // Changed DebtItemFormValidationSchema to DebtItemFormDataSchema
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";


interface DebtFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtItem | null;
}

const DebtFormSheet: React.FC<DebtFormSheetProps> = ({ isOpen, onClose, debt }) => {
  const { addDebt, updateDebt } = useDebtStore();
  const { toast } = useToast();

  const form = useForm<DebtItemFormData>({
    resolver: zodResolver(DebtItemFormDataSchema), // Changed DebtItemFormValidationSchema to DebtItemFormDataSchema
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

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{debt ? 'Edit Debt Item' : 'Add New Debt Item'}</SheetTitle>
          <SheetDescription>
            {debt ? 'Update the details below.' : 'Enter the details of the debt below.'}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Description</FormLabel>
                  <FormControl className="col-span-3">
                    <Input placeholder="e.g., Car Loan" {...field} />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="principal"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Principal (KES)</FormLabel>
                  <FormControl className="col-span-3">
                    <Input type="number" step="0.01" min="0" {...field} 
                     onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="interestRate"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Interest Rate (%)</FormLabel>
                  <FormControl className="col-span-3">
                    <Input type="number" step="0.01" min="0" placeholder="e.g., 12.5" {...field} 
                     onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="minPayment"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Min Payment (KES)</FormLabel>
                  <FormControl className="col-span-3">
                    <Input type="number" step="0.01" min="0" {...field} 
                     onChange={e => field.onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="term"
              render={({ field }) => (
                <FormItem className="grid grid-cols-4 items-center gap-4">
                  <FormLabel className="text-right">Term</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl className="col-span-3">
                      <SelectTrigger>
                        <SelectValue placeholder="Select term" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="short">Short Term</SelectItem>
                      <SelectItem value="long">Long Term</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="col-span-4 text-right" />
                </FormItem>
              )}
            />
            <SheetFooter className="mt-4">
              <SheetClose asChild>
                <Button type="button" variant="outline" onClick={() => form.reset()}>Cancel</Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : (debt ? 'Save Changes' : 'Add Debt')}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};

export default DebtFormSheet;

