// src/components/debt/DebtColumns.tsx
'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { 
  ArrowUpDown, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  List, 
  AlertCircle, 
  Users, 
  Landmark, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  CalendarCheck,
  Check,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
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
import type { DebtItem, DebtStatus } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import DebtAmortizationSheet from '@/components/debt/DebtAmortizationSheet';
import { Badge } from '@/components/ui/badge';
import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { computeDebtStatus, getDaysOverdue } from '@/lib/debtUtils';

interface InternalDebtItem extends DebtItem {
  _acknowledgementVersion?: number;
}

const formatPercentage = (rate?: number | null) => {
  if (rate === undefined || rate === null || rate === 0) {
    return '0.00% (Free)';
  }
  return `${rate.toFixed(2)}%`;
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
};

export const getDebtColumns = (
  onEdit: (item: InternalDebtItem) => void,
  onDelete: (item: InternalDebtItem) => void,
  acknowledgeDebtChange: (debtId: string) => void,
  acknowledgedPrincipals: Record<string, { principal: number; version: number }>,
  onStatusChange?: (item: InternalDebtItem, newStatus: DebtStatus) => void,
  onRestructure?: (item: InternalDebtItem) => void
): ColumnDef<InternalDebtItem>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <div className="flex items-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      </div>
    ),
    cell: ({ row }) => {
      const debtItem = row.original;
      const acknowledgedInfo = acknowledgedPrincipals[debtItem.id];
      const needsAcknowledgement = !acknowledgedInfo ||
                                 acknowledgedInfo.principal !== debtItem.principal ||
                                 acknowledgedInfo.version !== debtItem._acknowledgementVersion;
      return (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-[2px]"
          />
          {needsAcknowledgement && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0 hover:bg-transparent data-[state=open]:bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      acknowledgeDebtChange(debtItem.id);
                    }}
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-destructive animate-pulse-subtle" />
                    <span className="sr-only">Acknowledge change for {debtItem.description}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs p-1.5">
                  <p>Principal or details changed. Click to acknowledge.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
    size: 50,
  },
  {
    accessorKey: 'date',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-xs font-semibold px-1 hover:bg-transparent">
        <Calendar className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
        Date <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const dateVal = row.getValue('date') as string | undefined;
      const dueDateVal = row.original.dueDate;
      return (
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-muted-foreground whitespace-nowrap">
            {formatDate(dateVal)}
          </div>
          {dueDateVal && (
            <div className="text-[10px] font-mono text-muted-foreground/70 flex items-center gap-0.5" title={`Due Date: ${dueDateVal}`}>
              <CalendarCheck className="w-2.5 h-2.5 text-primary/70" />
              Due: {formatDate(dueDateVal)}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const debtItem = row.original;
      const computedStatus = computeDebtStatus({
        status: debtItem.status,
        dueDate: debtItem.dueDate,
        date: debtItem.date,
        term: debtItem.term,
        principal: debtItem.principal,
      });
      const daysOverdue = getDaysOverdue({
        dueDate: debtItem.dueDate,
        date: debtItem.date,
        term: debtItem.term,
        status: debtItem.status,
        principal: debtItem.principal,
      });

      if (computedStatus === 'overdue') {
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[11px] font-semibold flex items-center gap-1 cursor-default py-0.5 px-2">
                  <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400 animate-pulse" />
                  Overdue
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>{daysOverdue > 0 ? `${daysOverdue} days past maturity / expected date.` : 'Passed expected loan repayment expectation.'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      if (computedStatus === 'paid_off') {
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[11px] font-medium flex items-center gap-1 py-0.5 px-2">
            <CheckCircle2 className="w-3 h-3 text-blue-500" />
            Paid Off
          </Badge>
        );
      }

      if (computedStatus === 'in_grace') {
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] font-medium flex items-center gap-1 py-0.5 px-2">
            <Clock className="w-3 h-3 text-amber-500" />
            In Grace
          </Badge>
        );
      }

      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-medium flex items-center gap-1 py-0.5 px-2">
          <Check className="w-3 h-3 text-emerald-500" />
          Active
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      const debtItem = row.original;
      const status = computeDebtStatus({
        status: debtItem.status,
        dueDate: debtItem.dueDate,
        date: debtItem.date,
        term: debtItem.term,
        principal: debtItem.principal,
      });
      return value.includes(status);
    },
  },
  {
    accessorKey: 'classification',
    header: 'Classification',
    cell: ({ row }) => {
      const classification = row.getValue('classification') as string;
      const isPersonal = classification === 'personal';
      return (
        <Badge 
          variant="outline" 
          className={cn(
            "text-[11px] font-medium inline-flex items-center gap-1 py-0.5 px-2 rounded-full",
            isPersonal 
              ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20" 
              : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20"
          )}
        >
          {isPersonal ? (
            <>
              <Users className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              Personal (Friends/Family)
            </>
          ) : (
            <>
              <Landmark className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              Institutional (Bank/SACCO)
            </>
          )}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-xs font-semibold px-1 hover:bg-transparent">
        Description / Lender <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const desc = row.getValue('description') as string;
      const notes = row.original.notes;
      const isSecured = row.original.securityType === 'secured';
      const secDesc = row.original.securityDescription;
      return (
        <div className="max-w-[220px]">
          <div className="font-semibold text-xs text-foreground truncate" title={desc}>
            {desc}
          </div>
          {isSecured && (
            <div className="mt-0.5">
              <Badge 
                variant="outline" 
                className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[9px] py-0 px-1.5 font-normal inline-flex items-center gap-1 max-w-full truncate"
                title={secDesc ? `Secured: ${secDesc}` : 'Secured (Collateral Backed)'}
              >
                <ShieldCheck className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">Secured{secDesc ? `: ${secDesc}` : ''}</span>
              </Badge>
            </div>
          )}
          {notes && (
            <div className="text-[10px] text-muted-foreground truncate" title={notes}>
              {notes}
            </div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'term',
    header: 'Term',
    cell: ({ row }) => {
      const term = row.getValue('term') as string;
      return (
        <Badge variant={term === 'short' ? 'default' : 'secondary'} className="capitalize text-[11px] font-medium py-0 px-2">
          {term === 'short' ? 'Short-term' : 'Long-term'}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'principal',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-right w-full justify-end px-1 hover:bg-transparent text-xs font-semibold">
        Principal <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-right font-mono text-xs font-bold text-foreground">{formatCurrency(row.getValue('principal'))}</div>,
  },
  {
    accessorKey: 'interestRate',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-right w-full justify-end px-1 hover:bg-transparent text-xs font-semibold">
        Interest <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => {
      const rate = row.getValue('interestRate') as number | undefined | null;
      const isZero = !rate || rate === 0;
      return (
        <div className={cn("text-right font-mono text-xs", isZero ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-foreground")}>
          {formatPercentage(rate)}
        </div>
      );
    },
  },
  {
    accessorKey: 'minPayment',
    header: ({ column }) => (
      <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} className="text-right w-full justify-end px-1 hover:bg-transparent text-xs font-semibold">
        Min. Payment <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-right font-mono text-xs text-foreground">{formatCurrency(row.getValue('minPayment'))}</div>,
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const debtItem = row.original;
      return (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0 cursor-pointer">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Debt Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEdit(debtItem)} className="text-xs cursor-pointer">
                <Edit className="mr-2 h-3.5 w-3.5 text-primary" /> Edit Parameters
              </DropdownMenuItem>
              {onRestructure && (
                <DropdownMenuItem onClick={() => onRestructure(debtItem)} className="text-xs cursor-pointer">
                  <RefreshCw className="mr-2 h-3.5 w-3.5 text-primary" /> Restructure Debt
                </DropdownMenuItem>
              )}
              {onStatusChange && (
                <>
                  {debtItem.status !== 'paid_off' ? (
                    <DropdownMenuItem 
                      onClick={() => onStatusChange(debtItem, 'paid_off')}
                      className="text-xs cursor-pointer text-blue-600 dark:text-blue-400"
                    >
                      <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Mark as Paid Off
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem 
                      onClick={() => onStatusChange(debtItem, 'active')}
                      className="text-xs cursor-pointer text-emerald-600 dark:text-emerald-400"
                    >
                      <Check className="mr-2 h-3.5 w-3.5" /> Reactivate Debt
                    </DropdownMenuItem>
                  )}
                </>
              )}
              <DropdownMenuSeparator />
              <DebtAmortizationSheet debt={debtItem}>
                <Button
                  variant="ghost"
                  className="w-full justify-start text-xs font-normal relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <List className="h-3.5 w-3.5 text-primary" /> Amortization
                </Button>
              </DebtAmortizationSheet>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(debtItem)} className="text-xs text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Debt
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
