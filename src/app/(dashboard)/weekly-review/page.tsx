// src/app/(dashboard)/weekly-review/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore';
import { useBudgetStore } from '@/store/budgetStore'; // Import budget store
import { startOfWeek, endOfWeek, format, subWeeks, addWeeks, parseISO, startOfISOWeek, endOfISOWeek, getYear, getISOWeek } from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, Save, Search, Info, Loader2, MessageSquarePlus, MessageSquareText, Trash2, Edit, XCircle, BookOpen, TrendingUp, TrendingDown, Scale, CheckCircle, AlertTriangle as AlertTriangleIcon } from 'lucide-react'; // Added icons
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, BudgetItemCategory, BudgetItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert component
import { Badge } from '@/components/ui/badge'; // Import Badge

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

// Helper to get date range from week key (YYYY-WW)
const getWeekDateRange = (weekKey: string): { start: Date, end: Date } | null => {
    const [yearStr, weekStr] = weekKey.split('-');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);

    if (isNaN(year) || isNaN(week) || week < 1 || week > 53) {
        console.error("Invalid week key format:", weekKey);
        return null;
    }

    // Construct a date within the target ISO week and year
    // Note: ISO weeks can span across calendar years near start/end
    // We'll use the start of the week to determine the correct year context
    try {
         // A reference date (Jan 4th is always in week 1)
        const refDateStr = `${year}-01-04`;
        let dateInYear = parseISO(refDateStr);

        // Adjust to the target week
        // Calculate the difference in weeks and add/subtract days
        const targetDate = addWeeks(dateInYear, week - getISOWeek(dateInYear));

        const start = startOfISOWeek(targetDate);
        const end = endOfISOWeek(targetDate);

         // Ensure the start of the week aligns with the intended year if parsing was tricky
         // (This is a safeguard, startOfISOWeek should handle year boundaries correctly)
         if (getYear(start) !== year && week === 1 && getISOWeek(new Date(year, 0, 1)) > 50) {
             // Week 1 might start in the previous year
         } else if (getYear(start) !== year && week > 50 && getISOWeek(new Date(year, 11, 31)) === 1) {
              // Last week might start in the next year (less common with ISO week)
         }


        return { start, end };
    } catch (error) {
        console.error("Error parsing week key:", weekKey, error);
        return null;
    }
};


// Helper to calculate budget variance for a given set of transactions and budget items
const calculateBudgetVariance = (
    transactions: TransactionWithId[],
    budgetItems: BudgetItem[]
): { netBudgeted: number; netActual: number; variance: number; status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' } => {

    // 1. Calculate Actual Totals from Transactions
    const actualIncome = transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);
    const actualExpenses = transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const netActual = actualIncome - actualExpenses;

    // 2. Calculate Budgeted Totals from Budget Items
    const budgetedTotalsByCategory: Record<BudgetItemCategory, number> = {
        income: 0,
        'recurring-expense': 0,
        'one-time-expense': 0,
        goal: 0,
    };
    budgetItems.forEach(item => {
        budgetedTotalsByCategory[item.category] += item.amount;
    });
    const totalBudgetedIncome = budgetedTotalsByCategory.income;
    const totalBudgetedExpenses = budgetedTotalsByCategory['recurring-expense'] + budgetedTotalsByCategory['one-time-expense'];
    const totalBudgetedGoals = budgetedTotalsByCategory.goal;
    const netBudgeted = totalBudgetedIncome - totalBudgetedExpenses - totalBudgetedGoals;

     // 3. Determine Status and Variance
     if (totalBudgetedIncome === 0 && totalBudgetedExpenses === 0 && totalBudgetedGoals === 0 && actualIncome === 0 && actualExpenses === 0) {
       return { netBudgeted, netActual, variance: 0, status: 'no-data' };
     }

    const variance = netActual - netBudgeted; // Favorable is positive (more income/less spend than budgeted)
    let status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' = 'no-data';

     if (variance > 0) status = 'under-budget'; // Favorable
     else if (variance < 0) status = 'over-budget'; // Unfavorable
     else status = 'on-track'; // Exactly matches

    return { netBudgeted, netActual, variance, status };
};


