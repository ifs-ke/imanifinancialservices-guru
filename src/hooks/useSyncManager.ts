
// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';
import type { SaveDataPayload as SaveDataPayloadType } from '@/lib/schemas';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';

export const COMPONENT_UNMOUNTING_ABORT_REASON = 'ComponentUnmounting';
export const NEW_REQUEST_ABORT_REASON = 'NewFetchInitiated';
export const API_TIMEOUT_ABORT_REASON = 'APICallTimedOut';
export const FETCH_TIMEOUT_SYMBOL = Symbol.for('FETCH_TIMEOUT');
export const FETCH_ABORTED_BENIGNLY_SYMBOL = Symbol.for('FETCH_ABORTED_BENIGNLY');

interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  investmentItems: InvestmentItem[];
  startDate?: string;
  endDate?: string;
}

export type SyncStatus =
  | 'idle'
  | 'loading_local'
  | 'local'
  | 'local_changes' // Retained for potential future re-enabling
  | 'syncing'
  | 'synced'
  | 'error'
  | 'error_local'
  | 'hash_mismatch';

interface SyncState {
  status: SyncStatus;
  lastFetchTime: Date | null;
  lastSaveTime: Date | null;
  lastServerHash: string | null;
  isMismatchDialogOpen: boolean;
  conflictingLocalDataString: string | null;
  conflictingServerDataString: string | null;
  isInitialClientSyncPending: boolean;
  isPreviewingLocalChanges: boolean;
  localChangesPayloadPreview: string | null;
}

// --- CORE ARCHITECTURAL CHANGE: DISABLING SERVER SYNC ---
const IS_FETCH_DISABLED = true;
// ---

