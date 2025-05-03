// src/app/(dashboard)/weekly-review/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore'; // Use updated store
import { useBudgetStore } from '@/store/budgetStore'; // Import budget store
import { useAuth } from '@clerk/nextjs'; // Import useAuth for user ID
import { startOfWeek, endOfWeek, format, subWeeks, addWeeks, parseISO, startOfISOWeek, endOfISOWeek, getYear, getISOWeek } from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, Save, Search, Info, Loader2, MessageSquarePlus, MessageSquareText, Trash2, Edit, XCircle, BookOpen, TrendingUp, TrendingDown, Scale, CheckCircle, AlertTriangle as AlertTriangleIcon, Share2, Users } from 'lucide-react'; // Added Share2, Users
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, BudgetItemCategory, BudgetItem, WeeklyReviewData, UserShareInfo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs
import ShareReviewDialog from './ShareReviewDialog'; // Import the new dialog component

// Formatting Functions (remain the same)
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

// Helper to get date range (remains the same)
const getWeekDateRange = (weekKey: string): { start: Date, end: Date } | null => {
    const [yearStr, weekStr] = weekKey.split('-');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);
    if (isNaN(year) || isNaN(week) || week < 1 || week > 53) return null;
    try {
        const refDateStr = `${year}-01-04`;
        let dateInYear = parseISO(refDateStr);
        const targetDate = addWeeks(dateInYear, week - getISOWeek(dateInYear));
        const start = startOfISOWeek(targetDate);
        const end = endOfISOWeek(targetDate);
        return { start, end };
    } catch (error) {
        console.error("Error parsing week key:", weekKey, error);
        return null;
    }
};

// Calculate budget variance (remains the same)
const calculateBudgetVariance = (
    transactions: TransactionWithId[],
    budgetItems: BudgetItem[]
): { netBudgeted: number; netActual: number; variance: number; status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' } => {
    const actualIncome = transactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const actualExpenses = transactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const netActual = actualIncome - actualExpenses;
    const WEEKS_IN_MONTH_ESTIMATE = 4.33;
    const budgetedTotalsByCategory: Record<BudgetItemCategory, number> = { income: 0, 'recurring-expense': 0, 'one-time-expense': 0, goal: 0 };
    budgetItems.forEach(item => { budgetedTotalsByCategory[item.category] += item.amount / WEEKS_IN_MONTH_ESTIMATE; });
    const totalBudgetedIncome = budgetedTotalsByCategory.income;
    const totalBudgetedExpenses = budgetedTotalsByCategory['recurring-expense'] + budgetedTotalsByCategory['one-time-expense'];
    const totalBudgetedGoals = budgetedTotalsByCategory.goal;
    const netBudgeted = totalBudgetedIncome - totalBudgetedExpenses - totalBudgetedGoals;
    if (totalBudgetedIncome === 0 && totalBudgetedExpenses === 0 && totalBudgetedGoals === 0 && actualIncome === 0 && actualExpenses === 0) return { netBudgeted, netActual, variance: 0, status: 'no-data' };
    const variance = netActual - netBudgeted;
    let status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' = 'no-data';
    if (variance > 0.01) status = 'under-budget';
    else if (variance < -0.01) status = 'over-budget';
    else status = 'on-track';
    return { netBudgeted, netActual, variance, status };
};


