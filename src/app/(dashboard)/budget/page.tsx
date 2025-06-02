
// src/app/(dashboard)/budget/page.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Edit, PieChart as PieChartIcon, PlusCircle, Trash2, DollarSign, TrendingDown, Target, MinusCircle, Coins, FileUp, FileDown, History, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useBudgetStore, selectCurrentBudgetPeriod, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import BudgetItemFormSheet from './BudgetItemFormSheet';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, addMonths, subMonths, parse, isValid as isDateValid } from 'date-fns';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger as ShadAccordionTrigger } from "@/components/ui/accordion";


const budgetCategories: { name: string; key: BudgetItemCategory; icon: React.ElementType; description: string; }[] = [
    { name: 'Income', key: 'income', icon: DollarSign, description: "Track all sources of income." },
    { name: 'Recurring Expenses', key: 'recurring-expense', icon: TrendingDown, description: "Regular, predictable expenses like rent or subscriptions." },
    { name: 'One-Time Expenses', key: 'one-time-expense', icon: MinusCircle, description: "Infrequent or non-repeating expenses." },
    { name: 'Goals', key: 'goal', icon: Target, description: "Allocate funds towards your financial goals." },
    { name: 'Debt Allocation', key: 'debt', icon: Coins, description: "Payments towards reducing outstanding debts." },
];

const formatPeriodForDisplay = (period: string): string => {
    try {
        if (!period || !/^\d{4}-\d{02}$/.test(period)) return "Invalid Period";
        const [year, month] = period.split('-').map(Number);
        if (!year || !month) return "Invalid Period";
        const date = new Date(year, month - 1);
        if (!isDateValid(date)) return "Invalid Period";
        return format(date, 'MMMM yyyy');
    } catch {
        return "Invalid Period";
    }
}

const formatToPeriodKey = (date: Date): string => {
    return format(date, 'yyyy-MM');
}

const AccordionTriggerWithActions = React.forwardRef<
  HTMLButtonElement, // Ref for the underlying button element of ShadAccordionTrigger
  React.ComponentPropsWithoutRef<typeof ShadAccordionTrigger> & {
    title: string;
    description: string;
    icon: React.ElementType;
    totalAmount: number;
    onAddClick: () => void;
    itemCount: number;
  }
>(({ title, description, icon: Icon, totalAmount, onAddClick, itemCount, children, className, ...props }, ref) => {
  return (
    // This div acts as the header for the accordion item
    <div className={cn(
        "flex items-center justify-between w-full hover:bg-muted/50 data-[state=open]:bg-muted/60",
        "rounded-t-lg data-[state=closed]:rounded-b-lg transition-all", // Apply rounding based on state here
        props['data-state'] === 'open' ? 'rounded-b-none' : '',
        className
      )}
    >
      <ShadAccordionTrigger
        ref={ref}
        {...props}
        className={cn(
          "flex-grow p-4 hover:no-underline flex items-center gap-3 text-left",
          // Remove rounding from trigger itself if parent div handles it
          // "rounded-t-lg data-[state=closed]:rounded-b-lg data-[state=open]:rounded-b-none"
        )}
        // Prevent the trigger from firing if the add button was clicked
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-add-button]')) {
            e.preventDefault(); // Prevent accordion toggle
          }
          // Allow default AccordionTrigger onClick to proceed if not the add button
        }}
      >
        <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="flex-grow">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {itemCount > 0 && <span className="text-sm font-bold font-mono ml-auto mr-3 flex-shrink-0">{formatCurrency(totalAmount)}</span>}
        {/* The ChevronDown icon is part of ShadAccordionTrigger */}
      </ShadAccordionTrigger>
      <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation(); // Important: Stop click from bubbling to AccordionTrigger
            onAddClick();
          }}
          className="h-7 px-2 mr-3 flex-shrink-0 data-[add-button]" // Added data-add-button for identification
          aria-label={`Add new ${title.replace(/s$/, '')} item`}
        >
        <PlusCircle className="mr-1 h-3.5 w-3.5" />Add
      </Button>
    </div>
  );
});
AccordionTriggerWithActions.displayName = "AccordionTriggerWithActions";


