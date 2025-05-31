
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

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;
  const getInvestmentState = useInvestmentStore.getState; // Added

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
      getInvestmentState().clearInvestmentItems(); // Added

      // Also clear their sessionStorage entries explicitly if namespacing was used
      // (though persist middleware with `partialize` might make this less critical)
      const storeNames = ['transactions', 'debts', 'statementItems', 'budgetItems', 'weeklyReviews', 'notifications', 'investmentItems'];
      storeNames.forEach(name => {
        try {
          if (typeof sessionStorage !== 'undefined') {
            // If user-specific keys were used for persistence, those would be cleared here.
            // For now, assuming generic keys as per individual store setups.
            // Example: sessionStorage.removeItem(`ifcGuru-${name}`);
            // Or, if namespacing by user ID was done IN THE STORE'S PERSIST KEY:
            // sessionStorage.removeItem(`ifcGuru-${currentUserIdForLog}-${name}`);
            // Since the current setup uses fixed keys like 'ifcGuru_transactions',
            // calling the store's clearX methods should be sufficient.
          }
        } catch (e) {
          logWarn(`Failed to explicitly remove ${name} from sessionStorage during clearAll`, { error: e, userId: currentUserIdForLog });
        }
      });

      updateSyncState({
        status: 'local',
        lastLoadTime: new Date(),
        gettingStartedDismissed: false, // Reset this too
      });
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
      // User signed IN or SWITCHED
      logInfo(`SyncManager (Local Mode): User signed in or switched. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}.`, { userId: currentUserId });
      // Data is namespaced by Zustand persist keys (e.g., 'ifcGuru_transactions').
      // If user-specific keys were used, we'd call clearAllLocalStoreData here.
      // For now, stores rehydrate based on their fixed keys.
      // We can mark that an initial load for this user is pending.
      initialLoadDoneRef.current = false;
      previousUserIdRef.current = currentUserId;
    } else if (!currentUserId && prevUserId) {
      // User signed OUT
      logInfo(`SyncManager (Local Mode): User signed out. Was: ${prevUserId}.`, { userId: prevUserId });
      // Optionally clear data if it should not persist across sign-outs for the *same* browser session.
      // clearAllLocalStoreData(); // Uncomment if data should be wiped on sign-out.
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false; // Reset for next sign-in
      updateSyncState({ status: 'idle', lastLoadTime: null }); // Or 'local' if data persists
    }

    // Check hydration status of stores
    if (!initialLoadDoneRef.current) {
      updateSyncState({ status: 'loading_local' });
      // Zustand persist middleware handles rehydration automatically.
      // We just need to wait for it. A small timeout can simulate this check.
      const hydrationCheckTimeout = setTimeout(() => {
        const allStoresHydrated =
          getTransactionsState().isHydrated &&
          getDebtState().isHydrated &&
          getStatementState().isHydrated &&
          getBudgetState().isHydrated &&
          getWeeklyReviewState().isHydrated &&
          getNotificationState().isHydrated &&
          getInvestmentState().isHydrated; // Added

        if (allStoresHydrated) {
          updateSyncState({ status: 'local', lastLoadTime: new Date() });
          logInfo('SyncManager (Local Mode): All stores hydrated from Session Storage.', { userId: currentUserId });
          initialLoadDoneRef.current = true;
        } else {
          updateSyncState({ status: 'error_local' });
          logError('SyncManager (Local Mode): Not all stores rehydrated correctly.', new Error("Store rehydration failed"), { userId: currentUserId });
          toast({ title: 'Local Load Error', description: 'Could not load all local data.', variant: 'destructive' });
        }
      }, 100); // Adjust timeout as needed, or use Zustand's `hasHydrated` if available from persist v4+

      return () => clearTimeout(hydrationCheckTimeout);
    }
  }, [
    userId, isSignedIn, isClerkLoaded,
    clearAllLocalStoreData, // Keep if used
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, getInvestmentState, // Added
    updateSyncState, toast
  ]);

  // Effect for 'gettingStartedDismissed' - still relevant locally
  useEffect(() => {
    if (initialLoadDoneRef.current) {
      // Persist this change locally. Zustand persist middleware should handle this
      // automatically if 'gettingStartedDismissed' becomes part of a persisted store.
      // For now, it's just a local react state within this hook.
      // If it needs to persist across page reloads (but not sessions), it would need its own
      // localStorage/sessionStorage item or be part of a Zustand store.
      logDebug('SyncManager (Local Mode): gettingStartedDismissed changed.', { dismissed: syncState.gettingStartedDismissed, userId });
    }
  }, [syncState.gettingStartedDismissed, userId]);


  // Save on page hide - Zustand's persist middleware typically handles this,
  // but this is an explicit trigger if needed for some reason.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logInfo('SyncManager (Local Mode): Page hidden. Zustand persist should handle saving any pending state to Session Storage.', { userId });
        // No explicit 'saveData()' call as Zustand persist middleware handles this.
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId]);


  const retrySync = useCallback(() => {
    logInfo('SyncManager (Local Mode): "Retry Sync" clicked. In local-only mode, this re-checks hydration or informs user.', { currentStatus: syncState.status, userId });
    if (syncState.status === 'error_local') {
      toast({ title: 'Local Data Error', description: 'There was an issue loading local data. Try refreshing the page.', variant: 'destructive'});
    } else {
      toast({ title: 'Local Mode Active', description: 'All data is stored locally in this browser session.', variant: 'default'});
    }
    // Re-trigger hydration check logic if needed, though Zustand should manage this.
    initialLoadDoneRef.current = false; // This will make the main useEffect re-evaluate hydration
    updateSyncState({ status: 'idle' }); // Triggers re-evaluation in main useEffect
  }, [syncState.status, toast, userId, updateSyncState]);

  // Dummy saveData and fetchData for hooks that might still call them.
  const saveData = useCallback(async (isForceSave = false) => {
    logInfo('SyncManager (Local Mode): saveData called (no-op for server).', { isForceSave, userId });
    // In local-only mode, saving is handled by Zustand persist middleware on state change.
    return true; // Indicate success as there's no server operation.
  }, [userId]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    logInfo('SyncManager (Local Mode): fetchData called (no-op for server).', { isRetry, skipHashCheck, userId });
    // In local-only mode, data is loaded from Session Storage by Zustand.
    // This function can ensure the 'local' status is set after hydration.
    updateSyncState({ status: 'local', lastLoadTime: new Date() });
    initialLoadDoneRef.current = true;
    return true;
  }, [userId, updateSyncState]);

  // These are no longer used for server sync but kept to avoid breaking component props.
  const forceSaveLocal = useCallback(async () => {
    toast({ title: 'Local Mode', description: 'Data is already saved locally.', variant: 'default' });
    return true;
  }, [toast]);

  const forceFetchServer = useCallback(async () => {
    toast({ title: 'Local Mode', description: 'Cannot fetch from server; data is local.', variant: 'default' });
    return false;
  }, [toast]);


  return {
    syncStatus: syncState.status,
    retrySync, // Keep for UI, behavior changed
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => updateSyncState({ gettingStartedDismissed: dismissed }),
    // The following are no longer relevant in local-only mode but kept for API compatibility if components expect them
    hashMismatch: false,
    forceSaveLocal,
    forceFetchServer,
    isMismatchDialogOpen: false,
    setIsMismatchDialogOpen: () => {}, // No-op
    lastSyncTime: syncState.lastLoadTime, // Renamed to reflect local load
  };
}
