
// src/app/(dashboard)/weekly-review/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore'; // Import the updated store
import { startOfWeek, endOfWeek, format, subWeeks, addWeeks } from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, Save, Search, Info, Loader2, MessageSquarePlus, MessageSquareText, Trash2, Edit, XCircle, BookOpen } from 'lucide-react'; // Added BookOpen
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";


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

  // Weekly Review Store - Including new comment actions
  const { reviews, setJournalEntry, getReviewForWeek, setTransactionComment, deleteTransactionComment, getTransactionComment } = useWeeklyReviewStore();

  // State for the selected week
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday as start
  const [isSavingJournal, setIsSavingJournal] = useState(false); // Specific state for journal saving
  const [isSavingComment, setIsSavingComment] = useState(false); // Specific state for comment saving
  const [searchTerm, setSearchTerm] = useState(''); // State for transaction search
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null); // Track which transaction comment is being edited
  const [currentCommentText, setCurrentCommentText] = useState(''); // Hold the text of the comment being edited
  const [commentToDelete, setCommentToDelete] = useState<{ weekKey: string, transactionId: string } | null>(null); // Track comment to delete
  const [currentJournalEntry, setCurrentJournalEntry] = useState(''); // State for the journal entry textarea


  const currentWeekEnd = useMemo(() => endOfWeek(currentWeekStart, { weekStartsOn: 1 }), [currentWeekStart]);
  const currentWeekKey = useMemo(() => getWeekKey(currentWeekStart), [currentWeekStart]);

  // Effect to reset state and load journal when the week changes
  useEffect(() => {
    setSearchTerm('');
    setEditingCommentId(null);
    setCurrentCommentText('');
    setCommentToDelete(null);
    // Load journal entry for the current week
    const review = getReviewForWeek(currentWeekKey);
    setCurrentJournalEntry(review?.journal || '');
  }, [currentWeekKey, getReviewForWeek]);

  // Filter transactions for the selected week AND apply search term
  const weeklyTransactions = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return transactions
      .filter((tx) => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (isNaN(txDate.getTime())) return false; // Skip invalid dates
        const isInWeek = txDate >= currentWeekStart && txDate <= currentWeekEnd;
         // Filter by search term (description or amount)
         const matchesSearch = lowerCaseSearchTerm === '' ||
             tx.description.toLowerCase().includes(lowerCaseSearchTerm) ||
             tx.amount.toString().includes(searchTerm); // Allow searching by amount string
        return isInWeek && matchesSearch;
      })
      .sort((a, b) => { // Sort by date descending within the week
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
            return dateB.getTime() - dateA.getTime();
         });
  }, [transactions, currentWeekStart, currentWeekEnd, searchTerm]); // Add searchTerm dependency

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

  // --- Comment Handlers ---

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

   // --- Journal Handlers ---
   const handleJournalChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
       setCurrentJournalEntry(event.target.value);
   };

   const handleSaveJournal = () => {
       setIsSavingJournal(true);
       try {
           setJournalEntry(currentWeekKey, currentJournalEntry);
           toast({ title: 'Journal Saved', description: `Saved entry for week ${currentWeekKey}.` });
       } catch (error) {
           console.error("Error saving journal:", error);
           toast({ title: 'Save Failed', description: 'Could not save journal entry.', variant: 'destructive' });
       } finally {
           setIsSavingJournal(false);
       }
   };


  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" /> Weekly Review & Comments
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review transactions and journal about your financial progress for the selected week.
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
           <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-8 w-8" disabled={currentWeekEnd >= startOfWeek(new Date(), { weekStartsOn: 1 })}>
             <ChevronRight className="h-4 w-4" />
             <span className="sr-only">Next Week</span>
           </Button>
         </div>
      </header>

      {/* Search and Filter Component */}
       <Card>
         <CardHeader className="p-4 border-b">
           <CardTitle className="text-base font-semibold">Filter Transactions</CardTitle>
           <CardDescription className="text-xs">Search by description or amount.</CardDescription>
         </CardHeader>
         <CardContent className="p-4">
           <div className="relative">
             <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
             <Input
               type="search"
               placeholder="Search this week's transactions..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-8 h-9 w-full"
             />
           </div>
           {/* Future: Add more filters here (e.g., income/expense, category) */}
         </CardContent>
       </Card>


      <main className="flex-1 grid grid-cols-1 gap-6"> {/* Simplified layout */}
        {/* Transactions Table with Comments */}
        <Card className="flex flex-col">
           <CardHeader className="p-4 border-b">
              <CardTitle className="text-lg">Transactions & Comments</CardTitle>
              <CardDescription className="text-sm">Review transactions and add comments.</CardDescription>
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
                          {weeklyTransactions.length > 0 ? (
                              weeklyTransactions.map((tx) => {
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

         {/* Weekly Journal Section */}
         <Card className="flex flex-col">
             <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
                  <div>
                     <CardTitle className="text-lg flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" /> Weekly Journal
                     </CardTitle>
                      <CardDescription className="text-sm mt-1">Reflect on your financial progress and goals for the week.</CardDescription>
                  </div>
                  <Button size="sm" onClick={handleSaveJournal} disabled={isSavingJournal}>
                      {isSavingJournal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {isSavingJournal ? 'Saving...' : 'Save Journal'}
                  </Button>
             </CardHeader>
             <CardContent className="p-4 flex-grow">
                  <Textarea
                      placeholder="Write your weekly financial reflections, challenges, and successes here..."
                      value={currentJournalEntry}
                      onChange={handleJournalChange}
                       className="min-h-[200px] w-full border rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-muted/20" // Notion-like styling
                      aria-label="Weekly journal entry"
                  />
             </CardContent>
         </Card>

      </main>

    </div>
  );
}

    