export default function BudgetPage() {
  const { toast } = useToast();
  const budgetPeriod = useBudgetStore(selectCurrentBudgetPeriod);
  const setBudgetPeriod = useBudgetStore(state => state.setBudgetPeriod);
  const allBudgetItems = useBudgetStore(state => state.budgetItems);
  const { deleteBudgetItem } = useBudgetStore();

  const totalIncome = useBudgetStore(selectTotalBudgetedIncome);
  const totalRecurringExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const totalOneTimeExpenses = useBudgetStore(selectTotalOneTimeExpenses);
  const totalGoals = useBudgetStore(selectTotalGoals);
  const totalExpenses = useBudgetStore(selectTotalBudgetedExpenses);
  const totalDebtAllocation = useBudgetStore(selectTotalBudgetedDebt);
  const netBudgeted = useBudgetStore(selectNetBudgeted);

  const [isFormSheetOpen, setIsFormSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<BudgetItem | null>(null);
  const [categoryForNewItem, setCategoryForNewItem] = useState<BudgetItemCategory>('recurring-expense');
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => {
    const currentPeriod = useBudgetStore.getState().budgetPeriod;
    return parse(currentPeriod, 'yyyy-MM', new Date());
  });


  useEffect(() => {
      const initialPeriod = formatToPeriodKey(selectedMonthDate);
      if (budgetPeriod !== initialPeriod) {
          setBudgetPeriod(initialPeriod);
      }
  }, []);

  const budgetItemsForPeriod = useMemo(() => {
      return allBudgetItems.filter(item => item.period === budgetPeriod);
  }, [allBudgetItems, budgetPeriod]);

  const handleAddClick = (category: BudgetItemCategory) => {
      setCategoryForNewItem(category);
      setEditingItem(null);
      setIsFormSheetOpen(true);
  };

  const handleEditClick = (item: BudgetItem) => {
      setEditingItem(item);
      setIsFormSheetOpen(true);
  };

  const handleFormSheetClose = () => {
      setIsFormSheetOpen(false);
      setEditingItem(null);
  };

  const handleDeleteClick = (item: BudgetItem) => {
      setItemToDelete(item);
  };

  const confirmDeleteItem = () => {
      if (!itemToDelete) return;
      deleteBudgetItem(itemToDelete.id);
      setItemToDelete(null);
      toast({ title: 'Budget Item Deleted', description: 'Successfully removed item.' });
  };

   const handleMonthSelect = (date: Date | undefined) => {
       if (date && isDateValid(date)) {
           const newPeriod = formatToPeriodKey(date);
           setSelectedMonthDate(date);
           setBudgetPeriod(newPeriod);
       }
   };

    const changeMonth = (direction: 'prev' | 'next') => {
        const newDate = direction === 'prev' ? subMonths(selectedMonthDate, 1) : addMonths(selectedMonthDate, 1);
        handleMonthSelect(newDate);
    };

  const groupedBudgetItems = useMemo(() => {
      const groups: Record<BudgetItemCategory, BudgetItem[]> = {
          income: [], 'recurring-expense': [], 'one-time-expense': [], goal: [], debt: [], 'unplanned-expense': [], 'unbudgeted-income': []
      };
      budgetItemsForPeriod.forEach(item => {
          if (item.category && groups[item.category as BudgetItemCategory]) {
            groups[item.category as BudgetItemCategory].push(item);
          }
      });
      return groups;
  }, [budgetItemsForPeriod]);

   const groupTotals = useMemo(() => {
       const totals: Record<BudgetItemCategory, number> = {
           income: 0, 'recurring-expense': 0, 'one-time-expense': 0, goal: 0, debt: 0, 'unplanned-expense': 0, 'unbudgeted-income': 0
       };
       Object.entries(groupedBudgetItems).forEach(([category, items]) => {
           totals[category as BudgetItemCategory] = items.reduce((sum, item) => sum + item.amount, 0);
       });
       return totals;
   }, [groupedBudgetItems]);


  const handleExport = () => {
    if(budgetItemsForPeriod.length === 0) {
        toast({ title: "No Data", description: `Add budget items for ${formatPeriodForDisplay(budgetPeriod)} before exporting.` });
        return;
    }
    const dataToExport = budgetItemsForPeriod.map(({ id, period, ...rest }) => ({
        category: rest.category,
        description: rest.description,
        amount: rest.amount,
    }));
    // Dynamically import papaparse only when needed
    import('papaparse').then(Papa => {
      const csvData = Papa.unparse(dataToExport, {
        header: true,
        columns: ['category', 'description', 'amount']
      });
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `budget_${budgetPeriod}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "CSV Exported", description: `Budget for ${formatPeriodForDisplay(budgetPeriod)} exported.` });
    }).catch(err => {
      console.error("Failed to load papaparse for export", err);
      toast({title: "Export Error", description: "Could not load CSV export library.", variant: "destructive"})
    });
  };


  return (
    <div className="flex flex-col min-h-screen w-full py-4 md:py-6 lg:py-8">
      <header className="mb-6 px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <PieChartIcon className="h-6 w-6 text-primary" /> Budget Management
            </h1>
             <p className="text-sm text-muted-foreground">Plan your finances for a specific month.</p>
        </div>
         <div className="flex gap-2 items-center flex-wrap">
             <div className="flex items-center gap-1 border rounded-md px-2 py-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => changeMonth('prev')}><ChevronLeft size={16} /></Button>
                 <Popover>
                     <PopoverTrigger asChild>
                         <Button variant="ghost" className="h-7 px-2 text-sm font-semibold">
                             <CalendarIcon className="mr-2 h-4 w-4" />
                             {formatPeriodForDisplay(budgetPeriod)}
                         </Button>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0">
                         <Calendar
                             mode="single"
                             selected={selectedMonthDate}
                             onSelect={handleMonthSelect}
                             captionLayout="dropdown-buttons"
                             fromYear={new Date().getFullYear() - 5} // Adjusted range
                             toYear={new Date().getFullYear() + 5}
                             initialFocus
                         />
                     </PopoverContent>
                 </Popover>
                 <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => changeMonth('next')}><ChevronRight size={16} /></Button>
             </div>
             <Button asChild variant="outline" size="sm">
                <Link href="/budget/import">
                    <FileUp className="mr-2 h-4 w-4" /> Import CSV
                </Link>
             </Button>
              <Button onClick={handleExport} variant="secondary" size="sm" disabled={budgetItemsForPeriod.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export CSV</Button>
         </div>
      </header>

      <Card className="mb-6 mx-4 md:mx-6 lg:mx-8 shadow-md">
        <CardHeader className="p-6">
            <CardTitle>Budget Summary for {formatPeriodForDisplay(budgetPeriod)}</CardTitle>
            <CardDescription>Overview of your planned budget for the selected month.</CardDescription>
        </CardHeader>
         <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 text-sm p-6">
             <div className="flex flex-col p-3 rounded-md border bg-accent/10">
                <span className="text-muted-foreground mb-1">Total Income</span>
                <span className="font-bold text-lg font-mono text-accent">{formatCurrency(totalIncome)}</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-destructive/10">
                <span className="text-muted-foreground mb-1">Total Expenses</span>
                 <span className="font-bold text-lg font-mono text-destructive">{formatCurrency(totalExpenses)}</span>
                 <span className="text-xs text-muted-foreground">(Recurring: {formatCurrency(totalRecurringExpenses)}, One-Time: {formatCurrency(totalOneTimeExpenses)})</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-primary/10">
                <span className="text-muted-foreground mb-1">Total Goals</span>
                <span className="font-bold text-lg font-mono text-primary">{formatCurrency(totalGoals)}</span>
            </div>
            <div className="flex flex-col p-3 rounded-md border bg-destructive/5">
                <span className="text-muted-foreground mb-1">Total Debt Allocation</span>
                <span className="font-bold text-lg font-mono text-destructive/80">{formatCurrency(totalDebtAllocation)}</span>
            </div>
             <div className="flex flex-col p-3 rounded-md border bg-muted">
                <span className="text-muted-foreground mb-1">Expected Net</span>
                 <span className={cn("font-bold text-lg font-mono", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>{formatCurrency(netBudgeted)}</span>
                  {netBudgeted !== 0 && (<span className={cn("text-xs mt-1", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>{netBudgeted > 0 ? `${formatCurrency(netBudgeted)} Left Over` : `${formatCurrency(Math.abs(netBudgeted))} Shortfall`}</span>)}
             </div>
         </CardContent>
      </Card>

      <main className="flex flex-col gap-4 px-4 md:px-6 lg:px-8">
        <Accordion type="multiple" className="w-full space-y-4">
         {budgetCategories.map(({ name, key, icon: Icon, description }) => (
             <AccordionItem value={key} key={key} className="border-none shadow-sm rounded-lg overflow-hidden bg-card">
                 <AccordionTriggerWithActions
                    title={name}
                    description={description}
                    icon={Icon}
                    totalAmount={groupTotals[key as BudgetItemCategory]}
                    onAddClick={() => handleAddClick(key as BudgetItemCategory)}
                    itemCount={groupedBudgetItems[key as BudgetItemCategory].length}
                    data-state={undefined} // Pass Radix data-state for styling
                  />
                  <AccordionContent className="p-0 border-t border-border">
                      {groupedBudgetItems[key as BudgetItemCategory].length > 0 ? (
                        <ScrollArea className="h-[350px] w-full">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                                    <TableRow>
                                        <TableHead className="pl-4 pr-2">Description</TableHead>
                                        <TableHead className="text-right px-2">Amount (KES)</TableHead>
                                        <TableHead className="w-[60px] pr-4 pl-2"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groupedBudgetItems[key as BudgetItemCategory].map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium max-w-[150px] truncate pl-4 pr-2" title={item.description}>{item.description}</TableCell>
                                            <TableCell className="text-right font-mono px-2">{formatCurrency(item.amount)}</TableCell>
                                            <TableCell className="text-right pr-4 pl-2 py-1">
                                                <div className="flex justify-end items-center gap-0.5">
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditClick(item)}><Edit className="h-3 w-3" /><span className="sr-only">Edit</span></Button>
                                                    <AlertDialog open={itemToDelete?.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
                                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-6 w-6" onClick={() => handleDeleteClick(item)}>
                                                            <Trash2 className="h-3 w-3" /><span className="sr-only">Delete</span>
                                                        </Button>
                                                        {itemToDelete && itemToDelete.id === item.id && (
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                                    <AlertDialogDescription>Delete: <strong>{itemToDelete.description} ({formatCurrency(itemToDelete.amount)})</strong> for {formatPeriodForDisplay(itemToDelete.period)}?</AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter><AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction></AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        )}
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                      ) : (
                        <p className="text-center text-muted-foreground py-10 text-sm">No {name.toLowerCase()} items budgeted for {formatPeriodForDisplay(budgetPeriod)}.</p>
                      )}
                  </AccordionContent>
             </AccordionItem>
         ))}
         </Accordion>
      </main>

        <Separator className="my-8 mx-4 md:mx-6 lg:mx-8" />
        <Card className="shadow-sm mx-4 md:mx-6 lg:mx-8">
            <CardHeader className="p-6"><CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Budget History</CardTitle><CardDescription>View snapshots of your saved budgets from previous months. (Feature coming soon)</CardDescription></CardHeader>
            <CardContent className="p-6"><div className="text-center text-muted-foreground py-10"><p>Budget history snapshots will be listed here once saved.</p></div></CardContent>
        </Card>

        <BudgetItemFormSheet isOpen={isFormSheetOpen} onClose={handleFormSheetClose} item={editingItem} initialCategory={categoryForNewItem} />
    </div>
  );
}

    