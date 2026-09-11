// src/app/(dashboard)/transactions/columns.tsx
'use client';

import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TransactionWithId } from '@/lib/types';
import { format, isValid } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const formatCategoryDisplay = (freq?: string | null, vari?: string | null) => {
  if (!freq && !vari) return <span className="text-xs text-muted-foreground">—</span>;
  const badges = [];
  if (freq) {
    const label = freq === 'recurring' ? 'Recurring' : 'One-off';
    badges.push(
      <Badge 
        key="freq" 
        variant={freq === 'recurring' ? 'secondary' : 'outline'} 
        className="text-[11px] font-normal"
      >
        {label}
      </Badge>
    );
  }
  if (vari) {
    const label = vari === 'fixed' ? 'Fixed' : 'Variable';
    badges.push(
      <Badge 
        key="vari" 
        variant={vari === 'fixed' ? 'secondary' : 'outline'} 
        className="text-[11px] font-normal"
      >
        {label}
      </Badge>
    );
  }
  return <div className="flex items-center gap-1.5 flex-wrap">{badges}</div>;
};

export const getColumns = (
  onEdit: (transaction: TransactionWithId) => void,
  onDelete: (transaction: TransactionWithId) => void
): ColumnDef<TransactionWithId>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="-ml-3 h-8 text-xs font-semibold"
      >
        Date
        <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => {
      const date = row.getValue('date') as Date | string;
      const validDate = date instanceof Date ? date : new Date(date);
      return (
        <div className="font-mono text-xs whitespace-nowrap">
          {isValid(validDate) ? format(validDate, 'MMM d, yyyy') : 'No date'}
        </div>
      );
    },
    enableHiding: true,
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <div className="font-medium text-xs text-foreground truncate max-w-[220px] sm:max-w-xs" title={row.getValue('description')}>
        {row.getValue('description')}
      </div>
    ),
    enableHiding: true,
  },
  {
    accessorKey: 'modeOfPayment',
    header: 'Payment mode',
    cell: ({ row }) => {
      const mode = row.getValue('modeOfPayment') as string | null;
      return (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {mode || 'Direct'}
        </span>
      );
    },
    enableHiding: true,
  },
  {
    accessorKey: 'recurrence',
    id: 'recurrence',
    header: 'Classification',
    cell: ({ row }) => {
      const transaction = row.original;
      return formatCategoryDisplay(transaction.frequency, transaction.variability);
    },
    enableHiding: true,
  },
  {
    accessorKey: 'categoryName',
    header: 'Category',
    cell: ({ row }) => {
      const categoryName = row.getValue('categoryName') as string | null;
      return categoryName ? (
        <Badge variant="outline" className="text-[11px] font-normal">
          {categoryName}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      );
    },
    enableHiding: true,
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => (
      <div className="text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-mr-3 h-8 text-xs font-semibold justify-end"
        >
          Amount
          <ArrowUpDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    ),
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('amount'));
      const isIncome = amount > 0;
      return (
        <div className={cn(
          'text-right font-mono text-xs font-semibold whitespace-nowrap',
          isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
        )}>
          {isIncome ? `+${formatCurrency(amount)}` : formatCurrency(amount)}
        </div>
      );
    },
    enableHiding: true,
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const transaction = row.original;
      return (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-7 w-7 p-0 cursor-pointer">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 text-xs">
              <DropdownMenuLabel className="text-xs font-semibold">Options</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEdit(transaction)} className="cursor-pointer text-xs">
                <Edit className="mr-2 h-3.5 w-3.5" /> Edit transaction
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(transaction)}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer text-xs"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];
