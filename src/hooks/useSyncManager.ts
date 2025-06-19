
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
const AUTO_SAVE_DEBOUNCE_DELAY_MS = 60000;

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
  isInitialClientSyncPending: boolean; // New flag
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
    isInitialClientSyncPending: true, // Default to true
  });

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
        isInitialClientSyncPending: true, // Reset for next session
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
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (!isPreCheck && syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: true });
      return false;
    }
    if (IS_FETCH_DISABLED && !isPreCheck) {
      logInfo('SyncManager: Fetching disabled, maintaining local state.', { userId: currentUserId }, currentUserId);
      updateSyncState({ status: 'local', isInitialClientSyncPending: false }); // Assume local data is "loaded" if fetch is off
      return false;
    }

    if ((isFetchingRef.current && !isPreCheck) || isClearingRef.current) {
      logDebug('Fetch aborted: another fetch/clear operation in progress.', { userId: currentUserId, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, isPreCheck }, currentUserId);
      return FETCH_ABORTED_BENIGNLY_SYMBOL;
    }

    isFetchingRef.current = true;
    if (!isPreCheck) updateSyncState({ status: 'syncing' }); // Keep isInitialClientSyncPending true until success
    logInfo(`SyncManager: Fetching data from server... (isPreCheck: ${isPreCheck})`, { userId: currentUserId }, currentUserId);

    const startTime = performance.now();

    activeFetchControllerRef.current?.abort(NEW_REQUEST_ABORT_REASON);
    const currentFetchController = new AbortController();
    activeFetchControllerRef.current = currentFetchController;
    const timeoutId = setTimeout(() => currentFetchController.abort(API_TIMEOUT_ABORT_REASON), API_TIMEOUT_MS);

    try {
      const response = await fetch('/api/sync', { signal: currentFetchController.signal });
      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;

      if (currentFetchController.signal.aborted) {
        isFetchingRef.current = false;
        const reason = currentFetchController.signal.reason || 'Fetch aborted';
        logInfo(`Fetch aborted internally before processing response. Reason: ${reason}`, { userId: currentUserId, reason, isPreCheck }, currentUserId);
        if (reason === API_TIMEOUT_ABORT_REASON) return FETCH_TIMEOUT_SYMBOL;
        return FETCH_ABORTED_BENIGNLY_SYMBOL;
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
          // isInitialClientSyncPending remains true as sync isn't complete
        });
        isFetchingRef.current = false;
        return false;
      }

      if (HASH_CHECK_ENABLED) {
        const localHashOfLoadedData = await hashData(stringify(prepareDataForHashing(dataToLoad as any)));
        if (localHashOfLoadedData !== serverHash) {
          logError('CRITICAL: Fetched data hash mismatch! Server hash does not match local hash of data just received.',
            new Error('Fetched data hash mismatch'),
            { userIdFromFetchScope: currentUserId, serverHash, localHashOfLoadedData },
            currentUserId
          );
          updateSyncState({
            status: 'hash_mismatch',
            lastServerHash: serverHash,
            isMismatchDialogOpen: true,
            conflictingLocalDataString: currentLocalSnapshotString,
            conflictingServerDataString: stringify(prepareDataForHashing(dataToLoad as any)),
            // isInitialClientSyncPending remains true
          });
          isFetchingRef.current = false;
          return false;
        }
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
        isInitialClientSyncPending: false, // Crucial: initial sync complete
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data fetched and loaded successfully.', { userId: currentUserId, serverHash, durationMs: duration }, currentUserId);
      if (!isPreCheck) {
        toast({ title: 'Data Synced', description: `Latest data loaded from server. (Duration: ${duration.toFixed(0)}ms)` });
      }
      return serverHash;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown fetch error");
      const stableCurrentUserId = currentUserId;
      const abortReason = currentFetchController.signal.reason;

      logError(`Error fetching data (isPreCheck: ${isPreCheck}):`, errorToLog, { userIdFromFetchScope: stableCurrentUserId, originalErrorDetails: String(error), abortReason }, stableCurrentUserId);

      if (error.name === 'AbortError') {
        isFetchingRef.current = false;
        if (abortReason === API_TIMEOUT_ABORT_REASON) {
            if (!isPreCheck) {
                updateSyncState({ status: 'error' }); // isInitialClientSyncPending remains true
                toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
            }
            return FETCH_TIMEOUT_SYMBOL;
        }
        if (!isPreCheck && syncStateRef.current.status === 'syncing') {
            // If aborted for other reasons (e.g., new fetch), revert to a state reflecting potential local changes
            updateSyncState({ status: hasLocalChangesRef.current ? 'local_changes' : 'local' });
        }
        return FETCH_ABORTED_BENIGNLY_SYMBOL;
      }

      if (!isPreCheck) {
        updateSyncState({ status: 'error' }); // isInitialClientSyncPending remains true
        toast({ title: 'Sync Load Failed', description: `${errorMessage || 'Could not retrieve data from server.'}`, variant: 'destructive' });
      }
      return false;
    } finally {
      isFetchingRef.current = false;
      if (activeFetchControllerRef.current === currentFetchController) {
        activeFetchControllerRef.current = null;
      }
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, getCurrentLocalDataSnapshot]);


  const saveData = useCallback(async (force = false): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: true });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save aborted: another sync operation in progress or clearing.', { userId: currentUserId, isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current }, currentUserId);
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' }); // isInitialClientSyncPending remains as is, might be true if this is the first save attempt
    logInfo('SyncManager: Saving data to server...', { userId: currentUserId, force, hashCheckEnabled: HASH_CHECK_ENABLED }, currentUserId);

    if (autoSaveDebounceTimerRef.current) {
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
      sharedReviews: {}, // Shared reviews are not saved from client, they are fetched.
      notifications: [], // Notifications are not saved from client.
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
    };

    const preparedData = prepareDataForHashing(dataToSave);
    const payloadDataHash = await hashData(stringify(preparedData));
    const lastKnownServerHashForSave = force ? null : syncStateRef.current.lastServerHash;

    const localAbortController = new AbortController();
    const timeoutId = setTimeout(() => localAbortController.abort(API_TIMEOUT_ABORT_REASON), API_TIMEOUT_MS);

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
      clearTimeout(timeoutId);
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
             conflictingLocalDataString: stringify(preparedData),
             conflictingServerDataString: errorData.currentServerHash ? `Server Hash: ${errorData.currentServerHash}` : "Server data preview not available for this save conflict. Try fetching.",
             // isInitialClientSyncPending should remain true if this save was part of the initial sync flow
          });
          toast({ title: 'Save Failed: Data Conflict', description: errorData.error || 'Your data is out of sync with the server. Please sync again before saving.', variant: 'destructive', duration: Infinity });
          return false;
        }
        if (response.status === 400 && HASH_CHECK_ENABLED && (errorData.error as string || "").toLowerCase().includes("data integrity check failed")) {
           logError(
             'Save rejected by server due to payload data integrity check (payloadDataHash mismatch). Client will now show conflict dialog.',
             new Error(errorData.error || 'Server-side hash validation of payload failed'),
             { userIdFromSaveScope: currentUserId, clientPayloadHash: payloadDataHash, errorDetails: errorData.error, serverResponseStatus: response.status },
             currentUserId
           );
           updateSyncState({
             status: 'hash_mismatch',
             isMismatchDialogOpen: true,
             conflictingLocalDataString: stringify(preparedData),
             conflictingServerDataString: "Server rejected payload due to its own hash check. This might indicate corruption in transit or a client/server hashing inconsistency.",
             // isInitialClientSyncPending remains true
           });
           toast({ title: 'Save Failed: Data Integrity Issue', description: errorData.error || 'The server could not verify the integrity of the data sent. Please try syncing again or contact support.', variant: 'destructive', duration: Infinity });
           return false;
        }
        throw new Error(errorData.error || `Failed to save data to server: ${response.status} ${response.statusText}`.trim());
      }

      const saveResponseData = await response.json();
      const newServerHash = saveResponseData.newServerHash;

      updateSyncState({
        status: 'synced',
        lastSaveTime: new Date(),
        lastServerHash: newServerHash,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        isInitialClientSyncPending: false, // If save is successful, initial sync is complete
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data saved successfully.', { userId: currentUserId, newHash: newServerHash, durationMs: duration }, currentUserId);
      toast({ title: 'Data Saved', description: `Changes saved to server. (Duration: ${duration.toFixed(0)}ms)` });
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown save error");
      const stableCurrentUserId = currentUserId;
      let finalStatus: SyncStatus = 'error'; // isInitialClientSyncPending remains true on error

      if (error.name === 'AbortError' && localAbortController.signal.reason === API_TIMEOUT_ABORT_REASON) {
        logWarn(`Save aborted: API call timed out after ${API_TIMEOUT_MS}ms.`, { userId: stableCurrentUserId }, stableCurrentUserId);
        toast({ title: 'Save Timed Out', description: 'Could not save data to the server in time.', variant: 'destructive' });
      } else if (error.name === 'AbortError') {
        const reason = localAbortController.signal.reason || error.message;
        logInfo(`Save aborted: ${reason}`, { userId: stableCurrentUserId, reason }, stableCurrentUserId);
        finalStatus = hasLocalChangesRef.current ? 'local_changes' : 'local';
      } else {
        logError('Error saving data:', errorToLog, { userIdFromSaveScope: stableCurrentUserId, originalErrorDetails: String(error) }, stableCurrentUserId);
        toast({ title: 'Save Failed', description: `${errorMessage || 'Could not save data to server.'}`, variant: 'destructive' });
      }
      updateSyncState({ status: finalStatus });
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

    if (HASH_CHECK_ENABLED && syncStateRef.current.isMismatchDialogOpen) {
        logWarn("Manual sync: Dialog is open for hash_mismatch. User needs to resolve via dialog.", {userId: currentUserId}, currentUserId);
        toast({title: "Conflict Exists", description: "Please resolve the data conflict using the dialog.", variant: "destructive"});
        return;
    }
    if (HASH_CHECK_ENABLED && syncStateRef.current.status === 'hash_mismatch' && !syncStateRef.current.isMismatchDialogOpen) {
        logWarn("Manual sync: hash_mismatch status but dialog not open. Re-opening dialog.", {userId: currentUserId}, currentUserId);
        updateSyncState({ isMismatchDialogOpen: true });
        return;
    }

    updateSyncState({ status: 'syncing' }); // isInitialClientSyncPending remains true until fetch/save is successful

    if (IS_FETCH_DISABLED) {
      logInfo('Manual Sync: Fetch is disabled. Attempting to save local changes if any.', { userId: currentUserId }, currentUserId);
      if (hasLocalChangesRef.current) await saveData();
      updateSyncState({ status: 'local', isInitialClientSyncPending: false });
      toast({ title: 'Local Save Attempted', description: 'Cloud fetching is disabled. Data saved locally if changed.' });
      return;
    }

    if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
      logInfo('Manual Sync: Local changes detected. Attempting to save.', { userId: currentUserId }, currentUserId);
      const saveSuccess = await saveData();
      if (saveSuccess) { // saveSuccess implies status is 'synced' and isInitialClientSyncPending is false
        logInfo('Manual Sync: Save successful. Now fetching latest from server to ensure full consistency.', { userId: currentUserId }, currentUserId);
        const fetchResult = await fetchData(); // This will set isInitialClientSyncPending to false again if it was true
        if (fetchResult === false) updateSyncState({ status: 'error', isInitialClientSyncPending: true }); // Error during fetch part
        else if (fetchResult === FETCH_TIMEOUT_SYMBOL) {
            updateSyncState({ status: 'error', isInitialClientSyncPending: true });
            toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
        } else if (fetchResult === FETCH_ABORTED_BENIGNLY_SYMBOL) {
            logInfo("Manual Sync: Fetch after save was benignly aborted.", { userId: currentUserId }, currentUserId);
             if(syncStateRef.current.status === 'syncing') updateSyncState({ status: 'synced', isInitialClientSyncPending: false });
        }
      } else {
        logWarn('Manual Sync: saveData failed. Full fetch after save skipped.', { userId: currentUserId }, currentUserId);
        if(syncStateRef.current.status === 'syncing') {
            updateSyncState({ status: hasLocalChangesRef.current ? 'local_changes' : 'error', isInitialClientSyncPending: true });
        }
      }
    } else {
      logInfo('Manual Sync: No local changes detected. Fetching server state.', { userId: currentUserId }, currentUserId);
      const fetchResult = await fetchData(); // This will set isInitialClientSyncPending to false on success
       if (fetchResult === false) updateSyncState({ status: 'error', isInitialClientSyncPending: true });
       else if (fetchResult === FETCH_TIMEOUT_SYMBOL) {
           updateSyncState({ status: 'error', isInitialClientSyncPending: true });
           toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
       } else if (fetchResult === FETCH_ABORTED_BENIGNLY_SYMBOL) {
           logInfo("Manual Sync: Initial fetch was benignly aborted.", { userId: currentUserId }, currentUserId);
            if(syncStateRef.current.status === 'syncing') updateSyncState({ status: 'local', isInitialClientSyncPending: true });
       }
    }
  }, [userId, isClerkLoaded, isSignedIn, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Save initiated by user from conflict dialog.", { userId: currentUserId }, currentUserId);
    const success = await saveData(true); // saveData will set isInitialClientSyncPending to false on success
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
        updateSyncState({ isMismatchDialogOpen: false, status: 'local', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: false });
        return false;
    }
    clearAllLocalStoreData(); // This resets isInitialClientSyncPending to true
    const fetchResult = await fetchData(); // This will set isInitialClientSyncPending to false on success
    if (fetchResult !== false && fetchResult !== FETCH_TIMEOUT_SYMBOL && fetchResult !== FETCH_ABORTED_BENIGNLY_SYMBOL) {
      updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null, status: 'synced' });
      return true;
    }
    updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null });
    if(syncStateRef.current.status !== 'error') updateSyncState({status: 'local'}); // Keep isInitialClientSyncPending true if fetch failed
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);


  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect (user change): Auth not loaded yet.', { currentUserId }, currentUserId);
      return;
    }

    if (!isSignedIn && prevUserId) {
      logInfo(`SyncManager effect (user change): User SIGNED OUT. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId }, prevUserId);
      clearAllLocalStoreData(); // This sets isInitialClientSyncPending to true
      previousUserIdRef.current = null;
      initialLoadDoneRef.current = false;
      return;
    }

    if (isSignedIn && currentUserId && (currentUserId !== prevUserId)) {
      logInfo(`SyncManager effect (user change): User signed IN or SWITCHED. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing for new user.`, { userId: currentUserId }, currentUserId);
      clearAllLocalStoreData(); // This sets isInitialClientSyncPending to true
      previousUserIdRef.current = currentUserId;
      initialLoadDoneRef.current = false;
    }

    if (isSignedIn && currentUserId && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true; // Mark that this one-time-per-session setup block has started
      logInfo(`SyncManager: Initial setup for user ${currentUserId}. Loading preferences. Defaulting to manual sync.`, { userId: currentUserId }, currentUserId);
      const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${currentUserId}`);
      let loadedLastServerHash = null;
      let loadedGettingStartedDismissed = false;

      if (storedPrefsString) {
        try {
          const prefs = JSON.parse(storedPrefsString);
          loadedGettingStartedDismissed = prefs.gettingStartedDismissed || false;
          if (HASH_CHECK_ENABLED) {
            loadedLastServerHash = prefs.lastServerHash || null;
          }
        } catch (e: any) {
          logError('Error parsing UI preferences from localStorage for user', e, { userId: currentUserId }, currentUserId);
        }
      }

      updateSyncState({
        status: loadedLastServerHash ? 'local' : 'idle',
        lastServerHash: loadedLastServerHash,
        gettingStartedDismissed: loadedGettingStartedDismissed,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        lastFetchTime: null,
        lastSaveTime: null,
        isInitialClientSyncPending: true, // Still pending until manual sync
      });

      logInfo(`SyncManager: Initial preferences loaded for ${currentUserId}. Status: ${syncStateRef.current.status}. isInitialClientSyncPending: ${syncStateRef.current.isInitialClientSyncPending}. Client stores await manual sync.`, { userId: currentUserId, loadedLastServerHash, loadedGettingStartedDismissed }, currentUserId);
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState]);


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
    if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn || !currentUserId) {
      return;
    }
    if (!hasLocalChangesRef.current) {
        logInfo("SyncManager: Local store change detected, marking hasLocalChangesRef.", { userId: currentUserId }, currentUserId);
    }
    hasLocalChangesRef.current = true;
    if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'idle') {
      updateSyncState({ status: 'local_changes' }); // Keep isInitialClientSyncPending as is
      logDebug("SyncManager: Status updated to 'local_changes' due to store modification.", { userId: currentUserId }, currentUserId);
    }

    if (autoSaveDebounceTimerRef.current) {
        clearTimeout(autoSaveDebounceTimerRef.current);
    }
    autoSaveDebounceTimerRef.current = setTimeout(() => {
        const localUserId = userId;
        if (hasLocalChangesRef.current &&
            isSignedIn && localUserId &&
            initialLoadDoneRef.current &&
            !isSavingRef.current && !isFetchingRef.current && !isClearingRef.current &&
            syncStateRef.current.status !== 'syncing' && syncStateRef.current.status !== 'hash_mismatch'
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

  }, [updateSyncState, userId, isSignedIn, saveData]);

  useEffect(() => {
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useInvestmentStore
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => {
        unsubscribes.forEach(unsubscribe => unsubscribe());
        if (autoSaveDebounceTimerRef.current) {
            clearTimeout(autoSaveDebounceTimerRef.current);
        }
    };
  }, [handleStoreChange]);

  useEffect(() => {
    return () => {
      activeFetchControllerRef.current?.abort(COMPONENT_UNMOUNTING_ABORT_REASON);
       if (autoSaveDebounceTimerRef.current) {
            clearTimeout(autoSaveDebounceTimerRef.current);
      }
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
    setIsMismatchDialogOpen: (isOpen: boolean) => {
        const currentUserId = userId;
        logDebug(`SyncManager: setIsMismatchDialogOpen called with ${isOpen}`, {currentStatus: syncStateRef.current.status, userId: currentUserId}, currentUserId);
        if (!isOpen && syncStateRef.current.status === 'hash_mismatch') {
            const nextStatus = hasLocalChangesRef.current ? 'local_changes' : (syncStateRef.current.lastServerHash ? 'local' : 'idle');
            logInfo(`SyncManager: Mismatch dialog closed without resolution. Resetting status from 'hash_mismatch' to '${nextStatus}'.`, { userId: currentUserId }, currentUserId);
            updateSyncState({ isMismatchDialogOpen: false, status: nextStatus, conflictingLocalDataString: null, conflictingServerDataString: null });
        } else {
            updateSyncState({ isMismatchDialogOpen: isOpen });
        }
    },
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      const currentUserId = userId;
      updateSyncState({ gettingStartedDismissed: dismissed });
      if (isSignedIn && currentUserId && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'local_changes' || syncStateRef.current.status === 'idle')) {
        if (!hasLocalChangesRef.current) {
           logInfo("SyncManager: gettingStartedDismissed changed, marking for sync.", { userId: currentUserId, dismissed }, currentUserId);
        }
        hasLocalChangesRef.current = true;
        if (syncStateRef.current.status !== 'local_changes') {
            updateSyncState({ status: 'local_changes' });
        }
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
    isInitialClientSyncPending: syncState.isInitialClientSyncPending, // Expose the new flag
  };
}

