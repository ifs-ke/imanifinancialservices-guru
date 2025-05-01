
// src/app/(dashboard)/debt/page.tsx
'use client';

import React, { useState, type ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Coins } from 'lucide-react'; // Changed icon
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select
import { useDebt } from '@/contexts/DebtContext'; // Import useDebt hook
import type { DebtItem } from '@/lib/types'; // Import DebtItem type

// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES', // Changed to KES
    minimumFractionDigits: 0, // No decimals for KES typically
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercentage = (rate: number) => {
    return `${rate.toFixed(2)}%`;
};

// Initial form data structure including term
const initialFormData: Omit<DebtItem, 'id'> = {
    description: '',
    principal: 0,
    interestRate: 0,
    minPayment: 0,
    term: 'long' // Default to long term
};

export default function DebtPage() {
  const { debts, addDebt, updateDebt, deleteDebt } = useDebt();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtItem | null>(null);
  const [debtToDelete, setDebtToDelete] = useState<DebtItem | null>(null);
  const [formData, setFormData] = useState<Omit<DebtItem, 'id'>>(initialFormData);

  // Reset form data when dialogs close
  useEffect(() => {
    if (!isAddDialogOpen && !isEditDialogOpen) {
      setFormData(initialFormData);
      setEditingDebt(null);
    }
  }, [isAddDialogOpen, isEditDialogOpen]);

  // --- Handlers ---

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

  // CREATE
  const handleAddDebtSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.description || formData.principal < 0 || formData.interestRate < 0 || formData.minPayment < 0 || !formData.term) {
      toast({ title: 'Invalid Input', description: 'Please fill out all fields, including Term, with valid values.', variant: 'destructive' });
      return;
    }
    addDebt(formData);
    setIsAddDialogOpen(false);
    toast({ title: 'Debt Added', description: 'Successfully added new debt item.' });
  };

  // UPDATE
  const handleEditClick = (debt: DebtItem) => {
    setEditingDebt(debt);
    setFormData({
      description: debt.description,
      principal: debt.principal,
      interestRate: debt.interestRate,
      minPayment: debt.minPayment,
      term: debt.term, // Set term for editing
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateDebtSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDebt) return;
     if (!formData.description || formData.principal < 0 || formData.interestRate < 0 || formData.minPayment < 0 || !formData.term) {
      toast({ title: 'Invalid Input', description: 'Please fill out all fields, including Term, with valid values.', variant: 'destructive' });
      return;
    }
    updateDebt({
      ...editingDebt,
      ...formData,
    });
    setIsEditDialogOpen(false);
    toast({ title: 'Debt Updated', description: 'Successfully updated debt item.' });
  };

  // DELETE
  const handleDeleteClick = (debt: DebtItem) => {
    setDebtToDelete(debt);
  };

  const confirmDeleteDebt = () => {
    if (!debtToDelete) return;
    deleteDebt(debtToDelete.id);
    setDebtToDelete(null);
    toast({ title: 'Debt Deleted', description: 'Successfully removed debt item.' });
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary"/> Manage Debts {/* Changed icon */}
          </h1>
          <p className="text-muted-foreground">
            Track your outstanding debts, interest rates, and payments.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Add Debt Dialog */}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Debt
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Debt Item</DialogTitle>
                <DialogDescription>Enter the details of the debt below.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddDebtSubmit} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-description" className="text-right">Description</Label>
                  <Input id="add-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" placeholder="e.g., Car Loan" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-principal" className="text-right">Principal (KES)</Label>
                  <Input id="add-principal" name="principal" type="number" step="0.01" min="0" value={formData.principal} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-interestRate" className="text-right">Interest Rate (%)</Label>
                  <Input id="add-interestRate" name="interestRate" type="number" step="0.01" min="0" value={formData.interestRate} onChange={handleInputChange} className="col-span-3" placeholder="e.g., 12.5" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="add-minPayment" className="text-right">Min Payment (KES)</Label>
                  <Input id="add-minPayment" name="minPayment" type="number" step="0.01" min="0" value={formData.minPayment} onChange={handleInputChange} className="col-span-3" required />
                </div>
                {/* Term Selection */}
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="add-term" className="text-right">Term</Label>
                    <Select name="term" value={formData.term} onValueChange={handleSelectChange} required>
                        <SelectTrigger id="add-term" className="col-span-3">
                        <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                        <SelectContent>
                        <SelectItem value="short">Short Term</SelectItem>
                        <SelectItem value="long">Long Term</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit">Add Debt</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Debt List</CardTitle>
            <CardDescription>Your current outstanding debts.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Term</TableHead> {/* Added Term column */}
                    <TableHead className="text-right">Principal Balance</TableHead>
                    <TableHead className="text-right">Interest Rate</TableHead>
                    <TableHead className="text-right">Min. Payment</TableHead>
                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debts.length > 0 ? (
                    debts.map((debt) => (
                      <TableRow key={debt.id}>
                        <TableCell className="font-medium">{debt.description}</TableCell>
                        <TableCell className="text-center text-xs capitalize text-muted-foreground">{debt.term}</TableCell> {/* Display Term */}
                        <TableCell className="text-right font-mono">{formatCurrency(debt.principal)}</TableCell>
                        <TableCell className="text-right font-mono">{formatPercentage(debt.interestRate)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(debt.minPayment)}</TableCell>
                        <TableCell className="text-right">
                          {/* Edit Button */}
                          <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(debt)}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>

                          {/* Delete Button & Confirmation */}
                          <AlertDialog open={debtToDelete?.id === debt.id} onOpenChange={(open) => !open && setDebtToDelete(null)}>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(debt)}>
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the debt: <br />
                                  <strong>{debt.description} ({formatCurrency(debt.principal)})</strong>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDebtToDelete(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={confirmDeleteDebt}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground"> {/* Increased colspan */}
                        No debts recorded yet. Add one to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>

      {/* Edit Debt Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Debt Item</DialogTitle>
            <DialogDescription>Update the details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateDebtSubmit} className="grid gap-4 py-4">
             <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-description" className="text-right">Description</Label>
                  <Input id="edit-description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-principal" className="text-right">Principal (KES)</Label>
                  <Input id="edit-principal" name="principal" type="number" step="0.01" min="0" value={formData.principal} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-interestRate" className="text-right">Interest Rate (%)</Label>
                  <Input id="edit-interestRate" name="interestRate" type="number" step="0.01" min="0" value={formData.interestRate} onChange={handleInputChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-minPayment" className="text-right">Min Payment (KES)</Label>
                  <Input id="edit-minPayment" name="minPayment" type="number" step="0.01" min="0" value={formData.minPayment} onChange={handleInputChange} className="col-span-3" required />
                </div>
                 {/* Term Selection */}
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-term" className="text-right">Term</Label>
                    <Select name="term" value={formData.term} onValueChange={handleSelectChange} required>
                        <SelectTrigger id="edit-term" className="col-span-3">
                            <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="short">Short Term</SelectItem>
                            <SelectItem value="long">Long Term</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
