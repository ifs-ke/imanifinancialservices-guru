// src/app/(dashboard)/weekly-review/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore';
import { useBudgetStore, selectTotalBudgetedIncome, selectTotalBudgetedExpenses, selectTotalGoals, selectTotalBudgetedDebt, selectNetBudgeted } from '@/store/budgetStore';
import { useAuth } from '@clerk/nextjs';
import { startOfWeek, endOfWeek, format, subWeeks, addWeeks, getISOWeek } from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, Save, Search, Info, Loader2, MessageSquarePlus, MessageSquareText, Trash2, Edit, XCircle, BookOpen, TrendingUp, TrendingDown, Scale, CheckCircle, AlertTriangle as AlertTriangleIcon, Share2, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger as ShadAlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ShareReviewDialog from './ShareReviewDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { logInfo, logWarn, logError } from '@/lib/logger';

const formatDate = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return 'Invalid Date';
  return format(dateObj, 'PP');
};

const formatToPeriodKey = (date: Date): string => {
  return format(date, 'yyyy-MM');
}

const formatCategoryBadge = (value: string | undefined) => {
  if (!value) return null;
  const variant: "secondary" | "outline" = value === 'recurring' || value === 'fixed' ? 'secondary' : 'outline';
  const text = value.charAt(0).toUpperCase() + value.slice(1);
  return <Badge variant={variant} className="ml-2 text-xs font-normal">{text}</Badge>;
}

