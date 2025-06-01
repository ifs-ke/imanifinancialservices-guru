
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

const IS_FETCH_DISABLED = false; // Sync is ENABLED for server communication

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
  | 'idle' // Initial state, or after sign-out
  | 'loading_local' // Zustand rehydrating (conceptual, handled by persist)
  | 'local' // Local data loaded, server status unknown or not yet checked
  | 'local_changes' // Local data has changed since last sync
  | 'syncing' // Actively communicating with server (fetch/save)
  | 'synced' // Local and server data are confirmed to be in sync
  | 'error' // A server communication error occurred
  | 'error_local' // Error with local data processing/storage
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
  const initialLoadDoneRef = useRef(false); // Tracks if initial auth/local load sequence is complete
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
      logWarn('fetchData aborted: User not signed in or Clerk not loaded.', { isClerkLoaded, isSignedIn, currentUserId });
      if (!isPreCheck && syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
      initialLoadDoneRef.current = true; // Consider load attempt done
      return false;
    }
    if ((isFetchingRef.current && !isPreCheck) || isClearingRef.current) {
      logWarn('fetchData aborted: Another critical sync operation in progress.', { isFetching: isFetchingRef.current, isClearing: isClearingRef.current, currentUserId });
      return false;
    }

    isFetchingRef.current = true;
    if (!isPreCheck) updateSyncState({ status: 'syncing' });
    logInfo(`SyncManager: Fetching data from server... (isPreCheck: ${isPreCheck})`, { currentUserId });

    if (!isPreCheck) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
    }
    const signal = isPreCheck ? undefined : abortControllerRef.current?.signal;

    try {
      const response = await fetch('/api/sync', { signal });
      if (signal?.aborted) {
        logInfo('Fetch aborted by new request or unmount.', { currentUserId });
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

      // If it's a pre-check, we only care about the hash, don't load data yet.
      if (isPreCheck) {
        logInfo(`SyncManager: Pre-check fetch successful. Server hash: ${serverHash}`, { currentUserId });
        isFetchingRef.current = false;
        initialLoadDoneRef.current = true; // Pre-check contributes to "load attempt done"
        return serverHash;
      }

      // Full fetch: verify and load data
      const localDataForHashVerification = prepareDataForHashing(dataToLoad);
      const localCalculatedHash = await hashData(stringify(localDataForHashVerification));

      if (localCalculatedHash !== serverHash) {
        logError('Data integrity check failed after fetch: Server hash and locally calculated hash of server data do not match.',
          new Error('Hash Mismatch on Fetched Data'),
          { serverHash, localCalculatedHash, currentUserId, dataStringTruncated: stringify(localDataForHashVerification).substring(0, 200) }
        );
        updateSyncState({ status: 'hash_mismatch', lastServerHash: serverHash, isMismatchDialogOpen: true });
        toast({ title: 'Data Sync Mismatch', description: 'Server data may have changed unexpectedly. Please resolve the conflict.', variant: 'destructive', duration: Infinity });
        isFetchingRef.current = false;
        initialLoadDoneRef.current = true;
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
      toast({ title: 'Data Synced', description: 'Latest data loaded from the server.' });
      initialLoadDoneRef.current = true;
      return serverHash;
    } catch (error: any) {
      initialLoadDoneRef.current = true; // Ensure this is set even on error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown fetch error");

      if (error.name === 'AbortError') {
        logInfo('Fetch aborted.', { currentUserId });
      } else {
        logError(`Error fetching data: (isPreCheck: ${isPreCheck})`, errorToLog, { currentUserId, originalErrorDetails: String(error) });
        if (!isPreCheck) { // Only update status and toast for full fetches, not pre-checks
          updateSyncState({ status: 'error' });
          toast({
            title: 'Sync Load Failed',
            description: errorMessage || 'Could not load data from server. Check console for details.',
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
      logWarn('saveData aborted: User not signed in or Clerk not loaded.', { isClerkLoaded, isSignedIn, currentUserId });
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logWarn('saveData aborted: Another sync operation in progress.', { currentUserId, isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current });
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server...', { currentUserId, force });

    if (!force) {
      const knownServerHashBeforePreSaveFetch = syncStateRef.current.lastServerHash;
      const serverHashFromPreSaveFetch = await fetchData(true);

      if (serverHashFromPreSaveFetch === false) {
        logError('Save Aborted: Pre-save fetch check failed (network error or internal fetch error).', new Error("Pre-save fetch error"), { currentUserId });
        isSavingRef.current = false;
        if (syncStateRef.current.status !== 'hash_mismatch') updateSyncState({ status: 'error' });
        toast({ title: 'Save Failed', description: 'Could not verify server state before saving. Please try again.', variant: 'destructive' });
        return false;
      }
      
      if (typeof serverHashFromPreSaveFetch === 'string') {
        if (knownServerHashBeforePreSaveFetch && serverHashFromPreSaveFetch !== knownServerHashBeforePreSaveFetch) {
          logWarn('Save Aborted: Server data changed during pre-save check. Hash mismatch.', { currentUserId, knownOldHash: knownServerHashBeforePreSaveFetch, newServerHash: serverHashFromPreSaveFetch });
          updateSyncState({ status: 'hash_mismatch', lastServerHash: serverHashFromPreSaveFetch, isMismatchDialogOpen: true });
          toast({ title: 'Data Sync Conflict', description: 'Server data changed. Please resolve conflict to save.', variant: 'destructive', duration: Infinity });
          isSavingRef.current = false;
          return false;
        }
        updateSyncState({ lastServerHash: serverHashFromPreSaveFetch });
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
        const errorData = await response.json().catch(() => ({ error: `Server error during save: ${response.status} ${response.statusText}`.trim() }));
        throw new Error(errorData.error || `Failed to save data to server: ${response.status} ${response.statusText}`.trim());
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown save error");
      logError('Error saving data:', errorToLog, { currentUserId, originalErrorDetails: String(error) });
      updateSyncState({ status: 'error' });
      toast({ title: 'Save Failed', description: errorMessage || 'Could not save data to server.', variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, fetchData, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState]);

  // Effect for handling user sign-in/sign-out and initial setup
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
      // Initial status is 'local' after clearing and potential rehydration from (empty) session storage
      // This indicates local data is primary until first manual sync.
      updateSyncState({ status: 'local' });
      initialLoadDoneRef.current = true; // User is loaded, local stores are set (empty or rehydrated)
      logInfo('SyncManager: User loaded. App ready with local data. Manual sync required for server data.', { currentUserId });
    } else if (!currentUserId && prevUserId) {
      logInfo(`SyncManager effect (user change): User signed out. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId });
      clearAllLocalStoreData();
      previousUserIdRef.current = null;
      updateSyncState({ status: 'idle', lastFetchTime: null, lastSaveTime: null, lastServerHash: null, isMismatchDialogOpen: false });
      hasLocalChangesRef.current = false;
      initialLoadDoneRef.current = false; // Reset for next sign-in
    } else if (currentUserId && !initialLoadDoneRef.current) {
      // This case handles if the component mounts with user already signed in but initialLoadDoneRef is false
      logInfo('SyncManager effect (user change): Component mounted with user already signed in. Setting initialLoadDone.', { currentUserId });
      // If Zustand rehydration happens before this, 'local' or 'local_changes' might already be set.
      // If not, set to 'local' to indicate readiness for manual sync.
      if (syncStateRef.current.status === 'idle' || syncStateRef.current.status === 'loading_local') {
         updateSyncState({ status: 'local'});
      }
      initialLoadDoneRef.current = true;
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState]);

  // Persist/Load UI preferences (gettingStartedDismissed)
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

  useEffect(() => {
    if (isSignedIn && userId) {
      const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${userId}`);
      if (storedPrefsString) {
        try {
          const prefs = JSON.parse(storedPrefsString);
          updateSyncState({
            gettingStartedDismissed: prefs.gettingStartedDismissed || false,
            lastServerHash: prefs.lastServerHash || null, // Load lastServerHash
          });
          logDebug('SyncManager: Loaded UI preferences & lastServerHash from localStorage.', { userId, preferences: prefs });
        } catch (e) {
          logError('Error parsing UI preferences from localStorage', e, { userId });
        }
      }
      // After loading prefs and potentially lastServerHash, set status to 'local'
      // if it's still 'idle', signifying data is ready from session storage.
      if (syncStateRef.current.status === 'idle') {
          updateSyncState({ status: 'local' });
      }
    }
  }, [userId, isSignedIn, updateSyncState]);


  // Subscribe to store changes to detect local modifications
  const handleStoreChange = useCallback(() => {
    if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
      return;
    }
    if (!hasLocalChangesRef.current) { // Only log the first time it's marked
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const manualSync = useCallback(async () => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      toast({ title: 'Not Signed In', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }
    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncStateRef.current.status, currentUserId, hasLocalChanges: hasLocalChangesRef.current });
    updateSyncState({ status: 'syncing' });

    const serverHashFromPreCheck = await fetchData(true);

    if (serverHashFromPreCheck === false) { // Pre-check fetch failed
      logError('Manual Sync: Pre-check fetch failed. Aborting sync.', new Error("Pre-check fetch error during manualSync"), { currentUserId });
      // Status might already be 'error' from fetchData, or confirm it.
      if (syncStateRef.current.status !== 'hash_mismatch' && syncStateRef.current.status !== 'error') {
          updateSyncState({ status: 'error' });
      }
      // Toast is handled by fetchData for full fetches, but pre-check errors might not show one.
      if (syncStateRef.current.status !== 'error') { // Avoid double toast if fetchData already set it
         toast({ title: 'Sync Check Failed', description: 'Could not contact server to check for updates.', variant: 'destructive' });
      }
      return;
    }
    // serverHashFromPreCheck is now a string (actual hash or placeholder if fetch was disabled, though it's enabled here)

    if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
      logInfo('Manual Sync: Local changes detected. Comparing with server state.', { currentUserId, clientLastServerHash: syncStateRef.current.lastServerHash, currentServerHash: serverHashFromPreCheck });
      if (syncStateRef.current.lastServerHash && serverHashFromPreCheck !== syncStateRef.current.lastServerHash) {
        logWarn('Manual Sync: Conflict detected. Server changed while client has local changes.', { currentUserId, clientLastHash: syncStateRef.current.lastServerHash, serverCurrentHash: serverHashFromPreCheck });
        updateSyncState({ status: 'hash_mismatch', lastServerHash: serverHashFromPreCheck, isMismatchDialogOpen: true });
        toast({ title: 'Data Sync Conflict', description: 'Server data changed while you had local edits. Please resolve.', variant: 'destructive', duration: Infinity });
      } else {
        logInfo('Manual Sync: No conflict or first sync with local changes. Proceeding to save.', { currentUserId });
        const saveSuccess = await saveData(); // saveData internally handles its pre-save check if not forced
        if (saveSuccess) {
          logInfo('Manual Sync: Save successful. Now performing full fetch to confirm.', { currentUserId });
          await fetchData(); // Full fetch to get latest state after save
        } else {
            logWarn('Manual Sync: saveData failed. Full fetch after save skipped.', { currentUserId });
            // saveData would have set status to 'error' and toasted
        }
      }
    } else { // No local changes
      logInfo('Manual Sync: No local changes. Checking server state.', { currentUserId, clientLastServerHash: syncStateRef.current.lastServerHash, currentServerHash: serverHashFromPreCheck });
      if (syncStateRef.current.lastServerHash && serverHashFromPreCheck === syncStateRef.current.lastServerHash) {
        logInfo('Manual Sync: Client already in sync with server.', { currentUserId });
        updateSyncState({ status: 'synced', lastFetchTime: new Date() }); // Update lastFetchTime as a "check"
        toast({ title: 'Already Up To Date', description: 'Your data is already in sync with the server.' });
      } else {
        logInfo('Manual Sync: Server has different data or no prior sync. Fetching latest.', { currentUserId });
        await fetchData(); // Full fetch
      }
    }
  }, [userId, isClerkLoaded, isSignedIn, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(() => saveData(true), [saveData]);
  
  const forceFetch = useCallback(async () => {
    clearAllLocalStoreData();
    const fetchResult = await fetchData();
    if (fetchResult !== false) {
      updateSyncState({ isMismatchDialogOpen: false });
      return true;
    }
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState]);

  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED, // Still useful for UI
    retrySync: manualSync,
    manualSync,
    // fetchData, // Not typically called directly by UI anymore
    // saveData,  // Not typically called directly by UI anymore
    forceSave,
    forceFetch,
    hashMismatch: syncState.status === 'hash_mismatch',
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => updateSyncState({ isMismatchDialogOpen: isOpen }),
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      updateSyncState({ gettingStartedDismissed: dismissed });
      // This preference change should be saved. Marking as local change will queue it for next manualSync.
      if (isSignedIn && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local')) {
        hasLocalChangesRef.current = true;
        updateSyncState({ status: 'local_changes' });
        logInfo("SyncManager: gettingStartedDismissed changed. Marked for next sync.", { userId, dismissed });
      }
    },
  };
}

    