
// src/components/debt/DebtFormSheet.tsx
import React, { useState, useEffect, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from '@/hooks/use-toast';
import { useDebt } from '@/contexts/DebtContext';
import type { DebtItem } from '@/lib/types';

interface DebtFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  debt: DebtItem | null; // Null for Add, object for Edit
}

// Initial form data structure including term
const initialFormData: Omit<DebtItem, 'id'> = {
    description: '',
    principal: 0,
    interestRate: 0,
    minPayment: 0,
    term: 'long' // Default to long term
};

const DebtFormSheet: React.FC<DebtFormSheetProps> = ({ isOpen, onClose, debt }) => {
  const { addDebt, updateDebt } = useDebt();
  const { toast } = useToast();
  const [formData, setFormData] = useState<Omit<DebtItem, 'id'>>(initialFormData);

  // Effect to populate form when editing
  useEffect(() => {
    if (debt) {
      setFormData({
        description: debt.description,
        principal: debt.principal,
        interestRate: debt.interestRate,
        minPayment: debt.minPayment,
        term: debt.term,
      });
    } else {
      setFormData(initialFormData); // Reset form for adding
    }
  }, [debt, isOpen]); // Re-populate when debt or isOpen changes

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

   const handleSelectChange = (value: 'long' | 'short') => {
     setFormData(prev => ({ ...prev, term: value }));
   };

   const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const { description, principal, interestRate, minPayment, term } = formData;

    if (!description || principal < 0 || interestRate < 0 || minPayment < 0 || !term) {
      toast({ title: 'Invalid Input', description: 'Please fill out all fields with valid values.', variant: 'destructive' });
      return;
    }

    try {
        if (debt) {
            // Update existing debt
            updateDebt({ ...debt, ...formData });
            toast({ title: 'Debt Updated', description: 'Successfully updated debt item.' });
        } else {
            // Add new debt
            addDebt(formData);
            toast({ title: 'Debt Added', description: 'Successfully added new debt item.' });
        }
        onClose(); // Close the sheet on success
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
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-description" className="text-right">Description</Label>
                <Input id="form-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Car Loan" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-principal" className="text-right">Principal (KES)</Label>
                <Input id="form-principal" name="principal" type="number" step="0.01" min="0" value={formData.principal} onChange={handleInputChange} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-interestRate" className="text-right">Interest Rate (%)</Label>
                <Input id="form-interestRate" name="interestRate" type="number" step="0.01" min="0" value={formData.interestRate} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 12.5" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-minPayment" className="text-right">Min Payment (KES)</Label>
                <Input id="form-minPayment" name="minPayment" type="number" step="0.01" min="0" value={formData.minPayment} onChange={handleInputChange} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="form-term" className="text-right">Term</Label>
                <Select name="term" value={formData.term} onValueChange={handleSelectChange} required>
                    <SelectTrigger id="form-term" className="col-span-3">
                    <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="short">Short Term</SelectItem>
                    <SelectItem value="long">Long Term</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          <SheetFooter className="mt-4"> {/* Added margin top */}
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{debt ? 'Save Changes' : 'Add Debt'}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default DebtFormSheet;
