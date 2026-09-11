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
  Trash2, 
  Loader2, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  Users, 
  Calendar, 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  MessageSquare, 
  Share2, 
  UserCheck 
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

  // Email search & selection
  const [emailToShare, setEmailToShare] = useState('');
  const [searchResult, setSearchResult] = useState<UserShareInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Collaboration shares management
  const [sharesList, setSharesList] = useState<SharedReviewRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
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
      setSearchResult(null);
      setSearchError(null);
      setIsSearching(false);
      setShareToRevoke(null);
    }
  }, [isOpen]);

  const handleSearchUser = async (overrideEmail?: string) => {
    const targetEmail = overrideEmail || emailToShare;
    if (!isSignedIn) {
      toast({ title: "Authentication Required", description: "Please sign in to share reviews.", variant: "destructive" });
      return;
    }
    if (!targetEmail.trim()) {
      setSearchError('Please enter an email address.');
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const foundUser = await searchUserByEmailApi(targetEmail.trim());
      if (foundUser) {
        if (foundUser.userId === userId || foundUser.email.toLowerCase() === user?.email?.toLowerCase()) {
          setSearchError('You cannot share a review with yourself.');
        } else {
          setSearchResult(foundUser);
        }
      } else {
        setSearchError('User not found in system.');
      }
    } catch (error: any) {
      logError("User search error:", error, { targetEmail, userId });
      setSearchError(`Search failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleExecuteShare = async () => {
    if (!searchResult || !isSignedIn || !userId) {
      toast({ title: "Selection Missing", description: "Please search and select a collaborator.", variant: "destructive" });
      return;
    }

    setIsSharing(true);
    try {
      const ownerName = user?.fullName || user?.email || 'Sean Wambua';
      const ownerEmail = user?.email || 'user1@imanifinancial.com';

      const newRecord = await shareTransactionsReviewApi({
        scope,
        periodKey: periodDetails.key,
        periodLabel: periodDetails.label,
        startDate: periodDetails.startDate,
        endDate: periodDetails.endDate,
        targetUser: searchResult,
        ownerUser: { userId, name: ownerName, email: ownerEmail },
        transactions: scopedTransactions,
      });

      toast({
        title: "Review Shared Successfully",
        description: `Shared ${periodDetails.label} with ${searchResult.name || searchResult.email}. Both parties have been notified.`,
      });

      // Update local state list
      setSharesList((prev) => {
        const filtered = prev.filter((s) => s.id !== newRecord.id);
        return [newRecord, ...filtered];
      });

      setEmailToShare('');
      setSearchResult(null);
      setSearchError(null);
      onShareUpdated?.();
    } catch (error: any) {
      logError("Share execution failed:", error, { periodKey: periodDetails.key, userId });
      toast({ title: "Share Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSharing(false);
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
        title: "Access Revoked — Comments Retained",
        description: `Access revoked for ${targetName}. All comments made by the collaborator remain permanently preserved in your review.`,
      });

      // Update list status to 'revoked'
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-xl border border-border/60 shadow-xl bg-card">
          {/* Header */}
          <DialogHeader className="p-6 pb-4 border-b border-border/40 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight">Share Transactions Review</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Share weekly, monthly, or period transactions with a peer or advisor. Collaborators have comment rights only.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Body Content */}
          <ScrollArea className="flex-1 max-h-[calc(85vh-140px)] p-6 space-y-6">
            <div className="space-y-6">
              {/* Step 1: Select Period Scope */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  1. Select Share Scope
                </Label>
                <div className="grid grid-cols-3 gap-2 p-1 bg-muted/40 rounded-lg border border-border/40">
                  <button
                    type="button"
                    onClick={() => setScope('week')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-all ${
                      scope === 'week'
                        ? 'bg-background text-foreground shadow-xs border border-border/50 font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Weekly
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('month')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-all ${
                      scope === 'month'
                        ? 'bg-background text-foreground shadow-xs border border-border/50 font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('period')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-md transition-all ${
                      scope === 'period'
                        ? 'bg-background text-foreground shadow-xs border border-border/50 font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Custom Period
                  </button>
                </div>

                {/* Scope Details Banner */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border/30 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-foreground">{periodDetails.label}</span>
                    <span className="text-muted-foreground block mt-0.5">
                      {scopedTransactions.length} transaction{scopedTransactions.length === 1 ? '' : 's'} in selected period
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[11px] bg-primary/5 text-primary border-primary/20">
                    Comment-Only Rights
                  </Badge>
                </div>

                {/* Custom Period Date Pickers */}
                {scope === 'period' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="custom-start-date" className="text-xs text-muted-foreground">Start Date</Label>
                      <Input
                        id="custom-start-date"
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="custom-end-date" className="text-xs text-muted-foreground">End Date</Label>
                      <Input
                        id="custom-end-date"
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Choose Recipient */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Choose Collaborator (User 2)
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Enter collaborator email (e.g. demo.member@imanifinancial.com)"
                      value={emailToShare}
                      onChange={(e) => setEmailToShare(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                      className="h-9 text-xs pr-8"
                    />
                    {emailToShare && (
                      <button
                        type="button"
                        onClick={() => setEmailToShare('')}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSearchUser()}
                    disabled={isSearching || !emailToShare.trim()}
                    className="h-9 text-xs px-3 gap-1.5"
                  >
                    {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Find User
                  </Button>
                </div>

                {/* Quick Pick Suggested Collaborators */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Quick pick:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailToShare('demo.member@imanifinancial.com');
                      handleSearchUser('demo.member@imanifinancial.com');
                    }}
                    className="text-primary hover:underline font-medium text-[11px] bg-primary/5 px-2 py-0.5 rounded border border-primary/20"
                  >
                    Alex Morgan (Member)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmailToShare('jane.advisor@imanifinancial.com');
                      handleSearchUser('jane.advisor@imanifinancial.com');
                    }}
                    className="text-primary hover:underline font-medium text-[11px] bg-primary/5 px-2 py-0.5 rounded border border-primary/20"
                  >
                    Jane Doe (Advisor)
                  </button>
                </div>

                {searchError && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {searchError}
                  </p>
                )}

                {/* Selected Collaborator Confirmation Card */}
                {searchResult && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between animate-in fade-in-50">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {searchResult.name?.[0] || 'U'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{searchResult.name}</p>
                        <p className="text-[11px] text-muted-foreground">{searchResult.email}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleExecuteShare}
                      disabled={isSharing}
                      className="h-8 text-xs font-medium gap-1.5"
                    >
                      {isSharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Confirm & Share
                    </Button>
                  </div>
                )}
              </div>

              {/* Step 3: Active & Past Collaborators (Manage & Revoke) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Active Collaborators & Access Rights
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {sharesList.filter((s) => s.status === 'active').length} active share(s)
                  </span>
                </div>

                {isLoadingList ? (
                  <div className="p-6 text-center text-muted-foreground text-xs flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading collaboration registry...
                  </div>
                ) : sharesList.length > 0 ? (
                  <div className="border border-border/40 rounded-lg divide-y divide-border/30 overflow-hidden bg-background">
                    {sharesList.map((share) => {
                      const totalComments = Object.values(share.comments || {}).reduce(
                        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                        0
                      );
                      const isActive = share.status === 'active';

                      return (
                        <div key={share.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-foreground truncate">
                                {share.sharedWithName || share.sharedWithEmail}
                              </span>
                              <Badge
                                variant={isActive ? 'default' : 'secondary'}
                                className={`text-[10px] px-1.5 py-0 ${
                                  isActive ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'text-muted-foreground'
                                }`}
                              >
                                {isActive ? 'Active (Comment Only)' : 'Revoked — Comments Kept'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                              <span className="font-medium text-foreground/80">{share.periodLabel}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3 text-primary" />
                                {totalComments} comment{totalComments === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>

                          <div>
                            {isActive ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShareToRevoke(share)}
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                              >
                                Revoke Access
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground italic px-2">Access Revoked</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-lg border border-dashed border-border/60 bg-muted/10 text-muted-foreground text-xs">
                    <UserCheck className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    No active shares found. Select a period and invite a collaborator above.
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Footer */}
          <DialogFooter className="p-4 border-t border-border/40 bg-muted/10 flex items-center justify-between sm:justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Recipient has read and comment rights only. Financial data cannot be altered.</span>
            </div>
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revocation Confirmation Dialog */}
      <AlertDialog open={!!shareToRevoke} onOpenChange={(open) => !open && setShareToRevoke(null)}>
        <AlertDialogContent className="rounded-xl border border-border/60 shadow-xl max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-1">
              <ShieldAlert className="h-5 w-5" />
              <AlertDialogTitle className="text-base">Revoke Collaborator Access?</AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>
                  Are you sure you want to revoke share access for{' '}
                  <strong className="text-foreground">
                    {shareToRevoke?.sharedWithName || shareToRevoke?.sharedWithEmail}
                  </strong>{' '}
                  on <strong className="text-foreground">{shareToRevoke?.periodLabel}</strong>?
                </p>
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[11px] text-emerald-800 dark:text-emerald-300">
                  ✓ <strong>Comments Retained</strong>: All comments, notes, and feedback left by this collaborator will remain permanently saved in your review record.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking} className="h-8 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRevoking}
              onClick={handleConfirmRevoke}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Confirm Revocation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ShareReviewDialog;
