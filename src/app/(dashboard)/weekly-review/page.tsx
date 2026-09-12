// src/app/(dashboard)/weekly-review/page.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore';
import { useBudgetStore, selectNetBudgeted } from '@/store/budgetStore';
import { useAuth } from '@/context/AuthContext';
import { 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  format, 
  subWeeks, 
  addWeeks, 
  subMonths, 
  addMonths, 
  getISOWeek, 
  isWithinInterval 
} from 'date-fns';
import { 
  CalendarCheck, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  MessageSquare,
  MessageSquarePlus, 
  MessageSquareText, 
  Trash2, 
  BookOpen, 
  TrendingUp, 
  TrendingDown, 
  Share2, 
  Users, 
  Clock, 
  Calendar, 
  ShieldCheck, 
  Send, 
  User, 
  CheckCircle2, 
  Info,
  Loader2,
  Sparkles,
  Filter,
  Check,
  Maximize2,
  Minimize2,
  RotateCcw
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, CollaboratorComment, SharedReviewRecord, ShareScopeType } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger as ShadAlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShareReviewDialog } from '@/components/weekly-review/ShareReviewDialog';
import { ReviewChat } from '@/components/weekly-review/ReviewChat';
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
import { 
  getSharedReviewsForRecipientApi, 
  addCommentToSharedReviewApi, 
  getSharesCreatedByOwnerApi 
} from '@/app/actions/shareActions';

/**
 * Formats a given date object or string into a standardized localized string.
 */
const formatDate = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return 'Invalid Date';
  return format(dateObj, 'MMM d, yyyy');
};

/**
 * Formats date into YYYY-MM key representation.
 */
const formatToPeriodKey = (date: Date): string => {
  return format(date, 'yyyy-MM');
};

/**
 * Renders concise category pill tag.
 */
const formatCategoryBadge = (value: string | undefined) => {
  if (!value) return null;
  const isSpecial = value === 'recurring' || value === 'fixed';
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
        isSpecial
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-muted text-muted-foreground border border-border/40"
      )}
    >
      {value}
    </span>
  );
};

// Journal reflection template prompts
const REFLECTION_PROMPTS = [
  {
    title: '🏆 Key Wins',
    content: '🎯 **Key Wins & Savings:**\n- Stayed under budget on...\n- Successfully avoided unnecessary impulse spending on...\n',
  },
  {
    title: '💡 Lessons Learned',
    content: '💡 **Observations & Lessons:**\n- Noticed unexpected expenses in...\n- Need to plan ahead for...\n',
  },
  {
    title: '📉 Action Items',
    content: '📉 **Adjustments for Next Week:**\n1. Review recurring subscriptions\n2. Reallocate budget for dining/groceries\n3. Increase emergency savings contribution\n',
  },
  {
    title: '🤝 Peer Feedback',
    content: '🤝 **Collaborator Discussion Takeaways:**\n- Discussed high-ticket transactions with reviewer.\n- Agreed strategy for optimizing upcoming payments.\n',
  },
];

type FilterType = 'all' | 'income' | 'expense' | 'comments' | 'recurring';

