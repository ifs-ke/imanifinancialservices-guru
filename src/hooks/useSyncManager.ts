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

const DEBOUNCE_SAVE_DELAY = 10000; // 10 seconds

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

  const cleanupAsyncOperations = useCallback((reason: string) => {
    logDebug(`SyncManager: Cleanup initiated. Reason: ${reason}`, { currentUserId: userId });
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      logDebug(`SyncManager: Cleared save timeout. Reason: ${reason}`, { currentUserId: userId });
    }
    if (abortControllerRef.current) {
      logDebug(`SyncManager: Aborting previous fetch/save operation. Reason: ${reason}`, { currentUserId: userId });
      abortControllerRef.current.abort(reason); 
      abortControllerRef.current = null;
    }
    // Reset operation flags if cleanup is due to a superseding user action or unmount
    if (reason.includes('User changed') || reason.includes('User signed out') || reason.includes('Auth effect unmount')) {
        isFetchingRef.current = false;
        isSavingRef.current = false;
    }
  }, [userId]);

  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) {
      logDebug("ClearLocalState: Already in progress, skipping.", { currentUserId: internalPreviousUserId.current });
      return;
    }
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

      logInfo('SyncManager: Local state cleared successfully.', { userId: contextUserId });
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
    const currentUserId = userId; // Capture current userId for this specific fetch operation
    if (!isClerkLoaded) {
      logDebug('Fetch Aborted: Auth not loaded yet.', { currentUserId });
      return false;
    }
    if (!isSignedIn || !currentUserId) {
      logWarn('Fetch Aborted: User not signed in or userId not available.', { currentUserId, isSignedIn });
      updateSyncState({ status: 'local' }); 
      initialFetchDoneRef.current = true; 
      return false;
    }
    
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
        logDebug('Fetch Aborted: Operation already in progress.', { 
            isSaving: isSavingRef.current, 
            isFetching: isFetchingRef.current, 
            isClearing: isClearingRef.current, 
            currentUserId 
        });
        return false;
    }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { currentUserId });
    isFetchingRef.current = true; 
    updateSyncState({ status: 'syncing' });
    if (!skipHashCheck) updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
    
    const controller = new AbortController();
    abortControllerRef.current = controller;


    try {
      const response = await fetch('/api/sync', {
        signal: controller.signal
      });

      if (controller.signal.aborted) {
        logDebug(`Fetch Aborted: Operation was cancelled. Reason: ${controller.signal.reason}`, { currentUserId });
        if (syncState.status === 'syncing') { // Revert status if it was set to syncing by this attempt
            updateSyncState({ status: 'local' });
        }
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
        } catch (parseError) { logWarn("Fetch Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, currentUserId });}
        throw new Error(errorPayload.message, { cause: errorPayload });
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck && dataHash) {
        const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
        const dataString = stringify(preparedDataToVerify);
        const isValid = await verifyHash(dataString, dataHash);
        if (!isValid) {
          logError('Fetch Error: Data integrity check failed during fetch!', { clientHash: dataHash, serverHash: await hashData(dataString), dataStringTruncated: dataString.substring(0, 300) + (dataString.length > 300 ? "..." : ""), currentUserId });
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
      logInfo('Fetch: Successfully synced with DB.', { currentUserId });
      if (isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      return true;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        logDebug(`Fetch Aborted by signal: ${error.message}`, { currentUserId });
        if (syncState.status === 'syncing') { 
             updateSyncState({ status: 'local' });
        }
        return false;
      }
      logError('Fetch Error:', error, { cause: error.cause, currentUserId });
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
      if (abortControllerRef.current === controller) { // Only nullify if it's the same controller
        abortControllerRef.current = null;
      }
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true; 
      logDebug('Fetch: Operation complete.', { currentUserId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, updateSyncState, syncState.status // Added syncState.status
  ]);

  const saveData = useCallback(async (isForceSave = false) => {
    const currentUserId = userId; // Capture current userId
    if (!isClerkLoaded) { logDebug('Save Aborted: Auth not loaded yet.', { currentUserId }); return false; }
    if (!isSignedIn || !currentUserId) { logWarn('Save Aborted: User not signed in or userId not available.', { currentUserId, isSignedIn }); updateSyncState({ status: 'local' }); return false; }
    
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
        logDebug('Save Aborted: Operation already in progress.', { 
            isSaving: isSavingRef.current, 
            isFetching: isFetchingRef.current, 
            isClearing: isClearingRef.current, 
            currentUserId 
        });
        return false;
    }

    logInfo(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, { currentUserId });
    isSavingRef.current = true; 
    updateSyncState({ status: 'syncing' });

    if (!isForceSave) {
      logInfo('Save: Fetching latest data before saving to check for conflicts...', { currentUserId });
      const preSaveFetchSuccess = await fetchData(false, false); 
      if (!preSaveFetchSuccess) {
        logError('Save Aborted: Pre-save fetch failed or hash mismatch detected.', undefined, { operationStatus: 'pre-save-fetch-failed', currentUserId });
        isSavingRef.current = false; 
        if(!syncState.hashMismatch && syncState.status !== 'error') updateSyncState({ status: 'local' }); 
        return false;
      }
      logInfo('Save: Pre-save fetch successful, proceeding with save.', { currentUserId });
    } else {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false }); 
      logInfo('Save: Force save initiated, skipping pre-fetch check, proceeding with save.', { currentUserId });
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
        notifications: [], 
        sharedReviews: {}, 
      };
      const preparedData = prepareDataForHashing(currentState as SyncedData); 
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      logDebug(`Save Client: Calculated client hash: ${dataHash}`, { currentUserId });

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
        signal: controller.signal
      });

      if (controller.signal.aborted) {
        logDebug(`Save Aborted: Operation was cancelled. Reason: ${controller.signal.reason}`, { currentUserId });
         if (syncState.status === 'syncing') { 
            updateSyncState({ status: 'local' });
        }
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
        } catch (parseError) { logWarn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, currentUserId }); }

        if (response.status === 400 && errorPayload.message?.includes('integrity check failed')) {
          logError('Save API Error 400: Data integrity check failed on server.', errorPayload, { currentUserId });
          updateSyncState({ status: 'error', hashMismatch: true, isMismatchDialogOpen: true });
          toast({ title: 'Save Failed: Data Conflict', description: "Server data changed since last sync. Resolve using the cloud icon.", variant: 'destructive', link: '#' });
        } else if (response.status === 401) {
          logError('Save API Error 401: Unauthorized.', errorPayload, { currentUserId });
          updateSyncState({ status: 'error' });
          toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please refresh or log in again.', variant: 'destructive' });
        } else if (response.status === 429) {
          logWarn('Save API Error 429: Rate limit exceeded.', { currentUserId });
          updateSyncState({ status: 'error' });
          toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
        } else {
          logError(`Save API Error ${response.status}: ${errorPayload.message}`, errorPayload, { currentUserId });
          updateSyncState({ status: 'error' });
          throw new Error(errorPayload.message, { cause: errorPayload });
        }
        return false;
      }
      const result = await response.json();
      updateSyncState({ status: 'synced', lastSyncTime: new Date(), hashMismatch: false, isMismatchDialogOpen: false });
      hasLocalChangesRef.current = false;
      logInfo(`Save Successful. Server: ${result.message}`, { currentUserId });
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logDebug(`Save Aborted by signal: ${error.message}`, { currentUserId });
        if (syncState.status === 'syncing') {
            updateSyncState({ status: 'local' });
        }
        return false;
      }
      logError('Save Error:', error, { cause: error.cause, currentUserId });
      updateSyncState({ status: 'error' });
      let friendlyErrorMessage = 'Could not save data.';
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) friendlyErrorMessage = 'Could not save data: Network error. Please check connection.';
      else if (error.message?.includes('integrity check failed')) {
        friendlyErrorMessage = `Save failed: ${error.message}. Data conflict detected.`;
        updateSyncState({ hashMismatch: true, isMismatchDialogOpen: true });
      } else friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
      friendlyErrorMessage += ' Your local data is preserved. Click cloud icon to retry.';
      toast({ title: 'Sync Save Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      isSavingRef.current = false;
      logDebug('Save: Operation complete.', { currentUserId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, fetchData, syncState.gettingStartedDismissed, syncState.hashMismatch, 
    updateSyncState, syncState.status // Added syncState.status
  ]);

  const triggerDebouncedSave = useCallback(() => {
    const currentUserId = userId; // Capture userId
    if (!isSignedIn || !currentUserId) { logWarn('Debounced Save: User not signed in. Save will not occur.', { currentUserId }); return; }
    if (syncState.hashMismatch) { 
      logWarn('Debounced Save: Blocked by hash mismatch. Manual resolution required.', { currentUserId }); 
      if (syncState.status !== 'error') updateSyncState({ status: 'error' });
      return; 
    }
    
    cleanupAsyncOperations(`Starting new debounced save for user ${currentUserId}`);
    logDebug('Debounced Save: Timer started/reset.', { currentUserId });
    saveTimeoutRef.current = setTimeout(() => { 
      logInfo('Debounced Save: Timeout reached. Initiating save.', { currentUserId }); 
      saveData(); 
    }, DEBOUNCE_SAVE_DELAY);
  }, [saveData, isSignedIn, userId, syncState.hashMismatch, cleanupAsyncOperations, updateSyncState, syncState.status]);

  // Effect for initial fetch and user changes - Simplified dependencies
  useEffect(() => {
    if (!isClerkLoaded) {
      logDebug('Auth Effect: Auth state not ready. Waiting for load.');
      updateSyncState({ status: 'idle' });
      return () => cleanupAsyncOperations('Auth effect unmount while not loaded');
    }
    
    const currentAuthUserId = userId;

    if (currentAuthUserId && currentAuthUserId !== internalPreviousUserId.current) {
      logInfo(`Auth Effect: User signed IN or SWITCHED. New: ${currentAuthUserId}, Old: ${internalPreviousUserId.current ?? 'none'}.`, {
        oldUserId: internalPreviousUserId.current, newUserId: currentAuthUserId
      }, currentAuthUserId);
      
      cleanupAsyncOperations(`User changed from ${internalPreviousUserId.current} to ${currentAuthUserId}`);
      clearLocalState(); 
      internalPreviousUserId.current = currentAuthUserId;
      initialFetchDoneRef.current = false; 
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false, status: 'idle' }); 

      logDebug("Auth Effect: Triggering initial fetch for new/switched user.", { currentAuthUserId });
      fetchData(); // fetchData will use the latest userId from its own scope
      
    } else if (!currentAuthUserId && internalPreviousUserId.current) {
      logInfo(`Auth Effect: User signed OUT. Was: ${internalPreviousUserId.current}.`, {
        oldUserId: internalPreviousUserId.current
      }, internalPreviousUserId.current);
      cleanupAsyncOperations('User signed out');
      clearLocalState(); 
      internalPreviousUserId.current = null;
      initialFetchDoneRef.current = false;
      updateSyncState({ status: 'local', lastSyncTime: null, hashMismatch: false, isMismatchDialogOpen: false });
    } else if (currentAuthUserId && currentAuthUserId === internalPreviousUserId.current && !initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && syncState.status !== 'synced' && syncState.status !== 'error') {
      logInfo('Auth Effect: Same user session, initial fetch not completed or sync not confirmed. Triggering fetch...', {
        currentAuthUserId, currentStatus: syncState.status
      }, currentAuthUserId);
      fetchData();
    } else if (!currentAuthUserId && !internalPreviousUserId.current && !initialFetchDoneRef.current) {
      logInfo('Auth Effect: Initial load, no active user session. Setting status to local.');
      updateSyncState({ status: 'local', lastSyncTime: null, hashMismatch: false, isMismatchDialogOpen: false });
      initialFetchDoneRef.current = true; 
    } else {
      // This log can be very noisy if other dependencies cause re-runs
      // logDebug('Auth Effect: No primary auth-driven data clear/fetch action taken.', {
      //   isClerkLoaded, currentAuthUserId, previousUserId: internalPreviousUserId.current,
      //   initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current,
      //   isSaving: isSavingRef.current, currentStatus: syncState.status,
      // }, currentAuthUserId);
    }

    return () => {
        const effectUserId = currentAuthUserId; // Capture userId at the time effect was set up
        // Only cleanup if the userId for this effect instance is different from the current global userId,
        // or if the user is no longer signed in while this effect instance's userId was set.
        // This prevents cleanup if the effect re-runs for other dependency changes but the user session is stable.
        if (userId !== effectUserId || (!isSignedIn && effectUserId)) {
             logDebug(`Auth Effect Cleanup: Triggering. Effect's User: ${effectUserId}, Current Global User: ${userId}, SignedIn: ${isSignedIn}`);
            cleanupAsyncOperations(`Auth state changed. Effect User: ${effectUserId}, New User: ${userId}`);
        }
    };
  }, [userId, isSignedIn, isClerkLoaded, clearLocalState, fetchData, cleanupAsyncOperations, updateSyncState]); 


  // Effect to subscribe to store changes
  useEffect(() => {
    const currentUserId = userId; // Capture current userId for subscription
    if (!isClerkLoaded || !isSignedIn || !currentUserId || !initialFetchDoneRef.current) {
      logDebug('Change Subscription: Conditions not met.', { 
        isClerkLoaded, isSignedIn, currentUserId, initialFetchDone: initialFetchDoneRef.current 
      });
      return;
    }
    if (syncState.hashMismatch) {
      logWarn('Change Subscription: Blocked due to hash mismatch.', { currentUserId });
      if (syncState.status !== 'error') updateSyncState({ status: 'error' });
      return;
    }
    logDebug('Change Subscription: Subscribing to store changes...', { currentUserId });
    const storesToWatch = [useTransactionsStore, useDebtStore, useStatementStore, useBudgetStore, useWeeklyReviewStore];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    
    return () => {
      logDebug('Change Subscription: Unsubscribing from store changes.', { currentUserId });
      unsubscribes.forEach(unsub => unsub());
      // Do NOT call cleanupAsyncOperations here as it might cancel an in-flight debounced save on component unmount/re-render.
      // The debounced save should complete or be handled by auth changes.
    };
  }, [isClerkLoaded, isSignedIn, userId, initialFetchDoneRef.current, syncState.status, syncState.hashMismatch, handleStoreChange, updateSyncState]);

  // Effect to track changes to gettingStartedDismissed
  useEffect(() => {
    const currentUserId = userId; // Capture current userId
    if (!isClerkLoaded || !isSignedIn || !currentUserId || !initialFetchDoneRef.current) return;
    if (syncState.hashMismatch) {
      logWarn('Getting Started Tracker: Change detected, but blocked by hash mismatch.', { 
        gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId 
      });
      return;
    }
    
    // This effect should only trigger if gettingStartedDismissed actually changes
    // and other conditions (like no ongoing operations) are met.
    if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
      logDebug('Getting Started Tracker: Change detected for gettingStartedDismissed.', { 
        gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId 
      });
      hasLocalChangesRef.current = true;
      if (syncState.status === 'synced' || syncState.status === 'idle' || (syncState.status === 'error' && !syncState.hashMismatch) ) {
        updateSyncState({ status: 'local' });
        logInfo('Getting Started Tracker: Status changed to "local" due to dismissal state change.', { 
          currentUserId, previousStatus: syncState.status 
        });
      }
      triggerDebouncedSave();
    } else {
      logDebug('Getting Started Tracker: Dismissal change detected, but conditions prevent status update or already local.', { 
        initialFetchDone: initialFetchDoneRef.current, 
        isFetching: isFetchingRef.current, 
        isSaving: isSavingRef.current,
        isClearing: isClearingRef.current, 
        hashMismatch: syncState.hashMismatch, 
        currentUserId, 
        currentStatus: syncState.status 
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState.gettingStartedDismissed]); // Only track this specific state

  const forceSaveLocal = useCallback(async () => {
    const currentUserId = userId; // Capture current userId
    if (!currentUserId || !isSignedIn) { toast({ title: 'Error', description: 'Cannot force save without an authenticated user.', variant: 'destructive' }); return false; }
    logWarn('SyncManager: User chose to force save local data, overwriting server.', { currentUserId });
    cleanupAsyncOperations('Force Save Local initiated'); 
    isFetchingRef.current = false; 
    isClearingRef.current = false;
    const success = await saveData(true); 
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Local data successfully saved to the cloud, overwriting server data.' });
      logInfo('Force Save Local: Successful.', { currentUserId });
    } else {
      logError('Force Save Local: Failed.', undefined, { currentUserId });
      if (syncState.hashMismatch) updateSyncState({ isMismatchDialogOpen: true }); 
    }
    return success;
  }, [saveData, toast, userId, isSignedIn, updateSyncState, syncState.hashMismatch, cleanupAsyncOperations]);

  const forceFetchServer = useCallback(async () => {
    const currentUserId = userId; // Capture current userId
    if (!currentUserId || !isSignedIn) { toast({ title: 'Error', description: 'Cannot force fetch without an authenticated user.', variant: 'destructive' }); return false; }
    logWarn('SyncManager: User chose to force fetch server data, discarding local changes.', { currentUserId });
    cleanupAsyncOperations('Force Fetch Server initiated'); 
    isSavingRef.current = false; 
    isClearingRef.current = false;
    const success = await fetchData(false, true); 
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Server data loaded. Any unsaved local changes were discarded.' });
      logInfo('Force Fetch Server: Successful.', { currentUserId });
    } else {
      logError('Force Fetch Server: Failed.', undefined, { currentUserId });
      if (syncState.hashMismatch) updateSyncState({ isMismatchDialogOpen: true }); 
    }
    return success;
  }, [fetchData, toast, userId, isSignedIn, updateSyncState, syncState.hashMismatch, cleanupAsyncOperations]);

  const retrySync = useCallback(() => {
    const currentUserId = userId; // Capture current userId
    if (!isClerkLoaded) { toast({ title: 'Cannot Sync', description: 'Authentication status loading...', variant: 'default' }); return; }
    if (!isSignedIn || !currentUserId) { toast({ title: 'Cannot Sync', description: 'Please sign in to sync your data.', variant: 'destructive' }); return; }
    logInfo('Manual Sync/Retry Triggered.', { currentStatus: syncState.status, hashMismatchState: syncState.hashMismatch, currentUserId });
    
    cleanupAsyncOperations('Manual retry sync initiated'); 
    isFetchingRef.current = false; 
    isSavingRef.current = false;

    if (syncState.status === 'error' && syncState.hashMismatch) {
      logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', { currentUserId });
      updateSyncState({ isMismatchDialogOpen: true });
      return;
    }
    if (hasLocalChangesRef.current || (syncState.status === 'error' && !syncState.hashMismatch)) {
      logInfo('Manual Sync: Local changes or non-mismatch error. Attempting save...', { currentUserId });
      saveData();
    } else if (syncState.status === 'synced' || syncState.status === 'idle' || syncState.status === 'local') { 
      toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
      fetchData(true); 
    } else if (syncState.status === 'syncing') {
      toast({ title: 'Sync Busy', description: 'Please wait for the current operation to complete.' });
    } else { 
      logInfo('Manual Sync: Unknown state. Attempting fetch...', { currentUserId, currentStatus: syncState.status });
      fetchData(true);
    }
  }, [syncState.status, syncState.hashMismatch, saveData, fetchData, toast, isSignedIn, userId, isClerkLoaded, updateSyncState, cleanupAsyncOperations]);

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

