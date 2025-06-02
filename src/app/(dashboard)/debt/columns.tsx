// src/app/(dashboard)/debt/columns.tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal, Edit, Trash2, List } from 'lucide-react';
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
import type { DebtItem } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import DebtAmortizationSheet from '@/components/debt/DebtAmortizationSheet';
import { Badge } from '@/components/ui/badge';

const formatPercentage = (rate: number) => {
    return `${rate.toFixed(2)}%`;
};

export const getDebtColumns = (
  onEdit: (item: DebtItem) => void,
  onDelete: (item: DebtItem) => void
): ColumnDef<DebtItem>[] => [
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
    accessorKey: 'description',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        Description <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="font-medium truncate max-w-[200px]" title={row.getValue('description')}>{row.getValue('description')}</div>,
  },
  {
    accessorKey: 'term',
    header: 'Term',
    cell: ({ row }) => <Badge variant={row.getValue('term') === 'short' ? 'default' : 'secondary'} className="capitalize text-xs">{row.getValue('term')}</Badge>,
  },
  {
    accessorKey: 'principal',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-right w-full justify-end px-0 hover:bg-transparent">
        Principal <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-right font-mono">{formatCurrency(row.getValue('principal'))}</div>,
  },
  {
    accessorKey: 'interestRate',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-right w-full justify-end px-0 hover:bg-transparent">
        Rate (%) <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-right font-mono">{formatPercentage(row.getValue('interestRate'))}</div>,
  },
  {
    accessorKey: 'minPayment',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-right w-full justify-end px-0 hover:bg-transparent">
        Min. Payment <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-right font-mono">{formatCurrency(row.getValue('minPayment'))}</div>,
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const debtItem = row.original;
      return (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEdit(debtItem)}>
                <Edit className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DebtAmortizationSheet debt={debtItem}>
                <Button
                    variant="ghost"
                    className="w-full justify-start text-sm font-normal relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    onClick={(e) => e.stopPropagation()} // Prevent dropdown from closing if not handled by sheet trigger
                >
                    <List className="mr-2 h-4 w-4" /> Amortization
                </Button>
              </DebtAmortizationSheet>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(debtItem)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
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
