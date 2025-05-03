
// src/app/(dashboard)/weekly-review/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useBudgetStore, selectTotalGoals } from '@/store/budgetStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore'; // Import the new store
import { startOfWeek, endOfWeek, format, subWeeks, addWeeks } from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId } from '@/lib/types';
import { cn } from '@/lib/utils';

// Formatting Functions
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function WeeklyReviewPage() {
  const { toast } = useToast();
  const transactions = useTransactionsStore((state) => state.transactions);
  const budgetGoals = useBudgetStore((state) => state.budgetItems.filter(item => item.category === 'goal'));
  const totalBudgetedGoalsAmount = useBudgetStore(selectTotalGoals); // Use selector for total goal amount

  // Weekly Review Store
  const { reviews, setJournalEntry, getReviewForWeek } = useWeeklyReviewStore();

  // State for the selected week
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday as start
  const [journalEntry, setJournalEntry] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const currentWeekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart]);
  const currentWeekKey = useMemo(() => getWeekKey(currentWeekStart), [currentWeekStart]);

  // Effect to load journal entry when the week changes
  useEffect(() => {
    const reviewData = getReviewForWeek(currentWeekKey);
    setJournalEntry(reviewData?.journal || '');
  }, [currentWeekKey, getReviewForWeek]);

  // Filter transactions for the selected week
  const weeklyTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        return !isNaN(txDate.getTime()) && txDate >= currentWeekStart && txDate <= currentWeekEnd;
      })
      .sort((a, b) => { // Sort by date descending within the week
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
            return dateB.getTime() - dateA.getTime();
         });
  }, [transactions, currentWeekStart, currentWeekEnd]);

  // Calculate weekly summary
  const weeklySummary = useMemo(() => {
    const income = weeklyTransactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const expenses = weeklyTransactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const netFlow = income - expenses;
    return { income, expenses, netFlow };
  }, [weeklyTransactions]);

  // Handlers for week navigation
  const goToPreviousWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  };

  const goToNextWeek = () => {
    // Prevent going into the future beyond the current week
    if (currentWeekEnd < startOfWeek(new Date(), { weekStartsOn: 1 })) {
        setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    } else {
        toast({ title: "Future Travel Denied!", description: "Cannot review future weeks.", variant: "default" });
    }
  };

  // Handler for saving journal entry
  const handleSaveJournal = useCallback(() => {
    setIsSaving(true);
    try {
      setJournalEntry(currentWeekKey, journalEntry);
      toast({ title: 'Journal Saved', description: `Review for week of ${format(currentWeekStart, 'PP')} saved.` });
    } catch (error) {
      console.error("Error saving journal:", error);
      toast({ title: 'Save Failed', description: 'Could not save journal entry.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [currentWeekKey, journalEntry, setJournalEntry, toast, currentWeekStart]);


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" /> Weekly Financial Review
          </h1>
          <p className="text-muted-foreground">
            Reflect on your financial activity and progress for the week.
          </p>
        </div>
         {/* Week Navigation */}
        <div className="flex items-center gap-2">
           <Button variant="outline" size="icon" onClick={goToPreviousWeek} className="h-8 w-8">
             <ChevronLeft className="h-4 w-4" />
             <span className="sr-only">Previous Week</span>
           </Button>
           <span className="text-sm font-medium w-48 text-center">
             {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}
           </span>
           <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-8 w-8" disabled={currentWeekEnd >= startOfWeek(new Date(), { weekStartsOn: 1 })}>
             <ChevronRight className="h-4 w-4" />
             <span className="sr-only">Next Week</span>
           </Button>
         </div>
      </header>

      <main className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Weekly Summary & Transactions */}
        <div className="space-y-6">
            {/* Weekly Summary Card */}
            <Card>
                 <CardHeader>
                    <CardTitle>Weekly Summary</CardTitle>
                    <CardDescription>Overview of your income and expenses for this week.</CardDescription>
                 </CardHeader>
                 <CardContent className="grid grid-cols-3 gap-4 text-sm">
                     <div className="flex flex-col p-3 rounded-md border bg-accent/10">
                        <span className="text-muted-foreground mb-1">Income</span>
                        <span className="font-bold text-lg font-mono text-accent">{formatCurrency(weeklySummary.income)}</span>
                    </div>
                     <div className="flex flex-col p-3 rounded-md border bg-destructive/10">
                        <span className="text-muted-foreground mb-1">Expenses</span>
                        <span className="font-bold text-lg font-mono text-destructive">{formatCurrency(weeklySummary.expenses)}</span>
                    </div>
                     <div className="flex flex-col p-3 rounded-md border bg-muted">
                        <span className="text-muted-foreground mb-1">Net Flow</span>
                        <span className={cn("font-bold text-lg font-mono", weeklySummary.netFlow >= 0 ? 'text-accent' : 'text-destructive')}>
                            {formatCurrency(weeklySummary.netFlow)}
                        </span>
                    </div>
                 </CardContent>
            </Card>

             {/* Weekly Transactions Card */}
             <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle>Weekly Transactions</CardTitle>
                    <CardDescription>All transactions recorded during this week.</CardDescription>
                 </CardHeader>
                 <CardContent className="flex-grow p-0">
                    <ScrollArea className="h-[400px] w-full">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Amount (KES)</TableHead>
                                    {/* Add Note column in future */}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {weeklyTransactions.length > 0 ? (
                                    weeklyTransactions.map((tx) => (
                                        <TableRow key={tx.id}>
                                            <TableCell>{formatDate(tx.date)}</TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={tx.description}>{tx.description}</TableCell>
                                             <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>
                                                {formatCurrency(tx.amount)}
                                            </TableCell>
                                            {/* Future: Add input for transaction note */}
                                         </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                            No transactions recorded for this week.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                 </CardContent>
             </Card>
        </div>

        {/* Right Column: Goals & Journal */}
        <div className="space-y-6">
            {/* Financial Goals Card */}
             <Card>
                <CardHeader>
                    <CardTitle>Financial Goals</CardTitle>
                    <CardDescription>Your current financial goals from the budget.</CardDescription>
                </CardHeader>
                 <CardContent>
                    {budgetGoals.length > 0 ? (
                        <ul className="space-y-2 text-sm">
                            {budgetGoals.map(goal => (
                                <li key={goal.id} className="flex justify-between items-center border-b pb-1">
                                    <span>{goal.description}</span>
                                    <Badge variant="secondary">{formatCurrency(goal.amount)}</Badge>
                                </li>
                            ))}
                             <li className="flex justify-between items-center pt-2 font-semibold border-t mt-2">
                                <span>Total Budgeted for Goals</span>
                                <span>{formatCurrency(totalBudgetedGoalsAmount)}</span>
                             </li>
                         </ul>
                    ) : (
                         <p className="text-muted-foreground text-center py-4">No financial goals set in the budget yet.</p>
                    )}
                </CardContent>
            </Card>

            {/* Journal Card */}
             <Card className="flex flex-col">
                <CardHeader>
                    <CardTitle>Weekly Journal</CardTitle>
                    <CardDescription>Reflect on your spending, savings, and goal progress this week.</CardDescription>
                </CardHeader>
                 <CardContent className="flex-grow flex flex-col gap-2">
                    <Label htmlFor="weekly-journal">Your Thoughts:</Label>
                    <Textarea
                        id="weekly-journal"
                        value={journalEntry}
                        onChange={(e) => setJournalEntry(e.target.value)}
                        placeholder="How did your spending align with your budget? Any progress towards goals? What can be improved?"
                        className="flex-grow min-h-[200px] text-sm" // Allow textarea to grow
                    />
                     <Button onClick={handleSaveJournal} disabled={isSaving} className="mt-2 w-full sm:w-auto self-end">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? 'Saving...' : 'Save Journal'}
                     </Button>
                 </CardContent>
             </Card>
        </div>
      </main>
    </div>
  );
}