const HASH_CHECK_ENABLED = true;
const API_TIMEOUT_MS = 60000;
const AUTO_SAVE_DEBOUNCE_DELAY_MS = 60000;

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();

  const [syncState, setSyncStateInternal] = useState<SyncState>({
    status: 'idle',
    lastFetchTime: null,
    lastSaveTime: null,
    lastServerHash: null,
    isMismatchDialogOpen: false,
    conflictingLocalDataString: null,
    conflictingServerDataString: null,
    isInitialClientSyncPending: true,
    isPreviewingLocalChanges: false,
    localChangesPayloadPreview: null,
  });
  
  const lastSyncedData = useRef<SyncedData | null>(null);
  const isSavingRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(null);
  const hasLocalChangesRef = useRef(false);
  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const autoSaveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getInvestmentState = useInvestmentStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  const syncStateRef = useRef(syncState);
  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncStateInternal(prev => ({ ...prev, ...partialState }));
  }, []);


  const getCurrentLocalDataForFullSnapshot = useCallback((): SyncedData => {
    return {
      transactions: getTransactionsState().transactions,
      debts: getDebtState().debts,
      investmentItems: getInvestmentState().investmentItems,
      assetItems: getStatementState().assetItems,
      otherLiabilityItems: getStatementState().otherLiabilityItems,
      budgetItems: getBudgetState().budgetItems,
      ownedReviews: getWeeklyReviewState().ownedReviews,
      sharedReviews: getWeeklyReviewState().sharedReviews,
      notifications: getNotificationState().notifications,
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
    };
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState]);

  const computeDelta = useCallback((): Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'> | null => {
    // This function is now inert in local-only mode, but kept for potential future re-enabling.
    if (IS_FETCH_DISABLED) return null;
    
    // ... original delta logic remains here ...
    return null;
  }, [userId, getCurrentLocalDataForFullSnapshot]);


  const clearAllLocalStoreData = useCallback(() => {
    const currentUserIdForLog = previousUserIdRef.current || userId || 'unknown_user_at_clear';
    if (isClearingRef.current) {
      logWarn('clearAllLocalStoreData called while already clearing.', { userId: currentUserIdForLog }, currentUserIdForLog);
      return;
    }
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing all local Zustand store data.', { userId: currentUserIdForLog }, currentUserIdForLog);

    if (autoSaveDebounceTimerRef.current) {
      clearTimeout(autoSaveDebounceTimerRef.current);
      autoSaveDebounceTimerRef.current = null;
    }

    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getInvestmentState().clearInvestmentItems();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();
      lastSyncedData.current = null;
      updateSyncState({
        status: 'idle',
        lastFetchTime: null,
        lastSaveTime: null,
        lastServerHash: null,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        isInitialClientSyncPending: true,
        isPreviewingLocalChanges: false,
        localChangesPayloadPreview: null,
      });
      hasLocalChangesRef.current = false;
      if (currentUserIdForLog !== 'unknown_user_at_clear') {
        localStorage.removeItem(`ifcGuru_uiPrefs_${currentUserIdForLog}`);
      }
      logInfo('SyncManager: All local store data cleared.', { userId: currentUserIdForLog }, currentUserIdForLog);
    } catch (error: any) {
      logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog }, currentUserIdForLog);
      updateSyncState({ status: 'error_local', isInitialClientSyncPending: true });
    } finally {
      isClearingRef.current = false;
    }
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, updateSyncState, userId]);

  const fetchData = useCallback(async (isPreCheck = false): Promise<string | false | typeof FETCH_TIMEOUT_SYMBOL | typeof FETCH_ABORTED_BENIGNLY_SYMBOL> => {
    const currentUserId = userId;

    if (!isClerkLoaded) return false;

    // --- MODIFICATION FOR LOCAL-ONLY ---
    // If sync is disabled, we never fetch. We just set the status to 'local'.
    if (IS_FETCH_DISABLED) {
      logInfo('SyncManager: Fetching disabled (local-only mode). Setting status to local.', { userId: currentUserId }, currentUserId);
      if (!isPreCheck) {
        updateSyncState({ status: 'local', isInitialClientSyncPending: false, isPreviewingLocalChanges: false, localChangesPayloadPreview: null });
      }
      // Return a benign symbol to indicate it didn't fail, it just didn't run.
      return FETCH_ABORTED_BENIGNLY_SYMBOL;
    }
    // --- END MODIFICATION ---

    // Original fetch logic remains below but will not be executed due to the guard above.
    if (!isSignedIn || !currentUserId) {
      if (!isPreCheck && syncStateRef.current.status !== 'idle') {
          updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: true, isPreviewingLocalChanges: false, localChangesPayloadPreview: null });
      }
      return false;
    }
    
    // ... original fetch implementation ...
    return false; // Should not be reached
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, getCurrentLocalDataForFullSnapshot]);


  const saveData = useCallback(async (force = false, directPayloadObject?: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'>): Promise<boolean> => {
    // --- MODIFICATION FOR LOCAL-ONLY ---
    // In local-only mode, "saving" is instant because Zustand's persist middleware handles it.
    // We just update the state to reflect this and log it.
    if (IS_FETCH_DISABLED) {
        logInfo('SyncManager: `saveData` called in local-only mode. No server call needed.', { userId }, userId);
        updateSyncState({ status: 'local' });
        if (autoSaveDebounceTimerRef.current) {
            clearTimeout(autoSaveDebounceTimerRef.current);
            autoSaveDebounceTimerRef.current = null;
        }
        hasLocalChangesRef.current = false;
        return true;
    }
    // --- END MODIFICATION ---

    // Original save logic remains below but will not be executed.
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle', isInitialClientSyncPending: true });
      return false;
    }
    // ... original save implementation ...
    return false; // Should not be reached
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, computeDelta, getCurrentLocalDataForFullSnapshot]);

  const manualSync = useCallback(async () => {
    const currentUserId = userId;
    if (!isClerkLoaded) return;

    // --- MODIFICATION FOR LOCAL-ONLY ---
    if (IS_FETCH_DISABLED) {
        logInfo('SyncManager: Manual sync triggered in local-only mode. Setting status to "local".', { userId: currentUserId }, currentUserId);
        updateSyncState({ status: 'local', isInitialClientSyncPending: false });
        toast({title: "Local Data", description: "Your data is saved in this browser."});
        return;
    }
    // --- END MODIFICATION ---

    // Original manual sync logic remains below but will not be executed.
    if (!isSignedIn || !currentUserId) {
      toast({ title: 'Not Signed In', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }
    // ... original manual sync implementation ...
  }, [userId, isClerkLoaded, isSignedIn, fetchData, toast, updateSyncState, computeDelta]);

  // These functions are now inert because conflict resolution is not needed in local-only mode.
  const confirmAndProceedWithSave = useCallback(async (modifiedPayloadObject?: Record<string, any>) => { return; }, []);
  const cancelLocalChangesPreview = useCallback(() => {
    updateSyncState({ isPreviewingLocalChanges: false, localChangesPayloadPreview: null, status: 'local' });
  }, [updateSyncState]);
  const forceSave = useCallback(async () => { return false; }, []);
  const forceFetch = useCallback(async () => { return false; }, []);

  useEffect(() => {
    const handleStoreChange = () => {
        // In local-only mode, there's no concept of being out of sync with a server.
        // We just ensure the status is 'local'.
        if (IS_FETCH_DISABLED) {
            if (syncStateRef.current.status !== 'local' && initialLoadDoneRef.current) {
                updateSyncState({ status: 'local' });
            }
            return;
        }

        if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
          return;
        }
        hasLocalChangesRef.current = true;
        if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local') {
          updateSyncState({ status: 'local_changes' });
        }
    };

    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useInvestmentStore
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [updateSyncState, isSignedIn]);

  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      return; // Wait until Clerk is ready to make decisions
    }

    // Case 1: User has signed out.
    // This triggers if we were signed in before (prevUserId is not null) and now we are not.
    if (!isSignedIn && prevUserId) {
      logInfo(`SyncManager: User signed out (was ${prevUserId}). Clearing local data.`, { userId: prevUserId }, prevUserId);
      clearAllLocalStoreData();
      initialLoadDoneRef.current = false;
      previousUserIdRef.current = null; // Reset for next session
      return; // Stop further processing
    }
    
    // Case 2: User has switched accounts.
    // This triggers if we were signed in before, are still signed in, but the ID has changed.
    if (isSignedIn && currentUserId && prevUserId && currentUserId !== prevUserId) {
      logInfo(`SyncManager: User switched from ${prevUserId} to ${currentUserId}. Clearing previous user's local data.`, { prevUserId, currentUserId }, currentUserId);
      clearAllLocalStoreData();
      initialLoadDoneRef.current = false; // Reset for the new user's initial load
    }
    
    // Case 3: This is the first time we're setting up for this user in this session.
    // This runs after initial sign-in or after an account switch (because initialLoadDoneRef was reset).
    if (isSignedIn && currentUserId && !initialLoadDoneRef.current) {
      logInfo(`SyncManager: Initializing session for user ${currentUserId}.`, { userId: currentUserId }, currentUserId);
      initialLoadDoneRef.current = true;
      updateSyncState({ status: 'loading_local', isInitialClientSyncPending: true });
      // manualSync will correctly handle local mode and set status to 'local' after rehydration
      manualSync();
    }
    
    // Finally, update the ref for the next render AFTER all logic has run.
    if (previousUserIdRef.current !== currentUserId) {
        previousUserIdRef.current = currentUserId;
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState, manualSync]);


  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED,
    manualSync,
    forceSave,
    forceFetch,
    isMismatchDialogOpen: false, // Always false in local-only mode
    setIsMismatchDialogOpen: () => {}, // No-op
    lastSyncTime: null,
    conflictingLocalDataString: null,
    conflictingServerDataString: null,
    isInitialClientSyncPending: syncState.isInitialClientSyncPending,
    isPreviewingLocalChanges: false,
    localChangesPayloadPreview: null,
    confirmAndProceedWithSave: async () => {},
    cancelLocalChangesPreview: () => {},
  };
}
