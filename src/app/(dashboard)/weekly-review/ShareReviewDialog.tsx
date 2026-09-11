// src/app/(dashboard)/weekly-review/ShareReviewDialog.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  X, 
  UserPlus, 
  Loader2, 
  Search, 
  AlertTriangle, 
  Users, 
  Calendar, 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  MessageSquare, 
  Share2, 
  UserCheck,
  Mail,
  Archive
} from 'lucide-react';
import type { UserShareInfo, SharedReviewRecord, ShareScopeType } from '@/lib/types';
import { 
  searchUserByEmailApi, 
  shareTransactionsReviewApi, 
  revokeShareApi, 
  getSharesCreatedByOwnerApi 
} from '@/app/actions/shareActions';
import { useAuth } from '@/context/AuthContext';
import { useTransactionsStore } from '@/store/transactionsStore';
import { logError, logInfo } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  format, 
  getISOWeek,
  isWithinInterval 
} from 'date-fns';

interface ShareReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  weekKey: string;
  currentWeekStart?: Date;
  onShareUpdated?: () => void;
}

export const ShareReviewDialog: React.FC<ShareReviewDialogProps> = ({ 
  isOpen, 
  onClose, 
  weekKey,
  currentWeekStart = new Date(),
  onShareUpdated
}) => {
  const { toast } = useToast();
  const { user, isSignedIn, userId } = useAuth();
  const { transactions } = useTransactionsStore();

  // Scope selection: 'week' | 'month' | 'period'
  const [scope, setScope] = useState<ShareScopeType>('week');
  
  // Custom period states
  const [customStartDate, setCustomStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  // Email input and invitation state
  const [emailToShare, setEmailToShare] = useState('');
  const [isProcessingShare, setIsProcessingShare] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Collaboration shares management
  const [sharesList, setSharesList] = useState<SharedReviewRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  
  // Revocation dialog state
  const [shareToRevoke, setShareToRevoke] = useState<SharedReviewRecord | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Calculate dates according to selected scope
  const periodDetails = useMemo(() => {
    if (scope === 'week') {
      const start = startOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const end = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const weekNumber = getISOWeek(start);
      return {
        key: weekKey || `${format(start, 'yyyy')}-W${weekNumber.toString().padStart(2, '0')}`,
        label: `Week ${weekNumber} (${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')})`,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        start,
        end,
      };
    } else if (scope === 'month') {
      const start = startOfMonth(currentWeekStart);
      const end = endOfMonth(currentWeekStart);
      const monthKey = format(start, 'yyyy-MM');
      return {
        key: monthKey,
        label: `Month of ${format(start, 'MMMM yyyy')}`,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        start,
        end,
      };
    } else {
      const start = new Date(`${customStartDate}T00:00:00`);
      const end = new Date(`${customEndDate}T23:59:59`);
      const customKey = `${customStartDate}_${customEndDate}`;
      return {
        key: customKey,
        label: `Custom Period (${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')})`,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        start,
        end,
      };
    }
  }, [scope, currentWeekStart, weekKey, customStartDate, customEndDate]);

  // Filter transactions falling into the selected period
  const scopedTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
      if (isNaN(txDate.getTime())) return false;
      return isWithinInterval(txDate, { start: periodDetails.start, end: periodDetails.end });
    });
  }, [transactions, periodDetails]);

  // Load all shares created by this user
  const fetchSharesList = useCallback(async () => {
    if (!isOpen || !isSignedIn || !userId) return;
    setIsLoadingList(true);
    try {
      const records = await getSharesCreatedByOwnerApi(userId);
      setSharesList(records);
    } catch (error: any) {
      logError("Failed to fetch shares list:", error, { userId });
    } finally {
      setIsLoadingList(false);
    }
  }, [isOpen, isSignedIn, userId]);

  useEffect(() => {
    if (isOpen && isSignedIn) {
      fetchSharesList();
    }
  }, [isOpen, isSignedIn, fetchSharesList]);

  // Reset inputs when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setEmailToShare('');
      setSearchError(null);
      setIsProcessingShare(false);
      setShareToRevoke(null);
    }
  }, [isOpen]);

  const handleCreateShare = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSignedIn || !userId) {
      toast({ title: "Authentication Required", description: "Please sign in to share reviews.", variant: "destructive" });
      return;
    }

    const targetEmail = emailToShare.trim();
    if (!targetEmail) {
      setSearchError('Please enter an email address.');
      return;
    }

    if (targetEmail.toLowerCase() === user?.email?.toLowerCase()) {
      setSearchError('You cannot share a review with yourself.');
      return;
    }

    setIsProcessingShare(true);
    setSearchError(null);

    try {
      const foundUser = await searchUserByEmailApi(targetEmail);
      if (!foundUser) {
        setSearchError('User not found in system.');
        setIsProcessingShare(false);
        return;
      }

      const ownerName = user?.fullName || user?.email || 'Sean Wambua';
      const ownerEmail = user?.email || 'user1@imanifinancial.com';

      const newRecord = await shareTransactionsReviewApi({
        scope,
        periodKey: periodDetails.key,
        periodLabel: periodDetails.label,
        startDate: periodDetails.startDate,
        endDate: periodDetails.endDate,
        targetUser: foundUser,
        ownerUser: { userId, name: ownerName, email: ownerEmail },
        transactions: scopedTransactions,
      });

      toast({
        title: "Review Shared",
        description: `Successfully shared access with ${foundUser.name || foundUser.email}.`,
      });

      setSharesList((prev) => {
        const filtered = prev.filter((s) => s.id !== newRecord.id);
        return [newRecord, ...filtered];
      });

      setEmailToShare('');
      onShareUpdated?.();
    } catch (error: any) {
      logError("Share creation failed:", error, { email: targetEmail, userId });
      toast({ title: "Share Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsProcessingShare(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!shareToRevoke || !isSignedIn || !userId) return;
    setIsRevoking(true);
    try {
      const ownerName = user?.fullName || user?.email || 'Owner';
      const targetName = shareToRevoke.sharedWithName || shareToRevoke.sharedWithEmail || 'Collaborator';

      await revokeShareApi(shareToRevoke.id, shareToRevoke.sharedWithUserId, {
        ownerName,
        targetUserName: targetName,
        periodLabel: shareToRevoke.periodLabel,
      });

      toast({
        title: "Access Revoked",
        description: `Feedback from ${targetName} remains preserved.`,
      });

      setSharesList((prev) =>
        prev.map((s) => (s.id === shareToRevoke.id ? { ...s, status: 'revoked', revokedAt: new Date().toISOString() } : s))
      );

      setShareToRevoke(null);
      onShareUpdated?.();
    } catch (error: any) {
      logError("Revoke failed:", error, { shareId: shareToRevoke.id });
      toast({ title: "Revocation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsRevoking(false);
    }
  };

  const activeShares = useMemo(() => {
    return sharesList.filter((s) => s.status === 'active');
  }, [sharesList]);

  const archivedShares = useMemo(() => {
    return sharesList.filter((s) => s.status !== 'active');
  }, [sharesList]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg md:max-w-xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border border-border/40 shadow-xl bg-card">
          
          {/* Header */}
          <DialogHeader className="p-6 pb-4 border-b border-border/20 bg-muted/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Share2 className="h-4.5 w-4.5 stroke-[2]" />
              </div>
              <div className="space-y-0.5">
                <DialogTitle className="text-base font-bold tracking-tight text-foreground font-sans">Share Review</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground font-sans leading-relaxed">
                  Collaborators receive immediate access to leave contextual feedback and chat comments.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable Body */}
          <ScrollArea className="flex-1 max-h-[calc(80vh-140px)] p-6">
            <div className="space-y-6">
              
              {/* Form Section */}
              <form onSubmit={handleCreateShare} className="space-y-4">
                
                {/* Scope Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold tracking-wide text-foreground font-sans uppercase">
                    Select Scope
                  </Label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/30 rounded-xl border border-border/30">
                    <button
                      type="button"
                      onClick={() => setScope('week')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
                        scope === 'week'
                          ? 'bg-background text-foreground shadow-xs border border-border/40 font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                      }`}
                    >
                      <Calendar className="h-3.5 w-3.5 text-primary stroke-[1.75]" />
                      Weekly
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope('month')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
                        scope === 'month'
                          ? 'bg-background text-foreground shadow-xs border border-border/40 font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5 text-primary stroke-[1.75]" />
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope('period')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
                        scope === 'period'
                          ? 'bg-background text-foreground shadow-xs border border-border/40 font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                      }`}
                    >
                      <Calendar className="h-3.5 w-3.5 text-primary stroke-[1.75]" />
                      Custom Range
                    </button>
                  </div>
                </div>

                {/* Custom Range Inputs */}
                {scope === 'period' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-muted/20 border border-border/30 rounded-xl animate-in fade-in duration-200">
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-start-date" className="text-[11px] font-medium text-muted-foreground font-sans">Start Date</Label>
                      <Input
                        id="custom-start-date"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="h-8.5 text-xs rounded-lg"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="custom-end-date" className="text-[11px] font-medium text-muted-foreground font-sans">End Date</Label>
                      <Input
                        id="custom-end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="h-8.5 text-xs rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* Scope Metadata */}
                <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 flex items-center justify-between text-xs font-sans">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground block">{periodDetails.label}</span>
                    <span className="text-muted-foreground">
                      {scopedTransactions.length} transaction{scopedTransactions.length === 1 ? '' : 's'} to review
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 rounded-full font-medium tracking-wide">
                    Comment-Only
                  </Badge>
                </div>

                {/* Collaborator Input */}
                <div className="space-y-2">
                  <Label htmlFor="collab-email" className="text-xs font-semibold tracking-wide text-foreground font-sans uppercase">
                    Collaborator Email
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground stroke-[1.5]" />
                      <Input
                        id="collab-email"
                        placeholder="e.g. demo.member@imanifinancial.com"
                        value={emailToShare}
                        onChange={(e) => {
                          setEmailToShare(e.target.value);
                          if (searchError) setSearchError(null);
                        }}
                        className="h-9.5 text-xs pl-9 rounded-xl border-border/50"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isProcessingShare || !emailToShare.trim()}
                      className="h-9.5 text-xs px-4 rounded-xl gap-1.5 font-semibold"
                    >
                      {isProcessingShare ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5 stroke-[2]" />
                      )}
                      Invite
                    </Button>
                  </div>

                  {searchError && (
                    <p className="text-xs text-rose-500 font-sans flex items-center gap-1.5 mt-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {searchError}
                    </p>
                  )}
                </div>

                {/* Quick Pick Chips */}
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-sans pt-1">
                  <span>Quick Pick:</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEmailToShare('demo.member@imanifinancial.com');
                        setSearchError(null);
                      }}
                      className="text-[10px] bg-muted hover:bg-muted/80 text-foreground font-medium px-2 py-1 rounded-lg border border-border/30 transition-colors"
                    >
                      Alex Morgan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailToShare('jane.advisor@imanifinancial.com');
                        setSearchError(null);
                      }}
                      className="text-[10px] bg-muted hover:bg-muted/80 text-foreground font-medium px-2 py-1 rounded-lg border border-border/30 transition-colors"
                    >
                      Jane Doe
                    </button>
                  </div>
                </div>

              </form>

              {/* SECTION 1: Active Shares */}
              <div className="space-y-3 pt-3 border-t border-border/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-foreground flex items-center gap-1.5 font-sans">
                    <Users className="h-3.5 w-3.5 text-emerald-500 stroke-[1.75]" />
                    Active Shares
                  </Label>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full font-sans">
                    {activeShares.length} Active
                  </span>
                </div>

                {isLoadingList ? (
                  <div className="py-6 text-center text-muted-foreground text-xs font-sans flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading active shares...
                  </div>
                ) : activeShares.length > 0 ? (
                  <div className="divide-y divide-border/20 border border-border/30 rounded-xl overflow-hidden bg-background">
                    {activeShares.map((share) => {
                      const totalComments = Object.values(share.comments || {}).reduce(
                        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                        0
                      );

                      return (
                        <div key={share.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors font-sans">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-foreground truncate max-w-[150px] sm:max-w-none">
                                {share.sharedWithName || share.sharedWithEmail}
                              </span>
                              <Badge
                                variant="default"
                                className="text-[9px] px-1.5 py-0 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              >
                                Active
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                              <span className="font-semibold text-foreground/70">{share.periodLabel}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3 text-primary stroke-[1.75]" />
                                {totalComments} comment{totalComments === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>

                          <div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShareToRevoke(share)}
                              className="h-7 text-[10px] font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 border-rose-200/50 dark:border-rose-900/30 rounded-lg px-2.5"
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center rounded-xl border border-dashed border-border/50 bg-muted/5 text-muted-foreground text-xs font-sans">
                    <UserCheck className="h-7 w-7 mx-auto text-muted-foreground/30 mb-1.5 stroke-[1.25]" />
                    No active collaborators right now.
                  </div>
                )}
              </div>

              {/* SECTION 2: Archive History */}
              {archivedShares.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 font-sans">
                      <Archive className="h-3.5 w-3.5 text-muted-foreground stroke-[1.75]" />
                      Archive History
                    </Label>
                    <span className="text-[10px] bg-muted text-muted-foreground font-bold px-2 py-0.5 rounded-full font-sans">
                      {archivedShares.length} Archived
                    </span>
                  </div>

                  <div className="divide-y divide-border/20 border border-border/30 rounded-xl overflow-hidden bg-background opacity-9art">
                    {archivedShares.map((share) => {
                      const totalComments = Object.values(share.comments || {}).reduce(
                        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                        0
                      );

                      return (
                        <div key={share.id} className="p-3.5 flex items-center justify-between gap-3 bg-muted/5 font-sans">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-muted-foreground truncate max-w-[150px] sm:max-w-none">
                                {share.sharedWithName || share.sharedWithEmail}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 rounded-full font-semibold bg-muted text-muted-foreground border-transparent"
                              >
                                Revoked
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                              <span className="font-medium text-muted-foreground">{share.periodLabel}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3 text-muted-foreground stroke-[1.75]" />
                                {totalComments} comment{totalComments === 1 ? '' : 's'} preserved
                              </span>
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] text-muted-foreground italic select-none">Archived</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="p-4 border-t border-border/20 bg-muted/10 flex items-center justify-between sm:justify-between">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-sans">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 stroke-[2]" />
              <span>Read and comment rights only. Data is secure.</span>
            </div>
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs font-semibold rounded-lg px-3">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revocation Confirmation Dialog */}
      <AlertDialog open={!!shareToRevoke} onOpenChange={(open) => !open && setShareToRevoke(null)}>
        <AlertDialogContent className="rounded-xl border border-border/40 shadow-xl max-w-sm">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-rose-500 mb-1 font-sans">
              <ShieldAlert className="h-4.5 w-4.5 stroke-[2]" />
              <AlertDialogTitle className="text-sm font-bold">Revoke Access?</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-2 font-sans">
                <p>
                  Are you sure you want to revoke share access for{' '}
                  <strong className="text-foreground font-semibold">
                    {shareToRevoke?.sharedWithName || shareToRevoke?.sharedWithEmail}
                  </strong>{' '}
                  on <strong className="text-foreground font-semibold">{shareToRevoke?.periodLabel}</strong>?
                </p>
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] leading-normal text-emerald-800 dark:text-emerald-300">
                  ✓ <strong>Preserve Feedback</strong>: All existing comments and chats left by this collaborator remain saved in your archive history permanently.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2.5">
            <AlertDialogCancel disabled={isRevoking} className="h-8 text-xs rounded-lg font-semibold">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRevoking}
              onClick={handleConfirmRevoke}
              className="h-8 text-xs bg-rose-500 text-white hover:bg-rose-600 rounded-lg font-semibold"
            >
              {isRevoking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ShareReviewDialog;
