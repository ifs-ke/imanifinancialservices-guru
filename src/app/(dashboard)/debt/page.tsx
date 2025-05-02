
// src/app/(dashboard)/debt/page.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit, Trash2, Coins, FileUp, FileDown, List } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDebt } from '@/contexts/DebtContext';
import type { DebtItem } from '@/lib/types';
import Link from 'next/link';
import { format } from 'date-fns';
import DebtFormSheet from '@/components/debt/DebtFormSheet'; // Import the form sheet
import DebtAmortizationSheet from '@/components/debt/DebtAmortizationSheet'; // Import the amortization sheet

// Formatting Functions
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

export default function DebtPage() {
  const { debts, deleteDebt } = useDebt();
  const { toast } = useToast();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtItem | null>(null);
  const [debtToDelete, setDebtToDelete] = useState<DebtItem | null>(null);
  const [amortizationDebt, setAmortizationDebt] = useState<DebtItem | null>(null); // State for amortization view

  // Handlers for opening sheets
  const handleAddClick = () => {
    setEditingDebt(null); // Ensure no debt is being edited
    setIsFormSheetOpen(true);
  };

  const handleEditClick = (debt: DebtItem) => {
    setEditingDebt(debt);
    setIsFormSheetOpen(true);
  };

  const handleAmortizationClick = (debt: DebtItem) => {
      setAmortizationDebt(debt);
      // The DebtAmortizationSheet component will control its own open state via its trigger
  };

  // Handle closing the form sheet
  const handleFormSheetClose = () => {
      setIsFormSheetOpen(false);
      setEditingDebt(null); // Clear editing state when sheet closes
  };


  // DELETE
  const handleDeleteClick = (debt: DebtItem) => {
    setDebtToDelete(debt);
    // AlertDialogTrigger will open the confirmation dialog
  };

  const confirmDeleteDebt = () => {
    if (!debtToDelete) return;
    deleteDebt(debtToDelete.id);
    setDebtToDelete(null); // Close the dialog implicitly
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
        <div className="flex gap-2 flex-wrap">
          {/* Add Debt Button */}
          <Button variant="outline" onClick={handleAddClick}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Debt
          </Button>

          {/* Import Button */}
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
                    <TableHead className="text-right w-[120px]">Actions</TableHead> {/* Increased width */}
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
                           {/* Edit Button - Opens Form Sheet */}
                           <Button variant="ghost" size="icon" className="mr-1 h-7 w-7" onClick={() => handleEditClick(debt)}>
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                          </Button>

                           {/* Amortization Button - Opens Amortization Sheet */}
                            <DebtAmortizationSheet debt={debt}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mr-1 h-7 w-7"
                                    aria-label={`Show amortization for ${debt.description}`}
                                >
                                    <List className="h-4 w-4" />
                                    <span className="sr-only">Amortization</span>
                                </Button>
                            </DebtAmortizationSheet>

                          {/* Delete Button & Confirmation Dialog */}
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

         {/* Debt Form Sheet (for Add/Edit) */}
         <DebtFormSheet
            isOpen={isFormSheetOpen}
            onClose={handleFormSheetClose}
            debt={editingDebt} // Pass null for add, or the debt object for edit
         />

      </main>
    </div>
  );
}
