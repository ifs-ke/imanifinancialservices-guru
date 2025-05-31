// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';
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
  investmentItems: InvestmentItem[];
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export type SyncStatus =
  | 'idle' // Not yet synced or authenticated
  | 'loading_local' // Initial load from session storage (for zustand persist)
  | 'local' // Data is only in session storage, not synced to server
  | 'syncing' // Actively communicating with the server (fetch or save)
  | 'synced' // Data is in sync with the server
  | 'local_changes' // Local data has changed since last sync, needs to be saved
  | 'error' // A network or server error occurred during sync
  | 'hash_mismatch'; // Data conflict detected

interface SyncState {
  status: SyncStatus;
  lastFetchTime: Date | null;
  lastSaveTime: Date | null;
  lastServerHash: string | null;
  isMismatchDialogOpen: boolean;
  gettingStartedDismissed: boolean;
}

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();

  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastFetchTime: null,
    lastSaveTime: null,
    lastServerHash: null,
    isMismatchDialogOpen: false,
    gettingStartedDismissed: false,
  });

  const isSavingRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(null);
  const hasLocalChangesRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;
  const getInvestmentState = useInvestmentStore.getState;

  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncState(prev => ({ ...prev, ...partialState }));
  }, []);

  const clearAllLocalStoreData = useCallback(() => {
    const currentUserIdForLog = previousUserIdRef.current || userId || 'unknown_user_at_clear';
    if (isClearingRef.current) {
        logWarn('clearAllLocalStoreData called while already clearing.', { userId: currentUserIdForLog });
        return;
    }
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing all local Zustand store data.', { userId: currentUserIdForLog });
    try {
        getTransactionsState().clearTransactions();
        getDebtState().clearDebts();
        getStatementState().clearStatementItems();
        getBudgetState().clearBudgetItems();
        getWeeklyReviewState().clearReviews();
        getNotificationState().clearAllNotifications();
        getInvestmentState().clearInvestmentItems();
        updateSyncState({
            status: 'idle', // Reset to idle, will fetch if signed in
            lastFetchTime: null,
            lastSaveTime: null,
            lastServerHash: null,
            gettingStartedDismissed: false,
        });
        hasLocalChangesRef.current = false;
        logInfo('SyncManager: All local store data cleared.', { userId: currentUserIdForLog });
    } catch (error: any) {
        logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog });
        updateSyncState({ status: 'error' });
    } finally {
        isClearingRef.current = false;
    }
  }, [ getTransactionsState, getDebtState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, getInvestmentState, updateSyncState, userId]);

  const fetchData = useCallback(async (isPreSaveCheck = false): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      logWarn('fetchData aborted: User not signed in or Clerk not loaded.', { isClerkLoaded, isSignedIn, currentUserId });
      if (!isPreSaveCheck) updateSyncState({ status: 'idle' });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logWarn('fetchData aborted: Another sync operation in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, currentUserId });
      return false;
    }

    isFetchingRef.current = true;
    if (!isPreSaveCheck) updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Fetching data from server...', { currentUserId });

    abortControllerRef.current?.abort(); // Abort previous fetch if any
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    try {
      const response = await fetch('/api/sync', { signal });
      if (signal.aborted) {
        logInfo('Fetch aborted by new request or unmount.', { currentUserId });
        isFetchingRef.current = false;
        return false;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status}` }));
        throw new Error(errorData.error || `Failed to fetch data: ${response.status}`);
      }
      const serverData = await response.json();
      const { dataHash: serverHash, ...dataToLoad } = serverData;

      const localDataForHashVerification = prepareDataForHashing(dataToLoad);
      const localCalculatedHash = await hashData(stringify(localDataForHashVerification));

      if (localCalculatedHash !== serverHash) {
        logError('Data integrity check failed after fetch: Server hash and locally calculated hash of server data do not match.',
          new Error('Hash Mismatch on Fetched Data'),
          { serverHash, localCalculatedHash, currentUserId }
        );
        if (!isPreSaveCheck) {
            updateSyncState({ status: 'hash_mismatch', lastServerHash: serverHash, isMismatchDialogOpen: true });
            toast({ title: 'Data Sync Mismatch', description: 'Server data appears to have changed. Please resolve the conflict.', variant: 'destructive', duration: Infinity });
        }
        isFetchingRef.current = false;
        return false;
      }

      getTransactionsState().setTransactions(dataToLoad.transactions || []);
      getDebtState().setDebts(dataToLoad.debts || []);
      getInvestmentState().setInvestmentItems(dataToLoad.investmentItems || []);
      getStatementState().setAssetItems(dataToLoad.assetItems || []);
      getStatementState().setOtherLiabilityItems(dataToLoad.otherLiabilityItems || []);
      getBudgetState().setBudgetItems(dataToLoad.budgetItems || []);
      getWeeklyReviewState().setOwnedReviews(dataToLoad.ownedReviews || {});
      getWeeklyReviewState().setSharedReviews(dataToLoad.sharedReviews || {});
      getNotificationState().setNotifications(dataToLoad.notifications || []); // Notifications are also synced
      getStatementState().setStartDate(dataToLoad.startDate ? new Date(dataToLoad.startDate) : undefined);
      getStatementState().setEndDate(dataToLoad.endDate ? new Date(dataToLoad.endDate) : undefined);
      
      if (!isPreSaveCheck) {
          updateSyncState({
            status: 'synced',
            lastFetchTime: new Date(),
            lastServerHash: serverHash,
            isMismatchDialogOpen: false,
            gettingStartedDismissed: dataToLoad.gettingStartedDismissed || false,
          });
          hasLocalChangesRef.current = false;
          logInfo('SyncManager: Data fetched and loaded successfully.', { currentUserId, serverHash });
          toast({ title: 'Data Synced', description: 'Latest data loaded from the server.' });
      } else {
          // For pre-save, just update the hash for subsequent save operation
          updateSyncState({ lastServerHash: serverHash });
      }
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logInfo('Fetch aborted.', { currentUserId });
      } else {
        logError('Error fetching data:', error, { currentUserId });
        if (!isPreSaveCheck) {
            updateSyncState({ status: 'error' });
            toast({ title: 'Sync Load Failed', description: error.message || 'Could not load data from server.', variant: 'destructive' });
        }
      }
      isFetchingRef.current = false;
      return false;
    } finally {
      if (signal === abortControllerRef.current?.signal) { // Only clear if this is the most recent controller
        abortControllerRef.current = null;
      }
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState ]);

  const saveData = useCallback(async (force = false): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      logWarn('saveData aborted: User not signed in or Clerk not loaded.', { isClerkLoaded, isSignedIn, currentUserId });
      updateSyncState({ status: 'idle' });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logWarn('saveData aborted: Another sync operation in progress.', { currentUserId });
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server...', { currentUserId, force });

    if (!force) {
      const preSaveFetchSuccess = await fetchData(true);
      if (!preSaveFetchSuccess) {
        logError('Save Aborted: Pre-save fetch failed or hash mismatch detected.', new Error("Pre-save check failed"), { currentUserId });
        // fetchData(true) would have already set status to hash_mismatch or error, or shown a toast
        // If it was hash_mismatch, dialog is open. If error, status is 'error'.
        // No need to call updateSyncState({ status: 'error' }) here as fetchData handles it.
        isSavingRef.current = false;
        if (syncState.status !== 'hash_mismatch') updateSyncState({status: 'error'}); // Ensure error state if not conflict
        return false;
      }
    }

    const dataToSave: SyncedData = {
      transactions: getTransactionsState().transactions,
      debts: getDebtState().debts,
      investmentItems: getInvestmentState().investmentItems,
      assetItems: getStatementState().assetItems,
      otherLiabilityItems: getStatementState().otherLiabilityItems,
      budgetItems: getBudgetState().budgetItems,
      ownedReviews: getWeeklyReviewState().ownedReviews,
      sharedReviews: {}, // Shared reviews are not saved from client; managed server-side
      notifications: [], // Notifications are not saved from client
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
      gettingStartedDismissed: syncState.gettingStartedDismissed,
    };

    const preparedData = prepareDataForHashing(dataToSave);
    const dataHash = await hashData(stringify(preparedData));

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Server error during save.' }));
        throw new Error(errorData.error || 'Failed to save data to server.');
      }

      updateSyncState({
        status: 'synced',
        lastSaveTime: new Date(),
        lastServerHash: dataHash, // Assume server hash matches if save is successful
        isMismatchDialogOpen: false,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data saved successfully.', { currentUserId, newHash: dataHash });
      toast({ title: 'Data Saved', description: 'Your changes have been saved to the server.' });
      return true;
    } catch (error: any) {
      logError('Error saving data:', error, { currentUserId });
      updateSyncState({ status: 'error' });
      toast({ title: 'Save Failed', description: error.message || 'Could not save data to server.', variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, fetchData, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, syncState.gettingStartedDismissed, syncState.status]);


  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect: Auth not loaded yet.', { currentUserId });
      return;
    }

    if (currentUserId && currentUserId !== prevUserId) {
      logInfo(`SyncManager effect: User signed in or switched. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing local data and fetching.`, { currentUserId });
      clearAllLocalStoreData(); // Clear data from previous user
      initialLoadDoneRef.current = false; // Force fetch for new user
      previousUserIdRef.current = currentUserId;
      hasLocalChangesRef.current = false;
      updateSyncState({status: 'idle'}); // set to idle before fetch
      fetchData();
    } else if (!currentUserId && prevUserId) {
      logInfo(`SyncManager effect: User signed out. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId });
      clearAllLocalStoreData();
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false;
      updateSyncState({ status: 'idle', lastFetchTime: null, lastSaveTime: null, lastServerHash: null, isMismatchDialogOpen: false });
      hasLocalChangesRef.current = false;
    } else if (currentUserId && !initialLoadDoneRef.current && syncState.status === 'idle') {
      logInfo('SyncManager effect: Initial load for current user.', { currentUserId });
      fetchData();
      initialLoadDoneRef.current = true;
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, fetchData, syncState.status, updateSyncState]);


  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn) {
      const stateToPersist = {
        gettingStartedDismissed: syncState.gettingStartedDismissed,
        // Add other simple, non-sensitive UI preferences here if needed
      };
      localStorage.setItem(`ifcGuru_uiPrefs_${userId}`, JSON.stringify(stateToPersist));
      logDebug('SyncManager: Persisted UI preferences to localStorage.', { userId, preferences: stateToPersist });
    }
  }, [syncState.gettingStartedDismissed, userId, isSignedIn]);

  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn) {
      const storedPrefs = localStorage.getItem(`ifcGuru_uiPrefs_${userId}`);
      if (storedPrefs) {
        try {
          const prefs = JSON.parse(storedPrefs);
          updateSyncState({ gettingStartedDismissed: prefs.gettingStartedDismissed || false });
          logDebug('SyncManager: Loaded UI preferences from localStorage.', { userId, preferences: prefs });
        } catch (e) {
          logError('Error parsing UI preferences from localStorage', e, { userId });
        }
      }
    }
  }, [userId, isSignedIn, updateSyncState]);

  const handleStoreChange = useCallback(() => {
    if (syncState.status === 'syncing' || syncState.status === 'loading_local' || !initialLoadDoneRef.current || !isSignedIn) {
      return; // Don't mark changes during sync, initial load, or if not signed in
    }
    hasLocalChangesRef.current = true;
    if (syncState.status === 'synced' || syncState.status === 'local') {
      updateSyncState({ status: 'local_changes' });
    }
    logDebug("SyncManager: Store change detected. Marked hasLocalChanges. Status potentially set to 'local_changes'.", { currentUserId: userId, currentStatus: syncState.status });
  }, [syncState.status, updateSyncState, userId, isSignedIn]);

  useEffect(() => {
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useInvestmentStore
      // Not watching notification store for 'hasLocalChanges' as they are transient
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [handleStoreChange]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logInfo('SyncManager: Page hidden.', { userId, hasLocalChanges: hasLocalChangesRef.current, status: syncState.status });
        if (hasLocalChangesRef.current && syncState.status === 'local_changes' && isSignedIn) {
          logInfo('SyncManager: Attempting to save data due to page hide with local changes.', { userId });
          saveData();
        }
      } else if (document.visibilityState === 'visible') {
        logInfo('SyncManager: Page visible.', { userId, status: syncState.status, lastFetchTime: syncState.lastFetchTime });
        // Optional: Auto-fetch if page becomes visible after a long time and data is stale
        const tenMinutes = 10 * 60 * 1000;
        if (isSignedIn && syncState.status === 'synced' && syncState.lastFetchTime && (new Date().getTime() - syncState.lastFetchTime.getTime() > tenMinutes)) {
          logInfo('SyncManager: Data might be stale, auto-fetching on page visibility.', { userId });
          fetchData();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', () => handleVisibilityChange()); // More robust for some browsers for "final" save

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', () => handleVisibilityChange());
    };
  }, [userId, syncState.status, syncState.lastFetchTime, saveData, fetchData, isSignedIn]);

  const manualSync = useCallback(async () => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
        toast({ title: 'Not Signed In', description: 'Please sign in to sync your data.', variant: 'destructive' });
        return;
    }
    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncState.status, currentUserId });

    if (syncState.status === 'hash_mismatch') {
        updateSyncState({ isMismatchDialogOpen: true });
        toast({ title: 'Data Conflict', description: 'Please resolve the data conflict before syncing.', duration: Infinity });
    } else if (hasLocalChangesRef.current || syncState.status === 'local_changes') {
        await saveData();
    } else {
        await fetchData();
    }
  }, [userId, isClerkLoaded, isSignedIn, syncState.status, syncState.isMismatchDialogOpen, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(() => saveData(true), [saveData]);
  const forceFetch = useCallback(async () => {
    clearAllLocalStoreData(); // Clear local first
    const success = await fetchData(); // Then fetch server data
    if (success) updateSyncState({ isMismatchDialogOpen: false });
    return success;
  }, [clearAllLocalStoreData, fetchData, updateSyncState]);


  return {
    syncStatus: syncState.status,
    retrySync: manualSync, // 'retrySync' is now the general manual sync trigger
    fetchData,
    saveData,
    forceSave,
    forceFetch,
    hashMismatch: syncState.status === 'hash_mismatch',
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => updateSyncState({ isMismatchDialogOpen: isOpen }),
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime, // More general "last successful server interaction"
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
        updateSyncState({ gettingStartedDismissed: dismissed });
        // Also trigger a save if user is signed in, to persist this preference server-side
        if (isSignedIn) {
            // Small hack: set hasLocalChanges to true to make saveData persist this change
            // It's a small piece of data, often changed in isolation.
            hasLocalChangesRef.current = true;
            saveData();
        }
    },
  };
}
