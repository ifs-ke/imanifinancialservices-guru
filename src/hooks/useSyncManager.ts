// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useInvestmentStore } from '@/store/investmentStore'; // Added
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';

// Data structure is kept for potential rehydration from local storage if needed by stores,
// but it won't be fetched from a server.
interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  investmentItems: InvestmentItem[]; // Added
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export type SyncStatus = 'idle' | 'loading_local' | 'local' | 'error_local';

interface SyncState {
  status: SyncStatus;
  lastLoadTime: Date | null;
  gettingStartedDismissed: boolean;
  // Hash mismatch and dialog are no longer relevant in local-only mode
}

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();

  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastLoadTime: null,
    gettingStartedDismissed: false,
  });

  const initialLoadDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(null);
  const hasLocalChangesRef = useRef(false); // To track if local changes occurred since last "save" (now mostly page hide)

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;
  const getInvestmentState = useInvestmentStore.getState(); // Corrected: call getState

  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncState(prev => ({ ...prev, ...partialState }));
  }, []);

  const clearAllLocalStoreData = useCallback(() => {
    const currentUserIdForLog = previousUserIdRef.current || userId || 'unknown_user_at_clear';
    logInfo('SyncManager (Local Mode): Clearing all local Zustand store data.', { userId: currentUserIdForLog });
    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();
      getInvestmentState.clearInvestmentItems(); // Corrected: useInvestmentStore.getState() already called

      updateSyncState({
        status: 'local',
        lastLoadTime: new Date(),
        gettingStartedDismissed: false, // Reset this too
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager (Local Mode): All local store data cleared.', { userId: currentUserIdForLog });
    } catch (error: any) {
      logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog });
      updateSyncState({ status: 'error_local' });
    }
  }, [
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, getInvestmentState, updateSyncState, userId
  ]);


  // Effect for initial hydration check and user changes
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager (Local Mode): Auth not loaded yet.', { userId: currentUserId });
      updateSyncState({ status: 'idle' });
      return;
    }

    if (currentUserId && currentUserId !== prevUserId) {
      logInfo(`SyncManager (Local Mode): User signed in or switched. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}.`, { userId: currentUserId });
      initialLoadDoneRef.current = false;
      previousUserIdRef.current = currentUserId;
      hasLocalChangesRef.current = false;
    } else if (!currentUserId && prevUserId) {
      logInfo(`SyncManager (Local Mode): User signed out. Was: ${prevUserId}.`, { userId: prevUserId });
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false;
      updateSyncState({ status: 'idle', lastLoadTime: null });
      hasLocalChangesRef.current = false;
    }

    if (!initialLoadDoneRef.current) {
      updateSyncState({ status: 'loading_local' });
      const hydrationCheckTimeout = setTimeout(() => {
        const allStoresHydrated =
          getTransactionsState().isHydrated &&
          getDebtState().isHydrated &&
          getStatementState().isHydrated &&
          getBudgetState().isHydrated &&
          getWeeklyReviewState().isHydrated &&
          getNotificationState().isHydrated &&
          getInvestmentState.isHydrated; // Corrected

        if (allStoresHydrated) {
          updateSyncState({ status: 'local', lastLoadTime: new Date() });
          logInfo('SyncManager (Local Mode): All stores hydrated from Session Storage.', { userId: currentUserId });
          initialLoadDoneRef.current = true;
          hasLocalChangesRef.current = false; // Assume no local changes right after hydration
        } else {
          updateSyncState({ status: 'error_local' });
          logError('SyncManager (Local Mode): Not all stores rehydrated correctly.', new Error("Store rehydration failed"), { userId: currentUserId });
          toast({ title: 'Local Load Error', description: 'Could not load all local data.', variant: 'destructive' });
        }
      }, 100);

      return () => clearTimeout(hydrationCheckTimeout);
    }
  }, [
    userId, isSignedIn, isClerkLoaded,
    clearAllLocalStoreData,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, getInvestmentState,
    updateSyncState, toast
  ]);

  // Effect for 'gettingStartedDismissed' - still relevant locally
  useEffect(() => {
    if (initialLoadDoneRef.current) {
      logDebug('SyncManager (Local Mode): gettingStartedDismissed changed.', { dismissed: syncState.gettingStartedDismissed, userId });
    }
  }, [syncState.gettingStartedDismissed, userId]);

  const saveData = useCallback(async () => {
    logInfo('SyncManager (Local Mode): saveData called (no-op for server).', { userId });
    // In local-only mode, actual saving is handled by Zustand persist middleware on state change.
    // This function can be used to mark local changes as "saved" conceptually.
    hasLocalChangesRef.current = false;
    updateSyncState({ status: 'local' }); // Reflect that local state is current
    toast({ title: "Data Synced (Locally)", description: "Your changes are saved in this browser session." });
    return true;
  }, [userId, updateSyncState, toast]);

  // Listener for store changes
  const handleStoreChange = useCallback(() => {
    if (syncState.status === 'loading_local' || !initialLoadDoneRef.current) {
      return; // Don't mark changes during initial load
    }
    hasLocalChangesRef.current = true;
    if (syncState.status !== 'local') { // Only update if not already 'local' to avoid extra renders
        updateSyncState({ status: 'local' });
    }
    logDebug("SyncManager (Local Mode): Store change detected. Marked hasLocalChanges.", { currentUserId: userId });
  }, [syncState.status, updateSyncState, userId]);

  // Subscribe to store changes
  useEffect(() => {
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useNotificationStore, useInvestmentStore
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [handleStoreChange]);

  // Effect for "Save on Page Hide"
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logInfo('SyncManager (Local Mode): Page hidden.', { userId, hasLocalChanges: hasLocalChangesRef.current });
        if (hasLocalChangesRef.current && syncState.status === 'local') {
          logInfo('SyncManager (Local Mode): Attempting to conceptual "save" (mark as synced) due to page hide.', { userId });
          // In local-only, Zustand persist already handles writing to sessionStorage on change.
          // We just conceptually mark that these changes are now the "current" local state.
          hasLocalChangesRef.current = false;
          // No actual saveData call to server needed.
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange); // More robust for some browsers

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
    };
  }, [userId, syncState.status, saveData]); // Keep saveData if it has other local side effects

  const retrySync = useCallback(() => {
    logInfo('SyncManager (Local Mode): "Retry Sync" clicked.', { currentStatus: syncState.status, userId });
    if (syncState.status === 'error_local') {
      toast({ title: 'Retrying Local Load', description: 'Attempting to reload local data.', variant: 'default'});
      initialLoadDoneRef.current = false; // Force re-check of hydration
      updateSyncState({ status: 'idle' }); // Triggers main useEffect
    } else if (hasLocalChangesRef.current) {
        // This case should ideally not be common if page hide "saves" (marks as synced)
        // But if user clicks while local changes are pending and page is visible:
        logInfo('SyncManager (Local Mode): Conceptual save triggered by retrySync for pending local changes.', { userId });
        saveData(); // Conceptually marks local changes as "synced"
    } else {
      toast({ title: 'Local Mode Active', description: 'All data is stored locally in this browser session.', variant: 'default'});
    }
  }, [syncState.status, toast, userId, updateSyncState, saveData]);

  return {
    syncStatus: syncState.status,
    retrySync,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => updateSyncState({ gettingStartedDismissed: dismissed }),
    // The following are no longer relevant for server sync but kept if UI expects them (though they should be conditional)
    hashMismatch: false, // No server hash to mismatch with
    isMismatchDialogOpen: false,
    setIsMismatchDialogOpen: () => {}, // No-op
    lastSyncTime: syncState.lastLoadTime, // Reflects local load time
  };
}
