
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
const HASH_CHECK_ENABLED = false; // Hash checking remains disabled

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
      if (currentUserIdForLog !== 'unknown_user_at_clear') {
        localStorage.removeItem(`ifcGuru_uiPrefs_${currentUserIdForLog}`);
      }
      logInfo('SyncManager: All local store data cleared.', { userId: currentUserIdForLog });
    } catch (error: any) {
      logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog });
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
      logInfo('SyncManager: Fetching disabled, maintaining local state.', { currentUserId });
      initialLoadDoneRef.current = true;
      updateSyncState({ status: 'local' });
      return false;
    }

    if ((isFetchingRef.current && !isPreCheck) || isClearingRef.current) {
      logDebug('Fetch aborted: another fetch/clear operation in progress.', { currentUserId, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, isPreCheck });
      return false;
    }

    isFetchingRef.current = true;
    if (!isPreCheck) updateSyncState({ status: 'syncing' });
    logInfo(`SyncManager: Fetching data from server... (isPreCheck: ${isPreCheck})`, { currentUserId });

    if (!isPreCheck) {
      abortControllerRef.current?.abort('New fetch initiated');
      abortControllerRef.current = new AbortController();
    }
    const signal = isPreCheck ? undefined : abortControllerRef.current?.signal;

    try {
      const response = await fetch('/api/sync', { signal });
      if (signal?.aborted) {
        logInfo('Fetch aborted by new request or unmount.', { currentUserId, reason: signal.reason });
        isFetchingRef.current = false;
        initialLoadDoneRef.current = true; // Ensure this is set even on abort
        return false;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status} ${response.statusText}`.trim() }));
        throw new Error(errorData.error || `Failed to fetch data: ${response.status} ${response.statusText}`.trim());
      }
      const serverData = await response.json();
      const { dataHash: serverHash, ...dataToLoad } = serverData;

      if (isPreCheck) {
        logInfo(`SyncManager: Pre-check fetch successful. Server hash: ${serverHash}`, { currentUserId });
        isFetchingRef.current = false;
        initialLoadDoneRef.current = true;
        return serverHash;
      }

      // Full fetch (not pre-check)
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
        isMismatchDialogOpen: false, // Close dialog on successful fetch
        gettingStartedDismissed: dataToLoad.gettingStartedDismissed || false,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data fetched and loaded successfully.', { currentUserId, serverHash });
      if (syncStateRef.current.status !== 'syncing') { // Avoid redundant toast if already part of a sync operation
        toast({ title: 'Data Synced', description: 'Latest data loaded from the server.' });
      }
      initialLoadDoneRef.current = true;
      return serverHash;
    } catch (error: any) {
      initialLoadDoneRef.current = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown fetch error");

      if (error.name === 'AbortError') {
        logInfo(`Fetch aborted: ${error.message}`, { currentUserId });
      } else {
        logError(`Error fetching data (isPreCheck: ${isPreCheck}):`, errorToLog, { currentUserId, originalErrorDetails: String(error) });
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
      logDebug('Save aborted: another sync operation in progress or clearing.', { currentUserId, isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current });
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server...', { currentUserId, force, hashCheckEnabled: HASH_CHECK_ENABLED });

    // Pre-save check is removed as HASH_CHECK_ENABLED is false
    // If HASH_CHECK_ENABLED were true, the pre-save fetch and hash comparison logic would go here.
    // Since it's false, we proceed directly to preparing and sending data.

    const dataToSave: SyncedData = {
      transactions: getTransactionsState().transactions,
      debts: getDebtState().debts,
      investmentItems: getInvestmentState().investmentItems,
      assetItems: getStatementState().assetItems,
      otherLiabilityItems: getStatementState().otherLiabilityItems,
      budgetItems: getBudgetState().budgetItems,
      ownedReviews: getWeeklyReviewState().ownedReviews,
      sharedReviews: {}, // sharedReviews are not saved from client, they are derived on server sync
      notifications: [], // notifications are not saved from client, they are managed server-side or ephemeral
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
    };

    const preparedData = prepareDataForHashing(dataToSave);
    const clientDataHash = await hashData(stringify(preparedData)); // Client still generates hash for the payload

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Client sends its calculated hash; server-side verification is disabled per previous step
        body: JSON.stringify({ ...preparedData, dataHash: clientDataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error during save: ${response.status} ${response.statusText}`.trim() }));
        throw new Error(errorData.error || `Failed to save data to server: ${response.status} ${response.statusText}`.trim());
      }

      updateSyncState({
        status: 'synced', // After successful save, client is considered synced with its own pushed data
        lastSaveTime: new Date(),
        lastServerHash: clientDataHash, // Client now knows its pushed state matches this hash
        isMismatchDialogOpen: false,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data saved successfully.', { currentUserId, newHash: clientDataHash });
      toast({ title: 'Data Saved', description: 'Your changes have been saved to the server.' });
      return true;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown save error");
      logError('Error saving data:', errorToLog, { currentUserId, originalErrorDetails: String(error) });
      updateSyncState({ status: 'error' });
      toast({ title: 'Save Failed', description: `${errorMessage || 'Could not save data to server.'}`, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState]);

  // Effect for handling user sign-in/sign-out and initial load
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect (user change): Auth not loaded yet.', { currentUserId });
      return;
    }

    if (currentUserId && currentUserId !== prevUserId) {
      logInfo(`SyncManager effect (user change): User signed in or switched. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing local data.`, { currentUserId });
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
          loadedLastServerHash = prefs.lastServerHash || null; // Load lastServerHash
          logDebug('SyncManager: Loaded UI preferences & lastServerHash from localStorage.', { currentUserId, preferences: prefs });
        } catch (e) {
          logError('Error parsing UI preferences from localStorage', e, { currentUserId });
        }
      }
      // Initial status is 'local' after user context is set up and local stores are ready (empty or from session persist)
      // A manual sync will be required to get server data or push changes.
      updateSyncState({
        status: 'local',
        lastServerHash: loadedLastServerHash,
        gettingStartedDismissed: loadedGettingStartedDismissed,
      });
      initialLoadDoneRef.current = true;
      logInfo('SyncManager: User context established. App ready with local data. Manual sync required.', { currentUserId });

    } else if (!currentUserId && prevUserId) {
      logInfo(`SyncManager effect (user change): User signed out. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId });
      clearAllLocalStoreData();
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false;
    } else if (currentUserId && !initialLoadDoneRef.current) {
      // This case handles if the component mounts, user is already signed in, but initialLoadDoneRef is false.
      logInfo('SyncManager effect (user change): Component mounted, user signed in. Setting initialLoadDone and loading prefs.', { currentUserId });
      const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${currentUserId}`);
      if (storedPrefsString) {
        try {
          const prefs = JSON.parse(storedPrefsString);
          updateSyncState({
            gettingStartedDismissed: prefs.gettingStartedDismissed || false,
            lastServerHash: prefs.lastServerHash || null,
          });
        } catch (e) { /* already logged */ }
      }
      // Ensure status is not 'idle' if user is signed in and initial load is happening
      if (syncStateRef.current.status === 'idle' || syncStateRef.current.status === 'loading_local') {
         updateSyncState({ status: 'local'}); // Set to 'local' as we are now using local data
      }
      initialLoadDoneRef.current = true;
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState]);

  // Persist gettingStartedDismissed and lastServerHash to localStorage
  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn && userId) {
      const stateToPersist = {
        gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
        lastServerHash: syncStateRef.current.lastServerHash, // Persist lastServerHash
      };
      localStorage.setItem(`ifcGuru_uiPrefs_${userId}`, JSON.stringify(stateToPersist));
      logDebug('SyncManager: Persisted UI preferences & lastServerHash to localStorage.', { userId, preferences: stateToPersist });
    }
  }, [syncState.gettingStartedDismissed, syncState.lastServerHash, userId, isSignedIn]);

  // Subscribe to store changes to detect local modifications
  const handleStoreChange = useCallback(() => {
    if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
      return; // Don't mark changes if syncing, not loaded, or not signed in
    }
    if (!hasLocalChangesRef.current) { // Log only on the first detected change
        logInfo("SyncManager: Local store change detected, marking hasLocalChangesRef.", { currentUserId: userId });
    }
    hasLocalChangesRef.current = true;
    if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local') {
      updateSyncState({ status: 'local_changes' });
      logDebug("SyncManager: Status updated to 'local_changes' due to store modification.", { currentUserId: userId });
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

  // Cleanup AbortController on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort('Component unmounting');
    };
  }, []);


  const manualSync = useCallback(async () => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      toast({ title: 'Not Signed In', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }
    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncStateRef.current.status, currentUserId });
    updateSyncState({ status: 'syncing' });

    if (IS_FETCH_DISABLED) {
      logInfo('Manual Sync: Fetch is disabled. Attempting to save local changes if any.', { currentUserId });
      await saveData(); // Attempt to save
      updateSyncState({ status: 'local' }); // Reaffirm local status as fetch is off
      toast({ title: 'Local Save Attempted', description: 'Cloud fetching is disabled. Data saved locally if changed.' });
      return;
    }

    // If local changes exist, save them first.
    if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
      logInfo('Manual Sync: Local changes detected. Attempting to save.', { currentUserId });
      const saveSuccess = await saveData(); // saveData now does not do its own pre-fetch hash check
      if (saveSuccess) {
        logInfo('Manual Sync: Save successful. Now fetching latest from server.', { currentUserId });
        await fetchData(); // Full fetch to get latest state after save
      } else {
        logWarn('Manual Sync: saveData failed. Full fetch after save skipped.', { currentUserId });
        // saveData would have set status to 'error' and toasted
      }
    } else {
      // No local changes, just fetch from server.
      logInfo('Manual Sync: No local changes detected. Fetching server state.', { currentUserId });
      await fetchData();
    }
  }, [userId, isClerkLoaded, isSignedIn, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(async () => {
    logInfo("Force Save initiated (bypasses pre-save checks)", { userId });
    return saveData(true); // force = true
  }, [saveData, userId]);

  const forceFetch = useCallback(async () => {
    logInfo("Force Fetch initiated", { userId });
    if (IS_FETCH_DISABLED) {
        toast({ title: 'Cloud Sync Disabled', description: 'Cannot fetch from server. Fetching is currently off.', variant: 'destructive' });
        updateSyncState({ isMismatchDialogOpen: false }); // Close dialog if it was open for this
        return false;
    }
    clearAllLocalStoreData(); // Clear local data first
    const fetchResult = await fetchData(); // Then perform a full fetch
    if (fetchResult !== false) {
      updateSyncState({ isMismatchDialogOpen: false });
      return true;
    }
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);


  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED,
    retrySync: manualSync, // Kept for semantic clarity, points to manualSync
    manualSync,
    forceSave,
    forceFetch,
    // hashMismatch is less relevant now client-side hash checking is disabled,
    // but the status can still be set by server or other logic if needed.
    hashMismatch: HASH_CHECK_ENABLED && syncState.status === 'hash_mismatch',
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => updateSyncState({ isMismatchDialogOpen: isOpen }),
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      updateSyncState({ gettingStartedDismissed: dismissed });
      if (isSignedIn && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'local_changes')) {
        hasLocalChangesRef.current = true;
        if (syncStateRef.current.status !== 'local_changes') {
            updateSyncState({ status: 'local_changes' });
        }
        logInfo("SyncManager: gettingStartedDismissed changed. Marked for next sync.", { userId, dismissed });
      }
    },
  };
}

