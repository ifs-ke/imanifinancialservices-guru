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
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncState(prev => ({ ...prev, ...partialState }));
  }, []);

  const cleanupAsyncOperations = useCallback((reason = 'New operation or unmount') => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      logDebug(`SyncManager: Cleared save timeout due to: ${reason}`, { currentUserId: internalPreviousUserId.current || userId });
    }
    if (abortControllerRef.current) {
      logDebug(`SyncManager: Aborting previous fetch/save operation due to: ${reason}`, { currentUserId: internalPreviousUserId.current || userId });
      abortControllerRef.current.abort(reason); 
      abortControllerRef.current = null;
    }
  }, [userId]);

  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    const contextUserId = internalPreviousUserId.current;
    logInfo('SyncManager: Clearing local state.', { userId: contextUserId });

    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();

      const storeKeys = [
        'ifcGuru_transactions', 
        'ifcGuru_debts', 
        'ifcGuru_statementItems', 
        'ifcGuru_budgetItems', 
        'ifcGuru_weeklyReviews', 
        'ifcGuru_notifications'
      ];

      storeKeys.forEach(key => {
        try { 
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key); 
        } catch (e) { 
          logWarn(`Failed to remove ${key} from sessionStorage`, { error: e, userId: contextUserId }); 
        }
      });

      logInfo('SyncManager: Local state cleared.', { userId: contextUserId });
      updateSyncState({ 
        status: 'local',
        lastSyncTime: null,
        gettingStartedDismissed: false,
        hashMismatch: false,
        isMismatchDialogOpen: false
      });
      hasLocalChangesRef.current = false;
    } catch (error) {
      logError('Error during clearLocalState', error, { userId: contextUserId });
    } finally {
      isClearingRef.current = false;
    }
  }, [
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, updateSyncState
  ]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    if (!isClerkLoaded) {
      logDebug('Fetch Aborted: Auth not loaded yet.', { currentUserId: userId });
      return false;
    }
    if (!isSignedIn || !userId) {
      logWarn('Fetch Aborted: User not signed in or userId not available.', { currentUserId: userId, isSignedIn });
      updateSyncState({ status: 'local' }); 
      initialFetchDoneRef.current = true; 
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Fetch Aborted: Operation already in progress.', { 
        isSaving: isSavingRef.current, 
        isFetching: isFetchingRef.current, 
        isClearing: isClearingRef.current, 
        currentUserId: userId 
      });
      return false;
    }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { currentUserId: userId });
    isFetchingRef.current = true;
    updateSyncState({ status: 'syncing' });
    if (!skipHashCheck) updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
    
    cleanupAsyncOperations(`Starting new fetch operation for user ${userId}`);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/sync', {
        signal: abortControllerRef.current.signal
      });

      if (abortControllerRef.current?.signal.aborted) {
        logDebug('Fetch Aborted: Operation was cancelled by cleanup.', { currentUserId: userId, reason: abortControllerRef.current?.signal.reason });
        updateSyncState({ status: 'local' });
        return false;
      }


      if (!response.ok) {
        let errorPayload: any = { message: `Fetch failed: ${response.statusText} (Status: ${response.status})` };
        try { 
          const parsedError = await response.json(); 
          if (parsedError?.error) {
            errorPayload = parsedError;
            errorPayload.message = `Fetch failed: ${parsedError.error} (Status: ${response.status})`;
          }
        } catch (parseError) { logWarn("Fetch Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, currentUserId: userId });}
        throw new Error(errorPayload.message, { cause: errorPayload });
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck && dataHash) {
        const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
        const dataString = stringify(preparedDataToVerify);
        const isValid = await verifyHash(dataString, dataHash);
        if (!isValid) {
          logError('Fetch Error: Data integrity check failed during fetch!', { serverHash: dataHash, clientHashCalculationInputTruncated: dataString.substring(0, 200), currentUserId: userId });
          updateSyncState({ status: 'error', hashMismatch: true, isMismatchDialogOpen: true });
          toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Resolve using the cloud icon.", variant: 'destructive', link: '#' });
          isFetchingRef.current = false; 
          return false;
        }
      }

      getTransactionsState().setTransactions(fetchedData.transactions ?? []);
      getDebtState().setDebts(fetchedData.debts ?? []);
      getStatementState().setAssetItems(fetchedData.assetItems ?? []);
      getStatementState().setOtherLiabilityItems(fetchedData.otherLiabilityItems ?? []);
      getBudgetState().setBudgetItems(fetchedData.budgetItems ?? []);
      getWeeklyReviewState().setOwnedReviews(fetchedData.ownedReviews ?? {});
      getWeeklyReviewState().setSharedReviews(fetchedData.sharedReviews ?? {});
      getNotificationState().setNotifications(fetchedData.notifications ?? []);
      getStatementState().setStartDate(fetchedData.startDate ? new Date(fetchedData.startDate) : undefined);
      getStatementState().setEndDate(fetchedData.endDate ? new Date(fetchedData.endDate) : undefined);
      
      updateSyncState({ status: 'synced', lastSyncTime: new Date(), gettingStartedDismissed: fetchedData.gettingStartedDismissed ?? false, hashMismatch: false, isMismatchDialogOpen: false });
      hasLocalChangesRef.current = false;
      logInfo('Fetch: Successfully synced with DB.', { currentUserId: userId });
      if (isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      return true;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        logDebug(`Fetch Aborted: ${error.message}`, { currentUserId: userId });
        updateSyncState(prev => ({ ...prev, status: prev.status === 'syncing' ? 'local' : prev.status }));
        return false;
      }
      logError('Fetch Error:', error, { currentUserId: userId, cause: error.cause });
      updateSyncState({ status: 'error' });
      let friendlyErrorMessage = 'Could not load data.';
      if (error.message?.includes('Internal Server Error')) friendlyErrorMessage += ` Server error encountered.`;
      else if (error.message?.includes('Failed to parse') || error.message?.includes('JSON')) friendlyErrorMessage = 'Could not load data: Failed to parse server response.';
      else if (error.message?.includes('Failed to fetch')) friendlyErrorMessage += ' Network error. Please check connection.';
      else friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
      friendlyErrorMessage += ' Your local data (if any) is preserved. Click cloud icon to retry.';
      toast({ title: 'Sync Load Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true;
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) { 
          abortControllerRef.current = null; 
      }
      logDebug('Fetch: Operation complete.', { currentUserId: userId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, updateSyncState, cleanupAsyncOperations
  ]);

  const saveData = useCallback(async (isForceSave = false) => {
    if (!isClerkLoaded) { logDebug('Save Aborted: Auth not loaded yet.', { currentUserId: userId }); return false; }
    if (!isSignedIn || !userId) { logWarn('Save Aborted: User not signed in or userId not available.', { currentUserId: userId, isSignedIn }); updateSyncState({ status: 'local' }); return false; }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) { logDebug('Save Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, currentUserId: userId }); return false; }

    logInfo(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, { currentUserId: userId });
    updateSyncState({ status: 'syncing' });
    isSavingRef.current = true;

    if (!isForceSave) {
      logInfo('Save: Fetching latest data before saving to check for conflicts...', { currentUserId: userId });
      const preSaveFetchSuccess = await fetchData(false, false); 
      if (!preSaveFetchSuccess) {
        logError('Save Aborted: Pre-save fetch failed or hash mismatch detected.', undefined, { currentUserId: userId });
        isSavingRef.current = false;
        if(syncState.status !== 'error' && !syncState.hashMismatch) updateSyncState({ status: 'local' }); 
        else if (syncState.hashMismatch) updateSyncState({status: 'error'}); 
        return false;
      }
      if(syncState.hashMismatch) {
        logError('Save Aborted: Hash mismatch detected after pre-save fetch.', undefined, { currentUserId: userId });
        isSavingRef.current = false;
        return false;
      }
      logInfo('Save: Pre-save fetch successful, proceeding with save.', { currentUserId: userId });
    } else {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      logInfo('Save: Force save initiated, skipping pre-fetch check, proceeding with save.', { currentUserId: userId });
    }
    
    cleanupAsyncOperations(`Starting new save operation for user ${userId}`);
    abortControllerRef.current = new AbortController();

    try {
      const currentState = {
        transactions: getTransactionsState().transactions,
        debts: getDebtState().debts,
        assetItems: getStatementState().assetItems,
        otherLiabilityItems: getStatementState().otherLiabilityItems,
        budgetItems: getBudgetState().budgetItems,
        ownedReviews: getWeeklyReviewState().ownedReviews,
        startDate: getStatementState().startDate,
        endDate: getStatementState().endDate,
        gettingStartedDismissed: syncState.gettingStartedDismissed,
        notifications: [], sharedReviews: {}, 
      };
      const preparedData = prepareDataForHashing(currentState as SyncedData); 
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);

      logDebug(`Save Client: Calculated client hash: ${dataHash}`, { currentUserId: userId });


      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
        signal: abortControllerRef.current.signal
      });

      if (abortControllerRef.current?.signal.aborted) {
        logDebug('Save Aborted: Operation was cancelled by cleanup.', { currentUserId: userId, reason: abortControllerRef.current?.signal.reason });
        updateSyncState({ status: 'local' }); 
        return false;
      }

      if (!response.ok) {
        let errorPayload: any = { message: `Save failed: ${response.statusText} (Status: ${response.status})` };
        try { 
          const parsedError = await response.json(); 
          if (parsedError?.error) {
            errorPayload = parsedError;
            errorPayload.message = `Save failed: ${parsedError.error} (Status: ${response.status})`;
          }
        } catch (parseError) { logWarn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, currentUserId: userId });}

        if (response.status === 400 && errorPayload.message?.includes('integrity check failed')) {
          logError('Save API Error 400: Data integrity check failed on server.', errorPayload, { currentUserId: userId });
          updateSyncState({ status: 'error', hashMismatch: true, isMismatchDialogOpen: true });
          toast({ title: 'Save Failed: Data Conflict', description: "Server data changed since last sync. Resolve using the cloud icon.", variant: 'destructive', link: '#' });
        } else if (response.status === 401) {
          logError('Save API Error 401: Unauthorized.', errorPayload, { currentUserId: userId });
          updateSyncState({ status: 'error' });
          toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please refresh or log in again.', variant: 'destructive' });
        } else if (response.status === 429) {
          logWarn('Save API Error 429: Rate limit exceeded.', { currentUserId: userId });
          updateSyncState({ status: 'error' });
          toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
        } else {
          logError(`Save API Error ${response.status}: ${errorPayload.message}`, errorPayload, { currentUserId: userId });
          updateSyncState({ status: 'error' });
          throw new Error(errorPayload.message, { cause: errorPayload });
        }
        return false;
      }
      const result = await response.json();
      updateSyncState({ status: 'synced', lastSyncTime: new Date(), hashMismatch: false, isMismatchDialogOpen: false });
      hasLocalChangesRef.current = false;
      logInfo(`Save Successful. Server: ${result.message}`, { currentUserId: userId });
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logDebug(`Save Aborted: ${error.message}`, { currentUserId: userId });
        updateSyncState(prev => ({ ...prev, status: prev.status === 'syncing' ? 'local' : prev.status }));
        return false;
      }
      logError('Save Error:', error, { currentUserId: userId, cause: error.cause });
      updateSyncState({ status: 'error' });
      let friendlyErrorMessage = 'Could not save data.';
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) friendlyErrorMessage = 'Could not save data: Network error. Please check connection.';
      else if (error.message?.includes('integrity check failed')) {
        friendlyErrorMessage = `Save failed: ${error.message}. Data conflict detected.`;
        updateSyncState({ hashMismatch: true, isMismatchDialogOpen: true });
      } else friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
      friendlyErrorMessage += ' Your local data is preserved. Click cloud icon to retry or resolve conflict.';
      toast({ title: 'Sync Save Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current = null;
      }
      logDebug('Save: Operation complete.', { currentUserId: userId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, fetchData, syncState.gettingStartedDismissed, syncState.status, syncState.hashMismatch, 
    updateSyncState, cleanupAsyncOperations
  ]);

  const triggerDebouncedSave = useCallback(() => {
    if (!isSignedIn || !userId) { logWarn('Debounced Save: User not signed in. Save will not occur.', { currentUserId: userId }); return; }
    if (syncState.hashMismatch) { logWarn('Debounced Save: Blocked by hash mismatch. Manual resolution required.', { currentUserId: userId }); updateSyncState({ status: 'error' }); return; }
    cleanupAsyncOperations(`Starting new debounced save for user ${userId}`);
    logDebug('Debounced Save: Timer started/reset.', { currentUserId: userId });
    saveTimeoutRef.current = setTimeout(() => { logInfo('Debounced Save: Timeout reached. Initiating save.', { currentUserId: userId }); saveData(); }, 3000);
  }, [saveData, isSignedIn, userId, syncState.hashMismatch, cleanupAsyncOperations, updateSyncState]);

  const handleStoreChange = useCallback(() => {
    if (isFetchingRef.current || isSavingRef.current || isClearingRef.current || syncState.hashMismatch) {
      logDebug('Store Change: Operation in progress or hash mismatch. Save deferred.', { isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch: syncState.hashMismatch, currentUserId: userId });
      return;
    }
    if (!hasLocalChangesRef.current) logInfo('Store Change: First local change detected since last sync/load.', { currentUserId: userId });
    hasLocalChangesRef.current = true;
    if (syncState.status === 'synced' || syncState.status === 'idle' || (syncState.status === 'error' && !syncState.hashMismatch) ) {
      updateSyncState({ status: 'local' });
      logInfo('Store Change: Status changed to "local" due to store changes.', { currentUserId: userId, previousStatus: syncState.status });
    }
    triggerDebouncedSave();
  }, [syncState.status, syncState.hashMismatch, triggerDebouncedSave, userId, updateSyncState]);

  useEffect(() => {
    if (!isClerkLoaded) { logDebug('Auth Effect: Auth state not ready. Waiting for load.', { currentUserId: userId }); updateSyncState({ status: 'idle' }); return; }
    const currentAuthUserId = userId;
    if (currentAuthUserId && currentAuthUserId !== internalPreviousUserId.current) {
      logInfo(`Auth Effect: User signed in or changed. Current: ${currentAuthUserId}, Previous: ${internalPreviousUserId.current ?? 'none'}.`, { oldUserId: internalPreviousUserId.current, newUserId: currentAuthUserId });
      cleanupAsyncOperations('User changed or signed in');
      clearLocalState();
      internalPreviousUserId.current = currentAuthUserId;
      initialFetchDoneRef.current = false;
      if (!isFetchingRef.current) fetchData();
    } else if (!currentAuthUserId && internalPreviousUserId.current) {
      logInfo(`Auth Effect: User signed out. Was: ${internalPreviousUserId.current}.`, { oldUserId: internalPreviousUserId.current });
      cleanupAsyncOperations('User signed out');
      clearLocalState();
      internalPreviousUserId.current = null;
      initialFetchDoneRef.current = false;
      updateSyncState({ status: 'local' });
    } else if (currentAuthUserId && currentAuthUserId === internalPreviousUserId.current && !initialFetchDoneRef.current && !isFetchingRef.current) {
      logInfo('Auth Effect: Same user session, initial fetch not completed. Triggering fetch...', { currentAuthUserId });
      fetchData();
    } else if (!currentAuthUserId && !internalPreviousUserId.current && !initialFetchDoneRef.current) {
      logInfo('Auth Effect: Initial load, no active user session. Setting status to local.', { currentUserId: userId });
      updateSyncState({ status: 'local' });
      initialFetchDoneRef.current = true; 
    } else {
      logDebug('Auth Effect: No primary auth-driven action taken.', {
        isClerkLoaded, 
        currentAuthUserId, 
        previousUserId: internalPreviousUserId.current,
        initialFetchDone: initialFetchDoneRef.current, 
        isFetching: isFetchingRef.current,
        isSaving: isSavingRef.current, 
        currentStatus: syncState.status,
        currentUserId: userId
      });
    }
    return () => cleanupAsyncOperations('Auth effect cleanup');
  }, [userId, isSignedIn, isClerkLoaded, clearLocalState, fetchData, cleanupAsyncOperations, updateSyncState]);

  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
      logDebug('Change Subscription: Conditions not met (auth not ready or initial fetch not done).', { isClerkLoaded, isSignedIn, currentUserId: userId, initialFetchDone: initialFetchDoneRef.current });
      return () => cleanupAsyncOperations('Store subscription cleanup (early return)');
    }
    if (syncState.hashMismatch) {
      logWarn('Change Subscription: Blocked due to hash mismatch. Data is local but potentially conflicting.', { currentUserId: userId });
      if (syncState.status !== 'error') updateSyncState({ status: 'error' });
      return () => cleanupAsyncOperations('Store subscription cleanup (hash mismatch)');
    }
    logDebug('Change Subscription: Subscribing to store changes...', { currentUserId: userId });
    const storesToWatch = [useTransactionsStore, useDebtStore, useStatementStore, useBudgetStore, useWeeklyReviewStore];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => {
      logDebug('Change Subscription: Unsubscribing from store changes.', { currentUserId: userId });
      unsubscribes.forEach(unsub => unsub());
      cleanupAsyncOperations('Store subscription cleanup');
    };
  }, [isClerkLoaded, isSignedIn, userId, syncState.status, syncState.hashMismatch, handleStoreChange, cleanupAsyncOperations, updateSyncState]);

  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
      logDebug('Getting Started Tracker: Conditions not met or hash mismatch prevents update.', { isClerkLoaded, isSignedIn, currentUserId: userId, initialFetchDone: initialFetchDoneRef.current, hashMismatch: syncState.hashMismatch });
      return;
    }
    if (syncState.hashMismatch) {
      logWarn('Getting Started Tracker: Change detected, but blocked by hash mismatch.', { gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId: userId });
      return;
    }
    if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
      logDebug('Getting Started Tracker: Change detected.', { gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId: userId });
      hasLocalChangesRef.current = true;
      if (syncState.status === 'synced' || syncState.status === 'idle' || (syncState.status === 'error' && !syncState.hashMismatch) ) {
        updateSyncState({ status: 'local' });
        logInfo('Getting Started Tracker: Status changed to "local" due to dismissal state change.', { currentUserId: userId, previousStatus: syncState.status });
      }
      triggerDebouncedSave();
    } else {
      logDebug('Getting Started Tracker: Dismissal change detected, but conditions prevent status update or already local.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch: syncState.hashMismatch, currentUserId: userId, currentStatus: syncState.status });
    }
  }, [syncState.gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, syncState.hashMismatch, triggerDebouncedSave, syncState.status, updateSyncState]);

  const forceSaveLocal = useCallback(async () => {
    if (!userId || !isSignedIn) { toast({ title: 'Error', description: 'Cannot force save without an authenticated user.', variant: 'destructive' }); return false; }
    logWarn('SyncManager: User chose to force save local data, overwriting server.', { currentUserId: userId });
    const success = await saveData(true);
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Local data successfully saved to the cloud, overwriting server data.' });
      logInfo('Force Save Local: Successful.', { currentUserId: userId });
    } else {
      logError('Force Save Local: Failed.', undefined, { currentUserId: userId });
      if (syncState.hashMismatch) updateSyncState({ isMismatchDialogOpen: true }); 
    }
    return success;
  }, [saveData, toast, userId, isSignedIn, updateSyncState, syncState.hashMismatch]);

  const forceFetchServer = useCallback(async () => {
    if (!userId || !isSignedIn) { toast({ title: 'Error', description: 'Cannot force fetch without an authenticated user.', variant: 'destructive' }); return false; }
    logWarn('SyncManager: User chose to force fetch server data, discarding local changes.', { currentUserId: userId });
    const success = await fetchData(false, true); 
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Server data loaded. Any unsaved local changes were discarded.' });
      logInfo('Force Fetch Server: Successful.', { currentUserId: userId });
    } else {
      logError('Force Fetch Server: Failed.', undefined, { currentUserId: userId });
      if (syncState.hashMismatch) updateSyncState({ isMismatchDialogOpen: true }); 
    }
    return success;
  }, [fetchData, toast, userId, isSignedIn, updateSyncState, syncState.hashMismatch]);

  const retrySync = useCallback(() => {
    if (!isClerkLoaded) { toast({ title: 'Cannot Sync', description: 'Authentication status loading...', variant: 'default' }); return; }
    if (!isSignedIn || !userId) { toast({ title: 'Cannot Sync', description: 'Please sign in to sync your data.', variant: 'destructive' }); return; }
    logInfo('Manual Sync/Retry Triggered.', { currentStatus: syncState.status, hashMismatchState: syncState.hashMismatch, currentUserId: userId });
    if (syncState.status === 'error' && syncState.hashMismatch) {
      logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', { currentUserId: userId });
      updateSyncState({ isMismatchDialogOpen: true });
      return;
    }
    if (hasLocalChangesRef.current || (syncState.status === 'error' && !syncState.hashMismatch)) {
      logInfo('Manual Sync: Local changes or non-mismatch error. Attempting save...', { currentUserId: userId });
      saveData();
    } else { 
      toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
      fetchData(true); 
    }
  }, [syncState.status, syncState.hashMismatch, saveData, fetchData, toast, isSignedIn, userId, isClerkLoaded, updateSyncState]);

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
    