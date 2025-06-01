
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
import { hashData } from '@/lib/storage-utils'; // verifyHash is no longer used here
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
  | 'idle'
  | 'loading_local'
  | 'local'
  | 'local_changes'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'error_local'
  | 'hash_mismatch'; // This status might become less frequent or only triggered by server if it were to do checks

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
        gettingStartedDismissed: false, // Reset this too
      });
      hasLocalChangesRef.current = false; // Reset local changes flag
      localStorage.removeItem(`ifcGuru_uiPrefs_${currentUserIdForLog}`); // Clear persisted prefs for this user
      logInfo('SyncManager: All local store data cleared.', { userId: currentUserIdForLog });
    } catch (error: any) {
      logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog });
      updateSyncState({ status: 'error_local' });
    } finally {
      isClearingRef.current = false;
    }
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, updateSyncState, userId]);


  const fetchData = useCallback(async (isPreSaveCheck = false): Promise<string | false> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (!isPreSaveCheck && syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
      initialLoadDoneRef.current = true;
      return false;
    }
    if (IS_FETCH_DISABLED && !isPreSaveCheck) {
      logInfo('SyncManager: Fetching disabled, returning placeholder hash for non-pre-save check.', { currentUserId });
      initialLoadDoneRef.current = true;
      updateSyncState({ status: 'local' }); // Indicate local data is what we have
      return syncStateRef.current.lastServerHash || "fetch_disabled_no_hash"; // Return existing or placeholder
    }
    if ((isFetchingRef.current && !isPreSaveCheck) || isClearingRef.current) {
      return false;
    }

    isFetchingRef.current = true;
    if (!isPreSaveCheck) updateSyncState({ status: 'syncing' });
    logInfo(`SyncManager: Fetching data from server... (isPreSaveCheck: ${isPreSaveCheck})`, { currentUserId });

    if (!isPreSaveCheck) {
      abortControllerRef.current?.abort('New fetch initiated');
      abortControllerRef.current = new AbortController();
    }
    const signal = isPreSaveCheck ? undefined : abortControllerRef.current?.signal;

    try {
      const response = await fetch('/api/sync', { signal });
      if (signal?.aborted) {
        logInfo('Fetch aborted by new request or unmount.', { currentUserId, reason: signal.reason });
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

      if (isPreSaveCheck) {
        logInfo(`SyncManager: Pre-save check fetch successful. Server hash: ${serverHash}`, { currentUserId });
        isFetchingRef.current = false;
        initialLoadDoneRef.current = true;
        return serverHash;
      }

      // Full fetch: Load data directly, hash check disabled
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
        lastServerHash: serverHash, // Store the hash received from server
        isMismatchDialogOpen: false,
        gettingStartedDismissed: dataToLoad.gettingStartedDismissed || false,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data fetched and loaded successfully (hash check disabled).', { currentUserId, serverHash });
      if (!isPreSaveCheck) {
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
        logError(`Error fetching data: (isPreSaveCheck: ${isPreSaveCheck})`, errorToLog, { currentUserId, originalErrorDetails: String(error) });
        if (!isPreSaveCheck) {
          updateSyncState({ status: 'error' });
          toast({
            title: 'Sync Load Failed',
            description: `${errorMessage || 'Could not load data from server.'} (Hash check disabled)`,
            variant: 'destructive'
          });
        }
      }
      return false;
    } finally {
      isFetchingRef.current = false;
      if (!isPreSaveCheck && signal === abortControllerRef.current?.signal) {
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
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server... (Hash check disabled client-side before save)', { currentUserId, force });

    // Pre-save check for server changes is removed as hash checks are disabled for this flow
    // if (!force && !IS_FETCH_DISABLED) { ... }

    const dataToSave: SyncedData = {
      transactions: getTransactionsState().transactions,
      debts: getDebtState().debts,
      investmentItems: getInvestmentState().investmentItems,
      assetItems: getStatementState().assetItems,
      otherLiabilityItems: getStatementState().otherLiabilityItems,
      budgetItems: getBudgetState().budgetItems,
      ownedReviews: getWeeklyReviewState().ownedReviews,
      sharedReviews: {}, // Client only sends owned, server manages shared state based on DB
      notifications: [], // Client doesn't save notifications back
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
    };

    const preparedData = prepareDataForHashing(dataToSave);
    const dataHash = await hashData(stringify(preparedData)); // Client still generates hash to send

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }), // Send data and its hash
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error during save: ${response.status} ${response.statusText}`.trim() }));
        throw new Error(errorData.error || `Failed to save data to server: ${response.status} ${response.statusText}`.trim());
      }

      updateSyncState({
        status: 'synced',
        lastSaveTime: new Date(),
        lastServerHash: dataHash, // Assume server accepted this hash
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
      toast({ title: 'Save Failed', description: `${errorMessage || 'Could not save data to server.'} (Hash check disabled)`, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState]);

  // Effect for handling user sign-in/sign-out and initial setup
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect (user change): Auth not loaded yet.', { currentUserId });
      return;
    }

    if (currentUserId && currentUserId !== prevUserId) {
      logInfo(`SyncManager effect (user change): User signed in or switched. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing local data for new/switched user.`, { currentUserId });
      clearAllLocalStoreData(); // Clears data and resets sync state to idle
      previousUserIdRef.current = currentUserId;
      hasLocalChangesRef.current = false;
      initialLoadDoneRef.current = false; // Reset to allow initial load/sync logic for new user

      // Load persisted preferences for the new user
      const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${currentUserId}`);
      let loadedLastServerHash = null;
      let loadedGettingStartedDismissed = false;
      if (storedPrefsString) {
        try {
          const prefs = JSON.parse(storedPrefsString);
          loadedGettingStartedDismissed = prefs.gettingStartedDismissed || false;
          loadedLastServerHash = prefs.lastServerHash || null;
          logDebug('SyncManager: Loaded UI preferences & lastServerHash from localStorage for new user.', { currentUserId, preferences: prefs });
        } catch (e) {
          logError('Error parsing UI preferences from localStorage for new user', e, { currentUserId });
        }
      }
      // Set initial status to 'local' to indicate readiness for manual sync, update with loaded prefs
      updateSyncState({
        status: 'local',
        lastServerHash: loadedLastServerHash,
        gettingStartedDismissed: loadedGettingStartedDismissed,
      });
      initialLoadDoneRef.current = true; // Now consider initial load done for this user
      logInfo('SyncManager: User context established. App ready with local (or empty) data. Manual sync available.', { currentUserId });

    } else if (!currentUserId && prevUserId) {
      logInfo(`SyncManager effect (user change): User signed out. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId });
      clearAllLocalStoreData();
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false;
    } else if (currentUserId && !initialLoadDoneRef.current) {
      // This handles the case where the component mounts, user is already signed in, but initial setup hasn't run
      logInfo('SyncManager effect (user change): Component mounted, user signed in. Setting initialLoadDone.', { currentUserId });
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
      if (syncStateRef.current.status === 'idle' || syncStateRef.current.status === 'loading_local') {
         updateSyncState({ status: 'local'});
      }
      initialLoadDoneRef.current = true;
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState]);

  // Persist/Load UI preferences (gettingStartedDismissed and lastServerHash)
  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn && userId) {
      const stateToPersist = {
        gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
        lastServerHash: syncStateRef.current.lastServerHash,
      };
      localStorage.setItem(`ifcGuru_uiPrefs_${userId}`, JSON.stringify(stateToPersist));
      logDebug('SyncManager: Persisted UI preferences & lastServerHash to localStorage.', { userId, preferences: stateToPersist });
    }
  }, [syncState.gettingStartedDismissed, syncState.lastServerHash, userId, isSignedIn]);

  // Subscribe to store changes to detect local modifications
  const handleStoreChange = useCallback(() => {
    if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
      return;
    }
    if (!hasLocalChangesRef.current) {
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
    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncStateRef.current.status, currentUserId, hasLocalChanges: hasLocalChangesRef.current });

    if (IS_FETCH_DISABLED) {
        logInfo('Manual Sync: Fetch is disabled. Attempting to save local changes if any.', { currentUserId });
        if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
            await saveData(); // Attempt to save, hash check disabled server-side too
        } else {
            toast({ title: 'Cloud Sync Disabled', description: 'Data is local. Fetching from server is currently off.' });
            updateSyncState({ status: 'local' }); // Reaffirm local status
        }
        return;
    }

    updateSyncState({ status: 'syncing' });

    if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
      logInfo('Manual Sync: Local changes detected. Attempting to save.', { currentUserId });
      const saveSuccess = await saveData(); // saveData will not do client pre-save hash check
      if (saveSuccess) {
        logInfo('Manual Sync: Save successful. Now fetching latest from server.', { currentUserId });
        await fetchData(); // Full fetch to get latest state after save
      } else {
          logWarn('Manual Sync: saveData failed during push. Full fetch after save skipped.', { currentUserId });
          // saveData would have set status to 'error' and toasted
      }
    } else { // No local changes
      logInfo('Manual Sync: No local changes. Fetching latest from server.', { currentUserId });
      await fetchData(); // Full fetch
    }
  }, [userId, isClerkLoaded, isSignedIn, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(async () => {
    logInfo("Force Save initiated (hash checks disabled pathway)", { userId });
    // With hash checks disabled on client pre-save and server receive, "force" behaves like normal save.
    return saveData(true); // Pass true to indicate it's a "forced" context, though behavior change is minimal here
  }, [saveData, userId]);
  
  const forceFetch = useCallback(async () => {
    logInfo("Force Fetch initiated (hash checks disabled pathway)", { userId });
    if (IS_FETCH_DISABLED) {
        toast({ title: 'Cloud Sync Disabled', description: 'Cannot fetch from server. Fetching is currently off.', variant: 'destructive' });
        updateSyncState({ isMismatchDialogOpen: false }); // Still close dialog if it was open
        return false;
    }
    clearAllLocalStoreData();
    const fetchResult = await fetchData(); // Regular fetch, hash verification of response is disabled
    if (fetchResult !== false) { // fetchResult is serverHash or false
      updateSyncState({ isMismatchDialogOpen: false });
      return true;
    }
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);

  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED,
    retrySync: manualSync,
    manualSync,
    forceSave,
    forceFetch,
    hashMismatch: syncState.status === 'hash_mismatch', // This state is now less likely to be set by client-side checks
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => updateSyncState({ isMismatchDialogOpen: isOpen }),
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      updateSyncState({ gettingStartedDismissed: dismissed });
      if (isSignedIn && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'local_changes')) {
        hasLocalChangesRef.current = true; // Marking this as a change to be synced
        if (syncStateRef.current.status !== 'local_changes') {
            updateSyncState({ status: 'local_changes' });
        }
        logInfo("SyncManager: gettingStartedDismissed changed. Marked for next sync.", { userId, dismissed });
      }
    },
  };
}

    
