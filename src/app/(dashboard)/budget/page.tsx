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
import { Badge } from '@/components/ui/badge';
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
        "flex items-center justify-between w-full hover:bg-muted/10 transition-all border-b border-border/40", 
        props['data-state'] === 'open' ? 'bg-muted/5' : '', 
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
        className="flex-grow py-3 px-4 hover:no-underline flex items-center gap-3 text-left"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-add-button]')) {
            e.preventDefault(); 
          }
        }}
      >
        <div className="p-1.5 rounded-lg bg-primary/5 text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-grow min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground truncate max-w-[200px] sm:max-w-xs">{description}</p>
        </div>
        {itemCount > 0 && (
          <div className="text-right ml-auto mr-3 shrink-0">
            <p className="font-bold text-sm font-mono text-foreground">{formatCurrency(totalAmount)}</p>
            <p className="text-[10px] text-muted-foreground font-semibold">({itemCount} items)</p>
          </div>
        )}
      </ShadAccordionTrigger>
      <Button
          variant="outline"
          size="xs"
          onClick={(e) => {
            e.stopPropagation(); 
            onAddClick();
          }}
          className="h-7 px-2.5 mr-4 shrink-0 rounded-lg border-border/50 bg-background hover:bg-muted/20 text-xs font-bold"
          data-add-button 
          aria-label={`Add new ${title.replace(/s$/, '')} item`}
        >
        <PlusCircle className="mr-1 h-3 w-3 text-primary" />Add
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
  const { deleteBudgetItem, publishCurrentBudget, publishedBudgets, deletePublishedBudget } = useBudgetStore();

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
  const [viewingPublished, setViewingPublished] = useState<PublishedBudget | null>(null);
  const [publishedToDelete, setPublishedToDelete] = useState<PublishedBudget | null>(null);
  const [categoryForNewItem, setCategoryForNewItem] = useState<BudgetItemCategory>('recurring-expense');
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => {
    const currentPeriod = useBudgetStore.getState().budgetPeriod;
    if (!currentPeriod || !/^\d{4}-\d{2}$/.test(currentPeriod)) {
        return new Date();
    }
    return parse(currentPeriod, 'yyyy-MM', new Date());
  });

  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

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
  
  const confirmDeletePublished = () => {
      if (!publishedToDelete) return;
      deletePublishedBudget(publishedToDelete.id);
      setPublishedToDelete(null);
      toast({ title: 'Published Budget Deleted' });
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

  const expensePercentageOfIncome = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  return (
    <div className="flex flex-col min-h-screen w-full py-4 md:py-6 lg:py-8 space-y-6">
      {/* HEADER SECTION */}
      <header className="px-4 md:px-6 lg:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <PieChartIcon className="h-5 w-5 text-primary" /> Budget Management
          </h1>
          <p className="text-xs text-muted-foreground">Formulate, optimize, and archive your target monthly allocations.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap md:self-end">
          {/* MONTH SELECTOR */}
          <div className="flex items-center gap-1 border border-border/60 bg-card rounded-lg p-0.5 shadow-sm">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-muted" onClick={() => changeMonth('prev')}>
              <ChevronLeft size={14} className="text-muted-foreground" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="h-7 px-2.5 text-xs font-bold hover:bg-muted flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                  {formatPeriodForDisplay(budgetPeriod)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-xl border shadow-lg z-50">
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
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-muted" onClick={() => changeMonth('next')}>
              <ChevronRight size={14} className="text-muted-foreground" />
            </Button>
          </div>

          <Button onClick={toggleAllAccordions} variant="outline" size="xs" className="h-8 text-xs font-semibold rounded-lg border-border/60 bg-card hover:bg-muted/10">
            <ListCollapse className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
            {openAccordions.length === allCategoryKeys.length ? 'Collapse All' : 'Expand All'}
          </Button>

          <Button asChild variant="outline" size="xs" className="h-8 text-xs font-semibold rounded-lg border-border/60 bg-card hover:bg-muted/10">
            <Link href="/budget/import">
              <FileUp className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Import
            </Link>
          </Button>

          <Button onClick={handleExport} variant="outline" size="xs" disabled={budgetItemsForPeriod.length === 0} className="h-8 text-xs font-semibold rounded-lg border-border/60 bg-card hover:bg-muted/10">
            <FileDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Export
          </Button>

          <AlertDialog open={isPublishConfirmOpen} onOpenChange={setIsPublishConfirmOpen}>
            <Button 
              onClick={() => setIsPublishConfirmOpen(true)} 
              variant="default" 
              size="xs" 
              disabled={budgetItemsForPeriod.length === 0} 
              className="h-8 text-xs font-semibold rounded-lg shadow-sm bg-[#10b981] hover:bg-[#059669] text-white border-none shrink-0 flex items-center transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              <Send className="mr-1.5 h-3.5 w-3.5 text-white/90" /> Publish Snap
            </Button>
            <AlertDialogContent className="rounded-2xl border border-border/60 bg-background max-w-md p-5 shadow-lg">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
                  <Send className="h-5 w-5 text-emerald-500 animate-pulse-subtle" /> Publish Budget Snapshot?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground mt-1.5">
                  This will capture a static snapshot of your monthly target allocations for <strong className="text-foreground">{formatPeriodForDisplay(budgetPeriod)}</strong>.
                  <br /><br />
                  The snapshot will be archived in the snapshot history ledger below and can be previewed or audited at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4 gap-2">
                <AlertDialogCancel className="rounded-xl text-xs h-9 font-semibold border-border/60" onClick={() => setIsPublishConfirmOpen(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction 
                  className="rounded-xl text-xs h-9 font-bold bg-[#10b981] hover:bg-[#059669] text-white border-none shadow-sm"
                  onClick={() => {
                    handlePublish();
                    setIsPublishConfirmOpen(false);
                  }}
                >
                  Confirm & Save Snapshot
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      {/* BENTO GRID SUMMARY CARDS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 md:px-6 lg:px-8">
        {/* TOTAL INCOME CARD */}
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Budgeted Monthly Inflows</span>
            <span className="p-1.5 rounded-lg bg-primary/5 text-primary border border-primary/10">
              <DollarSign className="h-3.5 w-3.5" />
            </span>
          </div>
          <div>
            <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">{formatCurrency(totalIncome)}</h3>
            <p className="text-[11px] text-muted-foreground mt-1">Sum of all expected salary, investments, and dividend inflows.</p>
          </div>
          <div className="pt-2 border-t border-border/40 flex items-center gap-1.5 text-xs font-semibold text-foreground bg-foreground/[0.02] p-1.5 rounded-lg">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground shrink-0 animate-pulse" />
            100% Allocation Capacity Available
          </div>
        </div>

        {/* TOTAL BUDGETED EXPENSES */}
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target Outflows</span>
            <span className="p-1.5 rounded-lg bg-foreground/5 text-foreground border border-border">
              <TrendingDown className="h-3.5 w-3.5" />
            </span>
          </div>
          <div>
            <h3 className="text-2xl font-bold font-mono tracking-tight text-foreground">{formatCurrency(totalExpenses)}</h3>
            <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground mt-1 font-semibold">
              <span>Exp: {formatCurrency(totalRecurringExpenses + totalOneTimeExpenses)}</span>
              <span>•</span>
              <span>Goals: {formatCurrency(totalGoals)}</span>
              <span>•</span>
              <span>Debt: {formatCurrency(totalDebtAllocation)}</span>
            </div>
          </div>
          <div className="pt-2 border-t border-border/40 flex flex-col space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
              <span>Income Consumed:</span>
              <span>{expensePercentageOfIncome.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div 
                className={cn("h-full transition-all duration-500 rounded-full", expensePercentageOfIncome > 100 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(expensePercentageOfIncome, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* NET EXPECTED */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="p-4 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Projected Net Balance</span>
                <Badge variant={netBudgeted >= 0 ? 'outline' : 'secondary'} className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 border/50 uppercase",
                  netBudgeted >= 0 ? "bg-primary/5 text-primary border-primary/15" : "bg-destructive/5 text-destructive border-destructive/15"
                )}>
                  {netBudgeted >= 0 ? 'Surplus' : 'Shortfall'}
                </Badge>
              </div>
              <div>
                <h3 className={cn("text-2xl font-bold font-mono tracking-tight", netBudgeted >= 0 ? 'text-primary' : 'text-destructive')}>{formatCurrency(netBudgeted)}</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {netBudgeted > 0 ? `${formatCurrency(netBudgeted)} left to allocate.` : netBudgeted < 0 ? `${formatCurrency(Math.abs(netBudgeted))} over-budgeted!` : 'Perfect zero-based budget.'}
                </p>
              </div>
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1 hover:text-primary">
                  Click for insights
                </span>
                <span className="text-[10px] uppercase font-bold text-primary">Zero-Based Goal</span>
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 rounded-xl border shadow-lg z-50">
            <h4 className="font-bold text-sm text-foreground mb-1">Zero-Based Budget Tip</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Aim for exactly <strong className="font-mono text-primary">0.00</strong>. This means every single shilling of your income has a designated purpose, whether spent, saved in your goals, or paid towards debts.
            </p>
          </PopoverContent>
        </Popover>
      </section>

      {/* ACCORDION CATEGORIES */}
      <main className="px-4 md:px-6 lg:px-8 space-y-4">
        <Accordion type="multiple" className="w-full space-y-4" value={openAccordions} onValueChange={setOpenAccordions}>
         {budgetCategories.map(({ name, key, icon: Icon, description }) => {
            const itemsForCategory = groupedBudgetItems[key as BudgetItemCategory] || [];
            const totalForCategory = itemsForCategory.reduce((sum, item) => sum + (item.amount || 0), 0);
            return (
              <AccordionItem value={key} key={key} className="border border-border shadow-sm rounded-2xl overflow-hidden bg-card">
                  <AccordionTriggerWithActions
                    title={name}
                    description={description}
                    icon={Icon}
                    onAddClick={() => handleAddClick(key as BudgetItemCategory)}
                    itemCount={itemsForCategory.length}
                    totalAmount={totalForCategory}
                  />
                  <AccordionContent className="p-0 border-t border-border/40">
                      {itemsForCategory.length > 0 ? (
                        <div className="divide-y divide-border/30 max-h-[300px] overflow-y-auto">
                          {itemsForCategory.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-3 px-4 hover:bg-muted/10 transition-all">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate max-w-[180px] sm:max-w-md" title={item.description}>
                                  {item.description}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{formatPeriodForDisplay(item.period)}</p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="font-bold font-mono text-xs text-foreground">{formatCurrency(item.amount)}</span>
                                <div className="flex items-center gap-1.5 border-l border-border/40 pl-3">
                                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-muted" onClick={() => handleEditClick(item)}>
                                    <Edit className="h-3 w-3 text-muted-foreground" />
                                    <span className="sr-only">Edit</span>
                                  </Button>
                                  
                                  <AlertDialog open={itemToDelete?.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7 rounded-lg hover:bg-destructive/10" onClick={() => handleDeleteClick(item)}>
                                      <Trash2 className="h-3 w-3" />
                                      <span className="sr-only">Delete</span>
                                    </Button>
                                    {itemToDelete && itemToDelete.id === item.id && (
                                        <AlertDialogContent className="rounded-2xl">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle className="text-base font-bold">Delete allocation item?</AlertDialogTitle>
                                                <AlertDialogDescription className="text-xs">
                                                  Delete <strong>{itemToDelete.description} ({formatCurrency(itemToDelete.amount)})</strong> for {formatPeriodForDisplay(itemToDelete.period)}? This action is permanent.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel className="rounded-lg text-xs" onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
                                              <AlertDialogAction className="rounded-lg text-xs" onClick={confirmDeleteItem}>Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    )}
                                  </AlertDialog>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                          <p className="text-xs text-muted-foreground font-semibold">No target allocations structured for {formatPeriodForDisplay(budgetPeriod)} yet.</p>
                          <Button variant="link" size="xs" onClick={() => handleAddClick(key as BudgetItemCategory)} className="text-[11px] font-bold mt-1 text-primary">
                            Add custom item row →
                          </Button>
                        </div>
                      )}
                  </AccordionContent>
              </AccordionItem>
            );
        })}
         </Accordion>
      </main>

      {/* BUDGET SNAPSHOT LEDGER (HISTORY) */}
      <section className="px-4 md:px-6 lg:px-8">
        <Card className="shadow-sm rounded-2xl border border-border overflow-hidden">
          <CardHeader className="p-5 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Budget snapshot ledger
            </CardTitle>
            <CardDescription className="text-[11px]">Audit and review snapshots archived from previous fiscal months.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {Object.keys(publishedBudgets).length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/40 hover:bg-transparent bg-muted/5">
                      <TableHead className="pl-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Published Snap Date</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Budget Month</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Projected Net Snap</TableHead>
                      <TableHead className="text-right pr-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/30">
                    {Object.values(publishedBudgets).sort((a,b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).map(pb => (
                      <TableRow key={pb.id} className="hover:bg-muted/5">
                        <TableCell className="pl-6 font-semibold text-xs text-foreground">{format(new Date(pb.publishedAt), 'PPpp')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-semibold">{formatPeriodForDisplay(pb.period)}</TableCell>
                        <TableCell className={cn("font-bold font-mono text-xs", pb.net >= 0 ? 'text-primary' : 'text-destructive')}>{formatCurrency(pb.net)}</TableCell>
                        <TableCell className="text-right pr-6 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="outline" size="xs" onClick={() => setViewingPublished(pb)} className="h-7 text-[10px] font-bold rounded-lg border-border/50 hover:bg-muted/15">
                              Preview
                            </Button>
                            
                            <AlertDialog open={publishedToDelete?.id === pb.id} onOpenChange={(open) => !open && setPublishedToDelete(null)}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setPublishedToDelete(pb)}>
                                <Trash2 className="h-3 w-3" />
                                <span className="sr-only">Delete snap</span>
                              </Button>
                              {publishedToDelete && publishedToDelete.id === pb.id && (
                                  <AlertDialogContent className="rounded-2xl">
                                      <AlertDialogHeader>
                                          <AlertDialogTitle className="text-base font-bold">Delete published snapshot?</AlertDialogTitle>
                                          <AlertDialogDescription className="text-xs leading-relaxed">
                                              This will permanently delete the budget snapshot for <strong>{formatPeriodForDisplay(publishedToDelete.period)}</strong> published on <strong>{format(new Date(publishedToDelete.publishedAt), 'PP')}</strong>. This action cannot be reversed.
                                          </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                          <AlertDialogCancel className="rounded-lg text-xs" onClick={() => setPublishedToDelete(null)}>Cancel</AlertDialogCancel>
                                          <AlertDialogAction className="rounded-lg text-xs" onClick={confirmDeletePublished}>Delete Snapshot</AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                              )}
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-12 px-6">
                <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs font-semibold">No saved snapshots registered in budget history ledger.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* SLIDE PANELS & FORM ACTIONS */}
      <BudgetItemFormSheet isOpen={isFormSheetOpen} onClose={handleFormSheetClose} item={editingItem} initialCategory={categoryForNewItem} />

      <PublishedBudgetPreviewDialog
          isOpen={!!viewingPublished}
          onClose={() => setViewingPublished(null)}
          publishedBudget={viewingPublished}
      />
    </div>
  );
}
