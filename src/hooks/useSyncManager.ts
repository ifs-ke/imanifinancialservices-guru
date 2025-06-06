
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
const API_TIMEOUT_MS = 60000;
const AUTO_SAVE_DEBOUNCE_DELAY_MS = 3000; // 3 seconds

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
  conflictingLocalDataString: string | null;
  conflictingServerDataString: string | null;
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
    conflictingLocalDataString: null,
    conflictingServerDataString: null,
  });

  const isSavingRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(null);
  const hasLocalChangesRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
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


  const getCurrentLocalDataSnapshot = useCallback((): SyncedData => {
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
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
    };
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState]);


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
      updateSyncState({
        status: 'idle',
        lastFetchTime: null,
        lastSaveTime: null,
        lastServerHash: null,
        gettingStartedDismissed: false,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
      });
      hasLocalChangesRef.current = false;
      initialLoadDoneRef.current = false;
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
      if (!isPreCheck && syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null });
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

    const startTime = performance.now();

    if (!isPreCheck) {
      abortControllerRef.current?.abort('New fetch initiated');
      abortControllerRef.current = new AbortController();
      setTimeout(() => abortControllerRef.current?.abort('API call timed out'), API_TIMEOUT_MS);
    }
    const signal = isPreCheck ? undefined : abortControllerRef.current?.signal;

    try {
      const response = await fetch('/api/sync', { signal });
      const duration = performance.now() - startTime;

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

      const currentLocalSnapshotString = stringify(prepareDataForHashing(getCurrentLocalDataSnapshot()));
      if (HASH_CHECK_ENABLED && syncStateRef.current.lastServerHash && serverHash !== syncStateRef.current.lastServerHash && hasLocalChangesRef.current) {
        logError('CRITICAL: Server hash changed while local changes exist! Forcing conflict dialog.',
          new Error('Server data changed unexpectedly while local edits pending.'),
          { userIdFromFetchScope: currentUserId, oldServerHash: syncStateRef.current.lastServerHash, newServerHash: serverHash },
          currentUserId
        );
        updateSyncState({
          status: 'hash_mismatch',
          lastServerHash: serverHash,
          isMismatchDialogOpen: true,
          conflictingLocalDataString: currentLocalSnapshotString,
          conflictingServerDataString: stringify(prepareDataForHashing(dataToLoad as any)),
        });
        toast({
          title: 'Data Conflict: Server Changed',
          description: 'Server data has changed since your last sync and you have local changes. Please resolve.',
          variant: 'destructive',
          duration: Infinity,
        });
        isFetchingRef.current = false;
        return false;
      }

      if (HASH_CHECK_ENABLED) {
        const localHashOfLoadedData = await hashData(stringify(prepareDataForHashing(dataToLoad as any)));
        if (localHashOfLoadedData !== serverHash) {
          logError('CRITICAL: Fetched data hash mismatch! Server hash does not match local hash of data just received. This may indicate data corruption during transit or server-side issues.',
            new Error('Fetched data hash mismatch'),
            { userIdFromFetchScope: currentUserId, serverHash, localHashOfLoadedData },
            currentUserId
          );
          updateSyncState({
            status: 'hash_mismatch',
            lastServerHash: serverHash,
            isMismatchDialogOpen: true,
            conflictingLocalDataString: currentLocalSnapshotString, // Show current local data
            conflictingServerDataString: stringify(prepareDataForHashing(dataToLoad as any)), // Show the problematic server data
          });
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
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data fetched and loaded successfully.', { userId: currentUserId, serverHash, durationMs: duration }, currentUserId);
      if (syncStateRef.current.status !== 'syncing') { // Avoid toast if this fetch was part of a larger sync operation
        toast({ title: 'Data Synced', description: `Latest data loaded from server. (Duration: ${duration.toFixed(0)}ms)` });
      }
      initialLoadDoneRef.current = true;
      return serverHash;
    } catch (error: any) {
      initialLoadDoneRef.current = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown fetch error");
      const stableCurrentUserId = currentUserId;

      if (error.name === 'AbortError' && signal?.reason !== 'API call timed out') {
        logInfo(`Fetch aborted: ${signal?.reason || error.message}`, { userId: stableCurrentUserId }, stableCurrentUserId);
      } else if (error.name !== 'AbortError') { // Log and toast for actual errors, not just standard aborts
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
      if (!isPreCheck && signal === abortControllerRef.current?.signal) { // Only clear controller if this fetch was the one using it
        abortControllerRef.current = null;
      }
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, getCurrentLocalDataSnapshot]);

  const saveData = useCallback(async (force = false): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save aborted: another sync operation in progress or clearing.', { userId: currentUserId, isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current }, currentUserId);
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server...', { userId: currentUserId, force, hashCheckEnabled: HASH_CHECK_ENABLED }, currentUserId);

    if (autoSaveDebounceTimerRef.current) { // Clear pending auto-save if manual save is triggered
      clearTimeout(autoSaveDebounceTimerRef.current);
      autoSaveDebounceTimerRef.current = null;
    }

    const startTime = performance.now();

    const dataToSave: SyncedData = {
      transactions: getTransactionsState().transactions,
      debts: getDebtState().debts,
      investmentItems: getInvestmentState().investmentItems,
      assetItems: getStatementState().assetItems,
      otherLiabilityItems: getStatementState().otherLiabilityItems,
      budgetItems: getBudgetState().budgetItems,
      ownedReviews: getWeeklyReviewState().ownedReviews,
      sharedReviews: {}, // Not saved by client
      notifications: [], // Not saved by client
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
    };

    const preparedData = prepareDataForHashing(dataToSave);
    const payloadDataHash = await hashData(stringify(preparedData));
    const lastKnownServerHashForSave = force ? null : syncStateRef.current.lastServerHash; // If forcing, don't send lastKnownServerHash or server should ignore it

    const localAbortController = new AbortController();
    const timeoutId = setTimeout(() => localAbortController.abort('API call timed out'), API_TIMEOUT_MS);

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...preparedData,
          payloadDataHash: payloadDataHash,
          lastKnownServerHash: lastKnownServerHashForSave
        }),
        signal: localAbortController.signal,
      });
      clearTimeout(timeoutId); // Clear timeout if response received
      const duration = performance.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error during save: ${response.status} ${response.statusText}`.trim() }));
        if (response.status === 409 && HASH_CHECK_ENABLED && (errorData.error as string || "").toLowerCase().includes("data is out of sync")) {
          logError(
            'Save rejected by server due to 409 Conflict (stale data). Client will show conflict dialog.',
            new Error(errorData.error || 'Server indicated data is stale.'),
            { userIdFromSaveScope: currentUserId, clientPayloadHash: payloadDataHash, clientLastKnownServerHash: lastKnownServerHashForSave, errorDetails: errorData.error, serverResponseStatus: response.status },
            currentUserId
          );
          updateSyncState({
             status: 'hash_mismatch',
             isMismatchDialogOpen: true,
             conflictingLocalDataString: stringify(preparedData), // Data client tried to save
             // Server doesn't return its full data on 409 for save, but we might have its hash if the server sends it
             conflictingServerDataString: errorData.currentServerHash ? `Server Hash: ${errorData.currentServerHash}` : "Server data preview not available for this save conflict. Try fetching.",
          });
          toast({ title: 'Save Failed: Data Conflict', description: errorData.error || 'Your data is out of sync with the server. Please sync again before saving.', variant: 'destructive', duration: Infinity });
          return false;
        }
        // This was the error hit by the user: [Client - ERROR] Save rejected by server due to data integrity check (hash mismatch).
        // This means the payloadDataHash sent by client didn't match what server calculated for the received payload.
        if (response.status === 400 && HASH_CHECK_ENABLED && (errorData.error as string || "").toLowerCase().includes("data integrity check failed")) {
           logError(
             'Save rejected by server due to payload data integrity check (payloadDataHash mismatch). Client will now show conflict dialog.',
             new Error(errorData.error || 'Server-side hash validation of payload failed'),
             { userIdFromSaveScope: currentUserId, clientPayloadHash: payloadDataHash, errorDetails: errorData.error, serverResponseStatus: response.status },
             currentUserId
           );
           updateSyncState({
             status: 'hash_mismatch', // Treat as a general mismatch that needs resolution
             isMismatchDialogOpen: true,
             conflictingLocalDataString: stringify(preparedData),
             conflictingServerDataString: "Server rejected payload due to its own hash check. This might indicate corruption in transit or a client/server hashing inconsistency.",
           });
           toast({ title: 'Save Failed: Data Integrity Issue', description: errorData.error || 'The server could not verify the integrity of the data sent. Please try syncing again or contact support.', variant: 'destructive', duration: Infinity });
           return false;
        }
        throw new Error(errorData.error || `Failed to save data to server: ${response.status} ${response.statusText}`.trim());
      }

      // Successful save
      const saveResponseData = await response.json();
      const newServerHash = saveResponseData.newServerHash; // Server should return the hash of the *newly saved complete state*

      updateSyncState({
        status: 'synced',
        lastSaveTime: new Date(),
        lastServerHash: newServerHash, // Update with the hash from the successful save response
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data saved successfully.', { userId: currentUserId, newHash: newServerHash, durationMs: duration }, currentUserId);
      toast({ title: 'Data Saved', description: `Changes saved to server. (Duration: ${duration.toFixed(0)}ms)` });
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId); // Clear timeout if error occurs before response
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown save error");
      const stableCurrentUserId = currentUserId; // Capture userId for async logging

      if (error.name === 'AbortError' && localAbortController.signal.reason === 'API call timed out') {
        logWarn(`Save aborted: API call timed out after ${API_TIMEOUT_MS}ms.`, { userId: stableCurrentUserId }, stableCurrentUserId);
        toast({ title: 'Save Timed Out', description: 'Could not save data to the server in time.', variant: 'destructive' });
      } else if (error.name === 'AbortError') {
        // Log other aborts (e.g., component unmount) without a toast
        logInfo(`Save aborted: ${localAbortController.signal.reason || error.message}`, { userId: stableCurrentUserId }, stableCurrentUserId);
      } else {
        // Log actual errors and show a toast
        logError('Error saving data:', errorToLog, { userIdFromSaveScope: stableCurrentUserId, originalErrorDetails: String(error) }, stableCurrentUserId);
      }

      updateSyncState({ status: 'error' });
      if (error.name !== 'AbortError' || localAbortController.signal.reason === 'API call timed out') { // Show toast only for actual errors or timeouts
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

    if (autoSaveDebounceTimerRef.current) {
      clearTimeout(autoSaveDebounceTimerRef.current);
      autoSaveDebounceTimerRef.current = null;
      logDebug("Manual sync initiated, cleared pending auto-save timer.", { userId: currentUserId }, currentUserId);
    }

    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncStateRef.current.status, userId: currentUserId }, currentUserId);
    updateSyncState({ status: 'syncing' }); // Set status to syncing at the start of manual sync

    if (IS_FETCH_DISABLED) {
      logInfo('Manual Sync: Fetch is disabled. Attempting to save local changes if any.', { userId: currentUserId }, currentUserId);
      if (hasLocalChangesRef.current) await saveData();
      updateSyncState({ status: 'local' }); // Reset to 'local' as fetch is off
      toast({ title: 'Local Save Attempted', description: 'Cloud fetching is disabled. Data saved locally if changed.' });
      return;
    }

    // If there's a hash mismatch, the user must resolve it through the dialog.
    // The dialog's "Force Save" or "Force Fetch" will call the respective functions.
    if (HASH_CHECK_ENABLED && syncStateRef.current.isMismatchDialogOpen) {
        logWarn("Manual sync attempted while hash mismatch dialog is open. User needs to resolve first.", {userId: currentUserId}, currentUserId);
        updateSyncState({ status: 'hash_mismatch' }); // Ensure status reflects this
        toast({title: "Conflict Exists", description: "Please resolve the data conflict first.", variant: "destructive"});
        return;
    }

    if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
      logInfo('Manual Sync: Local changes detected. Attempting to save.', { userId: currentUserId }, currentUserId);
      const saveSuccess = await saveData();
      if (saveSuccess) {
        logInfo('Manual Sync: Save successful. Now fetching latest from server to ensure full consistency.', { userId: currentUserId }, currentUserId);
        await fetchData(); // Fetch after successful save to get latest server state (including the save just made)
      } else {
        logWarn('Manual Sync: saveData failed. Full fetch after save skipped.', { userId: currentUserId }, currentUserId);
        // If save failed, and we were in 'syncing' state, revert to 'local_changes' if changes still exist, or 'error'.
        // Avoids getting stuck in 'syncing' if save fails during manual sync.
        if(syncStateRef.current.status === 'syncing') { // Check this to avoid race if status changed elsewhere
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
    logInfo("Force Save initiated by user from conflict dialog.", { userId: currentUserId }, currentUserId);
    // When forcing save, we are telling the server to accept our version.
    // The current `saveData` doesn't have a "true" force flag that bypasses server checks.
    // The server's stale data check (comparing client's lastKnownServerHash with server's current hash)
    // might still reject this if the server state has changed.
    // For a true force, the API would need a way to signal "overwrite regardless of staleness".
    // For now, this just retries the save.
    const success = await saveData(true); // Pass force=true, although server currently doesn't use it to bypass staleness
    if (success) {
        updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null });
    }
    return success;
  }, [saveData, userId, updateSyncState]);

  const forceFetch = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Fetch initiated by user from conflict dialog.", { userId: currentUserId }, currentUserId);
    if (IS_FETCH_DISABLED) {
        toast({ title: 'Cloud Sync Disabled', description: 'Cannot fetch from server. Fetching is currently off.', variant: 'destructive' });
        updateSyncState({ isMismatchDialogOpen: false, status: 'local', conflictingLocalDataString: null, conflictingServerDataString: null });
        return false;
    }
    // Before fetching, ensure local changes are discarded to avoid re-triggering conflicts if the fetch itself fails.
    clearAllLocalStoreData(); // This also resets initialLoadDoneRef and hasLocalChangesRef
    const fetchResult = await fetchData(); // fetchData will set initialLoadDoneRef to true
    if (fetchResult !== false) { // fetchResult is serverHash on success, false on failure
      // State is updated within fetchData on success
      updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null }); // Ensure dialog closes
      return true;
    }
    // If fetch failed, fetchData already set status to 'error' and toasted.
    updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null }); // Still ensure dialog closes
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);


  // Effect for handling user sign-in/sign-out and initial load
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect (user change): Auth not loaded yet.', { currentUserId }, currentUserId);
      return;
    }

    // User signed out
    if (!isSignedIn && !currentUserId && prevUserId) { // prevUserId ensures this runs only if there was a previous user
        logInfo(`SyncManager effect (user change): User SIGNED OUT. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId }, prevUserId);
        clearAllLocalStoreData(); // This resets initialLoadDoneRef, lastServerHash, etc.
        previousUserIdRef.current = null;
        return; // Stop further processing for this effect run
    }

    // User signed in (or switched) AND initial load for this user hasn't been done
    if (isSignedIn && currentUserId && (currentUserId !== prevUserId || !initialLoadDoneRef.current)) {
        if (currentUserId !== prevUserId) { // User switched or first sign-in
            logInfo(`SyncManager effect (user change): User signed IN or SWITCHED. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Setting up for new user.`, { userId: currentUserId }, currentUserId);
            clearAllLocalStoreData(); // Clear data from any previous user
            previousUserIdRef.current = currentUserId;
            initialLoadDoneRef.current = false; // Mark that initial load for *this new user* hasn't happened
        }

        // Perform initial load actions only if initialLoadDoneRef is false for the current user
        if (!initialLoadDoneRef.current) {
            logInfo(`SyncManager effect: Initializing for user ${currentUserId}. Current status: ${syncStateRef.current.status}`, { userId: currentUserId }, currentUserId);
            // Load preferences from localStorage
            const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${currentUserId}`);
            let loadedLastServerHash = null;
            let loadedGettingStartedDismissed = false;
            if (storedPrefsString) {
                try {
                    const prefs = JSON.parse(storedPrefsString);
                    loadedGettingStartedDismissed = prefs.gettingStartedDismissed || false;
                    if(HASH_CHECK_ENABLED) { // Only load lastServerHash if hash checking is enabled
                        loadedLastServerHash = prefs.lastServerHash || null;
                    }
                } catch (e: any) {
                    logError('Error parsing UI preferences from localStorage for user', e, { userId: currentUserId }, currentUserId);
                    // Could clear corrupted prefs: localStorage.removeItem(`ifcGuru_uiPrefs_${currentUserId}`);
                 }
            }

            // Update state with loaded prefs before initial sync
            updateSyncState({
                status: 'local', // Start with 'local' status, will change after sync
                lastServerHash: loadedLastServerHash,
                gettingStartedDismissed: loadedGettingStartedDismissed,
                isMismatchDialogOpen: false, // Ensure dialog is closed on new user/initial load
                conflictingLocalDataString: null,
                conflictingServerDataString: null,
            });
            initialLoadDoneRef.current = true; // Mark initial load as done for this user
            logInfo('SyncManager: User context established. App ready with local data. Triggering initial manual sync.', { userId: currentUserId, newStatus: 'local' }, currentUserId);
            manualSync(); // Trigger initial sync
        }
    } else if (isSignedIn && currentUserId && initialLoadDoneRef.current) {
        // This block handles cases where the user is already signed in and initial load was done.
        // It's a safety net for unexpected status regressions.
        logDebug('SyncManager effect: User signed in, initial setup previously done. Current status:', { status: syncStateRef.current.status, userId: currentUserId }, currentUserId);
        if (syncStateRef.current.status === 'idle' || syncStateRef.current.status === 'loading_local') {
            logWarn('SyncManager: Status regressed to idle/loading_local for an active user. Correcting.', { currentStatus: syncStateRef.current.status, hasLocalChanges: hasLocalChangesRef.current, userId: currentUserId }, currentUserId);
            updateSyncState({ status: hasLocalChangesRef.current ? 'local_changes' : 'local' });
        }
    }
    // No explicit 'else' for cases like (!isSignedIn && !prevUserId), which is initial app load without a user session yet.
    // 'idle' status is appropriate here.
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState, manualSync]);


  // Persist gettingStartedDismissed and lastServerHash to localStorage
  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn && userId) {
      const stateToPersist = {
        gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
        // Only store lastServerHash if hash checking is enabled
        lastServerHash: HASH_CHECK_ENABLED ? syncStateRef.current.lastServerHash : undefined,
      };
      localStorage.setItem(`ifcGuru_uiPrefs_${userId}`, JSON.stringify(stateToPersist));
      logDebug('SyncManager: Persisted UI preferences & lastServerHash to localStorage.', { userId, preferences: stateToPersist, hashCheckEnabled: HASH_CHECK_ENABLED }, userId);
    }
  }, [syncState.gettingStartedDismissed, syncState.lastServerHash, userId, isSignedIn]);


  // Subscribe to store changes for auto-save
  const handleStoreChange = useCallback(() => {
    const currentUserId = userId; // Capture userId at the time of defining the callback
    // Abort if syncing, initial load not done, or not signed in
    if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn || !currentUserId) {
      return;
    }
    if (!hasLocalChangesRef.current) {
        logInfo("SyncManager: Local store change detected, marking hasLocalChangesRef.", { userId: currentUserId }, currentUserId);
    }
    hasLocalChangesRef.current = true;
    // Update status to 'local_changes' if it was previously 'synced' or 'local'
    if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local') {
      updateSyncState({ status: 'local_changes' });
      logDebug("SyncManager: Status updated to 'local_changes' due to store modification.", { userId: currentUserId }, currentUserId);
    }

    // Debounce auto-save
    if (autoSaveDebounceTimerRef.current) {
        clearTimeout(autoSaveDebounceTimerRef.current);
    }
    autoSaveDebounceTimerRef.current = setTimeout(() => {
        // Re-check conditions inside timeout as state might have changed
        const localUserId = userId; // Use userId captured at the time of setting the timeout
        if (hasLocalChangesRef.current &&
            isSignedIn && localUserId && // Check isSignedIn and localUserId again
            initialLoadDoneRef.current &&
            !isSavingRef.current && !isFetchingRef.current && !isClearingRef.current &&
            syncStateRef.current.status !== 'syncing' && syncStateRef.current.status !== 'hash_mismatch' // Don't auto-save if in conflict
        ) {
            logInfo("SyncManager: Auto-save triggered by debounce.", { userId: localUserId }, localUserId);
            saveData();
        } else {
            logDebug("SyncManager: Auto-save debounce fired, but conditions not met for save.", {
                userId: localUserId,
                hasLocalChanges: hasLocalChangesRef.current,
                isSignedIn,
                initialLoadDone: initialLoadDoneRef.current,
                isSaving: isSavingRef.current,
                isFetching: isFetchingRef.current,
                isClearing: isClearingRef.current,
                currentStatus: syncStateRef.current.status,
            }, localUserId);
        }
    }, AUTO_SAVE_DEBOUNCE_DELAY_MS);

  }, [updateSyncState, userId, isSignedIn, saveData]); // Dependencies for handleStoreChange

  // Setup store subscriptions
  useEffect(() => {
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useInvestmentStore
      // Note: Do not include useNotificationStore for auto-save trigger
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => {
        unsubscribes.forEach(unsubscribe => unsubscribe());
        if (autoSaveDebounceTimerRef.current) { // Clear timer on unmount
            clearTimeout(autoSaveDebounceTimerRef.current);
        }
    };
  }, [handleStoreChange]); // Re-subscribe if handleStoreChange changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort('Component unmounting');
       if (autoSaveDebounceTimerRef.current) { // Final clear on unmount
            clearTimeout(autoSaveDebounceTimerRef.current);
      }
    };
  }, []);


  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED,
    retrySync: manualSync, // For UI to allow retrying on error
    manualSync, // Expose for direct calls if needed
    forceSave,
    forceFetch,
    hashMismatch: HASH_CHECK_ENABLED && syncState.status === 'hash_mismatch',
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => {
        logDebug(`SyncManager: setIsMismatchDialogOpen called with ${isOpen}`, {currentStatus: syncStateRef.current.status, userId}, userId);
        updateSyncState({ isMismatchDialogOpen: isOpen });
    },
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime, // Use the most recent of fetch or save
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      const currentUserId = userId; // Capture for use in this scope
      updateSyncState({ gettingStartedDismissed: dismissed });
      // If user is signed in, mark this change for potential auto-save
      if (isSignedIn && currentUserId && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'local_changes')) {
        if (!hasLocalChangesRef.current) {
           logInfo("SyncManager: gettingStartedDismissed changed, marking for sync.", { userId: currentUserId, dismissed }, currentUserId);
        }
        hasLocalChangesRef.current = true;
        if (syncStateRef.current.status !== 'local_changes') { // Update status if not already reflecting local changes
            updateSyncState({ status: 'local_changes' });
        }
        // Trigger auto-save debounce
        if (autoSaveDebounceTimerRef.current) clearTimeout(autoSaveDebounceTimerRef.current);
        autoSaveDebounceTimerRef.current = setTimeout(() => {
            if (hasLocalChangesRef.current && isSignedIn && currentUserId && !isSavingRef.current && !isFetchingRef.current && syncStateRef.current.status !== 'syncing' && syncStateRef.current.status !== 'hash_mismatch') {
                saveData();
            }
        }, AUTO_SAVE_DEBOUNCE_DELAY_MS);
      }
    },
    conflictingLocalDataString: syncState.conflictingLocalDataString,
    conflictingServerDataString: syncState.conflictingServerDataString,
  };
}

