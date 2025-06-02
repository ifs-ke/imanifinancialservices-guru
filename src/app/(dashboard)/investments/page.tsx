
// src/app/(dashboard)/investments/page.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useInvestmentStore, selectTotalInvestmentsValue } from '@/store/investmentStore';
import type { InvestmentItem } from '@/lib/types';
import InvestmentFormSheet from './InvestmentFormSheet';
import { DataTable } from '@/components/ui/data-table';
import { getInvestmentColumns } from './columns';
import { PageHeader } from '@/components/layout/PageHeader';
import { Briefcase, PlusCircle, Trash2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import InvestmentForecastingTool from './InvestmentForecastingTool'; // Import the new component
import { Separator } from '@/components/ui/separator';

export default function InvestmentsPage() {
  const { investmentItems, deleteInvestmentItem } = useInvestmentStore();
  const totalInvestmentsValue = useInvestmentStore(selectTotalInvestmentsValue);
  const { toast } = useToast();

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InvestmentItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InvestmentItem | null>(null);
  const [isMassDeleteDialogOpen, setIsMassDeleteDialogOpen] = useState(false);

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const handleAddClick = () => {
    setEditingItem(null);
    setIsFormSheetOpen(true);
  };

  const handleEditClick = useCallback((item: InvestmentItem) => {
    setEditingItem(item);
    setIsFormSheetOpen(true);
  }, []);

  const handleDeleteClick = useCallback((item: InvestmentItem) => {
    setItemToDelete(item);
  }, []);

  const handleFormSheetClose = () => {
    setIsFormSheetOpen(false);
    setEditingItem(null);
  };

  const confirmDeleteItem = () => {
    if (!itemToDelete) return;
    deleteInvestmentItem(itemToDelete.id);
    setItemToDelete(null);
    toast({ title: 'Investment Deleted', description: 'Successfully removed investment.' });
  };

  const columns = React.useMemo(() => getInvestmentColumns(handleEditClick, handleDeleteClick), [handleEditClick, handleDeleteClick]);

  const table = useReactTable({
    data: investmentItems,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedInvestmentIds = useMemo(() => {
    return table.getSelectedRowModel().rows.map(row => row.original.id);
  }, [rowSelection, table]);

  const handleMassDeleteClick = () => {
     if (selectedInvestmentIds.length === 0) {
       toast({ title: 'No Selection', description: 'Please select investments to delete.', variant: 'default' });
       return;
     }
     setIsMassDeleteDialogOpen(true);
  };

  const confirmMassDelete = () => {
    if (selectedInvestmentIds.length > 0) {
      selectedInvestmentIds.forEach(id => deleteInvestmentItem(id));
      toast({ title: 'Batch Delete Successful', description: `${selectedInvestmentIds.length} investment(s) deleted.` });
      setRowSelection({});
    }
    setIsMassDeleteDialogOpen(false);
  };

  return (
    <div className="flex flex-col w-full min-h-screen py-4 md:py-6 lg:py-8">
       <PageHeader
          title="Investments"
          description="Track your current portfolio and plan for future growth."
          icon={<Briefcase className="h-6 w-6" />}
        >
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleAddClick}><PlusCircle className="mr-2 h-4 w-4" /> Add Investment</Button>
          </div>
        </PageHeader>

      <main className="flex-1 px-4 md:px-6 lg:px-8 space-y-8"> {/* Increased space-y */}
        
        {/* Current Portfolio Section */}
        <Card className="shadow-md">
          <CardHeader className="p-6">
            <CardTitle>Current Portfolio Overview</CardTitle>
             <CardDescription>Summary of your current investment holdings.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm p-6">
            <div className="flex flex-col p-3 rounded-md border bg-primary/10">
              <span className="text-muted-foreground mb-1">Total Current Value</span>
              <span className="font-bold text-lg font-mono text-primary">{formatCurrency(totalInvestmentsValue)}</span>
            </div>
            <div className="flex flex-col p-3 rounded-md border">
              <span className="text-muted-foreground mb-1">Number of Investments</span>
              <span className="font-bold text-lg font-mono">{investmentItems.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
           <CardHeader className="p-4 md:p-6 border-b">
            <CardTitle>My Investment Holdings</CardTitle>
            <CardDescription>Detailed list of your current investments.</CardDescription>
             {selectedInvestmentIds.length > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center border-t pt-4">
                    <span className="text-sm text-muted-foreground mb-2 sm:mb-0">{selectedInvestmentIds.length} selected</span>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="destructive" onClick={handleMassDeleteClick}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
                            <XCircle className="mr-2 h-4 w-4" /> Clear Selection
                        </Button>
                    </div>
                </div>
            )}
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            <DataTable
              columns={columns}
              data={investmentItems}
              table={table}
              searchColumn="name"
              searchPlaceholder="Search by name or type..."
            />
          </CardContent>
           {investmentItems.length > 0 && (
               <CardFooter className="p-4 border-t text-xs text-muted-foreground">
                   {table.getFilteredRowModel().rows.length} investment(s) showing.
               </CardFooter>
           )}
        </Card>

        <Separator className="my-8" /> {/* Added separator */}

        {/* Investment Planning & Forecasting Section */}
        <InvestmentForecastingTool />

      </main>

      {(editingItem || (isFormSheetOpen && !editingItem)) && (
        <InvestmentFormSheet
          isOpen={isFormSheetOpen}
          onClose={handleFormSheetClose}
          item={editingItem}
        />
      )}

      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        {itemToDelete && (
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                Delete investment: <strong>{itemToDelete.name} ({itemToDelete.type})</strong>? This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        )}
      </AlertDialog>

      <AlertDialog open={isMassDeleteDialogOpen} onOpenChange={setIsMassDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Investments?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedInvestmentIds.length} selected investment(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMassDelete}>Delete Selected</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
