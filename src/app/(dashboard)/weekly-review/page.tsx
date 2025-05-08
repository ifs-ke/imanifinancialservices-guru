'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore';
// Import budget store and selectors/actions
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalRecurringExpenses, selectTotalOneTimeExpenses, selectTotalGoals, selectTotalBudgetedDebt, selectNetBudgeted } from '@/store/budgetStore';
// import { useAuth } from '@clerk/nextjs'; // Clerk disabled
import { startOfWeek, endOfWeek, format, subWeeks, addWeeks, getISOWeek } from 'date-fns'; // Removed differenceInDays as it's not used directly here
import { CalendarCheck, ChevronLeft, ChevronRight, Save, Search, Info, Loader2, MessageSquarePlus, MessageSquareText, Trash2, Edit, XCircle, BookOpen, TrendingUp, TrendingDown, Scale, CheckCircle, AlertTriangle as AlertTriangleIcon, Share2, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, WeeklyReviewData, UserShareInfo } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ShareReviewDialog from './ShareReviewDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter, // Import DialogFooter
  DialogClose
} from "@/components/ui/dialog"; // Import Dialog components
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert components

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

// Helper function to format Date for display
const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    // Format as "MMM d, yyyy" (e.g., "May 7, 2024")
    return format(dateObj, 'PP');
};

// Helper function to format Date object to "YYYY-MM" period string
const formatToPeriodKey = (date: Date): string => {
    return format(date, 'yyyy-MM');
}


// Helper to format category badges
const formatCategoryBadge = (value: string | undefined) => {
    if (!value) return null;
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="ml-2 text-xs font-normal">{text}</Badge>;
}

