// src/app/(dashboard)/debt/columns.tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal, Edit, Trash2, List, AlertCircle } from 'lucide-react';
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
import { formatCurrency, cn } from '@/lib/utils';
import DebtAmortizationSheet from '@/components/debt/DebtAmortizationSheet';
import { Badge } from '@/components/ui/badge';
import React from 'react';

const formatPercentage = (rate: number) => {
    return `${rate.toFixed(2)}%`;
};

export const getDebtColumns = (
  onEdit: (item: DebtItem) => void,
  onDelete: (item: DebtItem) => void,
  acknowledgeDebtChange: (debtId: string) => void, // Action to acknowledge change
  acknowledgedPrincipals: Record<string, { principal: number; version: number }> // Map of acknowledged principals
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
    id: 'statusIndicator', // New column for pulsing dot
    header: 'Status',
    cell: ({ row }) => {
      const debtItem = row.original;
      const acknowledgedInfo = acknowledgedPrincipals[debtItem.id];
      const needsAcknowledgement = !acknowledgedInfo || 
                                 acknowledgedInfo.principal !== debtItem.principal ||
                                 acknowledgedInfo.version !== (debtItem as any)._acknowledgementVersion; // Compare with current version

      if (needsAcknowledgement) {
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 p-0 hover:bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent row selection if a general row click handler exists
                    acknowledgeDebtChange(debtItem.id);
                  }}
                >
                  <AlertCircle className="h-4 w-4 text-destructive animate-pulse-subtle" />
                  <span className="sr-only">Acknowledge change</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">New or changed. Click to acknowledge.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return null; // No indicator if acknowledged
    },
    enableSorting: false,
    enableHiding: true, // Allow hiding if preferred
    size: 60, // Small fixed size
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
                    onClick={(e) => e.stopPropagation()}
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

// Dummy Tooltip components if not globally available or for local context
// In a real app, import these from your UI library (e.g., Shadcn UI)
const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const Tooltip = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const TooltipTrigger = ({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) => asChild ? children : <div>{children}</div>;
const TooltipContent = ({ children, side }: { children: React.ReactNode, side?: string }) => <div className="hidden group-hover:block absolute bg-black text-white p-1 rounded text-xs" style={{ zIndex: 100}}>{children}</div>;