export default function WeeklyReviewPage() {
  const { toast } = useToast();
  const { userId } = useAuth(); // Get current user ID
  const allTransactions = useTransactionsStore((state) => state.transactions);
  const budgetItems = useBudgetStore((state) => state.budgetItems);
  const { ownedReviews, sharedReviews, setJournalEntry, getReviewForWeek, setTransactionComment, deleteTransactionComment, getTransactionComment } = useWeeklyReviewStore();

  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [currentCommentText, setCurrentCommentText] = useState('');
  const [commentToDelete, setCommentToDelete] = useState<{ weekKey: string, transactionId: string, ownerId: string } | null>(null); // Include ownerId
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [selectedWeekKeyForSharing, setSelectedWeekKeyForSharing] = useState<string | null>(null); // Track which week to share

  const currentWeekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart]);
  const currentWeekKey = useMemo(() => getWeekKey(currentWeekStart), [currentWeekStart]);

  // Get the ownerId for the currently viewed week (could be current user or owner of shared review)
  // For simplicity, we'll assume the "current week" view always pertains to the logged-in user's data unless explicitly viewing shared data elsewhere.
  // If shared reviews could be selected in the calendar, this logic would need adjustment.
  const currentOwnerId = userId; // Assume viewing own data in the main table

  useEffect(() => {
    setEditingCommentId(null);
    setCurrentCommentText('');
    setCommentToDelete(null);
  }, [currentWeekKey]);

  const filteredTransactionsForAllTime = useMemo(() => {
      const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
      if (lowerCaseSearchTerm === '') return allTransactions;
      return allTransactions.filter((tx) =>
          tx.description.toLowerCase().includes(lowerCaseSearchTerm) ||
          tx.amount.toString().includes(searchTerm) ||
          tx.id.toLowerCase().includes(lowerCaseSearchTerm)
      );
  }, [allTransactions, searchTerm]);

  const weeklyTransactionsToDisplay = useMemo(() => {
    if (!userId) return []; // Don't show transactions if not logged in
    // Filter transactions owned by the current user for the selected week
    return filteredTransactionsForAllTime.filter((tx) => {
        // TODO: Add ownerId check if transactions are also user-scoped in the store/db
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return false;
        return txDate >= currentWeekStart && txDate <= currentWeekEnd;
      })
      .sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
            return dateB.getTime() - dateA.getTime();
         });
  }, [filteredTransactionsForAllTime, currentWeekStart, currentWeekEnd, userId]);


  // Process owned reviews for the Journal History section
  const processedOwnedReviews = useMemo(() => {
      if (!userId) return [];
    return Object.entries(ownedReviews)
        .filter(([key, review]) => review.ownerId === userId) // Ensure only owned reviews are processed here
        .map(([weekKey, reviewData]) => {
            const dateRange = getWeekDateRange(weekKey);
            if (!dateRange) return null;
            const weeklyTxs = allTransactions.filter(tx => { // Filter ALL transactions for metrics
                const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                return !isNaN(txDate.getTime()) && txDate >= dateRange.start && txDate <= dateRange.end;
            });
            const netFlow = weeklyTxs.reduce((sum, tx) => sum + tx.amount, 0);
            const varianceResult = calculateBudgetVariance(weeklyTxs, budgetItems);
            return {
                weekKey,
                journal: reviewData.journal,
                sharedWith: reviewData.sharedWith, // Include sharedWith list
                ownerId: reviewData.ownerId,
                dateRange,
                transactionCount: weeklyTxs.length,
                netFlow,
                budgetVariance: varianceResult.variance,
                 varianceStatus: varianceResult.status,
            };
        })
        .filter(review => review !== null)
        .sort((a, b) => b!.dateRange.start.getTime() - a!.dateRange.start.getTime());
  }, [ownedReviews, allTransactions, budgetItems, userId]);


   // Process shared reviews for the "Shared With Me" tab
  const processedSharedReviews = useMemo(() => {
      if (!userId) return [];
    return Object.entries(sharedReviews)
        // No need to filter by ownerId here, as sharedReviews already excludes owned ones (based on store logic)
        .map(([weekKey, reviewData]) => {
            const dateRange = getWeekDateRange(weekKey);
            if (!dateRange) return null;
            // Note: To calculate metrics for shared reviews, we'd need access to the OWNER's transactions.
            // This is complex and might require separate API calls or adjusted data structures.
            // For now, we'll just display the journal and comments if available, without owner's metrics.
            return {
                weekKey,
                journal: reviewData.journal,
                ownerId: reviewData.ownerId, // Include ownerId
                transactionComments: reviewData.transactionComments, // Include comments
                dateRange,
                // Metrics might be unavailable or inaccurate without owner's full data
                transactionCount: Object.keys(reviewData.transactionComments || {}).length, // Estimate count from comments
                netFlow: NaN, // Indicate unavailable
                budgetVariance: NaN, // Indicate unavailable
                varianceStatus: 'no-data' as const,
            };
        })
        .filter(review => review !== null)
        .sort((a, b) => b!.dateRange.start.getTime() - a!.dateRange.start.getTime());
  }, [sharedReviews, userId]); // Dependency on sharedReviews and userId


  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => {
    if (currentWeekEnd < endOfWeek(new Date(), { weekStartsOn: 1 })) {
        setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    } else {
        toast({ title: "Future Travel Denied!", description: "Cannot review future weeks.", variant: "default" });
    }
  };

  // --- Comment Handlers ---
   const handleEditCommentClick = (transactionId: string) => {
      if (!currentOwnerId) return;
      setEditingCommentId(transactionId);
      setCurrentCommentText(getTransactionComment(currentWeekKey, transactionId, currentOwnerId) || '');
  };
  const handleCancelEditComment = () => { setEditingCommentId(null); setCurrentCommentText(''); };
  const handleSaveComment = (transactionId: string) => {
      if (!currentOwnerId) return;
      setIsSavingComment(true);
      try {
          setTransactionComment(currentWeekKey, transactionId, currentCommentText.trim(), currentOwnerId);
          toast({ title: 'Comment Saved', description: 'Transaction comment updated.' });
          handleCancelEditComment();
      } catch (error) { console.error("Error saving comment:", error); toast({ title: 'Save Failed', description: 'Could not save comment.', variant: 'destructive' }); }
      finally { setIsSavingComment(false); }
  };
  const handleDeleteCommentClick = (transactionId: string) => {
      if (!currentOwnerId) return;
      setCommentToDelete({ weekKey: currentWeekKey, transactionId, ownerId: currentOwnerId });
  };
  const confirmDeleteComment = () => {
      if (!commentToDelete) return;
      try {
          deleteTransactionComment(commentToDelete.weekKey, commentToDelete.transactionId, commentToDelete.ownerId);
          toast({ title: 'Comment Deleted', description: 'Transaction comment removed.' });
          setCommentToDelete(null);
          if (editingCommentId === commentToDelete.transactionId) handleCancelEditComment();
      } catch (error) { console.error("Error deleting comment:", error); toast({ title: 'Delete Failed', description: 'Could not delete comment.', variant: 'destructive' }); setCommentToDelete(null); }
  };

  // --- Journal Handler ---
   const handleSaveJournalForWeek = (weekKey: string, journalText: string) => {
       if (!userId) return; // Ensure user is logged in
       try {
           setJournalEntry(weekKey, journalText, userId); // Pass current userId as ownerId
           toast({ title: 'Journal Saved', description: `Saved entry for week ${weekKey}.` });
       } catch (error) { console.error("Error saving journal:", error); toast({ title: 'Save Failed', description: 'Could not save journal entry.', variant: 'destructive' }); }
   };

   // --- Sharing Handlers ---
    const handleOpenShareDialog = (weekKey: string) => {
        setSelectedWeekKeyForSharing(weekKey);
        setIsShareDialogOpen(true);
    };


   // --- Journal Card Component ---
    const JournalCard = ({ review, isShared = false }: { review: NonNullable<(typeof processedOwnedReviews | typeof processedSharedReviews)[number]>, isShared?: boolean }) => {
        const [journalText, setJournalText] = useState(review.journal);
        const [isSaving, setIsSaving] = useState(false);
        const [isFetchingOwner, setIsFetchingOwner] = useState(false); // State for fetching owner info
        const [ownerInfo, setOwnerInfo] = useState<UserShareInfo | null>(null);
        const dateRangeStr = `${format(review.dateRange.start, 'MMM d')} - ${format(review.dateRange.end, 'MMM d, yyyy')}`;
        const isOwnedByCurrentUser = userId === review.ownerId;

        useEffect(() => { setJournalText(review.journal); }, [review.journal]);

         // Fetch owner info if it's a shared review
         useEffect(() => {
            if (isShared && review.ownerId && userId && review.ownerId !== userId) {
                setIsFetchingOwner(true);
                // TODO: Implement an API action to get user info by ID
                // For now, placeholder or skip fetching
                // Example:
                // getUserInfoByIdApi(review.ownerId)
                //   .then(info => setOwnerInfo(info))
                //   .catch(err => console.error("Failed to fetch owner info", err))
                //   .finally(() => setIsFetchingOwner(false));
                 console.warn(`Need to fetch owner info for ID: ${review.ownerId}`);
                 // Placeholder:
                 setOwnerInfo({ userId: review.ownerId, email: `owner_${review.ownerId.substring(0,5)}@...`, name: `Owner ${review.ownerId.substring(0,5)}` });
                 setIsFetchingOwner(false);
            } else {
                setOwnerInfo(null); // Clear owner info if not shared or owner is current user
            }
        }, [isShared, review.ownerId, userId]);


        const handleLocalSave = () => {
            if (!isOwnedByCurrentUser) return; // Only owner can save journal
            setIsSaving(true);
            handleSaveJournalForWeek(review.weekKey, journalText);
            setIsSaving(false);
        };

        let varianceBadgeVariant: 'default' | 'destructive' | 'outline' = 'outline';
        let varianceBadgeText = 'No Data';
        let varianceColorClass = 'text-muted-foreground';
        if (review.varianceStatus === 'on-track' || review.varianceStatus === 'under-budget') { varianceBadgeVariant = 'default'; varianceBadgeText = review.varianceStatus === 'on-track' ? 'On Track' : 'Favorable'; varianceColorClass = 'text-accent'; }
        else if (review.varianceStatus === 'over-budget') { varianceBadgeVariant = 'destructive'; varianceBadgeText = 'Unfavorable'; varianceColorClass = 'text-destructive'; }

        return (
            <Card className="flex flex-col shadow-sm hover:shadow-md transition-shadow duration-200">
                 <CardHeader className="p-4 border-b bg-muted/30">
                     <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                         <div>
                            <CardTitle className="text-base font-semibold flex items-center gap-2 flex-wrap">
                                 <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                                 <span className="mr-1">Journal: {dateRangeStr}</span>
                                 <span className="text-xs font-mono text-muted-foreground">({review.weekKey})</span>
                                 {isShared && ownerInfo && (
                                     <Badge variant="secondary" className="text-xs font-normal">
                                         Shared by: {isFetchingOwner ? <Loader2 size={12} className="inline ml-1 animate-spin"/> : (ownerInfo.name || ownerInfo.email)}
                                      </Badge>
                                 )}
                                 {isOwnedByCurrentUser && review.sharedWith && review.sharedWith.length > 0 && (
                                      <Badge variant="outline" className="text-xs font-normal flex items-center gap-1">
                                          <Users size={12} /> Shared ({review.sharedWith.length})
                                      </Badge>
                                  )}
                             </CardTitle>
                             {/* Metrics - Only show if not shared or if data is available */}
                             {!isShared && (
                                 <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                                     <span>Transactions: <span className="font-medium text-foreground">{review.transactionCount}</span></span>
                                     <span className={cn("whitespace-nowrap", review.netFlow >= 0 ? "text-accent" : "text-destructive")}>Net Flow: <span className="font-medium">{formatCurrency(review.netFlow)}</span></span>
                                     <span className={cn("whitespace-nowrap", varianceColorClass)}>Variance: <span className="font-medium">{review.varianceStatus === 'no-data' ? 'N/A' : `${review.budgetVariance >= 0 ? '+' : ''}${formatCurrency(review.budgetVariance)}`}</span> <Badge variant={varianceBadgeVariant} className={cn("ml-1 text-xs px-1.5 py-0 h-4 font-normal", varianceBadgeVariant === 'default' && 'bg-accent border-accent text-accent-foreground')}>{varianceBadgeText}</Badge></span>
                                 </div>
                             )}
                         </div>
                         <div className="flex gap-2 mt-2 sm:mt-0 flex-shrink-0">
                             {isOwnedByCurrentUser && journalText !== review.journal && (
                                <Button size="sm" onClick={handleLocalSave} disabled={isSaving} className="h-8 px-3">
                                     {isSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} {isSaving ? 'Saving...' : 'Save'}
                                 </Button>
                             )}
                             {/* Share Button - Only for owned reviews */}
                              {isOwnedByCurrentUser && (
                                  <Button size="sm" variant="outline" onClick={() => handleOpenShareDialog(review.weekKey)} className="h-8 px-3">
                                      <Share2 className="mr-1 h-4 w-4" /> Share
                                  </Button>
                              )}
                           </div>
                     </div>
                 </CardHeader>
                 <CardContent className="p-4 flex-grow">
                     <Textarea
                         placeholder={isOwnedByCurrentUser ? "Write your reflections..." : "Journal entry (view only)"}
                         value={journalText}
                         onChange={(e) => isOwnedByCurrentUser && setJournalText(e.target.value)}
                         readOnly={!isOwnedByCurrentUser} // Make read-only if not the owner
                         className={cn(
                             "min-h-[150px] w-full border rounded-md p-3 focus:outline-none text-sm",
                             isOwnedByCurrentUser && "focus:ring-2 focus:ring-ring focus:ring-offset-2",
                             !isOwnedByCurrentUser && "bg-muted/50 cursor-not-allowed"
                         )}
                         aria-label={`Journal entry for week ${review.weekKey}`}
                     />
                 </CardContent>
            </Card>
        );
    };



  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" /> Weekly Review & Collaboration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review transactions, add comments, journal, and share your progress.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
           <Button variant="outline" size="icon" onClick={goToPreviousWeek} className="h-8 w-8"> <ChevronLeft className="h-4 w-4" /><span className="sr-only">Previous</span></Button>
           <span className="text-sm font-medium w-40 text-center">{format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}</span>
           <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-8 w-8" disabled={currentWeekEnd >= endOfWeek(new Date(), { weekStartsOn: 1 })}> <ChevronRight className="h-4 w-4" /><span className="sr-only">Next</span></Button>
         </div>
      </header>

      <Card>
         <CardHeader className="p-4 border-b"><CardTitle className="text-base font-semibold">Search All Transactions</CardTitle><CardDescription className="text-xs">Search by description, amount, or ID substring.</CardDescription></CardHeader>
         <CardContent className="p-4"><div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input type="search" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-9 w-full"/></div></CardContent>
       </Card>

        {/* Tabs for Owned vs Shared */}
        <Tabs defaultValue="owned" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="owned">My Reviews & Transactions</TabsTrigger>
                <TabsTrigger value="shared">Shared With Me</TabsTrigger>
            </TabsList>

             {/* Owned Reviews Tab */}
            <TabsContent value="owned" className="mt-4 space-y-6">
                <Card className="flex flex-col">
                    <CardHeader className="p-4 border-b">
                       <CardTitle className="text-lg">Transactions for Current Week</CardTitle>
                       <CardDescription className="text-sm">Review your transactions for the selected week ({format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}). {searchTerm && <span className='block text-xs mt-1 text-primary'>Filtering by: "{searchTerm}"</span>}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow p-0">
                       <ScrollArea className="h-[400px] w-full">
                           <Table>
                               <TableHeader className="sticky top-0 bg-background z-10">
                                   <TableRow><TableHead className="w-[50px]"></TableHead><TableHead className="w-[100px]">Date</TableHead><TableHead className="w-[90px]">ID</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Comment / Actions</TableHead></TableRow>
                               </TableHeader>
                               <TableBody>
                                   {weeklyTransactionsToDisplay.length > 0 ? (
                                       weeklyTransactionsToDisplay.map((tx) => {
                                           const existingComment = getTransactionComment(currentWeekKey, tx.id, currentOwnerId!); // Assert non-null owner
                                           const isEditingThis = editingCommentId === tx.id;
                                           return (
                                               <TableRow key={tx.id}>
                                                   <TableCell className="text-center">{existingComment ? <MessageSquareText size={16} className="text-muted-foreground mx-auto" title="Has comment"/> : <MessageSquarePlus size={16} className="text-muted-foreground/50 mx-auto" title="No comment"/>}</TableCell>
                                                   <TableCell className="text-xs">{formatDate(tx.date)}</TableCell>
                                                   <TableCell className="text-xs text-muted-foreground font-mono max-w-[70px] truncate" title={tx.id}>{tx.id.substring(tx.id.length - 6)}</TableCell>
                                                   <TableCell className="max-w-[200px] truncate" title={tx.description}>{tx.description}</TableCell>
                                                   <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>{formatCurrency(tx.amount)}</TableCell>
                                                   <TableCell className="min-w-[250px]">
                                                         {isEditingThis ? (
                                                             <div className="flex items-center gap-2">
                                                                 <Textarea value={currentCommentText} onChange={(e) => setCurrentCommentText(e.target.value)} placeholder="Add comment..." rows={1} className="text-xs flex-grow min-h-[36px] max-h-[100px]" />
                                                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveComment(tx.id)} disabled={isSavingComment}>{isSavingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button>
                                                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancelEditComment}><XCircle className="h-4 w-4" /></Button>
                                                              </div>
                                                         ) : (
                                                             <div className="flex items-center justify-between gap-2">
                                                                 <p className={cn("text-xs flex-grow truncate", !existingComment && "italic text-muted-foreground/70")} title={existingComment}>{existingComment || 'No comment...'}</p>
                                                                  <div className="flex items-center flex-shrink-0">
                                                                      <Button variant="ghost" size="icon" className="mr-1 h-6 w-6" onClick={() => handleEditCommentClick(tx.id)}><Edit className="h-3 w-3" /><span className="sr-only">Edit</span></Button>
                                                                     {existingComment && (
                                                                         <AlertDialog open={commentToDelete?.transactionId === tx.id && commentToDelete?.weekKey === currentWeekKey} onOpenChange={(open) => !open && setCommentToDelete(null)}>
                                                                              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-6 w-6" onClick={() => handleDeleteCommentClick(tx.id)}><Trash2 className="h-3 w-3" /><span className="sr-only">Delete</span></Button></AlertDialogTrigger>
                                                                             <AlertDialogContent>{commentToDelete && commentToDelete.transactionId === tx.id && (<><AlertDialogHeader><AlertDialogTitle>Delete Comment?</AlertDialogTitle><AlertDialogDescription>Delete comment for: <strong>{tx.description}</strong>?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setCommentToDelete(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteComment}>Delete</AlertDialogAction></AlertDialogFooter></>)}</AlertDialogContent>
                                                                          </AlertDialog>
                                                                      )}
                                                                  </div>
                                                              </div>
                                                         )}
                                                   </TableCell>
                                               </TableRow>
                                           );
                                       })
                                   ) : (<TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{searchTerm ? 'No matching transactions this week.' : 'No transactions this week.'}</TableCell></TableRow>)}
                               </TableBody>
                           </Table>
                       </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Owned Journal History */}
                  <Card>
                     <CardHeader className='p-4 border-b'><CardTitle className='text-lg flex items-center gap-2'><BookOpen className='h-5 w-5'/> My Journal History</CardTitle><CardDescription className='text-sm'>View and edit your past weekly reflections.</CardDescription></CardHeader>
                     <CardContent className='p-4'>
                         {processedOwnedReviews.length > 0 ? (
                              <ScrollArea className="h-[calc(100vh-350px)] w-full pr-4"> {/* Adjust height */}
                                  <div className="space-y-4">
                                     {processedOwnedReviews.map(review => review && <JournalCard key={review.weekKey} review={review} isShared={false}/>)}
                                  </div>
                              </ScrollArea>
                         ) : (<div className="h-[200px] flex flex-col items-center justify-center text-center text-muted-foreground"><BookOpen className="h-10 w-10 mb-2 text-muted-foreground/50"/><p>No journal entries found.</p><p className="text-xs mt-1">Go back to previous weeks and save entries.</p></div>)}
                     </CardContent>
                  </Card>
             </TabsContent>

            {/* Shared Reviews Tab */}
             <TabsContent value="shared" className="mt-4 space-y-6">
                <Card>
                     <CardHeader className='p-4 border-b'><CardTitle className='text-lg flex items-center gap-2'><Users className='h-5 w-5'/> Reviews Shared With Me</CardTitle><CardDescription className='text-sm'>View journal entries shared by other users.</CardDescription></CardHeader>
                     <CardContent className='p-4'>
                         {processedSharedReviews.length > 0 ? (
                             <ScrollArea className="h-[calc(100vh-250px)] w-full pr-4">
                                 <div className="space-y-4">
                                     {processedSharedReviews.map(review => review && <JournalCard key={`${review.ownerId}-${review.weekKey}`} review={review} isShared={true} />)}
                                 </div>
                             </ScrollArea>
                         ) : (
                             <div className="h-[200px] flex flex-col items-center justify-center text-center text-muted-foreground">
                                <Users className="h-10 w-10 mb-2 text-muted-foreground/50"/>
                                <p>No reviews have been shared with you yet.</p>
                             </div>
                         )}
                     </CardContent>
                 </Card>
            </TabsContent>

        </Tabs>


        {/* Share Dialog */}
        {selectedWeekKeyForSharing && (
             <ShareReviewDialog
                 isOpen={isShareDialogOpen}
                 onClose={() => setIsShareDialogOpen(false)}
                 weekKey={selectedWeekKeyForSharing}
             />
         )}
    </div>
  );
}