export default function WeeklyReviewPage() {
  const { user, userId, isSignedIn } = useAuth();
  const { transactions: allTransactions } = useTransactionsStore();
  const setBudgetPeriod = useBudgetStore(state => state.setBudgetPeriod);

  const {
    ownedReviews,
    setJournalEntry,
    setTransactionComment,
    addCollaboratorComment,
  } = useWeeklyReviewStore();

  const { toast } = useToast();

  // Review Scope & Range state
  const [viewScope, setViewScope] = useState<ShareScopeType>('week');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonthStart, setCurrentMonthStart] = useState(() => startOfMonth(new Date()));
  const [customRange, setCustomRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeTab, setActiveTab] = useState<"owned" | "shared">("owned");
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isFocusJournalMode, setIsFocusJournalMode] = useState(false);

  // Comment Dialog states
  const [isCommentDialogOpen, setIsCommentDialogOpen] = useState(false);
  const [commentingTransaction, setCommentingTransaction] = useState<TransactionWithId | null>(null);
  const [newCommentInput, setNewCommentInput] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Journal Deletion Dialog
  const [isDeleteJournalDialogOpen, setIsDeleteJournalDialogOpen] = useState(false);

  // Recipient / Shared reviews state
  const [sharedReviewsList, setSharedReviewsList] = useState<SharedReviewRecord[]>([]);
  const [selectedSharedReviewId, setSelectedSharedReviewId] = useState<string | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(false);

  // Owner active shares catalog for retention indicator
  const [ownerShares, setOwnerShares] = useState<SharedReviewRecord[]>([]);

  // Current period key according to scope
  const currentPeriodDetails = useMemo(() => {
    if (viewScope === 'week') {
      const start = currentWeekStart;
      const end = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const weekNumber = getISOWeek(start);
      const key = getWeekKey(start);
      return {
        key,
        label: `Week ${weekNumber}`,
        subLabel: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
        startDate: start,
        endDate: end,
      };
    } else if (viewScope === 'month') {
      const start = currentMonthStart;
      const end = endOfMonth(currentMonthStart);
      const key = format(start, 'yyyy-MM');
      return {
        key,
        label: format(start, 'MMMM yyyy'),
        subLabel: `${format(start, 'MMM 1')} – ${format(end, 'MMM d, yyyy')}`,
        startDate: start,
        endDate: end,
      };
    } else {
      const start = new Date(`${customRange.start}T00:00:00`);
      const end = new Date(`${customRange.end}T23:59:59`);
      const key = `${customRange.start}_${customRange.end}`;
      return {
        key,
        label: 'Custom Range',
        subLabel: `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`,
        startDate: start,
        endDate: end,
      };
    }
  }, [viewScope, currentWeekStart, currentMonthStart, customRange]);

  const currentPeriodKey = currentPeriodDetails.key;

  // Sync budget period context
  useEffect(() => {
    const correspondingMonthPeriod = formatToPeriodKey(currentPeriodDetails.startDate);
    setBudgetPeriod(correspondingMonthPeriod);
  }, [currentPeriodDetails, setBudgetPeriod]);

  // Load reviews shared with current user (recipient)
  const loadSharedWithMe = useCallback(async () => {
    if (!isSignedIn || !userId) return;
    setIsLoadingShared(true);
    try {
      const list = await getSharedReviewsForRecipientApi(userId);
      setSharedReviewsList(list);
      if (list.length > 0 && !selectedSharedReviewId) {
        setSelectedSharedReviewId(list[0].id);
      }
    } catch (e) {
      console.warn('Error loading shared reviews:', e);
    } finally {
      setIsLoadingShared(false);
    }
  }, [isSignedIn, userId, selectedSharedReviewId]);

  // Load owner shares for collaboration indicator
  const loadOwnerShares = useCallback(async () => {
    if (!isSignedIn || !userId) return;
    try {
      const list = await getSharesCreatedByOwnerApi(userId);
      setOwnerShares(list);
    } catch (e) {
      console.warn('Error loading owner shares:', e);
    }
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (isSignedIn && userId) {
      loadSharedWithMe();
      loadOwnerShares();
    }
  }, [isSignedIn, userId, loadSharedWithMe, loadOwnerShares]);

  // Active shared review when on "shared" tab
  const activeSharedRecord = useMemo(() => {
    if (!selectedSharedReviewId) return sharedReviewsList[0] || null;
    return sharedReviewsList.find(s => s.id === selectedSharedReviewId) || sharedReviewsList[0] || null;
  }, [selectedSharedReviewId, sharedReviewsList]);

  // Current review record for owned tab
  const currentOwnedReview = useMemo(() => {
    return ownedReviews[currentPeriodKey];
  }, [currentPeriodKey, ownedReviews]);

  const activeOwnedSharedRecord = useMemo(() => {
    if (!userId) return null;
    return ownerShares.find(s => s.periodKey === currentPeriodKey && s.ownerId === userId) || null;
  }, [ownerShares, currentPeriodKey, userId]);

  const commentsCountForCurrentPeriod = useMemo(() => {
    let count = 0;
    if (activeTab === 'shared' && activeSharedRecord?.comments) {
      Object.values(activeSharedRecord.comments).forEach((commentsList) => {
        if (Array.isArray(commentsList)) count += commentsList.length;
      });
    } else if (currentOwnedReview?.collaboratorComments) {
      Object.values(currentOwnedReview.collaboratorComments).forEach((commentsList) => {
        if (Array.isArray(commentsList)) count += commentsList.length;
      });
    }
    return count;
  }, [activeTab, activeSharedRecord, currentOwnedReview]);

  // Filtered transactions for current period
  const scopedTransactions = useMemo(() => {
    if (activeTab === 'shared' && activeSharedRecord) {
      if (activeSharedRecord.transactionsSnapshot && activeSharedRecord.transactionsSnapshot.length > 0) {
        return activeSharedRecord.transactionsSnapshot;
      }
    }

    const { startDate, endDate } = currentPeriodDetails;
    return allTransactions.filter(tx => {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (isNaN(txDate.getTime())) return false;
      return isWithinInterval(txDate, { start: startDate, end: endDate });
    }).sort((a, b) => {
      const dateA = a.date instanceof Date ? a.date : new Date(a.date);
      const dateB = b.date instanceof Date ? b.date : new Date(b.date);
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  }, [activeTab, activeSharedRecord, currentPeriodDetails, allTransactions]);

  // Helper to get all comments for a transaction
  const getTransactionCommentDetails = useCallback((transactionId: string): CollaboratorComment[] => {
    const list: CollaboratorComment[] = [];

    // 1. From active shared record if on shared tab
    if (activeTab === 'shared' && activeSharedRecord?.comments?.[transactionId]) {
      list.push(...activeSharedRecord.comments[transactionId]);
    }

    // 2. From owner's review store
    if (currentOwnedReview?.collaboratorComments?.[transactionId]) {
      list.push(...currentOwnedReview.collaboratorComments[transactionId]);
    }

    // 3. Fallback from owner's simple transactionComments
    const simpleComment = currentOwnedReview?.transactionComments?.[transactionId];
    if (simpleComment && !list.some(c => c.comment === simpleComment)) {
      list.unshift({
        id: `owner_simple_${transactionId}`,
        transactionId,
        authorId: userId || 'owner',
        authorName: user?.fullName || 'Owner',
        role: 'owner',
        comment: simpleComment,
        createdAt: new Date().toISOString(),
      });
    }

    // 4. Also check owner shares catalog
    ownerShares.forEach(share => {
      if (share.comments?.[transactionId]) {
        share.comments[transactionId].forEach(c => {
          if (!list.some(existing => existing.id === c.id || existing.comment === c.comment)) {
            list.push(c);
          }
        });
      }
    });

    return list;
  }, [activeTab, activeSharedRecord, currentOwnedReview, ownerShares, userId, user?.fullName]);

  // Apply Search & Tag filters
  const filteredTransactions = useMemo(() => {
    return scopedTransactions.filter(tx => {
      // Search term filter
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        const matchesDesc = tx.description.toLowerCase().includes(lower);
        const matchesAmount = tx.amount.toString().includes(lower);
        const matchesMode = tx.modeOfPayment?.toLowerCase().includes(lower);
        if (!matchesDesc && !matchesAmount && !matchesMode) return false;
      }

      // Quick filter buttons
      if (activeFilter === 'income') return tx.amount > 0;
      if (activeFilter === 'expense') return tx.amount < 0;
      if (activeFilter === 'recurring') return tx.frequency === 'recurring';
      if (activeFilter === 'comments') {
        const comments = getTransactionCommentDetails(tx.id);
        return comments.length > 0;
      }

      return true;
    });
  }, [scopedTransactions, searchTerm, activeFilter, getTransactionCommentDetails]);

  // Metric computations
  const metrics = useMemo(() => {
    let income = 0;
    let expenses = 0;
    let commentedCount = 0;

    scopedTransactions.forEach(tx => {
      if (tx.amount > 0) income += tx.amount;
      if (tx.amount < 0) expenses += Math.abs(tx.amount);
      if (getTransactionCommentDetails(tx.id).length > 0) commentedCount += 1;
    });

    const netFlow = income - expenses;
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netCashFlow: netFlow,
      savingsRate,
      count: scopedTransactions.length,
      commentedCount,
    };
  }, [scopedTransactions, getTransactionCommentDetails]);

  // Journal entries
  const journalEntry = activeTab === 'owned' 
    ? (currentOwnedReview?.journal || '')
    : (activeSharedRecord?.journal || '');

  const handleJournalChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeTab === 'owned' && userId && isSignedIn) {
      setJournalEntry(currentPeriodKey, event.target.value, userId);
    } else {
      toast({ 
        title: "Comment-Only Permission", 
        description: "Collaborators have comment-only rights and cannot modify the owner's journal.", 
        variant: "default" 
      });
    }
  };

  const handleInsertPrompt = (promptContent: string) => {
    if (activeTab !== 'owned' || !userId || !isSignedIn) return;
    const updated = journalEntry ? `${journalEntry.trim()}\n\n${promptContent}` : promptContent;
    setJournalEntry(currentPeriodKey, updated, userId);
    toast({
      title: "Prompt Added",
      description: "Template inserted into your financial journal.",
    });
  };

  const confirmDeleteJournal = () => {
    if (activeTab === 'owned' && userId && isSignedIn) {
      setJournalEntry(currentPeriodKey, '', userId); 
      toast({ title: "Journal Cleared", description: `Journal entry for ${currentPeriodDetails.label} cleared.` });
    }
    setIsDeleteJournalDialogOpen(false);
  };

  // Open comment dialog
  const handleOpenCommentDialog = (tx: TransactionWithId) => {
    setCommentingTransaction(tx);
    setNewCommentInput('');
    setIsCommentDialogOpen(true);
  };

  // Save / Post comment
  const handlePostComment = async () => {
    if (!commentingTransaction || !newCommentInput.trim() || !isSignedIn || !userId) {
      return;
    }

    setIsSubmittingComment(true);
    try {
      const isOwner = activeTab === 'owned';
      const role: 'owner' | 'reviewer' = isOwner ? 'owner' : 'reviewer';
      const authorName = user?.fullName || user?.email || (isOwner ? 'Owner' : 'Collaborator');
      const authorEmail = user?.email || undefined;

      const newComment: CollaboratorComment = {
        id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        transactionId: commentingTransaction.id,
        authorId: userId,
        authorName,
        authorEmail,
        role,
        comment: newCommentInput.trim(),
        createdAt: new Date().toISOString(),
      };

      if (activeTab === 'shared' && activeSharedRecord) {
        await addCommentToSharedReviewApi({
          shareId: activeSharedRecord.id,
          transactionId: commentingTransaction.id,
          txDescription: commentingTransaction.description,
          comment: newCommentInput.trim(),
          author: {
            userId,
            name: authorName,
            email: authorEmail,
            role: 'reviewer',
          },
        });

        setSharedReviewsList(prev => prev.map(s => {
          if (s.id === activeSharedRecord.id) {
            const comments = { ...(s.comments || {}) };
            if (!comments[commentingTransaction.id]) comments[commentingTransaction.id] = [];
            comments[commentingTransaction.id].push(newComment);
            return { ...s, comments };
          }
          return s;
        }));

        toast({
          title: "Feedback Posted",
          description: `Comment on "${commentingTransaction.description}" added.`,
        });
      } else {
        addCollaboratorComment(currentPeriodKey, commentingTransaction.id, newComment, 'owned');
        setTransactionComment(currentPeriodKey, commentingTransaction.id, newCommentInput.trim(), userId);

        toast({
          title: "Comment Saved",
          description: `Comment on "${commentingTransaction.description}" saved.`,
        });
      }

      setNewCommentInput('');
    } catch (e: any) {
      toast({ title: "Failed to post comment", description: e?.message || "Error", variant: "destructive" });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Period navigation helpers
  const handlePrev = () => {
    if (viewScope === 'week') setCurrentWeekStart(subWeeks(currentWeekStart, 1));
    else if (viewScope === 'month') setCurrentMonthStart(subMonths(currentMonthStart, 1));
  };

  const handleNext = () => {
    if (viewScope === 'week') setCurrentWeekStart(addWeeks(currentWeekStart, 1));
    else if (viewScope === 'month') setCurrentMonthStart(addMonths(currentMonthStart, 1));
  };

  const handleResetToCurrent = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setCurrentMonthStart(startOfMonth(new Date()));
  };

  const wordCount = useMemo(() => {
    if (!journalEntry) return 0;
    return journalEntry.trim().split(/\s+/).filter(Boolean).length;
  }, [journalEntry]);

  return (
    <div className="flex flex-col w-full min-h-screen p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header section */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Financial Review & Reflections
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                Audit cashflow trends, record strategic takeaways, and collaborate on line items.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsShareDialogOpen(true)}
            variant="outline"
            size="sm"
            disabled={activeTab !== 'owned' || !isSignedIn}
            className="h-9 gap-1.5 font-medium border-border/80 text-foreground hover:bg-muted"
          >
            <Share2 className="h-4 w-4 text-primary" />
            <span>Share with Peer</span>
            {ownerShares.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] bg-primary/10 text-primary">
                {ownerShares.length}
              </Badge>
            )}
          </Button>
        </div>
      </header>

      {/* Modern Interactive Scope & Period Switcher */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center bg-card p-3 rounded-xl border border-border/60 shadow-xs">
        {/* Scope selector */}
        <div className="lg:col-span-4 flex items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border/40">
          <button
            type="button"
            onClick={() => setViewScope('week')}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5",
              viewScope === 'week'
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Weekly
          </button>
          <button
            type="button"
            onClick={() => setViewScope('month')}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5",
              viewScope === 'month'
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setViewScope('period')}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5",
              viewScope === 'period'
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Custom
          </button>
        </div>

        {/* Date Navigator / Period Controls */}
        <div className="lg:col-span-5 flex items-center justify-center gap-2">
          {viewScope !== 'period' ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={handlePrev}
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="text-center min-w-[200px]">
                <div className="font-semibold text-sm text-foreground flex items-center justify-center gap-1.5">
                  <span>{currentPeriodDetails.label}</span>
                  <button
                    type="button"
                    onClick={handleResetToCurrent}
                    title="Jump to current"
                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {currentPeriodDetails.subLabel}
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={handleNext}
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                className="h-8 text-xs font-mono w-32"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                className="h-8 text-xs font-mono w-32"
              />
            </div>
          )}
        </div>

        {/* Active Transactions Count Badge */}
        <div className="lg:col-span-3 flex justify-end items-center gap-2">
          <span className="text-xs text-muted-foreground">
            <strong className="text-foreground">{metrics.count}</strong> transactions in scope
          </span>
        </div>
      </div>

      {/* Interactive Metric Cards (Clickable to Filter) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Income Card */}
        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'income' ? 'all' : 'income')}
          className={cn(
            "p-3.5 rounded-xl border text-left transition-all relative overflow-hidden",
            activeFilter === 'income'
              ? "bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30"
              : "bg-card border-border/60 hover:border-border/80 hover:bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Income</span>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            +{formatCurrency(metrics.totalIncome)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {activeFilter === 'income' ? '✓ Filtering Income' : 'Click to filter income'}
          </div>
        </button>

        {/* Expenses Card */}
        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'expense' ? 'all' : 'expense')}
          className={cn(
            "p-3.5 rounded-xl border text-left transition-all relative overflow-hidden",
            activeFilter === 'expense'
              ? "bg-destructive/10 border-destructive/40 ring-1 ring-destructive/30"
              : "bg-card border-border/60 hover:border-border/80 hover:bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Expenses</span>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </div>
          <div className="text-lg font-bold font-mono text-destructive mt-1">
            -{formatCurrency(metrics.totalExpenses)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {activeFilter === 'expense' ? '✓ Filtering Expenses' : 'Click to filter expenses'}
          </div>
        </button>

        {/* Net Savings Card */}
        <div className="p-3.5 rounded-xl border border-border/60 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Net Cash Flow</span>
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded", metrics.savingsRate >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive")}>
              {metrics.savingsRate.toFixed(1)}% Rate
            </span>
          </div>
          <div className={cn("text-lg font-bold font-mono mt-1", metrics.netCashFlow >= 0 ? "text-foreground font-semibold" : "text-destructive")}>
            {metrics.netCashFlow >= 0 ? `+${formatCurrency(metrics.netCashFlow)}` : `-${formatCurrency(Math.abs(metrics.netCashFlow))}`}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {metrics.netCashFlow >= 0 ? 'Positive net surplus' : 'Deficit in current period'}
          </div>
        </div>

        {/* Comments & Discussion Card */}
        <button
          type="button"
          onClick={() => setActiveFilter(activeFilter === 'comments' ? 'all' : 'comments')}
          className={cn(
            "p-3.5 rounded-xl border text-left transition-all relative overflow-hidden",
            activeFilter === 'comments'
              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
              : "bg-card border-border/60 hover:border-border/80 hover:bg-muted/30"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Comments & Feedback</span>
            <MessageSquareText className="h-4 w-4 text-primary" />
          </div>
          <div className="text-lg font-bold font-mono text-foreground mt-1">
            {metrics.commentedCount} Thread{metrics.commentedCount === 1 ? '' : 's'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {activeFilter === 'comments' ? '✓ Filtering Comments' : 'Click to view commented'}
          </div>
        </button>
      </div>

      {/* Tabs: My Reviews vs Shared With Me */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "owned" | "shared")} className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 border border-border/40 rounded-xl">
          <TabsTrigger value="owned" className="text-xs font-semibold py-2">
            My Review & Journal
          </TabsTrigger>
          <TabsTrigger value="shared" className="text-xs font-semibold py-2 flex items-center justify-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>Shared With Me</span>
            {sharedReviewsList.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1 bg-primary/10 text-primary">
                {sharedReviewsList.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Owned Reviews */}
        <TabsContent value="owned" className="space-y-4 m-0">
          {!isSignedIn && (
            <Alert className="border-primary/20 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle className="text-xs font-semibold">Account Sign In</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Sign in to save personal financial journals and share reviews with peer advisors.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Interactive Transactions Table */}
            <div className={cn(isFocusJournalMode ? "hidden" : "lg:col-span-7 space-y-3")}>
              {/* Quick Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search by description, amount, or mode..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 text-xs pl-8 bg-card"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                      activeFilter === 'all'
                        ? "bg-foreground text-background font-semibold"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('expense')}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                      activeFilter === 'expense'
                        ? "bg-destructive text-destructive-foreground font-semibold"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Expenses
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('income')}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                      activeFilter === 'income'
                        ? "bg-emerald-600 text-white font-semibold"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('comments')}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1",
                      activeFilter === 'comments'
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MessageSquare className="h-3 w-3" />
                    Threads
                  </button>
                </div>
              </div>

              {/* Transaction Table Card */}
              <Card className="border border-border/60 shadow-xs overflow-hidden bg-card">
                <CardHeader className="p-3.5 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Period Transactions
                    </CardTitle>
                    <CardDescription className="text-[11px] text-muted-foreground">
                      Click any row to inspect line details or exchange feedback comments.
                    </CardDescription>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground bg-background px-2 py-0.5 rounded border border-border/40">
                    {filteredTransactions.length} of {scopedTransactions.length}
                  </span>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[460px] w-full">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-xs z-10 border-b border-border/40">
                        <TableRow>
                          <TableHead className="w-[100px] pl-3 text-xs font-semibold">Date</TableHead>
                          <TableHead className="text-xs font-semibold">Description</TableHead>
                          <TableHead className="text-right text-xs font-semibold">Amount (KES)</TableHead>
                          <TableHead className="w-[120px] text-center pr-3 text-xs font-semibold">Comments</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.length > 0 ? (
                          filteredTransactions.map((tx) => {
                            const comments = getTransactionCommentDetails(tx.id);
                            const hasComments = comments.length > 0;
                            const isIncome = tx.amount > 0;

                            return (
                              <TableRow
                                key={tx.id}
                                className="cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleOpenCommentDialog(tx)}
                              >
                                <TableCell className="text-xs font-medium pl-3 text-muted-foreground">
                                  {formatDate(tx.date)}
                                </TableCell>
                                <TableCell className="max-w-[200px]">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="text-xs font-medium text-foreground truncate">
                                      {tx.description}
                                    </span>
                                    {formatCategoryBadge(tx.frequency)}
                                    {formatCategoryBadge(tx.variability)}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    {tx.modeOfPayment || 'Payment'}
                                  </div>
                                </TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono text-xs font-semibold",
                                  isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                                )}>
                                  {isIncome ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                                </TableCell>
                                <TableCell className="text-center pr-3">
                                  {hasComments ? (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-2 py-0.5 gap-1 bg-primary/10 text-primary border-primary/20 font-medium"
                                    >
                                      <MessageSquare className="h-3 w-3" />
                                      {comments.length}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground/40 group-hover:text-primary transition-colors text-[11px] flex items-center justify-center gap-1">
                                      <MessageSquarePlus className="h-3 w-3" />
                                      <span className="hidden sm:inline text-[10px]">Note</span>
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="h-36 text-center text-muted-foreground text-xs">
                              {searchTerm
                                ? 'No transactions match your search filter.'
                                : activeFilter !== 'all'
                                ? `No transactions match the "${activeFilter}" filter.`
                                : 'No transactions recorded in this period.'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Right 5 Columns: Interactive Financial Journal */}
            <div className={cn(isFocusJournalMode ? "lg:col-span-12 space-y-3" : "lg:col-span-5 space-y-3")}>
              <Card className="border border-border/60 shadow-xs bg-card overflow-hidden">
                <CardHeader className="p-3.5 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <div>
                      <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Strategic Financial Journal
                      </CardTitle>
                      <CardDescription className="text-[11px] text-muted-foreground">
                        Document reflections, habits, and commitments.
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setIsFocusJournalMode(!isFocusJournalMode)}
                      title={isFocusJournalMode ? "Exit Focus Mode" : "Expand Focus Mode"}
                    >
                      {isFocusJournalMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </Button>

                    {journalEntry && isSignedIn && (
                      <AlertDialog open={isDeleteJournalDialogOpen} onOpenChange={setIsDeleteJournalDialogOpen}>
                        <ShadAlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Clear Journal</span>
                          </Button>
                        </ShadAlertDialogTrigger>
                        <AlertDialogContent className="max-w-sm rounded-xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-sm font-semibold">Clear Journal?</AlertDialogTitle>
                            <AlertDialogDescription className="text-xs text-muted-foreground">
                              Are you sure you want to clear your reflections for {currentPeriodDetails.label}? This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDeleteJournal} className="h-8 text-xs bg-destructive text-destructive-foreground">
                              Clear
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  {/* Interactive Template Chips */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                      <Sparkles className="h-3 w-3 text-primary" />
                      <span>Quick Reflection Prompts:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {REFLECTION_PROMPTS.map((prompt) => (
                        <button
                          key={prompt.title}
                          type="button"
                          onClick={() => handleInsertPrompt(prompt.content)}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-muted/60 hover:bg-primary/10 hover:text-primary border border-border/50 transition-colors text-foreground"
                        >
                          {prompt.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Journal Textarea */}
                  <Textarea
                    placeholder="Write your reflections for this period (decisions made, budget variances, goals for next week)..."
                    value={journalEntry}
                    onChange={handleJournalChange}
                    rows={isFocusJournalMode ? 14 : 10}
                    className="w-full text-xs leading-relaxed font-sans resize-y bg-background border-border/60 focus-visible:ring-1"
                    disabled={!isSignedIn}
                  />

                  {/* Journal Footer Status */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                    <span className="font-mono">{wordCount} words</span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      Auto-saved
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Peer Collaboration Info Box */}
              <div className="p-3 rounded-xl border border-border/50 bg-muted/20 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground font-medium">Privacy Guaranteed:</strong> Invited peers receive comment-only review permissions. Your raw financial data cannot be edited by reviewers.
                </div>
              </div>

              {/* Live Share Chat & AI Advisor */}
              <ReviewChat
                shareRecord={activeOwnedSharedRecord}
                currentUserId={userId || 'local_user'}
                currentUserName={user?.fullName || user?.email?.split('@')[0] || 'Owner'}
                currentUserRole="owner"
                transactionsCount={scopedTransactions.length}
                commentsCount={commentsCountForCurrentPeriod}
                journalNotes={journalEntry}
                onCommentsUpdated={loadOwnerShares}
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Shared With Me (Collaborator View) */}
        <TabsContent value="shared" className="space-y-4 m-0">
          {isLoadingShared ? (
            <div className="p-12 text-center text-muted-foreground text-xs flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading shared reviews...
            </div>
          ) : sharedReviewsList.length > 0 ? (
            <div className="space-y-4">
              {/* Review Picker if multiple */}
              <div className="flex flex-wrap items-center gap-2 p-2.5 bg-card rounded-xl border border-border/60 shadow-xs">
                <span className="text-xs font-semibold text-foreground px-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  Select Review:
                </span>
                {sharedReviewsList.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => setSelectedSharedReviewId(record.id)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5",
                      activeSharedRecord?.id === record.id
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-muted/50 hover:bg-muted text-foreground border border-border/40"
                    )}
                  >
                    <span>{record.ownerName || record.ownerEmail}</span>
                    <span className="opacity-70 text-[10px]">({record.periodLabel})</span>
                  </button>
                ))}
              </div>

              {/* Shared Review Banner */}
              {activeSharedRecord && (
                <Alert className="bg-primary/5 border-primary/20">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertTitle className="text-xs font-semibold text-foreground">
                    Reviewing records shared by {activeSharedRecord.ownerName || activeSharedRecord.ownerEmail}
                  </AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground mt-0.5">
                    You have <strong>comment rights only</strong>. Click any transaction below to leave peer commentary or feedback.
                  </AlertDescription>
                </Alert>
              )}

              {/* Shared Transactions Table & Journal */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7">
                  <Card className="border border-border/60 shadow-xs bg-card overflow-hidden">
                    <CardHeader className="p-3.5 border-b border-border/40 bg-muted/20">
                      <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Shared Transactions
                      </CardTitle>
                      <CardDescription className="text-[11px] text-muted-foreground">
                        Click a transaction to view or submit feedback.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[460px] w-full">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-xs z-10 border-b border-border/40">
                            <TableRow>
                              <TableHead className="w-[100px] pl-3 text-xs font-semibold">Date</TableHead>
                              <TableHead className="text-xs font-semibold">Description</TableHead>
                              <TableHead className="text-right text-xs font-semibold">Amount (KES)</TableHead>
                              <TableHead className="w-[130px] text-center pr-3 text-xs font-semibold">Your Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {scopedTransactions.length > 0 ? (
                              scopedTransactions.map((tx) => {
                                const comments = getTransactionCommentDetails(tx.id);
                                const hasComments = comments.length > 0;
                                const isIncome = tx.amount > 0;

                                return (
                                  <TableRow
                                    key={tx.id}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors group"
                                    onClick={() => handleOpenCommentDialog(tx)}
                                  >
                                    <TableCell className="text-xs font-medium pl-3 text-muted-foreground">
                                      {formatDate(tx.date)}
                                    </TableCell>
                                    <TableCell className="max-w-[200px]">
                                      <div className="text-xs font-medium text-foreground truncate">
                                        {tx.description}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground font-mono">
                                        {tx.modeOfPayment || 'Payment'}
                                      </div>
                                    </TableCell>
                                    <TableCell className={cn(
                                      "text-right font-mono text-xs font-semibold",
                                      isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                                    )}>
                                      {isIncome ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                                    </TableCell>
                                    <TableCell className="text-center pr-3">
                                      {hasComments ? (
                                        <Badge
                                          variant="secondary"
                                          className="text-[10px] px-2 py-0.5 gap-1 bg-primary/10 text-primary border-primary/20 font-medium"
                                        >
                                          <MessageSquareText className="h-3 w-3" />
                                          {comments.length}
                                        </Badge>
                                      ) : (
                                        <span className="text-primary group-hover:underline text-[11px] font-medium flex items-center justify-center gap-1">
                                          <MessageSquarePlus className="h-3 w-3" />
                                          <span>Add note</span>
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            ) : (
                              <TableRow>
                                <TableCell colSpan={4} className="h-36 text-center text-muted-foreground text-xs">
                                  No transactions recorded in this shared review period.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                {/* Shared Journal View (Read-Only) */}
                <div className="lg:col-span-5 space-y-4">
                  <Card className="border border-border/60 shadow-xs bg-card">
                    <CardHeader className="p-3.5 border-b border-border/40 bg-muted/20">
                      <CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen className="h-4 w-4 text-primary" /> Owner's Journal
                      </CardTitle>
                      <CardDescription className="text-[11px] text-muted-foreground">
                        Read-only financial reflections from the owner.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4">
                      <Textarea
                        value={journalEntry || 'No journal reflections were added by the owner for this period.'}
                        rows={10}
                        className="w-full text-xs bg-muted/40 cursor-not-allowed resize-none text-muted-foreground leading-relaxed"
                        disabled={true}
                      />
                    </CardContent>
                  </Card>

                  {/* Shared Review Chat */}
                  <ReviewChat
                    shareRecord={activeSharedRecord}
                    currentUserId={userId || 'local_user'}
                    currentUserName={user?.fullName || user?.email?.split('@')[0] || 'Reviewer'}
                    currentUserRole="reviewer"
                    transactionsCount={scopedTransactions.length}
                    commentsCount={commentsCountForCurrentPeriod}
                    journalNotes={journalEntry}
                    onCommentsUpdated={loadSharedWithMe}
                  />
                </div>
              </div>
            </div>
          ) : (
            <Card className="text-center py-16 border border-dashed border-border/80 bg-card/40">
              <CardContent className="space-y-3">
                <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <h3 className="text-sm font-semibold text-foreground">No Shared Reviews Available</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  When other users share their weekly or monthly financial reviews with your email address, they will appear here with reviewer comment permissions.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Interactive Comment & Feedback Dialog */}
      <Dialog open={isCommentDialogOpen} onOpenChange={setIsCommentDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-border/60 shadow-xl p-0 gap-0 overflow-hidden bg-card">
          <DialogHeader className="p-4 pb-3 border-b border-border/40 bg-muted/30">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold text-foreground">
                  Transaction Notes & Comments
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium text-foreground">{commentingTransaction?.description}</span> •{' '}
                  <span className={cn("font-mono font-semibold", (commentingTransaction?.amount ?? 0) >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {formatCurrency(commentingTransaction?.amount || 0)}
                  </span>{' '}
                  ({commentingTransaction?.date ? formatDate(commentingTransaction.date) : ''})
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Comment Thread List */}
          <div className="p-4 space-y-3">
            <ScrollArea className="max-h-[240px] pr-2">
              {commentingTransaction && getTransactionCommentDetails(commentingTransaction.id).length > 0 ? (
                <div className="space-y-2.5">
                  {getTransactionCommentDetails(commentingTransaction.id).map((c) => {
                    const isAuthorOwner = c.role === 'owner';
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "p-3 rounded-xl border text-xs space-y-1.5 transition-all",
                          isAuthorOwner
                            ? "bg-primary/5 border-primary/20 text-foreground"
                            : "bg-muted/40 border-border/50 text-foreground"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="font-semibold text-foreground">{c.authorName}</span>
                            <Badge
                              variant={isAuthorOwner ? 'default' : 'secondary'}
                              className="text-[9px] px-1.5 py-0 h-4"
                            >
                              {isAuthorOwner ? 'Owner' : 'Peer'}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {c.createdAt ? format(new Date(c.createdAt), 'MMM d, h:mm a') : ''}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-foreground/90 pl-1">{c.comment}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground italic">
                  No notes or comments yet on this line item.
                </div>
              )}
            </ScrollArea>

            {/* Input to add new comment */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              <Textarea
                placeholder={
                  activeTab === 'owned'
                    ? "Add a note or reply to feedback..."
                    : "Add your reviewer feedback or comment..."
                }
                value={newCommentInput}
                onChange={(e) => setNewCommentInput(e.target.value)}
                rows={3}
                className="w-full text-xs resize-none bg-background border-border/60 focus-visible:ring-1"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {activeTab === 'shared' ? 'Posting as Peer Reviewer' : 'Posting as Owner'}
                </span>
                <Button
                  size="sm"
                  onClick={handlePostComment}
                  disabled={isSubmittingComment || !newCommentInput.trim()}
                  className="h-8 text-xs gap-1.5 px-3"
                >
                  {isSubmittingComment ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Post Note</span>
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="p-3 bg-muted/20 border-t border-border/40">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs ml-auto">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Review Dialog */}
      {isSignedIn && userId && (
        <ShareReviewDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          weekKey={currentPeriodKey}
          currentWeekStart={currentPeriodDetails.startDate}
          onShareUpdated={() => {
            loadOwnerShares();
            loadSharedWithMe();
          }}
        />
      )}
    </div>
  );
}
