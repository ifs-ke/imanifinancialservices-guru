// src/app/(dashboard)/budget/page.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Edit, PieChart as PieChartIcon, PlusCircle, Trash2, DollarSign, TrendingDown, Target, MinusCircle, Coins, FileUp, FileDown, History, Calendar as CalendarIcon, ChevronLeft, ChevronRight, ListCollapse, Send } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useBudgetStore, selectCurrentBudgetPeriod, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedExpenses, selectNetBudgeted, selectTotalBudgetedDebt } from '@/store/budgetStore';
import type { BudgetItem, BudgetItemCategory, PublishedBudget } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import BudgetItemFormSheet from './BudgetItemFormSheet';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, addMonths, subMonths, parse, isValid as isDateValid } from 'date-fns';
import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger as ShadAccordionTrigger } from "@/components/ui/accordion";
import PublishedBudgetPreviewDialog from './PublishedBudgetPreviewDialog';


const budgetCategories: { name: string; key: BudgetItemCategory; icon: React.ElementType; description: string; }[] = [
    { name: 'Income', key: 'income', icon: DollarSign, description: "Track all sources of income." },
    { name: 'Recurring Expenses', key: 'recurring-expense', icon: TrendingDown, description: "Regular, predictable expenses like rent or subscriptions." },
    { name: 'One-Time Expenses', key: 'one-time-expense', icon: MinusCircle, description: "Infrequent or non-repeating expenses." },
    { name: 'Goals', key: 'goal', icon: Target, description: "Allocate funds towards your financial goals." },
    { name: 'Debt Allocation', key: 'debt', icon: Coins, description: "Payments towards reducing outstanding debts." },
];
const allCategoryKeys = budgetCategories.map(c => c.key);


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
  HTMLDivElement, 
  React.HTMLAttributes<HTMLDivElement> & { 
    title: string;
    description: string;
    icon: React.ElementType;
    onAddClick: () => void;
    itemCount: number;
    totalAmount: number;
    'data-state'?: 'open' | 'closed';
    'id'?: string;
    'aria-controls'?: string;
    'aria-expanded'?: boolean;
    'aria-disabled'?: boolean;
    'disabled'?: boolean;
  }