export default function WeeklyReviewPage() {
  // const { userId } = useAuth(); // Clerk disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

  const { transactions: allTransactions } = useTransactionsStore();
  // Get budget state and actions
  const setBudgetPeriod = useBudgetStore(state => state.setBudgetPeriod);
  // Use selectors directly (they depend on the current budgetPeriod in the store)
  const monthlyBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const monthlyBudgetedExpenses = useBudgetStore(selectTotalRecurringExpenses);
  const monthlyBudgetedGoals = useBudgetStore(selectTotalGoals);
  const monthlyBudgetedDebt = useBudgetStore(selectTotalBudgetedDebt);
  const monthlyNetBudgeted = useBudgetStore(selectNetBudgeted);


  const {
    ownedReviews,
    sharedReviews,
    setJournalEntry,
    setTransactionComment,
    deleteTransactionComment,
    getReviewForWeek,
  } = useWeeklyReviewStore();

  const { toast } = useToast();

  // State for the selected week
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday as start
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false);
  const [commentingTransaction, setCommentingTransaction] = useState<TransactionWithId | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isDeleteCommentDialogOpen, setIsDeleteCommentDialogOpen] = useState(false);
  const [isDeleteJournalDialogOpen, setIsDeleteJournalDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<{ transactionId: string; comment: string } | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"owned" | "shared">("owned");

  const currentWeekKey = useMemo(() => getWeekKey(currentWeekStart), [currentWeekStart]);

  // Effect to sync the budget period with the selected week
  useEffect(() => {
      const correspondingMonthPeriod = formatToPeriodKey(currentWeekStart);
      setBudgetPeriod(correspondingMonthPeriod);
      // // console.log(`Weekly Review: Set budget period to ${correspondingMonthPeriod} for week starting ${formatDate(currentWeekStart)}`); // Console log commented out
  }, [currentWeekStart, setBudgetPeriod]);


   // Determine the review data based on the active tab and week key
   const currentReview = useMemo(() => {
        if (activeTab === 'owned') {
            return ownedReviews[currentWeekKey];
        } else {
             return sharedReviews[currentWeekKey];
        }
    }, [activeTab, currentWeekKey, ownedReviews, sharedReviews]);

    // Determine the owner ID of the currently viewed review
    const currentReviewOwnerId = useMemo(() => {
        return currentReview?.ownerId || (activeTab === 'owned' ? userId : null);
    }, [currentReview, activeTab, userId]);

     // Get journal entry safely from the potentially undefined review
     const journalEntry = currentReview?.journal || '';


  // Filter transactions for the selected week (owned transactions)
  const transactionsForWeek = useMemo(() => {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    return allTransactions.filter(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
         if (isNaN(txDate.getTime())) return false;
        return txDate >= currentWeekStart && txDate <= weekEnd;
    }).sort((a, b) => {
         const dateA = a.date instanceof Date ? a.date : new Date(a.date);
         const dateB = b.date instanceof Date ? b.date : new Date(b.date);
         if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
         return dateB.getTime() - dateA.getTime();
     });
  }, [allTransactions, currentWeekStart]);

  // Filter transactions based on search term
  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactionsForWeek;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return transactionsForWeek.filter(tx =>
      tx.description.toLowerCase().includes(lowerSearchTerm) ||
      tx.amount.toString().includes(lowerSearchTerm) ||
       tx.modeOfPayment.toLowerCase().includes(lowerSearchTerm) ||
       (currentReview?.transactionComments?.[tx.id] || '').toLowerCase().includes(lowerSearchTerm)
    );
  }, [transactionsForWeek, searchTerm, currentReview]);

  // --- Journal Handling ---
   const handleJournalChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
       if (activeTab === 'owned' && userId) {
           setJournalEntry(currentWeekKey, event.target.value, userId);
       } else {
           toast({ title: "Read Only", description: "You can only edit journals for your own reviews.", variant: "default" });
       }
   };

    const handleDeleteJournal = () => {
        if (activeTab === 'owned' && userId) {
            setIsDeleteJournalDialogOpen(true);
        } else {
            toast({ title: "Action Denied", description: "You can only delete journals from your own reviews.", variant: "destructive" });
        }
    };

    const confirmDeleteJournal = () => {
        if (activeTab === 'owned' && userId) {
            setJournalEntry(currentWeekKey, '', userId);
            toast({ title: "Journal Cleared", description: `Journal entry for week ${currentWeekKey} has been cleared.` });
        }
        setIsDeleteJournalDialogOpen(false);
    };

  // --- Comment Handling ---
  const isReadOnly = activeTab === 'shared'; // Determine if the current view is read-only

  const handleAddCommentClick = (tx: TransactionWithId) => {
    if (isReadOnly) {
      toast({ title: "Read Only", description: "Cannot add comments to a shared review.", variant: "default" });
      return;
    }
    setCommentingTransaction(tx);
    setCommentText(currentReview?.transactionComments?.[tx.id] || '');
    setIsCommentDialogOpen(true);
  };

  const handleSaveComment = () => {
     if (activeTab === 'owned' && commentingTransaction && userId) {
         setTransactionComment(currentWeekKey, commentingTransaction.id, commentText, userId);
         toast({ title: "Comment Saved", description: `Comment for "${commentingTransaction.description}" saved.` });
         setIsCommentDialogOpen(false);
         setCommentingTransaction(null);
         setCommentText('');
     } else {
         toast({ title: "Read Only", description: "You can only comment on your own weekly reviews.", variant: "default" });
         setIsCommentDialogOpen(false);
     }
  };

  const handleDeleteCommentClick = (transactionId: string) => {
     const comment = currentReview?.transactionComments?.[transactionId];
      if (activeTab === 'owned' && comment && userId) {
         setCommentToDelete({ transactionId, comment });
         setIsDeleteCommentDialogOpen(true);
     } else {
        toast({ title: "Read Only", description: "You can only delete comments from your own weekly reviews.", variant: "default" });
     }
  };

  const confirmDeleteComment = () => {
     if (activeTab === 'owned' && commentToDelete && userId) {
        deleteTransactionComment(currentWeekKey, commentToDelete.transactionId, userId);
        toast({ title: "Comment Deleted" });
    }
    setIsDeleteCommentDialogOpen(false);
    setCommentToDelete(null);
  };


  // --- Week Navigation ---
  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));


  // --- Weekly Metrics Calculation (Now uses Budget Store Selectors) ---
  const weeklyMetrics = useMemo(() => {
      const income = transactionsForWeek
          .filter(tx => tx.amount > 0)
          .reduce((sum, tx) => sum + tx.amount, 0);

      const expenses = transactionsForWeek
          .filter(tx => tx.amount < 0)
          .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const netFlow = income - expenses;

      // Prorate the *monthly* budget figures for the *current* period to a weekly estimate
      const daysInWeek = 7;
      // const daysInAvgMonth = 30.44;
      // const budgetMultiplier = daysInWeek / daysInAvgMonth;

      const netBudgetedWeekly = monthlyNetBudgeted; // Use selector result
      const variance = netFlow - netBudgetedWeekly;

      let varianceStatus: 'favorable' | 'unfavorable' | 'on-track' | 'no-budget' = 'no-budget';
       // Check if there's *any* budget data for the month
       if (monthlyBudgetedIncome > 0 || monthlyBudgetedExpenses > 0 || monthlyBudgetedGoals > 0 || monthlyBudgetedDebt > 0) {
           const threshold = Math.max(Math.abs(netBudgetedWeekly * 0.05), 50); // 5% or 50 KES threshold for the week
           if (Math.abs(variance) <= threshold) varianceStatus = 'on-track';
           else if (variance > 0) varianceStatus = 'favorable'; // More net income than budgeted net for the week
           else varianceStatus = 'unfavorable'; // Less net income than budgeted net for the week
       }

      return {
          totalIncome: income,
          totalExpenses: expenses,
          netCashFlow: netFlow,
          budgetVariance: variance,
          budgetVarianceStatus: varianceStatus,
          transactionCount: transactionsForWeek.length,
      };
  }, [
      transactionsForWeek,
      monthlyBudgetedIncome, // Depend on the selected values from the store
      monthlyBudgetedExpenses,
      monthlyBudgetedGoals,
      monthlyBudgetedDebt,
      monthlyNetBudgeted
  ]);

  // --- Sharing ---
  const handleOpenShareDialog = () => {
      if (activeTab !== 'owned') {
          toast({ title: "Action Denied", description: "You can only share reviews you own.", variant: "destructive" });
          return;
      }
       if (!ownedReviews[currentWeekKey] && userId) {
           setJournalEntry(currentWeekKey, '', userId);
           // // console.log(`Created shell for week ${currentWeekKey} before sharing.`); // Console log commented out
       }
      setIsShareDialogOpen(true);
  };

  // --- UI ---


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div>
             <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                 <CalendarCheck className="h-6 w-6 text-primary" /> Weekly Review
             </h1>
             <p className="text-muted-foreground">
                 Review transactions, add comments, and journal your financial progress week by week.
             </p>
         </div>
         <Button onClick={handleOpenShareDialog} variant="outline" disabled={activeTab !== 'owned'}>
             <Share2 className="mr-2 h-4 w-4" /> Share This Week
         </Button>
      </header>

       <Card className="shadow-sm">
           <CardContent className="p-4 flex items-center justify-between">
               <Button variant="outline" size="icon" onClick={goToPreviousWeek} aria-label="Previous week">
                 <ChevronLeft className="h-4 w-4" />
               </Button>
               <div className="text-center">
                 <p className="font-semibold text-lg">Week {getISOWeek(currentWeekStart)}</p>
                 <p className="text-sm text-muted-foreground">
                   {format(currentWeekStart, 'MMM d')} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
                 </p>
               </div>
               <Button variant="outline" size="icon" onClick={goToNextWeek} aria-label="Next week">
                 <ChevronRight className="h-4 w-4" />
               </Button>
           </CardContent>
       </Card>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "owned" | "shared")}>
             <TabsList className="grid w-full grid-cols-2 mb-4">
                 <TabsTrigger value="owned">My Reviews</TabsTrigger>
                 <TabsTrigger value="shared">Shared With Me ({Object.keys(sharedReviews).length})</TabsTrigger>
             </TabsList>

             {/* Owned Reviews Tab Content */}
             <TabsContent value="owned">
                 {/* Layout for Owned Reviews */}
                 <div className="grid gap-6 lg:grid-cols-3">
                      {/* Transaction List & Comments (Left/Main Panel) */}
                      <div className="lg:col-span-2 space-y-4">
                           <div className="flex gap-2">
                              <Input type="search" placeholder="Search your transactions or comments..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9" />
                           </div>
                          <Card className="shadow-sm">
                              <CardHeader className="p-4 border-b"><CardTitle className="text-base">Transactions & Comments</CardTitle><CardDescription>Click a transaction to add/edit comments.</CardDescription></CardHeader>
                              <CardContent className="p-0">
                                  <ScrollArea className="h-[400px] w-full">
                                      <Table>
                                          <TableHeader className="sticky top-0 bg-background z-10">
                                               <TableRow><TableHead className="w-[100px] pl-4">Date</TableHead><TableHead>Description</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount (KES)</TableHead><TableHead className="w-[150px] text-center pr-4">Comment</TableHead></TableRow>
                                           </TableHeader>
                                          <TableBody>
                                              {filteredTransactions.length > 0 ? (
                                                  filteredTransactions.map((tx) => {
                                                      const comment = currentReview?.transactionComments?.[tx.id];
                                                      return (
                                                          <TableRow key={tx.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleAddCommentClick(tx)} title={comment ? `Comment: ${comment}` : 'Add Comment'}>
                                                              <TableCell className="font-medium pl-4">{formatDate(tx.date)}</TableCell>
                                                              <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
                                                              <TableCell className="text-xs">{formatCategoryBadge(tx.frequency)}{formatCategoryBadge(tx.variability)}</TableCell>
                                                              <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(tx.amount)}</TableCell>
                                                              <TableCell className="text-center pr-4 text-xs">
                                                                  {comment ? (<div className="flex items-center justify-center gap-1"><MessageSquareText size={14} className="text-blue-500" /><span className='italic truncate max-w-[80px]'>"{comment}"</span></div>) : (<span className="text-muted-foreground italic">No comment</span>)}
                                                              </TableCell>
                                                          </TableRow>
                                                      );
                                                  })
                                              ) : ( <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">{searchTerm ? 'No transactions match your search.' : 'No transactions found for this week.'}</TableCell></TableRow> )}
                                          </TableBody>
                                      </Table>
                                  </ScrollArea>
                                   {/* Add/Edit Sheet */}
                                  {/*<AddCommentSheet isOpen={isCommentDialogOpen} onClose={handleFormSheetClose} item={editingItem} initialCategory={categoryForNewItem} />*/}
                              </CardContent>
                          </Card>
                      </div>
                      {/* Weekly Summary & Journal (Right Panel) */}
                      <div className="lg:col-span-1 space-y-4">
                           <Card className="shadow-sm">
                               <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Week Summary</CardTitle></CardHeader>
                               <CardContent className="p-4 text-sm space-y-2">
                                   <div className="flex justify-between items-center"><span className="text-muted-foreground">Transactions:</span><span className="font-medium">{weeklyMetrics.transactionCount}</span></div>
                                   <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><TrendingUp size={14}/> Income:</span><span className="font-mono font-semibold text-accent">{formatCurrency(weeklyMetrics.totalIncome)}</span></div>
                                   <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><TrendingDown size={14}/> Expenses:</span><span className="font-mono font-semibold text-destructive">{formatCurrency(weeklyMetrics.totalExpenses)}</span></div>
                                   <div className="flex justify-between items-center border-t pt-2 mt-2"><span className="text-muted-foreground flex items-center gap-1"><Scale size={14}/> Net Flow:</span><span className={cn("font-mono font-bold", weeklyMetrics.netCashFlow >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(weeklyMetrics.netCashFlow)}</span></div>
                                   <div className="flex justify-between items-center text-xs pt-1"><span className="text-muted-foreground">Budget Variance (vs. {format(currentWeekStart, 'MMM yyyy')} budget):</span><span className={cn("font-mono font-semibold", weeklyMetrics.budgetVarianceStatus === 'favorable' && 'text-accent', weeklyMetrics.budgetVarianceStatus === 'unfavorable' && 'text-destructive', weeklyMetrics.budgetVarianceStatus === 'on-track' && 'text-primary', weeklyMetrics.budgetVarianceStatus === 'no-budget' && 'text-muted-foreground italic')}>{weeklyMetrics.budgetVarianceStatus === 'no-budget' ? 'No Budget Data' : `${weeklyMetrics.budgetVariance >= 0 ? '+' : ''}${formatCurrency(weeklyMetrics.budgetVariance)} (${weeklyMetrics.budgetVarianceStatus.replace('-', ' ')})`}</span></div>
                               </CardContent>
                           </Card>
                           <Card className="shadow-sm">
                               <CardHeader className="p-4 pb-2 flex flex-row justify-between items-center">
                                   <div><CardTitle className="text-base flex items-center gap-1"><BookOpen size={16}/> Weekly Journal</CardTitle><CardDescription className="text-xs">Reflect on your financial progress.</CardDescription></div>
                                   {journalEntry && (<AlertDialog open={isDeleteJournalDialogOpen} onOpenChange={setIsDeleteJournalDialogOpen}><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0" onClick={handleDeleteJournal}><Trash2 size={16} /><span className="sr-only">Delete Journal Entry</span></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Journal Entry?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete the journal entry for week {currentWeekKey}? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteJournal}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}
                               </CardHeader>
                               <CardContent className="p-4 pt-0">
                                   <Textarea placeholder="Write your journal entry here..." value={journalEntry} onChange={handleJournalChange} rows={8} className="w-full text-sm" disabled={isReadOnly}/>
                               </CardContent>
                           </Card>
                      </div>
                 </div>
             </TabsContent>

             {/* Shared Reviews Tab Content */}
             <TabsContent value="shared">
                {Object.keys(sharedReviews).length > 0 ? (
                    <div className="space-y-4">
                        {/* TODO: Add a way to select *which* shared review to view if multiple exist for the same week */}
                        {/* For now, displaying the first one found for the currentWeekKey */}
                        {currentReview && currentReviewOwnerId !== userId ? (
                            <Alert>
                                <Users className="h-4 w-4" />
                                <AlertTitle>Viewing Shared Review</AlertTitle>
                                <AlertDescription>
                                    You are viewing the review for week {currentWeekKey} shared by user ID: {currentReviewOwnerId}. You cannot edit this review or its comments.
                                </AlertDescription>
                            </Alert>
                        ) : (
                             <Alert variant="destructive">
                                 <AlertTriangleIcon className="h-4 w-4" />
                                 <AlertTitle>No Shared Review Selected</AlertTitle>
                                 <AlertDescription>No shared review found or selected for week {currentWeekKey}.</AlertDescription>
                             </Alert>
                        )}

                         {/* Display shared review content (read-only) - Uses the same layout structure */}
                        {currentReview && currentReviewOwnerId !== userId && (
                             <div className="grid gap-6 lg:grid-cols-3">
                                  {/* Transaction List (Read-Only) */}
                                  <div className="lg:col-span-2 space-y-4">
                                      <Card className="shadow-sm">
                                          <CardHeader className="p-4 border-b"><CardTitle className="text-base">Shared Transactions</CardTitle><CardDescription>View transactions and comments for this shared week.</CardDescription></CardHeader>
                                          <CardContent className="p-0">
                                              <ScrollArea className="h-[400px] w-full">
                                                  {/* Note: Shared reviews don't inherently contain transactions. We show the OWNER's transactions for that week. */}
                                                  {/* This might need adjustment based on exact sharing requirements (e.g., share only comments/journal?) */}
                                                  {/* Assuming for now, viewing shared review shows owner's transactions + their comments */}
                                                  <Table>
                                                       <TableHeader className="sticky top-0 bg-background z-10">
                                                           <TableRow><TableHead className="w-[100px] pl-4">Date</TableHead><TableHead>Description</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount (KES)</TableHead><TableHead className="w-[150px] text-center pr-4">Comment</TableHead></TableRow>
                                                       </TableHeader>
                                                      <TableBody>
                                                          {transactionsForWeek.map((tx) => {
                                                              const comment = currentReview?.transactionComments?.[tx.id];
                                                              return (
                                                                  <TableRow key={tx.id} title={comment ? `Comment: ${comment}` : 'No Comment (Read-only)'}>
                                                                      <TableCell className="font-medium pl-4">{formatDate(tx.date)}</TableCell>
                                                                      <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
                                                                      <TableCell className="text-xs">{formatCategoryBadge(tx.frequency)}{formatCategoryBadge(tx.variability)}</TableCell>
                                                                      <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(tx.amount)}</TableCell>
                                                                      <TableCell className="text-center pr-4 text-xs">
                                                                           {comment ? (<div className="flex items-center justify-center gap-1"><MessageSquareText size={14} className="text-blue-500" /><span className='italic truncate max-w-[80px]'>"{comment}"</span></div>) : (<span className="text-muted-foreground italic">No comment</span>)}
                                                                      </TableCell>
                                                                  </TableRow>
                                                              );
                                                          })}
                                                      </TableBody>
                                                  </Table>
                                              </ScrollArea>
                                          </CardContent>
                                      </Card>
                                  </div>
                                  {/* Journal (Read-Only) */}
                                  <div className="lg:col-span-1 space-y-4">
                                      <Card className="shadow-sm">
                                          <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-1"><BookOpen size={16}/> Shared Journal</CardTitle></CardHeader>
                                          <CardContent className="p-4 pt-0">
                                              <Textarea placeholder="Journal entry (read-only)..." value={journalEntry} rows={8} className="w-full text-sm bg-muted/50 cursor-not-allowed" disabled={true}/>
                                              {!journalEntry && (<p className='text-xs italic text-muted-foreground mt-2 text-center py-4'>No journal entry shared for this week.</p>)}
                                          </CardContent>
                                      </Card>
                                  </div>
                             </div>
                        )}
                    </div>
                ) : (
                    <Card className="text-center py-10">
                        <CardContent>
                            <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-2" />
                            <p className="text-muted-foreground">No reviews have been shared with you yet.</p>
                        </CardContent>
                    </Card>
                 )}
             </TabsContent>
        </Tabs>

      {/* Add/Edit Comment Dialog */}
      <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comment on Transaction</DialogTitle>
            <DialogDescription>
              {commentingTransaction?.description} ({formatCurrency(commentingTransaction?.amount || 0)}) on {formatDate(commentingTransaction?.date || new Date())}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={activeTab === 'owned' ? "Add your comment here..." : "Comment (read-only)..."}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={4}
            className="w-full"
            disabled={isReadOnly} // Disable if viewing shared review
          />
          <DialogFooter>
              {/* Delete Comment Button - Show only if viewing owned review and comment exists */}
              {activeTab === 'owned' && commentingTransaction && currentReview?.transactionComments?.[commentingTransaction.id] && (
                   <Button variant="destructive" onClick={() => handleDeleteCommentClick(commentingTransaction!.id)} className="mr-auto">
                        <Trash2 className="mr-1 h-4 w-4"/> Delete Comment
                    </Button>
               )}
            <Button type="button" variant="outline" onClick={() => setIsCommentDialogOpen(false)}>Cancel</Button>
             {/* Disable save button if viewing shared review */}
            <Button onClick={handleSaveComment} disabled={isReadOnly}>Save Comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Comment Confirmation */}
       <AlertDialog open={isDeleteCommentDialogOpen} onOpenChange={setIsDeleteCommentDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Comment?</AlertDialogTitle>
             <AlertDialogDescription>
                {/* Ensure commentToDelete exists before accessing properties */}
               Are you sure you want to delete this comment? "{commentToDelete?.comment || ''}"
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel onClick={() => setCommentToDelete(null)}>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={confirmDeleteComment}>Delete</AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

        {/* Share Review Dialog */}
        <ShareReviewDialog
            isOpen={isShareDialogOpen}
            onClose={() => setIsShareDialogOpen(false)}
            weekKey={currentWeekKey}
        />

    </div>
  );
}
