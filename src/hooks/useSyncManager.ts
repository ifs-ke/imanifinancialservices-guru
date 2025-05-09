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
  const initialFetchDoneForUserRef = useRef<string | null>(null); // Track if initial fetch is done for the current user
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

  const cleanupAsyncOperations = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    const currentUserId = internalPreviousUserId.current; // Use the stored previous userId for context if available
    logInfo('SyncManager: Clearing local state.', { userId: currentUserId });

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
          logWarn(`Failed to remove ${key} from sessionStorage`, { error: e, userId: currentUserId }); 
        }
      });

      logInfo('SyncManager: Local state cleared.', { userId: currentUserId });
      updateSyncState({ 
        status: 'local',
        lastSyncTime: null,
        gettingStartedDismissed: false,
        hashMismatch: false, 
        isMismatchDialogOpen: false
      });
      hasLocalChangesRef.current = false;
    } catch (error) {
      logError('Error during clearLocalState', error, { userId: currentUserId });
    } finally {
      isClearingRef.current = false;
    }
  }, [
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, updateSyncState
  ]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    const currentUserId = userId; // Capture userId at the start of the function
    if (!isClerkLoaded) {
      logDebug('Fetch Aborted: Auth not loaded yet.', { userId: currentUserId });
      return false;
    }
    if (!isSignedIn || !currentUserId) {
      logWarn('Fetch Aborted: User not signed in or userId not available.', { userId: currentUserId, isSignedIn });
      updateSyncState({ status: 'local' });
      initialFetchDoneForUserRef.current = null; // Reset since no user
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Fetch Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId: currentUserId });
      return false;
    }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { userId: currentUserId });
    isFetchingRef.current = true;
    updateSyncState({ status: 'syncing' });
    if (!skipHashCheck) updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/sync', { signal: abortControllerRef.current.signal });

      if (!response.ok) {
        let errorMessage = `Fetch failed: ${response.statusText} (Status: ${response.status})`;
        try {
          const parsedError = await response.json();
          if (parsedError?.error) errorMessage = `Fetch failed: ${parsedError.error} (Status: ${response.status})`;
        } catch (parseError) {
          logWarn("Fetch Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId: currentUserId });
        }
        throw new Error(errorMessage);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      logDebug('Fetch: Received data from server.', { userId: currentUserId });
      const { dataHash: serverHash, ...fetchedData } = data;

      if (!skipHashCheck && serverHash) {
        const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
        const dataString = stringify(preparedDataToVerify);
        logDebug(`Fetch: Verifying received hash: ${serverHash}`, { userId: currentUserId });
        const isValid = await verifyHash(dataString, serverHash);

        if (!isValid) {
          logError('Fetch Error: Data integrity check failed!', { serverHash, clientHashCalculationInputTruncated: dataString.substring(0, 200), userId: currentUserId });
          updateSyncState({ status: 'error', hashMismatch: true, isMismatchDialogOpen: true });
          toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Please resolve the conflict.", variant: 'destructive', link: '#' });
          return false;
        }
        logDebug('Fetch: Data integrity check passed.', { userId: currentUserId });
      }

      logInfo('Fetch: Overwriting local stores with fetched data...', { userId: currentUserId });
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
      
      updateSyncState({
        status: 'synced',
        lastSyncTime: new Date(),
        gettingStartedDismissed: fetchedData.gettingStartedDismissed ?? false,
        hashMismatch: false, 
        isMismatchDialogOpen: false,
      });
      
      hasLocalChangesRef.current = false;
      initialFetchDoneForUserRef.current = currentUserId; // Mark initial fetch as done for this user
      logInfo('Fetch: Successfully synced with DB.', { userId: currentUserId });
      if (isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      return true;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        logDebug('Fetch Aborted: Intentionally cancelled.', { userId: currentUserId });
        return false;
      }
      logError('Fetch Error:', error, { userId: currentUserId });
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
      abortControllerRef.current = null;
      logDebug('Fetch: Operation complete.', { userId: currentUserId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, updateSyncState
  ]);

  const saveData = useCallback(async (isForceSave = false) => {
    const currentUserId = userId; // Capture userId
    if (!isClerkLoaded) {
      logDebug('Save Aborted: Auth not loaded yet.', { userId: currentUserId });
      return false;
    }
    if (!isSignedIn || !currentUserId) {
      logWarn('Save Aborted: User not signed in or userId not available.', { userId: currentUserId, isSignedIn });
      updateSyncState({ status: 'local' });
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId: currentUserId });
      return false;
    }

    logInfo(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, { userId: currentUserId });
    updateSyncState({ status: 'syncing' });
    isSavingRef.current = true;

    if (!isForceSave) {
        logInfo('Save: Fetching latest data before saving to check for conflicts...', { userId: currentUserId });
        const preSaveFetchSuccess = await fetchData(false, false); // isRetry = false, skipHashCheck = false
        if (!preSaveFetchSuccess) {
            logError('Save Aborted: Pre-save fetch failed or hash mismatch detected.', undefined, { userId: currentUserId });
            isSavingRef.current = false;
            // fetchData would have set status to 'error' and potentially hashMismatch to true
            return false;
        }
        logInfo('Save: Pre-save fetch successful, proceeding with save.', { userId: currentUserId });
    } else {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      logInfo('Save: Force save initiated, skipping pre-fetch check, proceeding with save.', { userId: currentUserId });
    }

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
        notifications: [], 
        sharedReviews: {},
      };

      const preparedData = prepareDataForHashing(currentState as SyncedData);
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      logDebug(`Save Client: Calculated client hash: ${dataHash}`, { userId: currentUserId });

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        let errorData = { error: `Save failed: ${response.statusText} (Status: ${response.status})` };
        try {
          const parsedError = await response.json();
          if (parsedError?.error) errorData.error = `Save failed: ${parsedError.error} (Status: ${response.status})`;
        } catch (parseError) {
          logWarn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId: currentUserId });
        }

        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
          logError('Save API Error 400: Data integrity check failed on server.', errorData, { userId: currentUserId });
          updateSyncState({ status: 'error', hashMismatch: true, isMismatchDialogOpen: true });
          toast({ title: 'Save Failed: Data Conflict', description: "Server data changed since last sync. Resolve using the cloud icon.", variant: 'destructive', link: '#' });
        } else if (response.status === 401) {
            logError('Save API Error 401: Unauthorized.', errorData, { userId: currentUserId });
            updateSyncState({ status: 'error' });
            toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please refresh or log in again.', variant: 'destructive' });
        } else if (response.status === 429) {
            logWarn('Save API Error 429: Rate limit exceeded.', { userId: currentUserId });
            updateSyncState({ status: 'error' });
            toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
        } else {
          logError(`Save API Error ${response.status}: ${errorData.error}`, undefined, { userId: currentUserId });
          updateSyncState({ status: 'error' });
          throw new Error(errorData.error);
        }
        return false;
      }

      const result = await response.json();
      updateSyncState({ status: 'synced', lastSyncTime: new Date(), hashMismatch: false, isMismatchDialogOpen: false });
      hasLocalChangesRef.current = false;
      logInfo(`Save Successful. Server: ${result.message}`, { userId: currentUserId });
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        logDebug('Save Aborted: Intentionally cancelled.', { userId: currentUserId });
        return false;
      }
      logError('Save Error:', error, { userId: currentUserId });
      updateSyncState({ status: 'error' });
      let friendlyErrorMessage = 'Could not save data.';
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) friendlyErrorMessage = 'Could not save data: Network error. Please check connection.';
      else if (error.message?.includes('integrity check failed')) {
        friendlyErrorMessage = `Save failed: ${error.message}.`;
        updateSyncState({ hashMismatch: true, isMismatchDialogOpen: true });
      } else friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
      friendlyErrorMessage += ' Your local data is preserved. Click cloud icon to retry.';
      toast({ title: 'Sync Save Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
      abortControllerRef.current = null;
      logDebug('Save: Operation complete.', { userId: currentUserId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, syncState.gettingStartedDismissed,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, fetchData, updateSyncState
  ]);

  const triggerDebouncedSave = useCallback(() => {
    const currentUserId = userId; // Capture userId
    if (!isSignedIn || !currentUserId) {
      logWarn('Debounced Save: User not signed in. Save will not occur.', { userId: currentUserId });
      return;
    }
    if (syncState.hashMismatch) {
      logWarn('Debounced Save: Blocked by hash mismatch. Manual resolution required.', { userId: currentUserId });
      updateSyncState({ status: 'error' }); 
      return;
    }

    cleanupAsyncOperations();
    logDebug('Debounced Save: Timer started/reset.', { userId: currentUserId });
    
    saveTimeoutRef.current = setTimeout(() => {
      logInfo('Debounced Save: Timeout reached. Initiating save.', { userId: currentUserId });
      saveData();
    }, 3000);
  }, [saveData, isSignedIn, userId, syncState.hashMismatch, cleanupAsyncOperations, updateSyncState]);

  const handleStoreChange = useCallback(() => {
    const currentUserId = userId; // Capture userId
    if (isFetchingRef.current || isSavingRef.current || isClearingRef.current || syncState.hashMismatch) {
      logDebug('Store Change: Operation in progress or hash mismatch. Save deferred.', { isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch: syncState.hashMismatch, userId: currentUserId });
      return;
    }

    if (!hasLocalChangesRef.current) {
      logInfo('Store Change: First local change detected since last sync/load.', { userId: currentUserId });
    }
    hasLocalChangesRef.current = true;

    if (syncState.status === 'synced' || syncState.status === 'idle' || (syncState.status === 'error' && !syncState.hashMismatch) ) {
      updateSyncState({ status: 'local' });
      logInfo('Store Change: Status changed to "local" due to store changes.', { userId: currentUserId, previousStatus: syncState.status });
    }
    triggerDebouncedSave();
  }, [syncState.status, syncState.hashMismatch, triggerDebouncedSave, userId, updateSyncState]);

  useEffect(() => {
    if (!isClerkLoaded) {
      logDebug('Auth Effect: Auth state not ready. Waiting for load.', { userId });
      updateSyncState({ status: 'idle' }); // Clerk not loaded, app is idle regarding sync
      return cleanupAsyncOperations;
    }
  
    const currentAuthUserId = userId;
  
    if (currentAuthUserId && currentAuthUserId !== internalPreviousUserId.current) {
      // New user signed in or user changed
      logInfo(`Auth Effect: User signed in or changed. Current: ${currentAuthUserId}, Previous: ${internalPreviousUserId.current ?? 'none'}.`, { oldUserId: internalPreviousUserId.current, newUserId: currentAuthUserId, userId: currentAuthUserId });
      cleanupAsyncOperations(); 
      clearLocalState(); 
      internalPreviousUserId.current = currentAuthUserId;
      initialFetchDoneForUserRef.current = null; // Reset for new user
      if (!isFetchingRef.current) {
        fetchData().then(success => {
          if (success) initialFetchDoneForUserRef.current = currentAuthUserId;
        });
      }
    } else if (!currentAuthUserId && internalPreviousUserId.current) {
      // User signed out
      logInfo(`Auth Effect: User signed out. Was: ${internalPreviousUserId.current}.`, { oldUserId: internalPreviousUserId.current, userId: internalPreviousUserId.current });
      cleanupAsyncOperations();
      clearLocalState();
      internalPreviousUserId.current = null;
      initialFetchDoneForUserRef.current = null;
      updateSyncState({ status: 'local' }); // No user, so it's local state only
    } else if (currentAuthUserId && currentAuthUserId === internalPreviousUserId.current && initialFetchDoneForUserRef.current !== currentAuthUserId && !isFetchingRef.current) {
      // Same user session, but initial fetch for THIS user hasn't completed successfully
      logInfo('Auth Effect: Same user session, initial fetch not completed for this user. Triggering fetch...', { currentAuthUserId, userId: currentAuthUserId });
      fetchData().then(success => {
        if (success) initialFetchDoneForUserRef.current = currentAuthUserId;
      });
    } else if (!currentAuthUserId && !internalPreviousUserId.current && !isFetchingRef.current && initialFetchDoneForUserRef.current !== 'anonymous_or_no_user') {
      // Initial load, no active user session (and not already marked as fetched for anonymous)
      logInfo('Auth Effect: Initial load, no active user session. Setting status to local.', { userId: currentAuthUserId });
      updateSyncState({ status: 'local' });
      initialFetchDoneForUserRef.current = 'anonymous_or_no_user'; // Mark that we've processed the "no user" state
    } else {
      logDebug('Auth Effect: No primary auth-driven action taken.', {
        isClerkLoaded, currentAuthUserId, previousUserId: internalPreviousUserId.current,
        initialFetchDoneForUser: initialFetchDoneForUserRef.current, isFetching: isFetchingRef.current,
        isSaving: isSavingRef.current, currentStatus: syncState.status, userId: currentAuthUserId
      });
    }
    return cleanupAsyncOperations;
  }, [userId, isSignedIn, isClerkLoaded, clearLocalState, fetchData, cleanupAsyncOperations, updateSyncState]);
  

  useEffect(() => {
    const currentUserId = userId; // Capture userId
    if (!isClerkLoaded || !isSignedIn || !currentUserId || initialFetchDoneForUserRef.current !== currentUserId) {
      logDebug('Change Subscription: Conditions not met (auth/initial fetch incomplete).', { 
          isClerkLoaded, isSignedIn, currentUserId, initialFetchDoneForUser: initialFetchDoneForUserRef.current, userId: currentUserId 
      });
      return cleanupAsyncOperations;
    }
    if (syncState.hashMismatch) {
      logWarn('Change Subscription: Blocked due to hash mismatch.', { currentUserId, userId: currentUserId });
      if (syncState.status !== 'error') updateSyncState({ status: 'error' });
      return cleanupAsyncOperations;
    }

    logDebug('Change Subscription: Subscribing to store changes...', { currentUserId, userId: currentUserId });
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore,
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));

    return () => {
      logDebug('Change Subscription: Unsubscribing from store changes.', { currentUserId, userId: currentUserId });
      unsubscribes.forEach(unsub => unsub());
      cleanupAsyncOperations();
    };
  }, [isClerkLoaded, isSignedIn, userId, syncState.status, syncState.hashMismatch, handleStoreChange, cleanupAsyncOperations, updateSyncState]);

  useEffect(() => {
    const currentUserId = userId; // Capture userId
    if (!isClerkLoaded || !isSignedIn || !currentUserId || initialFetchDoneForUserRef.current !== currentUserId) {
      logDebug('Getting Started Tracker: Conditions not met for tracking change.', { gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId, initialFetchDoneForUser: initialFetchDoneForUserRef.current, userId: currentUserId });
      return;
    }
    if (syncState.hashMismatch) {
       logWarn('Getting Started Tracker: Change detected, but blocked by hash mismatch.', { gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId, userId: currentUserId });
       return;
    }
    
    // Only trigger if this is the source of the change (not part of initial load or ongoing sync)
    if (initialFetchDoneForUserRef.current === currentUserId && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
      logDebug('Getting Started Tracker: Dismissal state changed, triggering potential save.', { gettingStartedDismissed: syncState.gettingStartedDismissed, currentUserId, userId: currentUserId });
      hasLocalChangesRef.current = true; 
      if (syncState.status === 'synced' || syncState.status === 'idle' || (syncState.status === 'error' && !syncState.hashMismatch)) {
        updateSyncState({ status: 'local' });
        logInfo('Getting Started Tracker: Status changed to "local".', { currentUserId, previousStatus: syncState.status, userId: currentUserId });
      }
      triggerDebouncedSave();
    } else {
       logDebug('Getting Started Tracker: Dismissal change detected, but conditions prevent status update or already local.', { initialFetchDoneForUser: initialFetchDoneForUserRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch: syncState.hashMismatch, currentUserId, currentStatus: syncState.status, userId: currentUserId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState.gettingStartedDismissed]); 

  const forceSaveLocal = useCallback(async () => {
    const currentUserId = userId; // Capture userId
    if (!currentUserId || !isSignedIn) {
      toast({ title: 'Error', description: 'Cannot force save without an authenticated user.', variant: 'destructive' });
      return false;
    }
    logWarn('SyncManager: User chose to force save local data, overwriting server.', { userId: currentUserId });
    const success = await saveData(true);
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Local data successfully saved to the cloud, overwriting server data.' });
      logInfo('Force Save Local: Successful.', { userId: currentUserId });
    } else {
      logError('Force Save Local: Failed.', undefined, { userId: currentUserId });
    }
    return success;
  }, [saveData, toast, userId, isSignedIn, updateSyncState]);

  const forceFetchServer = useCallback(async () => {
    const currentUserId = userId; // Capture userId
     if (!currentUserId || !isSignedIn) {
      toast({ title: 'Error', description: 'Cannot force fetch without an authenticated user.', variant: 'destructive' });
      return false;
    }
    logWarn('SyncManager: User chose to force fetch server data, discarding local changes.', { userId: currentUserId });
    const success = await fetchData(false, true); 
    if (success) {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
      toast({ title: 'Conflict Resolved', description: 'Server data loaded. Any unsaved local changes were discarded.' });
      logInfo('Force Fetch Server: Successful.', { userId: currentUserId });
    } else {
      logError('Force Fetch Server: Failed.', undefined, { userId: currentUserId });
    }
    return success;
  }, [fetchData, toast, userId, isSignedIn, updateSyncState]);

  const retrySync = useCallback(() => {
    const currentUserId = userId; // Capture userId
    if (!isClerkLoaded) {
      toast({ title: 'Cannot Sync', description: 'Authentication status loading...', variant: 'default' });
      return;
    }
    if (!isSignedIn || !currentUserId) {
      toast({ title: 'Cannot Sync', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }

    logInfo('Manual Sync/Retry Triggered.', { currentStatus: syncState.status, hashMismatchState: syncState.hashMismatch, userId: currentUserId });

    if (syncState.status === 'error' && syncState.hashMismatch) {
      logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', { userId: currentUserId });
      updateSyncState({ isMismatchDialogOpen: true });
      return;
    }
    
    if (hasLocalChangesRef.current || (syncState.status === 'error' && !syncState.hashMismatch)) {
      logInfo('Manual Sync: Local changes or non-mismatch error. Attempting save...', { userId: currentUserId });
      saveData();
    } else if (syncState.status === 'synced' || syncState.status === 'idle' || syncState.status === 'local') { 
      toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
      fetchData(true);
    } else if (syncState.status === 'syncing') {
      toast({ title: 'Sync Busy', description: 'Please wait for the current operation to complete.' });
    } else {
      logInfo('Manual Sync: Default case (unclear state). Attempting fetch...', { userId: currentUserId, currentStatus: syncState.status });
      fetchData(true);
    }
  }, [
    syncState.status, syncState.hashMismatch, saveData, fetchData, toast, 
    isSignedIn, userId, isClerkLoaded, updateSyncState
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
