
// src/app/(dashboard)/weekly-review/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore';
import { useBudgetStore, selectNetBudgeted } from '@/store/budgetStore'; // Import selectNetBudgeted for variance calculation
// import { useAuth } from '@clerk/nextjs'; // Clerk disabled
import { startOfWeek, endOfWeek, format, subWeeks, addWeeks, parseISO, startOfISOWeek, endOfISOWeek, getYear, getISOWeek, differenceInDays } from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, Save, Search, Info, Loader2, MessageSquarePlus, MessageSquareText, Trash2, Edit, XCircle, BookOpen, TrendingUp, TrendingDown, Scale, CheckCircle, AlertTriangle as AlertTriangleIcon, Share2, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, BudgetItemCategory, BudgetItem, WeeklyReviewData, UserShareInfo } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ShareReviewDialog from './ShareReviewDialog'; // Corrected import (should already be correct as default)
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog"; // Import Dialog components

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

// Helper function to format Date for display
const formatDate = (date: Date | string) => {
     const dateObj = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
    // Format as "MMM d, yyyy" (e.g., "May 7, 2024")
    return format(dateObj, 'PP');
};

// Helper to format category badges
const formatCategoryBadge = (value: string | undefined) => {
    if (!value) return null; // Don't render anything if no value
    const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
    const text = value.charAt(0).toUpperCase() + value.slice(1);
    return <Badge variant={variant} className="ml-2 text-xs font-normal">{text}</Badge>;
}

