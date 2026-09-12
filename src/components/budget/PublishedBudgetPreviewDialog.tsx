// src/app/(dashboard)/budget/PublishedBudgetPreviewDialog.tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import type { PublishedBudget, BudgetItemCategory } from '@/lib/types';

interface PublishedBudgetPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  publishedBudget: PublishedBudget | null;
}

const budgetCategoryNames: Record<BudgetItemCategory, string> = {
    'income': 'Income',
    'recurring-expense': 'Recurring Expense',
    'one-time-expense': 'One-Time Expense',
    'goal': 'Goal',
    'debt': 'Debt Allocation',
    'unplanned-expense': 'Unplanned Expense',
    'unbudgeted-income': 'Unbudgeted Income',
};

const PublishedBudgetPreviewDialog: React.FC<PublishedBudgetPreviewDialogProps> = ({ isOpen, onClose, publishedBudget }) => {
  if (!isOpen || !publishedBudget) return null;

  const groupedItems = publishedBudget.items.reduce((acc, item) => {
    const category = item.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<BudgetItemCategory, typeof publishedBudget.items>);

  const categoryOrder: BudgetItemCategory[] = ['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Budget Snapshot</DialogTitle>
          <DialogDescription>
            A read-only view of the budget for{' '}
            <span className="font-semibold">{format(new Date(publishedBudget.period + '-02'), 'MMMM yyyy')}</span>,
            published on <span className="font-semibold">{format(new Date(publishedBudget.publishedAt), 'PPp')}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 my-4 text-sm">
            <div className="p-3 border rounded-md bg-accent/10">
                <p className="text-muted-foreground">Total Income</p>
                <p className="font-mono font-semibold text-lg text-accent">{formatCurrency(publishedBudget.totalIncome)}</p>
            </div>
             <div className="p-3 border rounded-md bg-destructive/10">
                <p className="text-muted-foreground">Total Spending</p>
                <p className="font-mono font-semibold text-lg text-destructive">{formatCurrency(publishedBudget.totalSpending)}</p>
            </div>
             <div className="p-3 border rounded-md bg-muted">
                <p className="text-muted-foreground">Net</p>
                <p className={cn("font-mono font-semibold text-lg", publishedBudget.net >= 0 ? "text-primary" : "text-destructive")}>{formatCurrency(publishedBudget.net)}</p>
            </div>
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount (KES)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryOrder.map(category => (
                groupedItems[category] && groupedItems[category].length > 0 && (
                  <React.Fragment key={category}>
                    <TableRow className="bg-muted hover:bg-muted">
                        <TableCell colSpan={3} className="font-semibold text-muted-foreground">{budgetCategoryNames[category]}</TableCell>
                    </TableRow>
                    {groupedItems[category].map(item => (
                       <TableRow key={item.id}>
                         <TableCell>{item.description}</TableCell>
                         <TableCell><Badge variant="outline" className="text-xs">{item.category}</Badge></TableCell>
                         <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                       </TableRow>
                    ))}
                  </React.Fragment>
                )
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PublishedBudgetPreviewDialog;