>(({ title, description, icon: Icon, onAddClick, itemCount, totalAmount, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between w-full hover:bg-muted/50", 
        "rounded-t-lg data-[state=closed]:rounded-b-lg transition-all", 
        props['data-state'] === 'open' ? 'rounded-b-none' : '', 
        className
      )}
      data-state={props['data-state']} 
    >
      <ShadAccordionTrigger
        id={props.id}
        aria-controls={props['aria-controls']}
        aria-expanded={props['aria-expanded']}
        aria-disabled={props.disabled}
        data-state={props['data-state']}
        className={cn(
          "flex-grow p-4 hover:no-underline flex items-center gap-3 text-left",
           props['data-state'] === 'open' ? 'bg-muted/60' : ''
        )}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-add-button]')) {
            e.preventDefault(); 
          }
        }}
      >
        <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="flex-grow">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {itemCount > 0 && (
          <div className="text-right ml-auto mr-3 flex-shrink-0">
            <p className="font-semibold text-base text-foreground">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-muted-foreground">({itemCount} items)</p>
          </div>
        )}
      </ShadAccordionTrigger>
      <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation(); 
            onAddClick();
          }}
          className="h-7 px-2 mr-3 flex-shrink-0"
          data-add-button 
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
  const { deleteBudgetItem, publishCurrentBudget, publishedBudgets } = useBudgetStore();

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
  const [viewingPublished, setViewingPublished] = useState<PublishedBudget | null>(null);
  
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => {
    const currentPeriod = useBudgetStore.getState().budgetPeriod;
    if (!currentPeriod || !/^\d{4}-\d{2}$/.test(currentPeriod)) {
        return new Date();
    }
    return parse(currentPeriod, 'yyyy-MM', new Date());
  });

  const [openAccordions, setOpenAccordions] = useState<string[]>(allCategoryKeys);


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

    const toggleAllAccordions = () => {
        if (openAccordions.length === allCategoryKeys.length) {
            setOpenAccordions([]);
        } else {
            setOpenAccordions(allCategoryKeys);
        }
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

  const handlePublish = () => {
    publishCurrentBudget();
    toast({
        title: "Budget Published!",
        description: `A snapshot of the budget for ${formatPeriodForDisplay(budgetPeriod)} has been saved to history.`,
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
                             fromYear={new Date().getFullYear() - 5}
                             toYear={new Date().getFullYear() + 5}
                             initialFocus
                         />
                     </PopoverContent>
                 </Popover>
                 <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => changeMonth('next')}><ChevronRight size={16} /></Button>
             </div>
             <Button onClick={toggleAllAccordions} variant="outline" size="sm">
                <ListCollapse className="mr-2 h-4 w-4" />
                {openAccordions.length === allCategoryKeys.length ? 'Collapse All' : 'Expand All'}
             </Button>
             <Button asChild variant="outline" size="sm">
                <Link href="/budget/import">
                    <FileUp className="mr-2 h-4 w-4" /> Import
                </Link>
             </Button>
              <Button onClick={handleExport} variant="secondary" size="sm" disabled={budgetItemsForPeriod.length === 0}><FileDown className="mr-2 h-4 w-4" /> Export</Button>
              <Button onClick={handlePublish} variant="default" size="sm" disabled={budgetItemsForPeriod.length === 0}>
                 <Send className="mr-2 h-4 w-4" /> Publish
              </Button>
         </div>
      </header>

      <Card className="mb-6 mx-4 md:mx-6 lg:mx-8 shadow-md">
        <CardHeader className="p-6">
            <CardTitle>Budget Summary for {formatPeriodForDisplay(budgetPeriod)}</CardTitle>
            <CardDescription>Overview of your planned budget for the selected month.</CardDescription>
        </CardHeader>
         <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm p-6">
            <div className="flex flex-col p-3 rounded-md border bg-accent/10">
                <span className="text-muted-foreground mb-1">Total Income</span>
                <span className="font-bold text-lg font-mono text-accent">{formatCurrency(totalIncome)}</span>
            </div>
            <div className="flex flex-col p-3 rounded-md border bg-destructive/10">
                <span className="text-muted-foreground mb-1">Total Budgeted Spending</span>
                <span className="font-bold text-lg font-mono text-destructive">{formatCurrency(totalExpenses)}</span>
                <p className="text-xs text-muted-foreground mt-1">
                    Expenses: {formatCurrency(totalRecurringExpenses + totalOneTimeExpenses)},
                    Goals: {formatCurrency(totalGoals)},
                    Debt: {formatCurrency(totalDebtAllocation)}
                </p>
            </div>
            <div className="flex flex-col p-3 rounded-md border bg-muted">
                <span className="text-muted-foreground mb-1">Expected Net</span>
                <span className={cn("font-bold text-lg font-mono", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>{formatCurrency(netBudgeted)}</span>
                {netBudgeted !== 0 && (<span className={cn("text-xs mt-1", netBudgeted > 0 ? 'text-primary' : 'text-destructive')}>{netBudgeted > 0 ? `${formatCurrency(netBudgeted)} Left Over` : `${formatCurrency(Math.abs(netBudgeted))} Shortfall`}</span>)}
            </div>
        </CardContent>
      </Card>

      <main className="flex flex-col gap-4 px-4 md:px-6 lg:mx-8">
        <Accordion type="multiple" className="w-full space-y-4" value={openAccordions} onValueChange={setOpenAccordions}>
         {budgetCategories.map(({ name, key, icon: Icon, description }) => {
            const itemsForCategory = groupedBudgetItems[key as BudgetItemCategory] || [];
            const totalForCategory = itemsForCategory.reduce((sum, item) => sum + (item.amount || 0), 0);
            return (
             <AccordionItem value={key} key={key} className="border-none shadow-sm rounded-lg overflow-hidden bg-card">
                 <AccordionTriggerWithActions
                    title={name}
                    description={description}
                    icon={Icon}
                    onAddClick={() => handleAddClick(key as BudgetItemCategory)}
                    itemCount={itemsForCategory.length}
                    totalAmount={totalForCategory}
                  />
                  <AccordionContent className="p-0 border-t border-border">
                      {(itemsForCategory.length) > 0 ? (
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
                                    {itemsForCategory.map((item) => (
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
            );
        })}
         </Accordion>
      </main>

        <Separator className="my-8 mx-4 md:mx-6 lg:mx-8" />
        <Card className="shadow-sm mx-4 md:mx-6 lg:mx-8">
            <CardHeader className="p-6"><CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Budget History</CardTitle><CardDescription>View snapshots of your saved budgets from previous months.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {Object.keys(publishedBudgets).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Published Date</TableHead>
                      <TableHead>Budget Period</TableHead>
                      <TableHead>Net Amount</TableHead>
                      <TableHead className="text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(publishedBudgets).sort((a,b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).map(pb => (
                      <TableRow key={pb.id}>
                        <TableCell className="pl-6">{format(new Date(pb.publishedAt), 'PPpp')}</TableCell>
                        <TableCell>{formatPeriodForDisplay(pb.period)}</TableCell>
                        <TableCell className={cn("font-mono", pb.net >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(pb.net)}</TableCell>
                        <TableCell className="text-right pr-6">
                            <Button variant="outline" size="sm" onClick={() => setViewingPublished(pb)}>
                                Preview
                            </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-10 px-6"><p>Budget history snapshots will be listed here once saved.</p></div>
              )}
            </CardContent>
        </Card>

        <BudgetItemFormSheet isOpen={isFormSheetOpen} onClose={handleFormSheetClose} item={editingItem} initialCategory={categoryForNewItem} />

        <PublishedBudgetPreviewDialog
            isOpen={!!viewingPublished}
            onClose={() => setViewingPublished(null)}
            publishedBudget={viewingPublished}
        />
    </div>
  );
}