export default function WeeklyReviewPage() {
  // const { userId } = useAuth(); // Clerk disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

  const { transactions: allTransactions } = useTransactionsStore();
  const budgetItems = useBudgetStore(state => state.budgetItems);
  const {
    ownedReviews,
    sharedReviews,
    setJournalEntry,
    setTransactionComment,
    deleteTransactionComment,
    getReviewForWeek,
    getTransactionComment,
  } = useWeeklyReviewStore();

  const { toast } = useToast();

  // State for the selected week
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday as start
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false);
  const [commentingTransaction, setCommentingTransaction] = useState<TransactionWithId | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<{ transactionId: string; comment: string } | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("owned"); // 'owned' or 'shared'

  const currentWeekKey = useMemo(() => getWeekKey(currentWeekStart), [currentWeekStart]);
  const currentReviewOwnerId = useMemo(() => {
      // Logic to determine the owner ID based on the active tab and potentially the selected shared review
       if (activeTab === 'owned' || !userId) {
           return userId || CLERK_DISABLED_PLACEHOLDER_USER_ID; // Default to current user for owned tab
       } else {
           // For shared tab, you'd need a way to select a specific shared review to determine owner
           // Placeholder: Return the first shared review's owner ID if any, otherwise current user
           const firstSharedReviewKey = Object.keys(sharedReviews)[0];
            return sharedReviews[firstSharedReviewKey]?.ownerId || (userId || CLERK_DISABLED_PLACEHOLDER_USER_ID);
        }
   }, [activeTab, userId, sharedReviews]);


   const currentReview = useMemo(() => {
        // Fetch the review based on the calculated owner and week key
        return getReviewForWeek(currentWeekKey, currentReviewOwnerId);
   }, [currentWeekKey, currentReviewOwnerId, getReviewForWeek]);


  // Filter transactions for the selected week
  const transactionsForWeek = useMemo(() => {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    return allTransactions.filter(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
         if (isNaN(txDate.getTime())) return false;
        return txDate >= currentWeekStart && txDate <= weekEnd;
    }).sort((a, b) => { // Sort transactions within the week, e.g., by date descending
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
       (currentReview?.transactionComments?.[tx.id] || '').toLowerCase().includes(lowerSearchTerm) // Search comments too
    );
  }, [transactionsForWeek, searchTerm, currentReview]);

  // --- Journal Handling ---
   // Get journal entry safely from the potentially undefined review
   const journalEntry = currentReview?.journal || '';

   const handleJournalChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
       // Update the store directly - ensure ownerId is passed correctly
       if (currentReviewOwnerId) { // Check if ownerId is available
           setJournalEntry(currentWeekKey, event.target.value, currentReviewOwnerId);
       } else {
           // console.error("Cannot save journal: Owner ID is missing."); // Console log commented out
           toast({ title: "Error", description: "Could not save journal entry. Owner information missing.", variant: "destructive" });
       }
   };

  // --- Comment Handling ---
  const handleAddCommentClick = (tx: TransactionWithId) => {
    setCommentingTransaction(tx);
    setCommentText(currentReview?.transactionComments?.[tx.id] || ''); // Pre-fill if comment exists
    setIsCommentDialogOpen(true);
  };

  const handleSaveComment = () => {
    if (!commentingTransaction || !currentReviewOwnerId) return;
    setTransactionComment(currentWeekKey, commentingTransaction.id, commentText, currentReviewOwnerId);
    toast({ title: "Comment Saved", description: `Comment for "${commentingTransaction.description}" saved.` });
    setIsCommentDialogOpen(false);
    setCommentingTransaction(null);
    setCommentText('');
  };

  const handleDeleteCommentClick = (transactionId: string) => {
     const comment = currentReview?.transactionComments?.[transactionId];
     if (comment && currentReviewOwnerId) {
        setCommentToDelete({ transactionId, comment });
        setIsDeleteDialogOpen(true);
    }
  };

  const confirmDeleteComment = () => {
    if (!commentToDelete || !currentReviewOwnerId) return;
    deleteTransactionComment(currentWeekKey, commentToDelete.transactionId, currentReviewOwnerId);
    toast({ title: "Comment Deleted" });
    setIsDeleteDialogOpen(false);
    setCommentToDelete(null);
  };


  // --- Week Navigation ---
  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));


  // --- Weekly Metrics Calculation ---
  const weeklyMetrics = useMemo(() => {
      const income = transactionsForWeek
          .filter(tx => tx.amount > 0)
          .reduce((sum, tx) => sum + tx.amount, 0);

      const expenses = transactionsForWeek
          .filter(tx => tx.amount < 0)
          .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const netFlow = income - expenses;

      // Budget Variance Calculation (simplified for the week)
      const start = currentWeekStart;
      const end = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const daysInWeek = 7;
      const daysInAvgMonth = 30.44;
      const budgetMultiplier = daysInWeek / daysInAvgMonth; // Prorate monthly budget to weekly

       // Calculate prorated budget based on selected period
       const proratedBudgetedIncome = budgetItems
           .filter(item => item.category === 'income')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);
       const proratedBudgetedExpenses = budgetItems
           .filter(item => item.category === 'recurring-expense' || item.category === 'one-time-expense')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);
       const proratedBudgetedGoals = budgetItems
           .filter(item => item.category === 'goal')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);
        // Calculate prorated debt payments
       const proratedBudgetedDebt = budgetItems
           .filter(item => item.category === 'debt')
           .reduce((sum, item) => sum + (item.amount * budgetMultiplier), 0);


       // Compare prorated budget with actuals for the week
       const netBudgetedProrated = proratedBudgetedIncome - proratedBudgetedExpenses - proratedBudgetedGoals - proratedBudgetedDebt;
       const variance = netFlow - netBudgetedProrated;

      let varianceStatus: 'favorable' | 'unfavorable' | 'on-track' | 'no-budget' = 'no-budget';
      if (proratedBudgetedIncome > 0 || proratedBudgetedExpenses > 0 || proratedBudgetedGoals > 0 || proratedBudgetedDebt > 0) {
          const threshold = Math.max(Math.abs(netBudgetedProrated * 0.05), 50); // 5% or KES 50 threshold for weekly
          if (Math.abs(variance) <= threshold) varianceStatus = 'on-track';
          else if (variance > 0) varianceStatus = 'favorable';
          else varianceStatus = 'unfavorable';
      }


      return {
          totalIncome: income,
          totalExpenses: expenses,
          netCashFlow: netFlow,
          budgetVariance: variance,
          budgetVarianceStatus: varianceStatus,
          transactionCount: transactionsForWeek.length,
      };
  }, [transactionsForWeek, budgetItems, currentWeekStart]);

  // --- Sharing ---
  const handleOpenShareDialog = () => {
      if (activeTab !== 'owned') {
          toast({ title: "Action Denied", description: "You can only share reviews you own.", variant: "destructive" });
          return;
      }
      setIsShareDialogOpen(true);
  };


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
          {/* Share Button (only for owned reviews) */}
         <Button onClick={handleOpenShareDialog} variant="outline" disabled={activeTab !== 'owned'}>
             <Share2 className="mr-2 h-4 w-4" /> Share This Week
         </Button>
      </header>

      {/* Week Navigation and Selection */}
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

        {/* Tabs for Owned and Shared Reviews */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
                 <TabsTrigger value="owned">My Reviews</TabsTrigger>
                 <TabsTrigger value="shared">Shared With Me</TabsTrigger>
            </TabsList>

             {/* Owned Reviews Tab */}
             <TabsContent value="owned">
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Transaction List & Comments (Left/Main Panel) */}
                    <div className="lg:col-span-2 space-y-4">
                         {/* Search/Filter Input */}
                         <div className="flex gap-2">
                            <Input
                                type="search"
                                placeholder="Search transactions or comments..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-9"
                             />
                         </div>
                        <Card className="shadow-sm">
                            <CardHeader className="p-4 border-b">
                                <CardTitle className="text-base">Transactions for the Week</CardTitle>
                                <CardDescription>Click a transaction to add/edit comments.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[400px] w-full">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-background z-10">
                                             <TableRow>
                                                 <TableHead className="w-[100px] pl-4">Date</TableHead>
                                                 <TableHead>Description</TableHead>
                                                 <TableHead>Category</TableHead>
                                                 <TableHead className="text-right">Amount (KES)</TableHead>
                                                 <TableHead className="w-[150px] text-center pr-4">Comment</TableHead>
                                             </TableRow>
                                         </TableHeader>
                                        <TableBody>
                                            {filteredTransactions.length > 0 ? (
                                                filteredTransactions.map((tx) => {
                                                    const comment = currentReview?.transactionComments?.[tx.id];
                                                    return (
                                                        <TableRow
                                                            key={tx.id}
                                                            className="cursor-pointer hover:bg-muted/50"
                                                            onClick={() => handleAddCommentClick(tx)}
                                                            title={comment ? `Comment: ${comment}` : 'Add Comment'}
                                                        >
                                                            <TableCell className="font-medium pl-4">{formatDate(tx.date)}</TableCell>
                                                            <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
                                                            <TableCell className="text-xs">
                                                                {formatCategoryBadge(tx.frequency)}
                                                                {formatCategoryBadge(tx.variability)}
                                                            </TableCell>
                                                            <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>
                                                                {formatCurrency(tx.amount)}
                                                            </TableCell>
                                                            <TableCell className="text-center pr-4 text-xs">
                                                                {comment ? (
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <MessageSquareText size={14} className="text-blue-500" />
                                                                         <span className='italic truncate max-w-[80px]'>"{comment}"</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-muted-foreground italic">No comment</span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                        {searchTerm ? 'No transactions match your search.' : 'No transactions found for this week.'}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>

                     {/* Weekly Summary & Journal (Right Panel) */}
                     <div className="lg:col-span-1 space-y-4">
                         {/* Weekly Metrics Card */}
                         <Card className="shadow-sm">
                             <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-base">Week Summary</CardTitle>
                             </CardHeader>
                             <CardContent className="p-4 text-sm space-y-2">
                                 <div className="flex justify-between items-center">
                                     <span className="text-muted-foreground">Transactions:</span>
                                     <span className="font-medium">{weeklyMetrics.transactionCount}</span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground flex items-center gap-1"><TrendingUp size={14}/> Income:</span>
                                      <span className="font-mono font-semibold text-accent">{formatCurrency(weeklyMetrics.totalIncome)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground flex items-center gap-1"><TrendingDown size={14}/> Expenses:</span>
                                      <span className="font-mono font-semibold text-destructive">{formatCurrency(weeklyMetrics.totalExpenses)}</span>
                                  </div>
                                  <div className="flex justify-between items-center border-t pt-2 mt-2">
                                      <span className="text-muted-foreground flex items-center gap-1"><Scale size={14}/> Net Flow:</span>
                                       <span className={cn("font-mono font-bold", weeklyMetrics.netCashFlow >= 0 ? 'text-accent' : 'text-destructive')}>
                                           {formatCurrency(weeklyMetrics.netCashFlow)}
                                       </span>
                                   </div>
                                  {/* Budget Variance Display */}
                                  <div className="flex justify-between items-center text-xs pt-1">
                                      <span className="text-muted-foreground">Budget Variance:</span>
                                      <span className={cn("font-mono font-semibold",
                                          weeklyMetrics.budgetVarianceStatus === 'favorable' && 'text-accent',
                                          weeklyMetrics.budgetVarianceStatus === 'unfavorable' && 'text-destructive',
                                          weeklyMetrics.budgetVarianceStatus === 'on-track' && 'text-primary', // Or accent?
                                          weeklyMetrics.budgetVarianceStatus === 'no-budget' && 'text-muted-foreground italic'
                                      )}>
                                          {weeklyMetrics.budgetVarianceStatus === 'no-budget'
                                              ? 'No Budget Data'
                                              : `${weeklyMetrics.budgetVariance >= 0 ? '+' : ''}${formatCurrency(weeklyMetrics.budgetVariance)} (${weeklyMetrics.budgetVarianceStatus.replace('-', ' ')})`}
                                      </span>
                                  </div>
                             </CardContent>
                         </Card>

                         {/* Journal Card */}
                         <Card className="shadow-sm">
                             <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-base flex items-center gap-1"><BookOpen size={16}/> Weekly Journal</CardTitle>
                                <CardDescription className="text-xs">Reflect on your financial progress, challenges, and goals for this week.</CardDescription>
                             </CardHeader>
                             <CardContent className="p-4 pt-0">
                                <Textarea
                                    placeholder="Write your journal entry here..."
                                    value={journalEntry}
                                    onChange={handleJournalChange}
                                    rows={8}
                                    className="w-full text-sm"
                                    // Disabled if not viewing an owned review - handled by logic checking currentReviewOwnerId vs userId
                                    disabled={activeTab === 'shared'} // Simple disable for shared tab
                                />
                                {activeTab === 'shared' && <p className='text-xs italic text-muted-foreground mt-2'>You can only view journals for shared reviews.</p>}
                            </CardContent>
                        </Card>
                    </div>
                </div>
             </TabsContent>

            {/* Shared Reviews Tab */}
            <TabsContent value="shared">
                 <Card>
                     <CardHeader>
                         <CardTitle>Reviews Shared With You</CardTitle>
                         <CardDescription>Select a review to view its details.</CardDescription>
                     </CardHeader>
                     <CardContent>
                         {Object.keys(sharedReviews).length > 0 ? (
                             <ScrollArea className="h-[60vh]">
                                 <ul className="space-y-2">
                                     {Object.entries(sharedReviews).map(([key, review]) => (
                                         <li key={key} className="border p-3 rounded-md hover:bg-muted/50">
                                             <p className="font-semibold">Week: {key}</p>
                                             <p className="text-xs text-muted-foreground">Owner ID: {review.ownerId}</p>
                                             <Button size="sm" variant="link" className="p-0 h-auto mt-1" onClick={() => {
                                                 // Logic to load and display the selected shared review's data
                                                  const selectedWeekDate = parseISO(key.split('-')[0] + '-W' + key.split('-')[1] + '-1'); // Attempt to parse week key back to a date
                                                  if (!isNaN(selectedWeekDate.getTime())) {
                                                    setCurrentWeekStart(startOfWeek(selectedWeekDate, { weekStartsOn: 1 }));
                                                    // setActiveTab('shared'); // Stay on shared tab
                                                     toast({title: `Viewing Shared Review ${key}`});
                                                 } else {
                                                     toast({title: "Error", description: "Could not parse week key.", variant: "destructive"});
                                                  }
                                              }}>View Details</Button>
                                         </li>
                                     ))}
                                 </ul>
                             </ScrollArea>
                         ) : (
                             <p className="text-center text-muted-foreground py-6">No reviews have been shared with you yet.</p>
                         )}
                     </CardContent>
                 </Card>
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
            placeholder="Add your comment here..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={4}
            className="w-full"
          />
          <DialogFooter>
              {currentReview?.transactionComments?.[commentingTransaction?.id || ''] && (
                  <Button variant="destructive" onClick={() => handleDeleteCommentClick(commentingTransaction!.id)} className="mr-auto">
                       <Trash2 className="mr-1 h-4 w-4"/> Delete Comment
                   </Button>
               )}
            <Button type="button" variant="outline" onClick={() => setIsCommentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveComment}>Save Comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Comment Confirmation */}
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Comment?</AlertDialogTitle>
             <AlertDialogDescription>
               Are you sure you want to delete this comment? "{commentToDelete?.comment}"
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


    
