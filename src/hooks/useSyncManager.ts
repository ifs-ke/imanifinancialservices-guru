
// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
// import { useAuth } from '@clerk/nextjs'; // Clerk is disabled
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';

interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncTime: Date | null;
  gettingStartedDismissed: boolean;
  hashMismatch: boolean;
  isMismatchDialogOpen: boolean;
}

export function useSyncManager() {
  const MOCK_USER_ID = process.env.NEXT_PUBLIC_MOCK_USER_ID;
  const isSignedIn = !!MOCK_USER_ID;
  const userId = MOCK_USER_ID;
  const isClerkLoaded = true; // Simulate Clerk being loaded

  const { toast } = useToast();
  
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'local', // Default to local as there's no DB to sync with
    lastSyncTime: null,
    gettingStartedDismissed: false,
    hashMismatch: false,
    isMismatchDialogOpen: false
  });

  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(true); // Assume initial "fetch" (from local) is done
  const internalPreviousUserId = useRef<string | null | undefined>(userId); // Initialize with mock user
  const hasLocalChangesRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncState(prev => ({ ...prev, ...partialState }));
  }, []);

  const cleanupAsyncOperations = useCallback((reason?: string) => {
    const currentUserIdForLog = userId;
    logDebug(`SyncManager: Cleanup initiated. Reason: ${reason || 'Unknown'}`, { currentUserId: currentUserIdForLog }, currentUserIdForLog);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      logDebug(`SyncManager: Cleared save timeout. Reason: ${reason || 'Unknown'}`, { currentUserId: currentUserIdForLog }, currentUserIdForLog);
    }
    if (abortControllerRef.current) {
      logDebug(`SyncManager: Aborting previous fetch/save operation. Reason: ${reason || 'Unknown'}`, { currentUserId: currentUserIdForLog }, currentUserIdForLog);
      abortControllerRef.current.abort(reason); 
      abortControllerRef.current = null;
    }
  }, [userId]); 

  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) {
      logDebug("ClearLocalState: Already in progress, skipping.", { currentUserId: internalPreviousUserId.current }, userId);
      return;
    }
    isClearingRef.current = true;
    const contextUserId = internalPreviousUserId.current; 
    logInfo('SyncManager: Clearing local state.', { userId: contextUserId }, contextUserId);

    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();

      const storeKeys = [
        'ifcGuru_transactions', 
        'ifcGuru_debts', 
        'ifcGuru_statementItems', 
        'ifcGuru_budgetItems', 
        'ifcGuru_weeklyReviews', 
        'ifcGuru_notifications'
      ];

      storeKeys.forEach(key => {
        try { 
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key); 
        } catch (e) { 
          logWarn(`Failed to remove ${key} from sessionStorage`, { error: e, userId: contextUserId }, contextUserId); 
        }
      });

      logInfo('SyncManager: Local state cleared successfully.', { userId: contextUserId }, contextUserId);
      updateSyncState({ 
        status: 'local',
        lastSyncTime: null,
        gettingStartedDismissed: false, 
        hashMismatch: false,
        isMismatchDialogOpen: false
      });
      hasLocalChangesRef.current = false;
    } catch (error:any) {
      logError('Error during clearLocalState', error, { userId: contextUserId }, contextUserId);
    } finally {
      isClearingRef.current = false;
    }
  }, [
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, updateSyncState, userId
  ]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    const currentUserIdForLog = userId;
    logWarn('FetchData: MongoDB has been removed. This operation is disabled and will return simulated local state.', { userId: currentUserIdForLog, isRetry, skipHashCheck }, currentUserIdForLog);
    updateSyncState({ status: 'local', lastSyncTime: new Date() }); // Simulate a "sync" to local state
    initialFetchDoneRef.current = true;
    return false; // Indicate no server fetch occurred
  }, [userId, updateSyncState]);

  const saveData = useCallback(async (isForceSave = false) => {
    const currentUserIdForLog = userId;
    logWarn('SaveData: MongoDB has been removed. This operation is disabled and will not save to a remote server.', { userId: currentUserIdForLog, isForceSave }, currentUserIdForLog);
    // Simulate a successful local "save"
    updateSyncState({ status: 'local', lastSyncTime: new Date() });
    hasLocalChangesRef.current = false;
    toast({ title: 'Data is Local', description: 'Changes are saved in this browser session only. Database functionality is disabled.' });
    return false; // Indicate no server save occurred
  }, [userId, updateSyncState, toast]);

  const triggerDebouncedSave = useCallback(() => {
    const currentUserIdForLog = userId;
    if (!isSignedIn) { 
      logWarn('Debounced Save: User not "signed in" (mock). Save will not occur.', { currentUserId: currentUserIdForLog }, currentUserIdForLog); 
      return; 
    }
    
    cleanupAsyncOperations(`Starting new debounced save for user ${currentUserIdForLog}`);
    logDebug('Debounced Save: Timer started/reset (MongoDB removed - local persistence only).', { currentUserId: currentUserIdForLog }, currentUserIdForLog);
    
    // With MongoDB removed, the debounced save doesn't need to call saveData to a backend.
    // It essentially becomes a no-op for cloud persistence. Local changes are already in Zustand/sessionStorage.
    // We can clear the timeout if it was for an actual backend save.
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // We can set a short timeout to update the status to 'local' if it was 'syncing' (though less likely now)
    saveTimeoutRef.current = setTimeout(() => { 
      if (syncState.status === 'syncing') { // Should not happen if save is disabled
        updateSyncState({ status: 'local' });
      }
      logDebug('Debounced Save: "Save" completed (local persistence).', { currentUserId: currentUserIdForLog }, currentUserIdForLog);
    }, 500); // Short delay to simulate a local "save" acknowledgement

  }, [isSignedIn, userId, cleanupAsyncOperations, syncState.status, updateSyncState]); 


  const handleStoreChange = useCallback(() => {
    const currentUserIdForLog = userId;
    if (isClearingRef.current) { // Added isClearingRef check
      logDebug('Store Change: Clear operation in progress. Save deferred.', { 
        isClearing: isClearingRef.current, 
        currentUserId: currentUserIdForLog 
      }, currentUserIdForLog);
      return;
    }
    if (!hasLocalChangesRef.current) {
      logInfo('Store Change: First local change detected.', { currentUserId: currentUserIdForLog }, currentUserIdForLog);
    }
    hasLocalChangesRef.current = true;
    if (syncState.status !== 'local') { // If not already 'local', set it to local
      updateSyncState({ status: 'local' });
      logInfo('Store Change: Status changed to "local" due to store changes (MongoDB removed).', { 
        currentUserId: currentUserIdForLog, previousStatus: syncState.status 
      }, currentUserIdForLog);
    }
    // No debounced save to backend as MongoDB is removed.
    // Local persistence is handled by Zustand's persist middleware.
  }, [userId, syncState.status, updateSyncState]); 

  useEffect(() => {
    const currentAuthUserId = userId;
    logInfo(`Auth Effect (MongoDB removed): User identified as ${currentAuthUserId || 'None'}. Initializing local state.`, {
      currentAuthUserId,
      previousUserId: internalPreviousUserId.current,
    }, currentAuthUserId);

    if (internalPreviousUserId.current !== currentAuthUserId) {
      cleanupAsyncOperations(`User ID changed from ${internalPreviousUserId.current} to ${currentAuthUserId}`);
      // If there was a previous mock user and it's different, clear state.
      // Or if a mock user appears after none was set.
      if (internalPreviousUserId.current || (currentAuthUserId && !internalPreviousUserId.current)) {
        clearLocalState();
      }
      internalPreviousUserId.current = currentAuthUserId;
    }
    
    updateSyncState({ status: 'local', lastSyncTime: null, hashMismatch: false, isMismatchDialogOpen: false });
    initialFetchDoneRef.current = true; // Since there's no server fetch, mark as done.
    
    return () => {
        const reason = `AuthEffectCleanup-${currentAuthUserId || 'noUser'}`;
        cleanupAsyncOperations(reason);
    };
  }, [userId, isSignedIn, isClerkLoaded, clearLocalState, cleanupAsyncOperations, updateSyncState]); 


  useEffect(() => {
    const currentUserIdForLog = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserIdForLog || !initialFetchDoneRef.current) {
      logDebug('Change Subscription (MongoDB removed): Conditions not met.', { 
        isClerkLoaded, isSignedIn, currentUserId: currentUserIdForLog, initialFetchDone: initialFetchDoneRef.current 
      }, currentUserIdForLog);
      return;
    }
    logDebug('Change Subscription (MongoDB removed): Subscribing to store changes...', { currentUserId: currentUserIdForLog }, currentUserIdForLog);
    const storesToWatch = [useTransactionsStore, useDebtStore, useStatementStore, useBudgetStore, useWeeklyReviewStore];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    
    return () => {
      logDebug('Change Subscription (MongoDB removed): Unsubscribing from store changes.', { currentUserId: currentUserIdForLog }, currentUserIdForLog);
      unsubscribes.forEach(unsub => unsub());
      cleanupAsyncOperations(`Change Subscription Unmount for user ${currentUserIdForLog}`);
    };
  }, [isClerkLoaded, isSignedIn, userId, handleStoreChange, cleanupAsyncOperations]); 

  useEffect(() => {
    const currentUserIdForLog = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserIdForLog || !initialFetchDoneRef.current) return;
    
    if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
      logDebug('Getting Started Tracker (MongoDB removed): Change detected for gettingStartedDismissed.', { 
        gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId: currentUserIdForLog 
      }, currentUserIdForLog);
      hasLocalChangesRef.current = true; // Mark that a change occurred
      if (syncState.status !== 'local' ) {
        updateSyncState({ status: 'local' });
        logInfo('Getting Started Tracker (MongoDB removed): Status changed to "local" due to dismissal state change.', { 
          currentUserId: currentUserIdForLog, previousStatus: syncState.status 
        }, currentUserIdForLog);
      }
      // No debounced save to backend.
    } else {
      logDebug('Getting Started Tracker (MongoDB removed): Dismissal change detected, but conditions prevent status update or already local.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch: syncState.hashMismatch, currentUserId: userId, currentStatus: syncState.status }, userId);
    }
  }, [syncState.gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, syncState.hashMismatch, syncState.status, updateSyncState]);

  const forceSaveLocal = useCallback(async () => {
    logWarn('Force Save Local: MongoDB has been removed. This action is effectively a no-op as data is already local.', { userId });
    toast({ title: 'Data is Local', description: 'Database functionality is disabled. Data is saved in this browser session.' });
    return true; // Indicate success as local data is "saved"
  }, [userId, toast]);

  const forceFetchServer = useCallback(async () => {
    logWarn('Force Fetch Server: MongoDB has been removed. This action will clear local data and simulate an empty server state.', { userId });
    clearLocalState(); // Clears session storage and Zustand stores
    updateSyncState({ status: 'local', hashMismatch: false, isMismatchDialogOpen: false, lastSyncTime: new Date() });
    toast({ title: 'Local Data Cleared', description: 'Local data has been cleared. Database functionality is disabled.' });
    return true; // Indicate success of the local operation
  }, [userId, clearLocalState, updateSyncState, toast]);

  const retrySync = useCallback(() => {
    const currentUserIdForLog = userId;
    if (!isSignedIn) { 
      toast({ 
        title: 'Cannot Sync', 
        description: 'User is not "signed in" (mock).', 
        variant: 'destructive' 
      });
      return;
    }
    logInfo('Manual Sync/Retry Triggered (MongoDB removed). Status remains local.', { currentStatus: syncState.status, currentUserId: currentUserIdForLog }, currentUserIdForLog);
    toast({ title: 'Local Data', description: 'Database synchronization is disabled. Your data is saved in this browser session only.' });
    updateSyncState({ status: 'local' }); // Ensure status reflects local state
    
  }, [
    syncState.status, isSignedIn, userId, toast, updateSyncState
  ]); 

  return {
    syncStatus: syncState.status,
    retrySync,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => updateSyncState({ gettingStartedDismissed: dismissed }),
    hashMismatch: syncState.hashMismatch,
    forceSaveLocal,
    forceFetchServer,
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (open: boolean) => updateSyncState({ isMismatchDialogOpen: open }),
    lastSyncTime: syncState.lastSyncTime,
  };
}

