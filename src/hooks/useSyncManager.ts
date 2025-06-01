
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

const IS_FETCH_DISABLED = false; // Set to false to enable server sync

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
  | 'idle'
  | 'loading_local'
  | 'local'
  | 'syncing'
  | 'synced'
  | 'local_changes'
  | 'error'
  | 'error_local'
  | 'hash_mismatch';

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

  const [syncState, setSyncStateInternal] = useState<SyncState>({
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

  const syncStateRef = useRef(syncState);
  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);


  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncStateInternal(prev => ({ ...prev, ...partialState }));
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
        getInvestmentState().clearInvestmentItems();
        getStatementState().clearStatementItems();
        getBudgetState().clearBudgetItems();
        getWeeklyReviewState().clearReviews();
        getNotificationState().clearAllNotifications();
        updateSyncState({
            status: 'idle',
            lastFetchTime: null,
            lastSaveTime: null,
            lastServerHash: null,
            gettingStartedDismissed: false,
        });
        hasLocalChangesRef.current = false;
        logInfo('SyncManager: All local store data cleared.', { userId: currentUserIdForLog });
    } catch (error: any) {
        logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog });
        updateSyncState({ status: 'error_local' });
    } finally {
        isClearingRef.current = false;
    }
  }, [ getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, updateSyncState, userId]);

  const fetchData = useCallback(async (isPreSaveCheck = false): Promise<string | false> => {
    const currentUserId = userId;

    if (IS_FETCH_DISABLED) {
        logInfo(`SyncManager: Fetching is disabled (isPreSaveCheck: ${isPreSaveCheck}). Skipping network request.`, { currentUserId });
        if (!isPreSaveCheck) {
            if (syncStateRef.current.status === 'syncing' || syncStateRef.current.status === 'idle' || syncStateRef.current.status === 'loading_local') {
                 updateSyncState({ status: 'local' });
            }
        }
        if (!initialLoadDoneRef.current) {
            initialLoadDoneRef.current = true;
        }
        return isPreSaveCheck ? (syncStateRef.current.lastServerHash || "fetch_disabled_no_hash") : false;
    }

    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      logWarn('fetchData aborted: User not signed in or Clerk not loaded.', { isClerkLoaded, isSignedIn, currentUserId });
      if (!isPreSaveCheck && syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logWarn('fetchData aborted: Another sync operation in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, currentUserId });
      return false;
    }

    isFetchingRef.current = true;
    if (!isPreSaveCheck) updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Fetching data from server...', { currentUserId, isPreSaveCheck });

    abortControllerRef.current?.abort();
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

      if (!isPreSaveCheck) {
        const localDataForHashVerification = prepareDataForHashing(dataToLoad);
        const localCalculatedHash = await hashData(stringify(localDataForHashVerification));

        if (localCalculatedHash !== serverHash) {
            logError('Data integrity check failed after fetch: Server hash and locally calculated hash of server data do not match.',
            new Error('Hash Mismatch on Fetched Data'),
            { serverHash, localCalculatedHash, currentUserId }
            );
            updateSyncState({ status: 'hash_mismatch', lastServerHash: serverHash, isMismatchDialogOpen: true });
            toast({ title: 'Data Sync Mismatch', description: 'Server data appears to have changed. Please resolve the conflict.', variant: 'destructive', duration: Infinity });
            isFetchingRef.current = false;
            return false; // Return false to indicate failure for general fetches
        }

        getTransactionsState().setTransactions(dataToLoad.transactions || []);
        getDebtState().setDebts(dataToLoad.debts || []);
        getInvestmentState().setInvestmentItems(dataToLoad.investmentItems || []);
        getStatementState().setAssetItems(dataToLoad.assetItems || []);
        getStatementState().setOtherLiabilityItems(dataToLoad.otherLiabilityItems || []);
        getBudgetState().setBudgetItems(dataToLoad.budgetItems || []);
        getWeeklyReviewState().setOwnedReviews(dataToLoad.ownedReviews || {});
        getWeeklyReviewState().setSharedReviews(dataToLoad.sharedReviews || {});
        getNotificationState().setNotifications(dataToLoad.notifications || []);
        getStatementState().setStartDate(dataToLoad.startDate ? new Date(dataToLoad.startDate) : undefined);
        getStatementState().setEndDate(dataToLoad.endDate ? new Date(dataToLoad.endDate) : undefined);

        updateSyncState({
            status: 'synced',
            lastFetchTime: new Date(),
            lastServerHash: serverHash,
            isMismatchDialogOpen: false,
            gettingStartedDismissed: dataToLoad.gettingStartedDismissed || false,
        });
        hasLocalChangesRef.current = false;
        logInfo('SyncManager: Data fetched and loaded successfully.', { currentUserId, serverHash });
        if (!isPreSaveCheck) { // Only toast for general fetches, not pre-save checks
          toast({ title: 'Data Synced', description: 'Latest data loaded from the server.' });
        }
      }
      // For pre-save checks, we just need the server hash. For general fetches, this indicates success.
      if (!isPreSaveCheck) initialLoadDoneRef.current = true;
      return serverHash; // Return the server hash
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
      if (!isPreSaveCheck) initialLoadDoneRef.current = true; // Mark initial load done even on error for general fetches
      return false; // Indicate failure for both pre-save and general fetches
    } finally {
      isFetchingRef.current = false;
      if (signal === abortControllerRef.current?.signal) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState]);

  const saveData = useCallback(async (force = false): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      logWarn('saveData aborted: User not signed in or Clerk not loaded.', { isClerkLoaded, isSignedIn, currentUserId });
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logWarn('saveData aborted: Another sync operation in progress.', { currentUserId });
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server...', { currentUserId, force });

    if (!force && !IS_FETCH_DISABLED) {
      const knownServerHashBeforePreSaveFetch = syncStateRef.current.lastServerHash;
      const serverHashFromPreSaveFetch = await fetchData(true); // true indicates it's a pre-save check

      if (serverHashFromPreSaveFetch === false) { // fetchData returns false on error
        logError('Save Aborted: Pre-save fetch check failed (network error or internal fetch error).', new Error("Pre-save fetch error"), { currentUserId });
        isSavingRef.current = false;
        if (syncStateRef.current.status !== 'hash_mismatch') updateSyncState({status: 'error'});
        toast({ title: 'Save Failed', description: 'Could not verify server state before saving. Please try again.', variant: 'destructive'});
        return false;
      }
      
      if (knownServerHashBeforePreSaveFetch && 
          typeof serverHashFromPreSaveFetch === 'string' && // ensure it's a hash string
          serverHashFromPreSaveFetch !== "fetch_disabled_no_hash" && // ensure it's not the placeholder
          serverHashFromPreSaveFetch !== knownServerHashBeforePreSaveFetch) {
        logWarn('Save Aborted: Server data changed during pre-save check. Hash mismatch.', { currentUserId, knownOldHash: knownServerHashBeforePreSaveFetch, newServerHash: serverHashFromPreSaveFetch });
        updateSyncState({ status: 'hash_mismatch', lastServerHash: serverHashFromPreSaveFetch, isMismatchDialogOpen: true });
        toast({ title: 'Data Sync Conflict', description: 'Server data changed. Please resolve conflict to save.', variant: 'destructive', duration: Infinity });
        isSavingRef.current = false;
        return false;
      }
      if (serverHashFromPreSaveFetch && typeof serverHashFromPreSaveFetch === 'string' && serverHashFromPreSaveFetch !== "fetch_disabled_no_hash") {
        updateSyncState({ lastServerHash: serverHashFromPreSaveFetch});
      }

    } else if (!force && IS_FETCH_DISABLED) {
        logInfo('SyncManager: Pre-save fetch skipped because fetching is disabled. Proceeding with save.', {currentUserId});
    }


    const dataToSave: SyncedData = {
      transactions: getTransactionsState().transactions,
      debts: getDebtState().debts,
      investmentItems: getInvestmentState().investmentItems,
      assetItems: getStatementState().assetItems,
      otherLiabilityItems: getStatementState().otherLiabilityItems,
      budgetItems: getBudgetState().budgetItems,
      ownedReviews: getWeeklyReviewState().ownedReviews,
      sharedReviews: {}, 
      notifications: [], 
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
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
        lastServerHash: dataHash, 
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
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, fetchData, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState]);


  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect: Auth not loaded yet.', { currentUserId });
      return;
    }

    if (currentUserId && currentUserId !== prevUserId) {
      logInfo(`SyncManager effect: User signed in or switched. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing local data and attempting fetch.`, { currentUserId });
      clearAllLocalStoreData();
      initialLoadDoneRef.current = false;
      previousUserIdRef.current = currentUserId;
      hasLocalChangesRef.current = false;
      updateSyncState({status: 'idle'}); 
      if (!IS_FETCH_DISABLED) {
        fetchData();
      } else {
        logInfo('SyncManager effect: Initial fetch for new user disabled. App will use local/empty data.', { currentUserId });
        updateSyncState({ status: 'local' }); 
        initialLoadDoneRef.current = true;
      }
    } else if (!currentUserId && prevUserId) {
      logInfo(`SyncManager effect: User signed out. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId });
      clearAllLocalStoreData();
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false; 
      updateSyncState({ status: 'idle', lastFetchTime: null, lastSaveTime: null, lastServerHash: null, isMismatchDialogOpen: false });
      hasLocalChangesRef.current = false;
    } else if (currentUserId && !initialLoadDoneRef.current && (syncStateRef.current.status === 'idle' || syncStateRef.current.status === 'loading_local')) {
      logInfo('SyncManager effect: Initial load for current user.', { currentUserId, currentStatus: syncStateRef.current.status });
      if (!IS_FETCH_DISABLED) {
        // updateSyncState({status: 'syncing'}); // No, fetchData sets this if not pre-save
        fetchData();
      } else {
        logInfo('SyncManager effect: Initial fetch disabled. App will use local/empty data.', { currentUserId });
        updateSyncState({ status: 'local' }); 
        initialLoadDoneRef.current = true;
      }
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, fetchData, updateSyncState]);


  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn && userId) {
      const stateToPersist = {
        gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
      };
      localStorage.setItem(`ifcGuru_uiPrefs_${userId}`, JSON.stringify(stateToPersist));
      logDebug('SyncManager: Persisted UI preferences to localStorage.', { userId, preferences: stateToPersist });
    }
  }, [syncStateRef.current.gettingStartedDismissed, userId, isSignedIn]);

  useEffect(() => {
    if (isSignedIn && userId) {
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
    if (syncStateRef.current.status === 'syncing' || syncStateRef.current.status === 'loading_local' || !initialLoadDoneRef.current || !isSignedIn) {
      return;
    }
    hasLocalChangesRef.current = true;
    if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'idle') {
      updateSyncState({ status: 'local_changes' });
    }
    logDebug("SyncManager: Store change detected. Marked hasLocalChanges. Status potentially set to 'local_changes'.", { currentUserId: userId, currentStatus: syncStateRef.current.status });
  }, [updateSyncState, userId, isSignedIn]);

  useEffect(() => {
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useInvestmentStore
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [handleStoreChange]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logInfo('SyncManager: Page hidden.', { userId, hasLocalChanges: hasLocalChangesRef.current, status: syncStateRef.current.status });
        if (hasLocalChangesRef.current && syncStateRef.current.status === 'local_changes' && isSignedIn && !IS_FETCH_DISABLED) {
          logInfo('SyncManager: Attempting to save data due to page hide with local changes.', { userId });
          saveData(); 
        }
      } else if (document.visibilityState === 'visible') {
        logInfo('SyncManager: Page visible.', { userId, status: syncStateRef.current.status, lastFetchTime: syncStateRef.current.lastFetchTime });
        const tenMinutes = 10 * 60 * 1000;
        if (isSignedIn && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local') && syncStateRef.current.lastFetchTime && (new Date().getTime() - syncStateRef.current.lastFetchTime.getTime() > tenMinutes)) {
          if (!IS_FETCH_DISABLED) {
            logInfo('SyncManager: Data might be stale, auto-fetching on page visibility.', { userId });
            fetchData();
          } else {
            logInfo('SyncManager: Auto-fetch on visibility skipped as fetching is disabled.', { userId });
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const pageHideHandler = () => {
        if (hasLocalChangesRef.current && syncStateRef.current.status === 'local_changes' && isSignedIn && !IS_FETCH_DISABLED) {
            logInfo('SyncManager: Attempting to save data due to pagehide with local changes.', { userId });
            saveData();
        }
    };
    window.addEventListener('pagehide', pageHideHandler);


    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', pageHideHandler);
      abortControllerRef.current?.abort(); 
    };
  }, [userId, saveData, fetchData, isSignedIn]);

  const manualSync = useCallback(async () => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
        toast({ title: 'Not Signed In', description: 'Please sign in to sync your data.', variant: 'destructive' });
        return;
    }
    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncStateRef.current.status, currentUserId });

    if (IS_FETCH_DISABLED && !hasLocalChangesRef.current) {
        logInfo('SyncManager: Manual sync triggered, but fetching is disabled and no local changes. No action taken.', { currentUserId });
        toast({ title: 'Fetch Disabled', description: 'Fetching data from server is currently disabled. No local changes to save.', variant: 'default' });
        return;
    }

    if (syncStateRef.current.status === 'hash_mismatch') {
        updateSyncState({ isMismatchDialogOpen: true });
        toast({ title: 'Data Conflict', description: 'Please resolve the data conflict before syncing.', duration: Infinity });
    } else if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
        const saveSuccess = await saveData();
        if (saveSuccess && !IS_FETCH_DISABLED) { 
            await fetchData(); 
        }
    } else {
        if (!IS_FETCH_DISABLED) {
            await fetchData();
        } else {
            logInfo('SyncManager: Manual sync - fetch part skipped as fetching is disabled.', { currentUserId });
             toast({ title: 'Fetch Disabled', description: 'Fetching data from server is currently disabled.', variant: 'default' });
        }
    }
  }, [userId, isClerkLoaded, isSignedIn, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(() => saveData(true), [saveData]);
  const forceFetch = useCallback(async () => {
    if (IS_FETCH_DISABLED) {
        logInfo('SyncManager: forceFetch called but fetching is disabled. No action taken.', {userId});
        toast({ title: 'Fetch Disabled', description: 'Cannot force fetch data from server as fetching is disabled.', variant: 'default' });
        updateSyncState({ isMismatchDialogOpen: false }); 
        return false;
    }
    clearAllLocalStoreData();
    const fetchResult = await fetchData(); 
    if (fetchResult !== false) { // Success if a hash string is returned
        updateSyncState({ isMismatchDialogOpen: false });
        return true;
    }
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);


  return {
    syncStatus: syncState.status,
    retrySync: manualSync, 
    manualSync,
    fetchData,
    saveData,
    forceSave,
    forceFetch,
    hashMismatch: syncState.status === 'hash_mismatch',
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => updateSyncState({ isMismatchDialogOpen: isOpen }),
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
        updateSyncState({ gettingStartedDismissed: dismissed });
        if (isSignedIn && !IS_FETCH_DISABLED) { 
            hasLocalChangesRef.current = true; 
            saveData();
        } else if (isSignedIn && IS_FETCH_DISABLED) {
            logInfo("SyncManager: gettingStartedDismissed changed, but not saving to server as fetch is disabled.", { userId, dismissed });
        }
    },
    isFetchDisabled: IS_FETCH_DISABLED,
  };
}

// Helper to safely parse dates that might be undefined or already Date objects
// This helper seems unused in the current context of useSyncManager and could be removed if not needed elsewhere.
// const safeParseDate = (dateInput?: string | Date): Date | undefined => {
//   if (!dateInput) return undefined;
//   if (dateInput instanceof Date) return dateInput;
//   const parsed = new Date(dateInput);
//   return isNaN(parsed.getTime()) ? undefined : parsed;
// };