export default function WeeklyReviewPage() {
  const { toast } = useToast();
  const allTransactions = useTransactionsStore((state) => state.transactions);
  const budgetItems = useBudgetStore((state) => state.budgetItems); // Get budget items

  // Weekly Review Store - Including new comment actions
  const { reviews, setJournalEntry, getReviewForWeek, setTransactionComment, deleteTransactionComment, getTransactionComment } = useWeeklyReviewStore();

  // State for the selected week (controls the transaction table view)
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday as start
  const [isSavingComment, setIsSavingComment] = useState(false); // Specific state for comment saving
  const [searchTerm, setSearchTerm] = useState(''); // State for transaction search
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null); // Track which transaction comment is being edited
  const [currentCommentText, setCurrentCommentText] = useState(''); // Hold the text of the comment being edited
  const [commentToDelete, setCommentToDelete] = useState<{ weekKey: string, transactionId: string } | null>(null); // Track comment to delete


  const currentWeekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart]);
  const currentWeekKey = useMemo(() => getWeekKey(currentWeekStart), [currentWeekStart]);

  // Effect to reset state when the week changes
  useEffect(() => {
    // Don't reset search term when week changes, allow searching across weeks
    // setSearchTerm('');
    setEditingCommentId(null);
    setCurrentCommentText('');
    setCommentToDelete(null);
    // Journal entry is now handled per-journal card, no longer a single state needed here
  }, [currentWeekKey]);

  // Filter transactions for the selected week AND apply search term
  // Search now filters ALL transactions first, then the table shows the subset for the CURRENT week
  const filteredTransactionsForAllTime = useMemo(() => {
      const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
      if (lowerCaseSearchTerm === '') {
          return allTransactions; // No search term, return all
      }
      return allTransactions.filter((tx) => {
         // Filter by search term (description or amount)
          return tx.description.toLowerCase().includes(lowerCaseSearchTerm) ||
                 tx.amount.toString().includes(searchTerm) || // Allow searching by amount string
                 tx.id.toLowerCase().includes(lowerCaseSearchTerm); // Allow searching by ID substring
      });
  }, [allTransactions, searchTerm]);


  // Transactions displayed in the table are filtered by BOTH search and the current week
  const weeklyTransactionsToDisplay = useMemo(() => {
    return filteredTransactionsForAllTime.filter((tx) => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return false; // Skip invalid dates
        return txDate >= currentWeekStart && txDate <= currentWeekEnd;
      })
      .sort((a, b) => { // Sort by date descending within the week
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
            return dateB.getTime() - dateA.getTime();
         });
  }, [filteredTransactionsForAllTime, currentWeekStart, currentWeekEnd]);


  // Calculate metrics and journal data for ALL reviewed weeks
  const processedReviews = useMemo(() => {
    return Object.entries(reviews)
        .map(([weekKey, reviewData]) => {
            const dateRange = getWeekDateRange(weekKey);
            if (!dateRange) return null; // Skip if week key is invalid

            const weeklyTxs = allTransactions.filter(tx => {
                const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
                return !isNaN(txDate.getTime()) && txDate >= dateRange.start && txDate <= dateRange.end;
            });

             const netFlow = weeklyTxs.reduce((sum, tx) => sum + tx.amount, 0);
             const varianceResult = calculateBudgetVariance(weeklyTxs, budgetItems);


            return {
                weekKey,
                journal: reviewData.journal,
                dateRange,
                transactionCount: weeklyTxs.length,
                netFlow,
                budgetVariance: varianceResult.variance,
                 varianceStatus: varianceResult.status,
            };
        })
        .filter(review => review !== null) // Remove null entries from invalid week keys
        // Sort reviews by week descending (most recent first)
         .sort((a, b) => b!.dateRange.start.getTime() - a!.dateRange.start.getTime());
  }, [reviews, allTransactions, budgetItems]);


  // Handlers for week navigation
  const goToPreviousWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  };

  const goToNextWeek = () => {
    // Allow going up to the current week
    if (currentWeekEnd < endOfWeek(new Date(), { weekStartsOn: 1 })) { // Check end of current real week
        setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    } else {
        toast({ title: "Future Travel Denied!", description: "Cannot review future weeks.", variant: "default" });
    }
  };

  // --- Comment Handlers (remain mostly the same) ---

   const handleEditCommentClick = (transactionId: string) => {
      setEditingCommentId(transactionId);
      setCurrentCommentText(getTransactionComment(currentWeekKey, transactionId) || '');
  };

  const handleCancelEditComment = () => {
      setEditingCommentId(null);
      setCurrentCommentText('');
  };

  const handleSaveComment = (transactionId: string) => {
      setIsSavingComment(true);
      try {
          setTransactionComment(currentWeekKey, transactionId, currentCommentText.trim());
          toast({ title: 'Comment Saved', description: 'Transaction comment updated.' });
          handleCancelEditComment(); // Exit edit mode
      } catch (error) {
          console.error("Error saving comment:", error);
          toast({ title: 'Save Failed', description: 'Could not save comment.', variant: 'destructive' });
      } finally {
          setIsSavingComment(false);
      }
  };

  const handleDeleteCommentClick = (transactionId: string) => {
      setCommentToDelete({ weekKey: currentWeekKey, transactionId });
  };

  const confirmDeleteComment = () => {
      if (!commentToDelete) return;
      try {
          deleteTransactionComment(commentToDelete.weekKey, commentToDelete.transactionId);
          toast({ title: 'Comment Deleted', description: 'Transaction comment removed.' });
          setCommentToDelete(null); // Close dialog
          if (editingCommentId === commentToDelete.transactionId) {
              handleCancelEditComment(); // Cancel edit if deleting the currently edited comment
          }
      } catch (error) {
          console.error("Error deleting comment:", error);
          toast({ title: 'Delete Failed', description: 'Could not delete comment.', variant: 'destructive' });
          setCommentToDelete(null); // Close dialog even on error
      }
  };

   // --- Journal Handlers (Now specific to a journal card) ---
   // Use a local state within each JournalCard component if needed,
   // or pass down setters if managing state centrally is preferred (more complex)
   // For simplicity, we'll call the store directly from the button for now.

   const handleSaveJournalForWeek = (weekKey: string, journalText: string) => {
        // Potentially add a loading state specific to that card if complex UI needed
       try {
           setJournalEntry(weekKey, journalText);
           toast({ title: 'Journal Saved', description: `Saved entry for week ${weekKey}.` });
       } catch (error) {
           console.error("Error saving journal:", error);
           toast({ title: 'Save Failed', description: 'Could not save journal entry.', variant: 'destructive' });
       }
   };


   // --- Component for displaying a single Journal Entry Card ---
    const JournalCard = ({ review }: { review: NonNullable<typeof processedReviews[number]> }) => {
        const [journalText, setJournalText] = useState(review.journal);
        const [isSaving, setIsSaving] = useState(false);
        const dateRangeStr = `${format(review.dateRange.start, 'MMM d')} - ${format(review.dateRange.end, 'MMM d, yyyy')}`;
        const isCurrentEditingWeek = review.weekKey === currentWeekKey;

        // Update local text if the store changes (e.g., due to initial load or external update)
        useEffect(() => {
            setJournalText(review.journal);
        }, [review.journal]);

        const handleLocalSave = () => {
            setIsSaving(true);
             handleSaveJournalForWeek(review.weekKey, journalText);
            setIsSaving(false);
        };

        return (
            <Card className="flex flex-col">
                 <CardHeader className="p-4 border-b">
                     <div className="flex justify-between items-start gap-2">
                         <div>
                            <CardTitle className="text-base font-semibold">
                                Journal: {dateRangeStr} ({review.weekKey})
                            </CardTitle>
                             <CardDescription className="text-xs mt-1 space-x-2">
                                 <span>{review.transactionCount} transactions</span>
                                 <span>|</span>
                                 <span className={cn(review.netFlow >= 0 ? "text-accent" : "text-destructive")}>
                                    Net: {formatCurrency(review.netFlow)}
                                 </span>
                                 <span>|</span>
                                 <span className={cn(
                                     review.varianceStatus === 'no-data' && 'text-muted-foreground',
                                     (review.varianceStatus === 'on-track' || review.varianceStatus === 'under-budget') && 'text-accent',
                                     review.varianceStatus === 'over-budget' && 'text-destructive'
                                 )}>
                                     Var: {review.varianceStatus === 'no-data' ? 'N/A' : `${review.budgetVariance >= 0 ? '+' : ''}${formatCurrency(review.budgetVariance)}`}
                                     <Badge variant={
                                        review.varianceStatus === 'no-data' ? 'outline' :
                                        (review.varianceStatus === 'on-track' || review.varianceStatus === 'under-budget') ? 'default' : // Use default (primary) for favorable
                                        'destructive' // Destructive for unfavorable
                                        }
                                         className={cn("ml-1 text-xs px-1.5 py-0 h-4",
                                              review.varianceStatus === 'on-track' || review.varianceStatus === 'under-budget' ? 'bg-accent border-accent' : ''
                                         )}>
                                         {review.varianceStatus === 'no-data' ? 'No Data' :
                                          review.varianceStatus === 'on-track' ? 'On Track' :
                                          review.varianceStatus === 'under-budget' ? 'Favorable' : 'Unfavorable'}
                                     </Badge>
                                 </span>
                             </CardDescription>
                         </div>
                         {/* Show save button only if text changed */}
                         {journalText !== review.journal && (
                             <Button size="sm" onClick={handleLocalSave} disabled={isSaving}>
                                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                 {isSaving ? 'Saving...' : 'Save'}
                             </Button>
                         )}
                     </div>
                 </CardHeader>
                 <CardContent className="p-4 flex-grow">
                     <Textarea
                         placeholder="Write your reflections for this week..."
                         value={journalText}
                         onChange={(e) => setJournalText(e.target.value)}
                         className="min-h-[150px] w-full border rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-muted/20"
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
            <CalendarCheck className="h-6 w-6 text-primary" /> Weekly Review & Comments
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review transactions, add comments, and journal about your financial progress.
          </p>
        </div>
         {/* Week Navigation */}
        <div className="flex items-center gap-2 flex-shrink-0">
           <Button variant="outline" size="icon" onClick={goToPreviousWeek} className="h-8 w-8">
             <ChevronLeft className="h-4 w-4" />
             <span className="sr-only">Previous Week</span>
           </Button>
           <span className="text-sm font-medium w-40 text-center"> {/* Adjusted width */}
             {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}
           </span>
           <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-8 w-8" disabled={currentWeekEnd >= endOfWeek(new Date(), { weekStartsOn: 1 })}>
             <ChevronRight className="h-4 w-4" />
             <span className="sr-only">Next Week</span>
           </Button>
         </div>
      </header>

      {/* Search Component */}
       <Card>
         <CardHeader className="p-4 border-b">
           <CardTitle className="text-base font-semibold">Search All Transactions</CardTitle>
           <CardDescription className="text-xs">Search by description, amount, or ID substring across all time.</CardDescription>
         </CardHeader>
         <CardContent className="p-4">
           <div className="relative">
             <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
             <Input
               type="search"
               placeholder="Search all transactions..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-8 h-9 w-full"
             />
           </div>
         </CardContent>
       </Card>


      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6"> {/* Two columns for larger screens */}

         {/* Left Column: Current Week Transactions & Comments */}
         <div className="space-y-6">
             <Card className="flex flex-col">
                <CardHeader className="p-4 border-b">
                   <CardTitle className="text-lg">Transactions for Current Week</CardTitle>
                   <CardDescription className="text-sm">
                        Review transactions for {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}. Add comments as needed.
                        {searchTerm && <span className='block text-xs mt-1 text-primary'>Filtering by search term: "{searchTerm}"</span>}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow p-0">
                   <ScrollArea className="h-[400px] w-full"> {/* Fixed height for table */}
                       <Table>
                           <TableHeader className="sticky top-0 bg-background z-10">
                               <TableRow>
                                   <TableHead className="w-[50px]"></TableHead> {/* Status Icon Placeholder */}
                                   <TableHead className="w-[100px]">Date</TableHead>
                                   <TableHead className="w-[90px]">ID (Ref)</TableHead>
                                   <TableHead>Description</TableHead>
                                   <TableHead className="text-right">Amount (KES)</TableHead>
                                   <TableHead>Comment / Actions</TableHead> {/* Combined Comment/Actions */}
                               </TableRow>
                           </TableHeader>
                           <TableBody>
                               {weeklyTransactionsToDisplay.length > 0 ? (
                                   weeklyTransactionsToDisplay.map((tx) => {
                                       const existingComment = getTransactionComment(currentWeekKey, tx.id);
                                       const isEditingThis = editingCommentId === tx.id;

                                       return (
                                           <TableRow key={tx.id}>
                                               <TableCell className="text-center">
                                                     {/* Placeholder or icon to indicate comment status */}
                                                     {existingComment ? (
                                                         <MessageSquareText size={16} className="text-muted-foreground mx-auto" title="Has comment"/>
                                                     ) : (
                                                          <MessageSquarePlus size={16} className="text-muted-foreground/50 mx-auto" title="No comment"/>
                                                     )}
                                                </TableCell>
                                               <TableCell className="text-xs">{formatDate(tx.date)}</TableCell>
                                               <TableCell className="text-xs text-muted-foreground font-mono max-w-[70px] truncate" title={tx.id}>
                                                  {tx.id.substring(tx.id.length - 6)} {/* Show last 6 chars of ID */}
                                               </TableCell>
                                               <TableCell className="max-w-[200px] truncate" title={tx.description}>{tx.description}</TableCell>
                                               <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-accent' : 'text-destructive')}>
                                                   {formatCurrency(tx.amount)}
                                               </TableCell>
                                               <TableCell className="min-w-[250px]"> {/* Ensure enough space */}
                                                     {isEditingThis ? (
                                                         // Edit Comment Form
                                                         <div className="flex items-center gap-2">
                                                             <Textarea
                                                                 value={currentCommentText}
                                                                 onChange={(e) => setCurrentCommentText(e.target.value)}
                                                                 placeholder="Add your comment..."
                                                                 rows={1}
                                                                 className="text-xs flex-grow min-h-[36px] max-h-[100px]" // Smaller textarea
                                                                 />
                                                              <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => handleSaveComment(tx.id)} disabled={isSavingComment}>
                                                                   {isSavingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                              </Button>
                                                              <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={handleCancelEditComment}>
                                                                  <XCircle className="h-4 w-4" />
                                                              </Button>
                                                          </div>
                                                     ) : (
                                                         // Display Comment & Action Buttons
                                                         <div className="flex items-center justify-between gap-2">
                                                             <p className={cn("text-xs flex-grow truncate", !existingComment && "italic text-muted-foreground/70")} title={existingComment}>
                                                                 {existingComment || 'No comment yet...'}
                                                             </p>
                                                              <div className="flex items-center flex-shrink-0">
                                                                  {/* Edit Button */}
                                                                  <Button variant="ghost" size="icon" className="mr-1 h-6 w-6" onClick={() => handleEditCommentClick(tx.id)}>
                                                                     <Edit className="h-3 w-3" />
                                                                     <span className="sr-only">Edit Comment</span>
                                                                 </Button>
                                                                  {/* Delete Button (only if comment exists) */}
                                                                 {existingComment && (
                                                                     <AlertDialog open={commentToDelete?.transactionId === tx.id && commentToDelete?.weekKey === currentWeekKey} onOpenChange={(open) => !open && setCommentToDelete(null)}>
                                                                          <AlertDialogTrigger asChild>
                                                                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-6 w-6" onClick={() => handleDeleteCommentClick(tx.id)}>
                                                                                  <Trash2 className="h-3 w-3" />
                                                                                  <span className="sr-only">Delete Comment</span>
                                                                              </Button>
                                                                          </AlertDialogTrigger>
                                                                         <AlertDialogContent>
                                                                             {commentToDelete && commentToDelete.transactionId === tx.id && commentToDelete.weekKey === currentWeekKey && (
                                                                                <>
                                                                                 <AlertDialogHeader>
                                                                                     <AlertDialogTitle>Delete Comment?</AlertDialogTitle>
                                                                                     <AlertDialogDescription>
                                                                                          Are you sure you want to delete the comment for transaction: <br/>
                                                                                          <strong>{tx.description} ({formatCurrency(tx.amount)})</strong>? <br/> This action cannot be undone.
                                                                                     </AlertDialogDescription>
                                                                                 </AlertDialogHeader>
                                                                                 <AlertDialogFooter>
                                                                                     <AlertDialogCancel onClick={() => setCommentToDelete(null)}>Cancel</AlertDialogCancel>
                                                                                     <AlertDialogAction onClick={confirmDeleteComment}>Delete</AlertDialogAction>
                                                                                 </AlertDialogFooter>
                                                                                </>
                                                                             )}
                                                                         </AlertDialogContent>
                                                                      </AlertDialog>
                                                                  )}
                                                              </div>
                                                          </div>
                                                     )}
                                               </TableCell>
                                           </TableRow>
                                       );
                                   })
                               ) : (
                                   <TableRow>
                                       <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                           {searchTerm ? 'No transactions match your search for this week.' : 'No transactions recorded for this week.'}
                                       </TableCell>
                                   </TableRow>
                               )}
                           </TableBody>
                       </Table>
                   </ScrollArea>
                </CardContent>
              </Card>
         </div>


         {/* Right Column: Previous Journal Entries */}
          <div className="space-y-6">
              <Card>
                  <CardHeader className='p-4 border-b'>
                      <CardTitle className='text-lg flex items-center gap-2'><BookOpen className='h-5 w-5'/> Journal History</CardTitle>
                      <CardDescription className='text-sm'>View and edit your past weekly reflections.</CardDescription>
                  </CardHeader>
                  <CardContent className='p-4'>
                      {processedReviews.length > 0 ? (
                           <ScrollArea className="h-[calc(100vh-250px)] w-full pr-4"> {/* Adjust height */}
                               <div className="space-y-4">
                                  {processedReviews.map(review => review && <JournalCard key={review.weekKey} review={review} />)}
                               </div>
                           </ScrollArea>
                      ) : (
                          <div className="h-[200px] flex flex-col items-center justify-center text-center text-muted-foreground">
                              <BookOpen className="h-10 w-10 mb-2 text-muted-foreground/50"/>
                              <p>No journal entries found.</p>
                              <p className="text-xs mt-1">Journal entries will appear here once you save them for a specific week.</p>
                          </div>
                      )}
                  </CardContent>
              </Card>
          </div>

      </main>

    </div>
  );
}

