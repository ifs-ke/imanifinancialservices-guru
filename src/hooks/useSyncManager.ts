
// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
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
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();
  
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSyncTime: null,
    gettingStartedDismissed: false,
    hashMismatch: false,
    isMismatchDialogOpen: false
  });

  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const internalPreviousUserId = useRef<string | null | undefined>(undefined);
  const hasLocalChangesRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState; // Correct definition
  const getNotificationState = useNotificationStore.getState;

  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncState(prev => ({ ...prev, ...partialState }));
  }, []);

  const cleanupAsyncOperations = useCallback((reason?: string, forUserId?: string | null) => {
    const logContext = { cleanupReason: reason, forUserId: forUserId || userId || 'unknown_user_at_cleanup' };
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      logDebug('SyncManager: Cleared save timeout.', logContext);
    }
    if (abortControllerRef.current) {
      logWarn('SyncManager: Aborting previous fetch/save operation.', { ...logContext, operationToAbort: abortControllerRef.current.signal.reason || 'unknown' });
      abortControllerRef.current.abort(reason || 'Operation cancelled by new action or unmount');
      abortControllerRef.current = null;
    }
  }, [userId]);


  const clearLocalState = useCallback(() => {
    const currentUserIdForLog = internalPreviousUserId.current; 
    if (isClearingRef.current) {
      logDebug('ClearLocalState: Already in progress, skipping.', { userId: currentUserIdForLog });
      return;
    }
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing local state.', { userId: currentUserIdForLog });

    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();
      
      const storeKeys = [
        `ifcGuru-${currentUserIdForLog}-transactions`,
        `ifcGuru-${currentUserIdForLog}-debts`,
        `ifcGuru-${currentUserIdForLog}-statementItems`,
        `ifcGuru-${currentUserIdForLog}-budgetItems`,
        `ifcGuru-${currentUserIdForLog}-weeklyReviews`,
        `ifcGuru-${currentUserIdForLog}-notifications`
      ];
      storeKeys.forEach(key => {
        try { 
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
        } catch (e) { 
          logWarn(`Failed to remove ${key} from sessionStorage`, { error: e, userId: currentUserIdForLog }); 
        }
      });

      logInfo('SyncManager: Local state cleared successfully.', { userId: currentUserIdForLog });
      updateSyncState({ 
        status: 'local',
        lastSyncTime: null,
        gettingStartedDismissed: false, 
        hashMismatch: false, 
        isMismatchDialogOpen: false 
      });
      hasLocalChangesRef.current = false;
    } catch (error:any) {
      logError('Error during clearLocalState', error, { userId: currentUserIdForLog });
    } finally {
      isClearingRef.current = false;
    }
  }, [
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, updateSyncState
  ]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    const currentUserIdForLog = userId; 
    if (!isClerkLoaded) {
      logDebug('Fetch Aborted: Auth not loaded yet.', undefined, currentUserIdForLog);
      return false;
    }
    if (!isSignedIn || !currentUserIdForLog) {
      logWarn('Fetch Aborted: User not signed in or userId not available.', { currentUserId: currentUserIdForLog, isSignedIn }, currentUserIdForLog);
      updateSyncState({ status: 'local' });
      initialFetchDoneRef.current = true; 
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current) {
        if (isFetchingRef.current) {
            logDebug('Fetch Aborted: Another fetch operation already in progress.', { userId: currentUserIdForLog });
        } else { // isSavingRef.current must be true
            logDebug('Fetch Aborted: Save operation in progress. Fetch will be deferred.', { userId: currentUserIdForLog });
        }
        return false; 
    }
    
    cleanupAsyncOperations(`Starting new fetch operation for user ${currentUserIdForLog}`, currentUserIdForLog);
    isFetchingRef.current = true;
    updateSyncState({ status: 'syncing' });
    if (!skipHashCheck) updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });

    const currentAbortController = new AbortController();
    abortControllerRef.current = currentAbortController;
    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { userId: currentUserIdForLog });

    let success = false;
    try {
      const response = await fetch('/api/sync', { signal: currentAbortController.signal });
      
      if (currentAbortController.signal.aborted) {
        logWarn('Fetch Aborted by signal during/after API call.', { reason: currentAbortController.signal.reason || 'No reason given', userId: currentUserIdForLog });
        return false;
      }

      if (!response.ok) {
        let errorDetails = `Status: ${response.status}`;
        try { const errJson = await response.json(); errorDetails = errJson.error || errJson.message || errorDetails; }
        catch (e) { /* ignore parsing error */ }
        throw new Error(`Fetch failed: ${response.statusText} (${errorDetails})`);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      const { dataHash, ...fetchedDataFromServer } = data;
      logDebug('Fetch: Received data from server.', { userId: currentUserIdForLog });

      if (!skipHashCheck && dataHash) {
        const preparedDataToVerify = prepareDataForHashing(fetchedDataFromServer as SyncedData);
        const dataString = stringify(preparedDataToVerify);
        const isValid = await verifyHash(dataString, dataHash);
        if (!isValid) {
          logError('Fetch Error: Data integrity check failed (hash mismatch)!', 
            { serverHash: dataHash, clientCalculatedFromReceived: await hashData(dataString), dataReceived: JSON.stringify(fetchedDataFromServer).substring(0,500) }, 
            currentUserIdForLog);
          updateSyncState({ status: 'error', hashMismatch: true, isMismatchDialogOpen: true });
          toast({ title: 'Data Sync Mismatch', description: "Local and server data may be out of sync. Please resolve.", variant: 'destructive', link: '#' });
          throw new Error("Hash mismatch during fetch.");
        }
        logDebug('Fetch: Data integrity check passed.', { userId: currentUserIdForLog });
      }

      getTransactionsState().setTransactions(fetchedDataFromServer.transactions ?? []);
      getDebtState().setDebts(fetchedDataFromServer.debts ?? []);
      getStatementState().setAssetItems(fetchedDataFromServer.assetItems ?? []);
      getStatementState().setOtherLiabilityItems(fetchedDataFromServer.otherLiabilityItems ?? []);
      getBudgetState().setBudgetItems(fetchedDataFromServer.budgetItems ?? []);
      getWeeklyReviewState().setOwnedReviews(fetchedDataFromServer.ownedReviews ?? {});
      getWeeklyReviewState().setSharedReviews(fetchedDataFromServer.sharedReviews ?? {});
      getNotificationState().setNotifications(fetchedDataFromServer.notifications ?? []);
      getStatementState().setStartDate(fetchedDataFromServer.startDate ? new Date(fetchedDataFromServer.startDate) : undefined);
      getStatementState().setEndDate(fetchedDataFromServer.endDate ? new Date(fetchedDataFromServer.endDate) : undefined);
      
      updateSyncState({
        status: 'synced',
        lastSyncTime: new Date(),
        gettingStartedDismissed: fetchedDataFromServer.gettingStartedDismissed ?? false,
        hashMismatch: false, 
        isMismatchDialogOpen: false 
      });
      hasLocalChangesRef.current = false;
      logInfo('Fetch: Successfully synced with DB.', { userId: currentUserIdForLog });
      if (isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      success = true;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logWarn('Fetch Aborted by signal.', { reason: error.message || 'No reason given', userId: currentUserIdForLog });
      } else {
        let errorToLog: Error;
        let originalErrorString = String(error);
        if (error instanceof Error) { errorToLog = error; } 
        else if (typeof error === 'object' && error !== null && 'message' in error) { errorToLog = new Error(String(error.message || originalErrorString)); Object.assign(errorToLog, error); } 
        else { errorToLog = new Error(originalErrorString || 'Unknown fetch error'); }
        logError('Fetch Error (Non-Abort):', errorToLog, { userId: currentUserIdForLog, originalErrorType: typeof error, originalErrorString: originalErrorString.substring(0, 500) });
        updateSyncState({ status: 'error' }); // hashMismatch might be true from earlier
        toast({ title: 'Sync Load Failed', description: `Could not load data. An unknown error occurred (${errorToLog.message}). Your local data (if any) is preserved. Click cloud icon to retry.`, variant: 'destructive' });
      }
    } finally {
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true; 
      if (abortControllerRef.current === currentAbortController) {
        abortControllerRef.current = null;
      }
      logDebug('Fetch: Operation complete.', { userId: currentUserIdForLog, success });
    }
    return success;
  }, [isSignedIn, userId, isClerkLoaded, toast, getTransactionsState, getDebtState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, updateSyncState, cleanupAsyncOperations]);


  const saveData = useCallback(async (isForceSave = false) => {
    const currentUserIdForLog = userId;
    if (!isClerkLoaded) {
      logDebug('Save Aborted: Auth not loaded yet.', undefined, currentUserIdForLog);
      return false;
    }
    if (!isSignedIn || !currentUserIdForLog) {
      logWarn('Save Aborted: User not signed in or userId not available.', { currentUserId: currentUserIdForLog, isSignedIn }, currentUserIdForLog);
      updateSyncState({ status: 'local' });
      return false;
    }
     if (isSavingRef.current || isFetchingRef.current) {
        logWarn('Save Aborted: Another fetch/save operation already in progress.', { isFetching: isFetchingRef.current, isSaving: isSavingRef.current, userId: currentUserIdForLog });
        return false;
    }

    cleanupAsyncOperations(`Starting new save operation for user ${currentUserIdForLog}`, currentUserIdForLog);
    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, { userId: currentUserIdForLog });

    if (!isForceSave) {
      logInfo('Save: Fetching latest data before saving to check for conflicts...', { userId: currentUserIdForLog });
      const preSaveFetchSuccess = await fetchData(false, false); 
      if (!preSaveFetchSuccess) {
        logError('Save Aborted: Pre-save fetch failed. Check earlier logs from fetch.', new Error('Pre-save fetch failed'), { operationStatus: 'pre-save-fetch-failed', preFetchStatus: syncState.status }, currentUserIdForLog);
        isSavingRef.current = false; 
        updateSyncState({ status: 'error', isMismatchDialogOpen: syncState.hashMismatch }); // Preserve mismatch dialog if it was set by fetch
        return false;
      }
      logInfo('Save: Pre-save fetch successful, proceeding with actual save.', { userId: currentUserIdForLog });
    } else {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false }); 
      logInfo('Save: Force save initiated, skipping pre-fetch check.', { userId: currentUserIdForLog });
    }
    
    const currentAbortController = new AbortController();
    abortControllerRef.current = currentAbortController;
    let success = false;

    try {
      const currentState: SyncedData = {
        transactions: getTransactionsState().transactions,
        debts: getDebtState().debts,
        assetItems: getStatementState().assetItems,
        otherLiabilityItems: getStatementState().otherLiabilityItems,
        budgetItems: getBudgetState().budgetItems,
        ownedReviews: getWeeklyReviewState().ownedReviews,
        sharedReviews: getWeeklyReviewState().sharedReviews, // Included for completeness, though prepareDataForHashing excludes it
        notifications: getNotificationState().notifications, // Included for completeness, though prepareDataForHashing excludes it
        startDate: getStatementState().startDate?.toISOString(),
        endDate: getStatementState().endDate?.toISOString(),
        gettingStartedDismissed: syncState.gettingStartedDismissed,
      };

      const preparedData = prepareDataForHashing(currentState as SyncedData); // Cast as SyncedData to satisfy prepareDataForHashing
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      logDebug(`Save Client: Calculated client hash: ${dataHash}`, { userId: currentUserIdForLog });

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
        signal: currentAbortController.signal,
      });

      if (currentAbortController.signal.aborted) {
        logWarn('Save Aborted by signal during/after API call.', { reason: currentAbortController.signal.reason || 'No reason given', userId: currentUserIdForLog });
        return false;
      }

      if (!response.ok) {
        let errorDetails = `Status: ${response.status}`;
        let errorFromServer = `Save failed: ${response.statusText}`;
        try { const errJson = await response.json(); errorDetails = errJson.error || errJson.message || errorDetails; errorFromServer = errJson.error || errorFromServer; }
        catch (e) { logWarn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError: e, userId: currentUserIdForLog });}

        if (response.status === 400 && errorDetails.includes('integrity check failed')) {
          logError('Save API Error 400: Data integrity check failed on server.', new Error(errorDetails), { userId: currentUserIdForLog });
          updateSyncState({ status: 'error', hashMismatch: true, isMismatchDialogOpen: true });
          toast({ title: 'Save Failed: Data Conflict', description: "Server data changed. Please resolve conflict.", variant: 'destructive', link: '#' });
        } else {
          logError(`Save API Error ${response.status}:`, new Error(errorDetails), { userId: currentUserIdForLog });
          updateSyncState({ status: 'error' });
          throw new Error(errorFromServer);
        }
      } else {
        const result = await response.json();
        updateSyncState({ status: 'synced', lastSyncTime: new Date(), hashMismatch: false, isMismatchDialogOpen: false });
        hasLocalChangesRef.current = false;
        logInfo(`Save Successful. Server: ${result.message}`, { userId: currentUserIdForLog });
        toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
        success = true;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logWarn('Save Aborted by signal.', { reason: error.message || 'No reason given', userId: currentUserIdForLog });
      } else {
        let errorToLog: Error;
        let originalErrorString = String(error);
        if (error instanceof Error) { errorToLog = error; }
        else if (typeof error === 'object' && error !== null && 'message' in error) { errorToLog = new Error(String(error.message || originalErrorString)); Object.assign(errorToLog, error); }
        else { errorToLog = new Error(originalErrorString || 'Unknown save error'); }
        logError('Save Error:', errorToLog, { userId: currentUserIdForLog, originalErrorType: typeof error, originalErrorString: originalErrorString.substring(0, 500) });
        updateSyncState({ status: 'error' }); 
        toast({ title: 'Sync Save Failed', description: `Could not save data. An unknown error occurred (${errorToLog.message}). Your local data is preserved. Click cloud icon to retry.`, variant: 'destructive' });
      }
    } finally {
      isSavingRef.current = false;
       if (abortControllerRef.current === currentAbortController) {
         abortControllerRef.current = null;
       }
      logDebug('Save: Actual save API call phase complete.', { userId: currentUserIdForLog, success });
    }
    return success;
  }, [
    isSignedIn, userId, isClerkLoaded, toast, getTransactionsState, getDebtState, 
    getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, 
    fetchData, syncState.gettingStartedDismissed, updateSyncState, cleanupAsyncOperations
  ]);


  const triggerDebouncedSave = useCallback(() => {
    const currentUserIdForLog = userId;
    if (!isSignedIn || !currentUserIdForLog) {
      logWarn('Debounced Save: User not signed in. Save will not occur.', undefined, currentUserIdForLog);
      return;
    }
    if (syncState.hashMismatch) {
      logWarn('Debounced Save: Blocked by hash mismatch. Manual resolution required.', undefined, currentUserIdForLog);
      if (syncState.status !== 'error') updateSyncState({ status: 'error' });
      return;
    }

    cleanupAsyncOperations(`Starting new debounced save for user ${currentUserIdForLog}`, currentUserIdForLog);
    logDebug('Debounced Save: Timer started/reset.', undefined, currentUserIdForLog);
    
    saveTimeoutRef.current = setTimeout(() => {
      logInfo('Debounced Save: Timeout reached. Initiating save.', undefined, currentUserIdForLog);
      saveData();
    }, 5000); // Increased debounce time to 5 seconds
  }, [saveData, isSignedIn, userId, syncState.hashMismatch, syncState.status, cleanupAsyncOperations, updateSyncState]);


  useEffect(() => {
    const effectUserId = userId; 
    if (!isClerkLoaded) {
      logDebug('Auth Effect: Auth state not ready. Waiting for load.', undefined, effectUserId);
      updateSyncState({ status: 'idle' });
      return () => cleanupAsyncOperations(`Auth effect unmount while not loaded`, effectUserId);
    }

    if (effectUserId && effectUserId !== internalPreviousUserId.current) {
      logInfo(`Auth Effect: User signed IN or SWITCHED. New: ${effectUserId}, Old: ${internalPreviousUserId.current ?? 'none'}. Clearing local state and fetching new data.`, 
        { oldUserId: internalPreviousUserId.current, newUserId: effectUserId }, 
        effectUserId
      );
      cleanupAsyncOperations(`User changed from ${internalPreviousUserId.current} to ${effectUserId}`, effectUserId);
      clearLocalState(); 
      internalPreviousUserId.current = effectUserId;
      initialFetchDoneRef.current = false; 
      hasLocalChangesRef.current = false; 
      if (!isFetchingRef.current) fetchData(); 
    } else if (!effectUserId && internalPreviousUserId.current) {
      logInfo(`Auth Effect: User signed OUT. Was: ${internalPreviousUserId.current}. Clearing local state.`, 
        { oldUserId: internalPreviousUserId.current }, 
        internalPreviousUserId.current 
      );
      cleanupAsyncOperations(`User signed out: ${internalPreviousUserId.current}`, internalPreviousUserId.current);
      clearLocalState();
      internalPreviousUserId.current = null;
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      updateSyncState({ status: 'local', lastSyncTime: null, hashMismatch: false, isMismatchDialogOpen: false });
    } else if (effectUserId && effectUserId === internalPreviousUserId.current && !initialFetchDoneRef.current && !isFetchingRef.current) {
      logInfo('Auth Effect: Same user session, initial fetch not completed. Triggering fetch...', 
        { currentAuthUserId: effectUserId, currentStatus: syncState.status }, 
        effectUserId
      );
      fetchData();
    } else if (!effectUserId && !internalPreviousUserId.current && !initialFetchDoneRef.current) {
      logInfo('Auth Effect: Initial load, no active user session. Setting status to local.', { userId: effectUserId }, effectUserId);
      updateSyncState({ status: 'local', lastSyncTime: null, hashMismatch: false, isMismatchDialogOpen: false });
      initialFetchDoneRef.current = true; 
    } else {
      logDebug('Auth Effect: No primary auth-driven data clear/fetch action taken. Review conditions.', {
        isClerkLoaded, currentAuthUserId: effectUserId, previousUserId: internalPreviousUserId.current,
        initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current,
        isSaving: isSavingRef.current, currentStatus: syncState.status,
      }, effectUserId);
    }
    // Pass a specific string to cleanupAsyncOperations to identify the source of cleanup for debugging.
    return () => cleanupAsyncOperations(`AuthEffectCleanup-${effectUserId || 'noUser'}`, effectUserId);
  }, [userId, isSignedIn, isClerkLoaded, clearLocalState, fetchData, cleanupAsyncOperations, updateSyncState, syncState.status]); // Added syncState.status
  
  
  const handleStoreChange = useCallback(() => {
    const currentUserIdForLog = userId;
    if (isFetchingRef.current || isSavingRef.current || isClearingRef.current || syncState.hashMismatch) {
      logDebug('Store Change: Operation in progress or hash mismatch. Save deferred.', { 
        isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, 
        hashMismatch: syncState.hashMismatch, currentUserId: currentUserIdForLog 
      });
      return;
    }
    if (!initialFetchDoneRef.current) {
        logDebug('Store Change: Initial fetch not done. Save deferred.', { currentUserId: currentUserIdForLog });
        return;
    }

    if (!hasLocalChangesRef.current) {
      logInfo('Store Change: First local change detected since last sync/load.', { currentUserId: currentUserIdForLog });
    }
    hasLocalChangesRef.current = true;

    if (syncState.status === 'synced' || syncState.status === 'idle' || (syncState.status === 'error' && !syncState.hashMismatch)) {
      updateSyncState({ status: 'local' });
      logInfo('Store Change: Status changed to "local" due to store changes.', { 
        currentUserId: currentUserIdForLog, previousStatus: syncState.status 
      });
    }
    triggerDebouncedSave();
  }, [userId, syncState.hashMismatch, syncState.status, triggerDebouncedSave, updateSyncState]);


  useEffect(() => {
    const currentUserIdForLog = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserIdForLog || !initialFetchDoneRef.current) {
      logDebug('Change Subscription: Conditions not met (auth not ready or initial fetch not done).', 
        { isClerkLoaded, isSignedIn, currentUserId: currentUserIdForLog, initialFetchDone: initialFetchDoneRef.current }, 
        currentUserIdForLog);
      return () => cleanupAsyncOperations('Store subscription cleanup - conditions not met', currentUserIdForLog); 
    }
    if (syncState.hashMismatch) {
      logWarn('Change Subscription: Blocked due to hash mismatch. Data is local but potentially conflicting.', 
        { currentUserId: currentUserIdForLog });
      if (syncState.status !== 'error') updateSyncState({ status: 'error' });
      return () => cleanupAsyncOperations('Store subscription cleanup - hash mismatch', currentUserIdForLog); 
    }

    logDebug('Change Subscription: Subscribing to store changes...', { currentUserId: currentUserIdForLog });
    const storesToWatch = [ useTransactionsStore, useDebtStore, useStatementStore, useBudgetStore, useWeeklyReviewStore ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    
    return () => {
      logDebug('Change Subscription: Unsubscribing from store changes.', { currentUserId: currentUserIdForLog });
      unsubscribes.forEach(unsub => unsub());
      cleanupAsyncOperations('Store subscription cleanup - unmount/deps change', currentUserIdForLog);
    };
  }, [isClerkLoaded, isSignedIn, userId, syncState.status, syncState.hashMismatch, handleStoreChange, updateSyncState, cleanupAsyncOperations]); // Added cleanupAsyncOperations


  useEffect(() => {
    const currentUserIdForLog = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserIdForLog || !initialFetchDoneRef.current) return;
    if (syncState.hashMismatch) {
      logWarn('Getting Started Tracker: Change detected, but blocked by hash mismatch.', 
        { gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId: currentUserIdForLog });
      return;
    }

    if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
      logDebug('Getting Started Tracker: Change detected for gettingStartedDismissed.', 
        { gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId: currentUserIdForLog });
      hasLocalChangesRef.current = true;
      if (syncState.status === 'synced' || syncState.status === 'idle' || (syncState.status === 'error' && !syncState.hashMismatch)) {
        updateSyncState({ status: 'local' });
        logInfo('Getting Started Tracker: Status changed to "local" due to dismissal state change.', 
          { currentUserId: currentUserIdForLog, previousStatus: syncState.status });
      }
      triggerDebouncedSave();
    } else {
      logDebug('Getting Started Tracker: Dismissal change detected, but conditions prevent status update or already local.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch: syncState.hashMismatch, currentUserId: userId, currentStatus: syncState.status }, userId);
    }
  }, [syncState.gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, syncState.hashMismatch, triggerDebouncedSave, syncState.status, updateSyncState]);


  const forceSaveLocal = useCallback(async () => {
    const currentUserIdForLog = userId;
    if (!currentUserIdForLog || !isSignedIn) {
      toast({ title: 'Error', description: 'Cannot force save without an authenticated user.', variant: 'destructive' });
      return false;
    }
    logWarn('SyncManager: User chose to force save local data, overwriting server.', { currentUserId: currentUserIdForLog });
    cleanupAsyncOperations('Force save initiated', currentUserIdForLog); 
    const success = await saveData(true); 
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Local data successfully saved to the cloud.' });
      logInfo('Force Save Local: Successful.', { currentUserId: currentUserIdForLog });
    } else {
      logError('Force Save Local: Failed.', undefined, { currentUserId: currentUserIdForLog });
    }
    return success;
  }, [saveData, toast, userId, isSignedIn, updateSyncState, cleanupAsyncOperations]);


  const forceFetchServer = useCallback(async () => {
    const currentUserIdForLog = userId;
    if (!currentUserIdForLog || !isSignedIn) {
      toast({ title: 'Error', description: 'Cannot force fetch without an authenticated user.', variant: 'destructive' });
      return false;
    }
    logWarn('SyncManager: User chose to force fetch server data, discarding local changes.', { currentUserId: currentUserIdForLog });
    cleanupAsyncOperations('Force fetch initiated', currentUserIdForLog); 
    const success = await fetchData(false, true); 
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Server data loaded. Local changes were discarded.' });
      logInfo('Force Fetch Server: Successful.', { currentUserId: currentUserIdForLog });
    } else {
      logError('Force Fetch Server: Failed.', undefined, { currentUserId: currentUserIdForLog });
    }
    return success;
  }, [fetchData, toast, userId, isSignedIn, updateSyncState, cleanupAsyncOperations]);


  const retrySync = useCallback(() => {
    const currentUserIdForLog = userId;
    if (!isClerkLoaded) {
      toast({ title: 'Cannot Sync', description: 'Authentication status loading...', variant: 'default' });
      return;
    }
    if (!isSignedIn || !currentUserIdForLog) {
      toast({ title: 'Cannot Sync', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }

    logInfo('Manual Sync/Retry Triggered.', { currentStatus: syncState.status, hashMismatchState: syncState.hashMismatch, currentUserId: currentUserIdForLog });
    cleanupAsyncOperations(`Manual retry sync initiated for user ${currentUserIdForLog}`, currentUserIdForLog); 

    if (syncState.status === 'error' && syncState.hashMismatch) {
      logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', { currentUserId: currentUserIdForLog });
      updateSyncState({ isMismatchDialogOpen: true }); 
      return; 
    }
    
    // If there are local changes or a non-mismatch error, try to save.
    // Otherwise, (e.g., status 'synced', 'idle', or 'local' without explicit local changes flagged) try to fetch.
    if (hasLocalChangesRef.current || (syncState.status === 'error' && !syncState.hashMismatch)) {
      logInfo('Manual Sync: Local changes or non-mismatch error. Attempting save...', { currentUserId: currentUserIdForLog });
      saveData(); 
    } else {
      logInfo('Manual Sync: No local changes flagged or status is synced/idle. Attempting fetch...', { currentUserId: currentUserIdForLog });
      toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
      fetchData(true); 
    }
  }, [
    syncState.status, syncState.hashMismatch, saveData, fetchData, toast, 
    isSignedIn, userId, isClerkLoaded, updateSyncState, cleanupAsyncOperations
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

