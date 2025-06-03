
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
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';

const IS_FETCH_DISABLED = false;
const HASH_CHECK_ENABLED = true;
const API_TIMEOUT_MS = 5000;

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
  | 'local_changes'
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

  const clearAllLocalStoreData = useCallback(() => {
    const currentUserIdForLog = previousUserIdRef.current || userId || 'unknown_user_at_clear';
    if (isClearingRef.current) {
      logWarn('clearAllLocalStoreData called while already clearing.', { userId: currentUserIdForLog }, currentUserIdForLog);
      return;
    }
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing all local Zustand store data.', { userId: currentUserIdForLog }, currentUserIdForLog);
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
      if (currentUserIdForLog !== 'unknown_user_at_clear') {
        localStorage.removeItem(`ifcGuru_uiPrefs_${currentUserIdForLog}`);
      }
      logInfo('SyncManager: All local store data cleared.', { userId: currentUserIdForLog }, currentUserIdForLog);
    } catch (error: any) {
      logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog }, currentUserIdForLog);
      updateSyncState({ status: 'error_local' });
    } finally {
      isClearingRef.current = false;
    }
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, updateSyncState, userId]);

  const fetchData = useCallback(async (isPreCheck = false): Promise<string | false> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (!isPreCheck && syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
      initialLoadDoneRef.current = true;
      return false;
    }
    if (IS_FETCH_DISABLED && !isPreCheck) {
      logInfo('SyncManager: Fetching disabled, maintaining local state.', { userId: currentUserId }, currentUserId);
      initialLoadDoneRef.current = true;
      updateSyncState({ status: 'local' });
      return false;
    }

    if ((isFetchingRef.current && !isPreCheck) || isClearingRef.current) {
      logDebug('Fetch aborted: another fetch/clear operation in progress.', { userId: currentUserId, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, isPreCheck }, currentUserId);
      return false;
    }

    isFetchingRef.current = true;
    if (!isPreCheck) updateSyncState({ status: 'syncing' });
    logInfo(`SyncManager: Fetching data from server... (isPreCheck: ${isPreCheck})`, { userId: currentUserId }, currentUserId);

    if (!isPreCheck) {
      abortControllerRef.current?.abort('New fetch initiated');
      abortControllerRef.current = new AbortController();
      setTimeout(() => abortControllerRef.current?.abort('API call timed out'), API_TIMEOUT_MS);
    }
    const signal = isPreCheck ? undefined : abortControllerRef.current?.signal;

    try {
      const response = await fetch('/api/sync', { signal });

      if (signal?.aborted) {
        const abortReason = signal.reason || 'Fetch aborted by new request or unmount.';
        if (abortReason === 'API call timed out') {
          logWarn(`Fetch aborted: API call timed out after ${API_TIMEOUT_MS}ms.`, { userId: currentUserId }, currentUserId);
           if (!isPreCheck) {
            toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
            updateSyncState({ status: 'error' });
          }
        } else {
          logInfo(`Fetch aborted: ${abortReason}`, { userId: currentUserId, reason: abortReason }, currentUserId);
        }
        isFetchingRef.current = false;
        initialLoadDoneRef.current = true;
        return false;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status} ${response.statusText}`.trim() }));
        throw new Error(errorData.error || `Failed to fetch data: ${response.status} ${response.statusText}`.trim());
      }
      const serverData = await response.json();
      const { dataHash: serverHash, ...dataToLoad } = serverData;

      if (isPreCheck) {
        logInfo(`SyncManager: Pre-check fetch successful. Server hash: ${serverHash}`, { userId: currentUserId }, currentUserId);
        isFetchingRef.current = false;
        initialLoadDoneRef.current = true;
        return serverHash;
      }

      if (HASH_CHECK_ENABLED) {
        const localHashOfLoadedData = await hashData(stringify(prepareDataForHashing(dataToLoad as any)));
        if (localHashOfLoadedData !== serverHash) {
          logError('CRITICAL: Fetched data hash mismatch! Server hash does not match local hash of data just received.',
            new Error('Fetched data hash mismatch'),
            { userIdFromFetchScope: currentUserId, serverHash, localHashOfLoadedData },
            currentUserId
          );
          updateSyncState({ status: 'hash_mismatch', lastServerHash: serverHash, isMismatchDialogOpen: true });
          toast({
            title: 'Data Inconsistency Detected',
            description: 'Data received from server does not match its own integrity check. Please resolve the conflict or contact support.',
            variant: 'destructive',
            duration: Infinity,
          });
          isFetchingRef.current = false;
          return false;
        }
        logInfo('SyncManager: Fetched data hash verified successfully against server hash.', { userId: currentUserId, serverHash }, currentUserId);
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
      logInfo('SyncManager: Data fetched and loaded successfully.', { userId: currentUserId, serverHash }, currentUserId);
      if (syncStateRef.current.status !== 'syncing') {
        toast({ title: 'Data Synced', description: 'Latest data loaded from the server.' });
      }
      initialLoadDoneRef.current = true;
      return serverHash;
    } catch (error: any) {
      initialLoadDoneRef.current = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown fetch error");
      const stableCurrentUserId = currentUserId;

      if (error.name === 'AbortError' && signal?.reason !== 'API call timed out') { // Only log generic aborts if not timeout
        logInfo(`Fetch aborted: ${signal?.reason || error.message}`, { userId: stableCurrentUserId }, stableCurrentUserId);
      } else if (error.name !== 'AbortError') { // Don't log AbortError if it's not a timeout (timeout handled above)
        logError(`Error fetching data (isPreCheck: ${isPreCheck}):`, errorToLog, { userIdFromFetchScope: stableCurrentUserId, originalErrorDetails: String(error) }, stableCurrentUserId);
        if (!isPreCheck) {
          updateSyncState({ status: 'error' });
          toast({
            title: 'Sync Load Failed',
            description: `${errorMessage || 'Could not load data from server.'}`,
            variant: 'destructive'
          });
        }
      }
      return false;
    } finally {
      isFetchingRef.current = false;
      if (!isPreCheck && signal === abortControllerRef.current?.signal) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState]);

  const saveData = useCallback(async (force = false): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save aborted: another sync operation in progress or clearing.', { userId: currentUserId, isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current }, currentUserId);
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server...', { userId: currentUserId, force, hashCheckEnabled: HASH_CHECK_ENABLED }, currentUserId);

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
    const clientDataHash = await hashData(stringify(preparedData));

    const localAbortController = new AbortController();
    const timeoutId = setTimeout(() => localAbortController.abort('API call timed out'), API_TIMEOUT_MS);

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash: clientDataHash }),
        signal: localAbortController.signal,
      });
      clearTimeout(timeoutId);


      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error during save: ${response.status} ${response.statusText}`.trim() }));
        if (response.status === 400 && HASH_CHECK_ENABLED) {
           logError('Save rejected by server due to data integrity check (hash mismatch).',
             new Error(errorData.error || 'Server-side hash validation failed'),
             { userIdFromSaveScope: currentUserId, clientHash: clientDataHash, errorDetails: errorData.error },
             currentUserId
           );
           updateSyncState({ status: 'hash_mismatch', isMismatchDialogOpen: true, lastServerHash: syncStateRef.current.lastServerHash });
           toast({ title: 'Save Failed: Data Conflict', description: errorData.error || 'Your local data is out of sync with the server. Please resolve the conflict.', variant: 'destructive', duration: Infinity });
           return false;
        }
        throw new Error(errorData.error || `Failed to save data to server: ${response.status} ${response.statusText}`.trim());
      }

      updateSyncState({
        status: 'synced',
        lastSaveTime: new Date(),
        lastServerHash: clientDataHash,
        isMismatchDialogOpen: false,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data saved successfully.', { userId: currentUserId, newHash: clientDataHash }, currentUserId);
      toast({ title: 'Data Saved', description: 'Your changes have been saved to the server.' });
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown save error");
      const stableCurrentUserId = currentUserId;
      if (error.name === 'AbortError' && localAbortController.signal.reason === 'API call timed out') {
        logWarn(`Save aborted: API call timed out after ${API_TIMEOUT_MS}ms.`, { userId: stableCurrentUserId }, stableCurrentUserId);
        toast({ title: 'Save Timed Out', description: 'Could not save data to the server in time.', variant: 'destructive' });
      } else if (error.name === 'AbortError') {
        logInfo(`Save aborted: ${localAbortController.signal.reason || error.message}`, { userId: stableCurrentUserId }, stableCurrentUserId);
      } else {
        logError('Error saving data:', errorToLog, { userIdFromSaveScope: stableCurrentUserId, originalErrorDetails: String(error) }, stableCurrentUserId);
      }
      updateSyncState({ status: 'error' });
      if (error.name !== 'AbortError' || localAbortController.signal.reason === 'API call timed out') { // Only show toast if it's a real error or our specific timeout
        toast({ title: 'Save Failed', description: `${errorMessage || 'Could not save data to server.'}`, variant: 'destructive' });
      }
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState]);

  const manualSync = useCallback(async () => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      toast({ title: 'Not Signed In', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }
    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncStateRef.current.status, userId: currentUserId }, currentUserId);
    updateSyncState({ status: 'syncing' });

    if (IS_FETCH_DISABLED) {
      logInfo('Manual Sync: Fetch is disabled. Attempting to save local changes if any.', { userId: currentUserId }, currentUserId);
      if (hasLocalChangesRef.current) await saveData();
      updateSyncState({ status: 'local' });
      toast({ title: 'Local Save Attempted', description: 'Cloud fetching is disabled. Data saved locally if changed.' });
      return;
    }

    if (HASH_CHECK_ENABLED && syncStateRef.current.isMismatchDialogOpen) {
        logWarn("Manual sync attempted while hash mismatch dialog is open. User needs to resolve first.", {userId: currentUserId}, currentUserId);
        updateSyncState({ status: 'hash_mismatch' });
        toast({title: "Conflict Exists", description: "Please resolve the data conflict first.", variant: "destructive"});
        return;
    }

    if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
      logInfo('Manual Sync: Local changes detected. Attempting to save.', { userId: currentUserId }, currentUserId);
      const saveSuccess = await saveData();
      if (saveSuccess) {
        logInfo('Manual Sync: Save successful. Now fetching latest from server.', { userId: currentUserId }, currentUserId);
        await fetchData();
      } else {
        logWarn('Manual Sync: saveData failed. Full fetch after save skipped.', { userId: currentUserId }, currentUserId);
        if(syncStateRef.current.status === 'syncing') {
            updateSyncState({ status: hasLocalChangesRef.current ? 'local_changes' : 'error' });
        }
      }
    } else {
      logInfo('Manual Sync: No local changes detected. Fetching server state.', { userId: currentUserId }, currentUserId);
      await fetchData();
    }
  }, [userId, isClerkLoaded, isSignedIn, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Save initiated", { userId: currentUserId }, currentUserId);
    return saveData(true);
  }, [saveData, userId]);

  const forceFetch = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Fetch initiated", { userId: currentUserId }, currentUserId);
    if (IS_FETCH_DISABLED) {
        toast({ title: 'Cloud Sync Disabled', description: 'Cannot fetch from server. Fetching is currently off.', variant: 'destructive' });
        updateSyncState({ isMismatchDialogOpen: false, status: 'local' });
        return false;
    }
    clearAllLocalStoreData();
    const fetchResult = await fetchData();
    if (fetchResult !== false) {
      updateSyncState({ isMismatchDialogOpen: false, status: 'synced', lastServerHash: fetchResult || null });
      return true;
    }
    updateSyncState({ isMismatchDialogOpen: false, status: 'error' });
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);


  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect (user change): Auth not loaded yet.', { currentUserId }, currentUserId);
      return;
    }

    if (currentUserId && currentUserId !== prevUserId) {
      logInfo(`SyncManager effect (user change): User signed in or switched. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing local data.`, { userId: currentUserId }, currentUserId);
      clearAllLocalStoreData();
      previousUserIdRef.current = currentUserId;
      hasLocalChangesRef.current = false;
      initialLoadDoneRef.current = false;

      const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${currentUserId}`);
      let loadedLastServerHash = null;
      let loadedGettingStartedDismissed = false;
      if (storedPrefsString) {
        try {
          const prefs = JSON.parse(storedPrefsString);
          loadedGettingStartedDismissed = prefs.gettingStartedDismissed || false;
          if(HASH_CHECK_ENABLED) {
            loadedLastServerHash = prefs.lastServerHash || null;
          }
          logDebug('SyncManager: Loaded UI preferences & lastServerHash from localStorage.', { userId: currentUserId, preferences: prefs, hashCheckEnabled: HASH_CHECK_ENABLED }, currentUserId);
        } catch (e: any) {
          logError('Error parsing UI preferences from localStorage', e, { userId: currentUserId }, currentUserId);
        }
      }
      updateSyncState({
        status: 'local',
        lastServerHash: loadedLastServerHash,
        gettingStartedDismissed: loadedGettingStartedDismissed,
      });
      initialLoadDoneRef.current = true;
      logInfo('SyncManager: User context established. App ready with local data. Awaiting manual sync.', { userId: currentUserId }, currentUserId);
      // Removed automatic manualSync() call here

    } else if (!currentUserId && prevUserId) {
      logInfo(`SyncManager effect (user change): User signed out. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId }, prevUserId);
      clearAllLocalStoreData();
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false;
    } else if (currentUserId && !initialLoadDoneRef.current) {
      logInfo('SyncManager effect (user change): Component mounted, user signed in. Setting initialLoadDone and loading prefs.', { userId: currentUserId }, currentUserId);
      const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${currentUserId}`);
      if (storedPrefsString) {
        try {
          const prefs = JSON.parse(storedPrefsString);
          updateSyncState({
            gettingStartedDismissed: prefs.gettingStartedDismissed || false,
            lastServerHash: HASH_CHECK_ENABLED ? (prefs.lastServerHash || null) : null,
          });
        } catch (e: any) { /* already logged */ }
      }
      if (syncStateRef.current.status === 'idle' || syncStateRef.current.status === 'loading_local') {
         updateSyncState({ status: 'local'});
      }
      initialLoadDoneRef.current = true;
      logInfo('SyncManager: Component mounted, local data loaded. Awaiting manual sync.', { userId: currentUserId }, currentUserId);
      // Removed automatic manualSync() call here
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState]); // Removed manualSync from dependency array as it's not called here

  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn && userId) {
      const stateToPersist = {
        gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
        lastServerHash: HASH_CHECK_ENABLED ? syncStateRef.current.lastServerHash : undefined,
      };
      localStorage.setItem(`ifcGuru_uiPrefs_${userId}`, JSON.stringify(stateToPersist));
      logDebug('SyncManager: Persisted UI preferences & lastServerHash to localStorage.', { userId, preferences: stateToPersist, hashCheckEnabled: HASH_CHECK_ENABLED }, userId);
    }
  }, [syncState.gettingStartedDismissed, syncState.lastServerHash, userId, isSignedIn]);

  const handleStoreChange = useCallback(() => {
    const currentUserId = userId;
    if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
      return;
    }
    if (!hasLocalChangesRef.current) {
        logInfo("SyncManager: Local store change detected, marking hasLocalChangesRef.", { userId: currentUserId }, currentUserId);
    }
    hasLocalChangesRef.current = true;
    if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local') {
      updateSyncState({ status: 'local_changes' });
      logDebug("SyncManager: Status updated to 'local_changes' due to store modification.", { userId: currentUserId }, currentUserId);
    }
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
    return () => {
      abortControllerRef.current?.abort('Component unmounting');
    };
  }, []);


  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED,
    retrySync: manualSync,
    manualSync,
    forceSave,
    forceFetch,
    hashMismatch: HASH_CHECK_ENABLED && syncState.status === 'hash_mismatch',
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => updateSyncState({ isMismatchDialogOpen: isOpen }),
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      const currentUserId = userId;
      updateSyncState({ gettingStartedDismissed: dismissed });
      if (isSignedIn && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'local_changes')) {
        hasLocalChangesRef.current = true;
        if (syncStateRef.current.status !== 'local_changes') {
            updateSyncState({ status: 'local_changes' });
        }
        logInfo("SyncManager: gettingStartedDismissed changed. Marked for next sync.", { userId: currentUserId, dismissed }, currentUserId);
      }
    },
  };
}

