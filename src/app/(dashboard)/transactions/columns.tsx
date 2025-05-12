// src/app/(dashboard)/transactions/columns.tsx
'use client';

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
import { format } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const formatCategoryDisplay = (freq?: string | null, vari?: string | null) => {
  if (!freq && !vari) return <Badge variant="outline" className="text-xs font-normal">N/A</Badge>;
  const badges = [];
  if (freq) {
    badges.push(<Badge key="freq" variant={freq === 'recurring' ? 'secondary' : 'outline'} className="text-xs font-normal mr-1">{freq.charAt(0).toUpperCase() + freq.slice(1)}</Badge>);
  }
  if (vari) {
    badges.push(<Badge key="vari" variant={vari === 'fixed' ? 'secondary' : 'outline'} className="text-xs font-normal">{vari.charAt(0).toUpperCase() + vari.slice(1)}</Badge>);
  }
  return <div className="flex items-center gap-1">{badges}</div>;
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = row.getValue('date') as Date | string; // Can be string from API, Date in store
      const validDate = date instanceof Date ? date : new Date(date);
      return <div className="font-medium">{isValid(validDate) ? format(validDate, 'PP') : 'Invalid Date'}</div>;
    },
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => <div className="truncate max-w-[200px] sm:max-w-xs" title={row.getValue('description')}>{row.getValue('description')}</div>,
  },
  {
    accessorKey: 'modeOfPayment',
    header: 'Mode',
  },
  {
    id: 'recurrence',
    header: 'Recurrence',
    cell: ({ row }) => {
      const transaction = row.original;
      return formatCategoryDisplay(transaction.frequency, transaction.variability);
    },
  },
  {
    accessorKey: 'categoryName',
    header: 'Budget Category',
    cell: ({ row }) => {
        const categoryName = row.getValue('categoryName') as string | null;
        return categoryName ? <Badge variant="outline" className="text-xs">{categoryName}</Badge> : <span className="text-xs text-muted-foreground">N/A</span>;
    },
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="text-right w-full justify-end px-0 hover:bg-transparent"
        >
          Amount (KES)
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('amount'));
      return (
        <div className={cn('text-right font-mono', amount >= 0 ? 'text-accent' : 'text-destructive')}>
          {formatCurrency(amount)}
        </div>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const transaction = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEdit(transaction)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(transaction)}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];

function isValid(date: Date) {
  return date instanceof Date && !isNaN(date.getTime());
}