export default function WeeklyReviewPage() {
  const { userId, isSignedIn } = useAuth();

  const { transactions: allTransactions } = useTransactionsStore();
  const setBudgetPeriod = useBudgetStore(state => state.setBudgetPeriod);
  const monthlyBudgetedIncome = useBudgetStore(selectTotalBudgetedIncome);
  const monthlyBudgetedExpenses = useBudgetStore(selectTotalBudgetedExpenses);
  const monthlyBudgetedGoals = useBudgetStore(selectTotalGoals);
  const monthlyBudgetedDebt = useBudgetStore(selectTotalBudgetedDebt);
  const monthlyNetBudgeted = useBudgetStore(selectNetBudgeted);

  const {
    ownedReviews,
    sharedReviews,
    setJournalEntry,
    setTransactionComment,
    deleteTransactionComment,
  } = useWeeklyReviewStore();

  const { toast } = useToast();

  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
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

  useEffect(() => {
    const correspondingMonthPeriod = formatToPeriodKey(currentWeekStart);
    setBudgetPeriod(correspondingMonthPeriod);
    logInfo(`Weekly Review: Set budget period to ${correspondingMonthPeriod} for week starting ${formatDate(currentWeekStart)}`, { userId });
  }, [currentWeekStart, setBudgetPeriod, userId]);

  const currentReview = useMemo(() => {
    if (activeTab === 'owned') {
      return ownedReviews[currentWeekKey];
    } else {
      return sharedReviews[currentWeekKey];
    }
  }, [activeTab, currentWeekKey, ownedReviews, sharedReviews]);

  const currentReviewOwnerId = useMemo(() => {
    return currentReview?.ownerId || (activeTab === 'owned' ? userId : null);
  }, [currentReview, activeTab, userId]);

  const journalEntry = currentReview?.journal || '';

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

  const handleJournalChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeTab === 'owned' && userId && isSignedIn) {
      setJournalEntry(currentWeekKey, event.target.value, userId);
    } else {
      toast({ title: "Read Only", description: "You can only edit journals for your own reviews or if not signed in.", variant: "default" });
    }
  };

  const handleDeleteJournal = () => {
    if (activeTab === 'owned' && userId && isSignedIn) {
      setIsDeleteJournalDialogOpen(true);
    } else {
      toast({ title: "Action Denied", description: "You can only delete journals from your own reviews or if not signed in.", variant: "destructive" });
    }
  };

  const confirmDeleteJournal = () => {
    if (activeTab === 'owned' && userId && isSignedIn) {
      setJournalEntry(currentWeekKey, '', userId); 
      toast({ title: "Journal Cleared", description: `Journal entry for week ${currentWeekKey} has been cleared.` });
    }
    setIsDeleteJournalDialogOpen(false);
  };

  const isReadOnly = activeTab === 'shared' || !isSignedIn; 

  const handleAddCommentClick = (tx: TransactionWithId) => {
    if (isReadOnly) {
      toast({ title: "Read Only", description: "Cannot add comments to a shared review or if not signed in.", variant: "default" });
      return;
    }
    setCommentingTransaction(tx);
    setCommentText(currentReview?.transactionComments?.[tx.id] || '');
    setIsCommentDialogOpen(true);
  };

  const handleSaveComment = () => {
    if (activeTab === 'owned' && commentingTransaction && userId && isSignedIn) {
      setTransactionComment(currentWeekKey, commentingTransaction.id, commentText, userId); 
      toast({ title: "Comment Saved", description: `Comment for "${commentingTransaction.description}" saved.` });
      setIsCommentDialogOpen(false);
      setCommentingTransaction(null);
      setCommentText('');
    } else {
      toast({ title: "Read Only / Not Signed In", description: "You can only comment on your own weekly reviews and must be signed in.", variant: "default" });
      setIsCommentDialogOpen(false); 
    }
  };

  const handleDeleteCommentClick = (transactionId: string) => {
    const comment = currentReview?.transactionComments?.[transactionId];
    if (activeTab === 'owned' && comment && userId && isSignedIn) {
      setCommentToDelete({ transactionId, comment });
      setIsDeleteCommentDialogOpen(true);
    } else {
      toast({ title: "Read Only / Not Signed In", description: "You can only delete comments from your own weekly reviews and must be signed in.", variant: "default" });
    }
  };

  const confirmDeleteComment = () => {
    if (activeTab === 'owned' && commentToDelete && userId && isSignedIn) {
      deleteTransactionComment(currentWeekKey, commentToDelete.transactionId, userId); 
      toast({ title: "Comment Deleted" });
    }
    setIsDeleteCommentDialogOpen(false);
    setCommentToDelete(null);
  };

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));

  const weeklyMetrics = useMemo(() => {
    const income = transactionsForWeek
      .filter(tx => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const expenses = transactionsForWeek
      .filter(tx => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const netFlow = income - expenses;
    const netBudgetedMonthlyContext = monthlyNetBudgeted; 
    const varianceAgainstMonthly = netFlow - (netBudgetedMonthlyContext / 4); 

    let varianceStatus: 'favorable' | 'unfavorable' | 'on-track' | 'no-budget' = 'no-budget';
    if (monthlyBudgetedIncome > 0 || monthlyBudgetedExpenses > 0 || monthlyBudgetedGoals > 0 || monthlyBudgetedDebt > 0) {
      const roughWeeklyBudget = netBudgetedMonthlyContext / 4.33; 
      const threshold = Math.max(Math.abs(roughWeeklyBudget * 0.1), 1000); 
      if (Math.abs(netFlow - roughWeeklyBudget) <= threshold) varianceStatus = 'on-track';
      else if (netFlow > roughWeeklyBudget) varianceStatus = 'favorable';
      else varianceStatus = 'unfavorable';
    }

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netCashFlow: netFlow,
      budgetVariance: varianceAgainstMonthly, 
      budgetVarianceStatus: varianceStatus,
      transactionCount: transactionsForWeek.length,
    };
  }, [
    transactionsForWeek,
    monthlyBudgetedIncome,
    monthlyBudgetedExpenses,
    monthlyBudgetedGoals,
    monthlyBudgetedDebt,
    monthlyNetBudgeted
  ]);

  const handleOpenShareDialog = () => {
    if (!isSignedIn || !userId) { 
        toast({ title: "Sign In Required", description: "Please sign in to share reviews.", variant: "destructive"});
        return;
    }
    if (activeTab !== 'owned') {
      toast({ title: "Action Denied", description: "You can only share reviews you own.", variant: "destructive" });
      return;
    }
    if (!ownedReviews[currentWeekKey] && userId) { 
      setJournalEntry(currentWeekKey, '', userId); 
      logInfo(`Created shell for week ${currentWeekKey} before sharing.`, { userId });
    }
    setIsShareDialogOpen(true);
  };

  return (
    <div className="flex flex-col min-h-screen py-4 md:py-6 lg:py-8 space-y-6">
      <header className="px-4 md:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" /> Weekly Review
          </h1>
          <p className="text-muted-foreground">
            Review transactions, add comments, and journal your financial progress week by week.
          </p>
        </div>
        <Button onClick={handleOpenShareDialog} variant="outline" disabled={activeTab !== 'owned' || !isSignedIn}>
          <Share2 className="mr-2 h-4 w-4" /> Share This Week
        </Button>
      </header>

      <Card className="shadow-sm mx-4 md:mx-6 lg:mx-8">
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "owned" | "shared")} className="px-4 md:px-6 lg:px-8">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="owned">My Reviews</TabsTrigger>
          <TabsTrigger value="shared">Shared With Me ({Object.keys(sharedReviews).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="owned">
          {!isSignedIn && (
            <Alert variant="destructive" className="mb-4">
                <AlertTriangleIcon className="h-4 w-4" />
                <AlertTitle>Not Signed In</AlertTitle>
                <AlertDescription>
                  Please sign in to create or edit your weekly reviews.
                </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-6 lg:grid-cols-3">
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
                        ) : (<TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">{searchTerm ? 'No transactions match your search.' : 'No transactions found for this week.'}</TableCell></TableRow>)}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-1 space-y-4">
              <Card className="shadow-sm">
                <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Week Summary</CardTitle></CardHeader>
                <CardContent className="p-4 text-sm space-y-2">
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Transactions:</span><span className="font-medium">{weeklyMetrics.transactionCount}</span></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><TrendingUp size={14} /> Income:</span><span className="font-mono font-semibold text-accent">{formatCurrency(weeklyMetrics.totalIncome)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground flex items-center gap-1"><TrendingDown size={14} /> Expenses:</span><span className="font-mono font-semibold text-destructive">{formatCurrency(weeklyMetrics.totalExpenses)}</span></div>
                  <div className="flex justify-between items-center border-t pt-2 mt-2"><span className="text-muted-foreground flex items-center gap-1"><Scale size={14} /> Net Flow:</span><span className={cn("font-mono font-bold", weeklyMetrics.netCashFlow >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(weeklyMetrics.netCashFlow)}</span></div>
                  <div className="flex justify-between items-center text-xs pt-1"><span className="text-muted-foreground">Budget Context ({format(currentWeekStart, 'MMM yyyy')}):</span><span className={cn("font-mono font-semibold", weeklyMetrics.budgetVarianceStatus === 'favorable' && 'text-accent', weeklyMetrics.budgetVarianceStatus === 'unfavorable' && 'text-destructive', weeklyMetrics.budgetVarianceStatus === 'on-track' && 'text-primary', weeklyMetrics.budgetVarianceStatus === 'no-budget' && 'text-muted-foreground italic')}>{weeklyMetrics.budgetVarianceStatus === 'no-budget' ? 'No Budget Data' : `${weeklyMetrics.budgetVariance >= 0 ? '+' : ''}${formatCurrency(weeklyMetrics.budgetVariance)} (${weeklyMetrics.budgetVarianceStatus.replace('-', ' ')})`}</span></div>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardHeader className="p-4 pb-2 flex flex-row justify-between items-center">
                  <div><CardTitle className="text-base flex items-center gap-1"><BookOpen size={16} /> Weekly Journal</CardTitle><CardDescription className="text-xs">Reflect on your financial progress.</CardDescription></div>
                  {journalEntry && isSignedIn && (<AlertDialog open={isDeleteJournalDialogOpen} onOpenChange={setIsDeleteJournalDialogOpen}><ShadAlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0" onClick={handleDeleteJournal}><Trash2 size={16} /><span className="sr-only">Delete Journal Entry</span></Button></ShadAlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Journal Entry?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete the journal entry for week {currentWeekKey}? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteJournal}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>)}
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <Textarea placeholder="Write your journal entry here..." value={journalEntry} onChange={handleJournalChange} rows={8} className="w-full text-sm" disabled={isReadOnly} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="shared">
          {Object.keys(sharedReviews).length > 0 ? (
            <div className="space-y-4">
              {currentReview && currentReviewOwnerId !== userId ? (
                <Alert>
                  <Users className="h-4 w-4" />
                  <AlertTitle>Viewing Shared Review</AlertTitle>
                  <AlertDescription>
                    You are viewing the review for week {currentWeekKey} shared by {currentReview.ownerUsername || `User ID: ${currentReviewOwnerId || 'Unknown User'}`}. You cannot edit this review or its comments.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangleIcon className="h-4 w-4" />
                  <AlertTitle>No Shared Review Selected</AlertTitle>
                  <AlertDescription>No shared review found or selected for week {currentWeekKey}.</AlertDescription>
                </Alert>
              )}

              {currentReview && currentReviewOwnerId !== userId && (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-4">
                    <Card className="shadow-sm">
                      <CardHeader className="p-4 border-b"><CardTitle className="text-base">Shared Transactions</CardTitle><CardDescription>View transactions and comments for this shared week.</CardDescription></CardHeader>
                      <CardContent className="p-0">
                        <ScrollArea className="h-[400px] w-full">
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
                  <div className="lg:col-span-1 space-y-4">
                    <Card className="shadow-sm">
                      <CardHeader className="p-4 pb-2"><CardTitle className="text-base flex items-center gap-1"><BookOpen size={16} /> Shared Journal</CardTitle></CardHeader>
                      <CardContent className="p-4 pt-0">
                        <Textarea placeholder="Journal entry (read-only)..." value={journalEntry} rows={8} className="w-full text-sm bg-muted/50 cursor-not-allowed" disabled={true} />
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

      <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comment on Transaction</DialogTitle>
            <DialogDescription>
              {commentingTransaction?.description} ({formatCurrency(commentingTransaction?.amount || 0)}) on {formatDate(commentingTransaction?.date || new Date())}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={activeTab === 'owned' && isSignedIn ? "Add your comment here..." : "Comment (read-only)..."}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={4}
            className="w-full"
            disabled={isReadOnly}
          />
          <DialogFooter>
            {activeTab === 'owned' && isSignedIn && commentingTransaction && currentReview?.transactionComments?.[commentingTransaction.id] && (
              <Button variant="destructive" onClick={() => handleDeleteCommentClick(commentingTransaction!.id)} className="mr-auto">
                <Trash2 className="mr-1 h-4 w-4" /> Delete Comment
              </Button>
            )}
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveComment} disabled={isReadOnly}>Save Comment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteCommentDialogOpen} onOpenChange={setIsDeleteCommentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comment?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? "{commentToDelete?.comment || ''}"
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCommentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteComment}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isSignedIn && userId && ( 
        <ShareReviewDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          weekKey={currentWeekKey}
        />
      )}
    </div>
  );
}
