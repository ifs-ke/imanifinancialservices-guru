
// src/app/(dashboard)/transactions/EditTransactionDialog.tsx
'use client';

import React, { useState, useEffect, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useTransactionsStore } from '@/store/transactionsStore'; // Import Zustand store hook
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types';

interface EditTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionWithId; // Must have a transaction to edit
}

// Helper to format Date to YYYY-MM-DD for input[type=date]
const formatDateForInput = (date: Date | string): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const EditTransactionDialog: React.FC<EditTransactionDialogProps> = ({
  isOpen,
  onClose,
  transaction,
}) => {
  const { updateTransaction } = useTransactionsStore();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    date: '',
    description: '',
    amount: '',
    modeOfPayment: '' as ModeOfPayment | '',
    frequency: '' as TransactionFrequency | '',
    variability: '' as TransactionVariability | '',
  });

  // Effect to populate form when the dialog opens or the transaction prop changes
  useEffect(() => {
    if (transaction) {
      setFormData({
        date: formatDateForInput(transaction.date),
        description: transaction.description,
        amount: transaction.amount.toString(),
        modeOfPayment: transaction.modeOfPayment,
        frequency: transaction.frequency || '',
        variability: transaction.variability || '',
      });
    }
  }, [transaction, isOpen]); // Depend on transaction and isOpen

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
     setFormData(prev => ({ ...prev, [name]: value }));
   };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const { date, description, amount, modeOfPayment, frequency, variability } = formData;
    if (!date || !description || !amount || !modeOfPayment) {
      toast({ title: 'Missing Information', description: 'Please fill out required fields (Date, Desc, Amount, Mode).', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid number.', variant: 'destructive' });
      return;
    }

    try {
      updateTransaction({
        ...transaction, // Keep the original ID
        date: new Date(date + 'T00:00:00'),
        description,
        amount: parsedAmount,
        modeOfPayment: modeOfPayment as ModeOfPayment,
        frequency: frequency || undefined,
        variability: variability || undefined,
      });
      toast({ title: 'Transaction Updated', description: 'Successfully updated.' });
      onClose(); // Close the dialog on success
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast({ title: 'Error Updating', description: 'Could not update the transaction.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>Update the details below.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          {/* Input Fields (same as Add dialog, pre-populated) */}
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="edit-date" className="text-right">Date</Label>
             <Input id="edit-date" name="date" type="date" value={formData.date} onChange={handleInputChange} className="col-span-3" required />
           </div>
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="edit-description" className="text-right">Description</Label>
             <Input id="edit-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" required />
           </div>
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="edit-amount" className="text-right">Amount (KES)</Label>
             <Input id="edit-amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleInputChange} className="col-span-3" required />
           </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-modeOfPayment" className="text-right">Payment Mode</Label>
            <Select name="modeOfPayment" value={formData.modeOfPayment} onValueChange={(value) => handleSelectChange('modeOfPayment', value)} required>
              <SelectTrigger id="edit-modeOfPayment" className="col-span-3">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank">Bank</SelectItem>
                <SelectItem value="Mpesa">Mpesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Categorization Selects */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-frequency" className="text-right">Frequency</Label>
             <Select name="frequency" value={formData.frequency} onValueChange={(value) => handleSelectChange('frequency', value)}>
              <SelectTrigger id="edit-frequency" className="col-span-3">
                <SelectValue placeholder="Optional: Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="one-time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="edit-variability" className="text-right">Variability</Label>
             <Select name="variability" value={formData.variability} onValueChange={(value) => handleSelectChange('variability', value)}>
              <SelectTrigger id="edit-variability" className="col-span-3">
                <SelectValue placeholder="Optional: Select variability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="variable">Variable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
             {/* Use DialogClose for cancellation */}
             <DialogClose asChild>
                 <Button type="button" variant="outline">Cancel</Button>
             </DialogClose>
            <Button type="submit">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTransactionDialog;

