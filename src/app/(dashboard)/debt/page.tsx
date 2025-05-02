// src/app/(dashboard)/debt/page.tsx
'use client';

import React, { useState, type ChangeEvent, useEffect, useCallback, useMemo } from 'react'; // Added useMemo
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, List } from 'lucide-react'; // Added List icon for amortization toggle
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebt } from '@/contexts/DebtContext';
import type { DebtItem } from '@/lib/types';
import Link from 'next/link'; // Import Link for Import button
import { format } from 'date-fns'; // Import format for potential date usage in export (though not currently used)
import DebtAmortizationSchedule from '@/components/debt/DebtAmortizationSchedule'; // Import the new component

// Formatting Function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
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
  const [showAmortizationId, setShowAmortizationId] = useState<string | null>(null); // State to track which debt schedule to show

  // Find the debt item corresponding to the ID for the amortization schedule
  const selectedDebtForAmortization = useMemo(() => {
      return debts.find(d => d.id === showAmortizationId) || null;
  }, [debts, showAmortizationId]);


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
      term: debt.term,
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

    // --- Export Functionality ---
    const handleExportCsv = useCallback(() => {
        if (debts.length === 0) {
        toast({ title: "No data to export", description: "Add debts to export a CSV file.", variant: "default" });
        return;
        }

        const csvRows = [];
        // Define explicit headers for CSV
        const headers = ['Description', 'Principal (KES)', 'Interest Rate (%)', 'Min Payment (KES)', 'Term'];
        csvRows.push(headers.join(','));

        for (const debt of debts) {
        // Sanitize description to prevent CSV injection issues (basic example: remove quotes)
        const sanitizedDescription = debt.description.replace(/"/g, "''");

        const values = [
            `"${sanitizedDescription}"`, // Enclose description in quotes
            debt.principal,
            debt.interestRate,
            debt.minPayment,
            debt.term,
        ].join(',');
        csvRows.push(values);
        }

        const csvData = csvRows.join('\n');
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' }); // Specify charset
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'debts_export.csv'; // Use a more descriptive name
        document.body.appendChild(link); // Needed for Firefox
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url); // Clean up the object URL

        toast({ title: "CSV Exported", description: "Successfully downloaded debt data." });
    }, [debts, toast]);


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary"/> Manage Debts
          </h1>
          <p className="text-muted-foreground">
            Track your outstanding debts, interest rates, and payments.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap"> {/* Added flex-wrap */}
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
                {/* Input Fields */}
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

          {/* Import Button - Links to Debt Import Page */}
           <Button asChild variant="default">
             <Link href="/debt/import">
               <FileUp className="mr-2 h-4 w-4" /> Import CSV
             </Link>
           </Button>
            {/* Export Button */}
            <Button variant="secondary" onClick={handleExportCsv}>
              <FileDown className="mr-2 h-4 w-4" /> Export CSV
            </Button>
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
                    <TableHead className="text-center">Term</TableHead>
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
                        <TableCell className="text-center text-xs capitalize text-muted-foreground">{debt.term}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(debt.principal)}</TableCell>
                        <TableCell className="text-right font-mono">{formatPercentage(debt.interestRate)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(debt.minPayment)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(debt)}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>
                           {/* Amortization Toggle Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="mr-1 h-7 w-7"
                                onClick={() => setShowAmortizationId(prevId => prevId === debt.id ? null : debt.id)} // Toggle based on ID
                                aria-label={`Show amortization for ${debt.description}`}
                            >
                                <List className="h-4 w-4" />
                                <span className="sr-only">Amortization</span>
                            </Button>
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
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No debts recorded yet. Add one or import a CSV to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

         {/* Amortization Schedule Section - Conditionally rendered below the main table */}
        {selectedDebtForAmortization && (
          <DebtAmortizationSchedule debt={selectedDebtForAmortization} />
        )}
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
