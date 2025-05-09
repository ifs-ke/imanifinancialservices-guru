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
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; // Assuming logger is configured for client-side if needed

// Removed CLERK_DISABLED_PLACEHOLDER_USER_ID

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

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissedState] = useState(false);
  const [hashMismatch, setHashMismatch] = useState(false);
  const [isMismatchDialogOpen, setIsMismatchDialogOpen] = useState(false);

  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const hasLocalChangesRef = useRef(false);

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    const currentContextUserId = userId || 'unknown-on-clear';
    logInfo('SyncManager: Clearing local state.', { userId: currentContextUserId });
    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();
      setGettingStartedDismissedState(false);

      const storeKeys = ['ifcGuru_transactions', 'ifcGuru_debts', 'ifcGuru_statementItems', 'ifcGuru_budgetItems', 'ifcGuru_weeklyReviews', 'ifcGuru_notifications'];
      storeKeys.forEach(key => {
        try { sessionStorage.removeItem(key); } catch (e) { logWarn(`Failed to remove ${key} from sessionStorage`, { error: e, userId: currentContextUserId }); }
      });

      logInfo('SyncManager: Local state cleared.', { userId: currentContextUserId });
      setSyncStatus('local');
      setLastSyncTime(null);
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      setHashMismatch(false);
    } catch (error) {
      logError('Error during clearLocalState', error, { userId: currentContextUserId });
    } finally {
      isClearingRef.current = false;
    }
  }, [
    userId, getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState,
  ]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    if (!isClerkLoaded) {
      logDebug('Fetch Aborted: Clerk not loaded yet.');
      return false;
    }
    if (!isSignedIn || !userId) {
      logDebug('Fetch Aborted: User not signed in.', { currentUserId: userId });
      if (previousUserIdRef.current !== undefined && previousUserIdRef.current !== userId) {
        logInfo('Fetch: User changed or signed out, clearing local state.', { oldUserId: previousUserIdRef.current, newUserId: userId });
        clearLocalState();
        previousUserIdRef.current = userId;
      }
      setSyncStatus('local');
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Fetch Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId });
      return false;
    }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { userId });
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false);

    try {
      const response = await fetch('/api/sync');

      if (!response.ok) {
        let errorMessage = `Fetch failed: ${response.statusText} (Status: ${response.status})`;
        try {
          const parsedError = await response.json();
          if (parsedError && typeof parsedError.error === 'string') {
            errorMessage = `Fetch failed: ${parsedError.error} (Status: ${response.status})`;
          }
        } catch (parseError) {
          logWarn("Fetch Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId });
        }
        logError(`Fetch API Error ${response.status}: ${errorMessage}`, undefined, { userId });
        throw new Error(errorMessage);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      logDebug('Fetch: Received data from server.', { userId });
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck) {
        if (!dataHash) {
          logWarn('Fetch Warning: No dataHash received from server. Skipping integrity check.', { userId });
        } else {
          const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
          const dataString = stringify(preparedDataToVerify);
          logDebug(`Fetch: Verifying received hash: ${dataHash}`, { userId });
          const isValid = await verifyHash(dataString, dataHash);

          if (!isValid) {
            logError('Fetch Error: Data integrity check failed!', { serverHash: dataHash, clientHashCalculationInputTruncated: dataString.substring(0, 200), userId });
            setHashMismatch(true);
            setSyncStatus('error');
            setIsMismatchDialogOpen(true);
            toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Please resolve the conflict.", variant: 'destructive' });
            return false;
          }
          logDebug('Fetch: Data integrity check passed.', { userId });
        }
      } else {
        logInfo('Fetch: Skipping hash check as requested (Force Fetch).', { userId });
      }

      logInfo('Fetch: Overwriting local stores with fetched data...', { userId });
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
      setGettingStartedDismissedState(fetchedData.gettingStartedDismissed ?? false);

      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false;
      logInfo('Fetch: Successfully synced with DB.', { userId });
      if (isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      return true;

    } catch (error: any) {
      logError('Fetch Error:', error, { userId });
      setSyncStatus('error');
      let friendlyErrorMessage = 'Could not load data.';
      if (error.message?.includes('Failed to parse') || error.message?.includes('JSON')) {
        friendlyErrorMessage = 'Could not load data: Failed to parse server response. Using local data.';
      } else if (error.message?.includes('Failed to fetch')) {
        friendlyErrorMessage += ' Network error. Please check connection.';
      } else if (error.message?.includes('Internal Server Error') || error.message?.includes('database')) {
        friendlyErrorMessage += ` Server error (${error.message}).`;
      } else {
        friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
      }
      friendlyErrorMessage += ' Using local data if available. Click cloud icon to retry.';
      toast({ title: 'Sync Load Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true;
      logDebug('Fetch: Operation complete.', { userId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState,
  ]);

  const saveData = useCallback(async (isForceSave = false) => {
    if (!isClerkLoaded) {
      logDebug('Save Aborted: Clerk not loaded yet.', { userId });
      return false;
    }
    if (!isSignedIn || !userId) {
      logWarn('Save Aborted: User not signed in.', { userId });
      setSyncStatus('local');
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId });
      return false;
    }

    logInfo(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, { userId });
    setSyncStatus('syncing');
    isSavingRef.current = true;

    if (!isForceSave) {
      logInfo('Save: Fetching latest data before saving to check for conflicts...', { userId });
      const fetchSuccess = await fetchData(false, false);
      if (!fetchSuccess) {
        logError('Save Aborted: Pre-save fetch failed. Data might be out of sync or hash mismatch occurred.', undefined, { userId });
        isSavingRef.current = false;
        return false;
      }
      logInfo('Save: Pre-save fetch successful, proceeding with save.', { userId });
    } else {
      setHashMismatch(false);
      logInfo('Save: Force save initiated, skipping pre-fetch check.', { userId });
    }

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
        gettingStartedDismissed: gettingStartedDismissed,
      };

      const preparedData = prepareDataForHashing(currentState as SyncedData);
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      logDebug(`Save Client: Calculated client hash: ${dataHash}`, { userId });

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        let errorData = { error: `Save failed: ${response.statusText} (Status: ${response.status})` };
        try {
          const parsedError = await response.json();
          if (parsedError && typeof parsedError.error === 'string') {
            errorData.error = `Save failed: ${parsedError.error} (Status: ${response.status})`;
          }
        } catch (parseError) {
          logWarn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId });
        }

        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
          logError('Save API Error 400: Data integrity check failed on server.', errorData, { userId });
          setHashMismatch(true);
          setSyncStatus('error');
          setIsMismatchDialogOpen(true);
          toast({ title: 'Save Failed: Data Conflict', description: "Server data changed since last sync. Resolve using the cloud icon.", variant: 'destructive' });
        } else if (response.status === 401) {
          logError('Save API Error 401: Unauthorized.', errorData, { userId });
          setSyncStatus('error');
          toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please refresh or log in again.', variant: 'destructive' });
        } else if (response.status === 429) {
          logWarn('Save API Error 429: Rate limit exceeded.', { userId });
          setSyncStatus('error');
          toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
        } else {
          logError(`Save API Error ${response.status}: ${errorData.error}`, undefined, { userId });
          throw new Error(errorData.error);
        }
        isSavingRef.current = false;
        return false;
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false;
      logInfo(`Save Successful. Server: ${result.message}`, { userId });
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
      logError('Save Error:', error, { userId });
      setSyncStatus('error');
      let friendlyErrorMessage = 'Could not save data.';
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        friendlyErrorMessage = 'Could not save data: Network error. Please check connection.';
      } else if (error.message?.includes('integrity check failed')) {
        friendlyErrorMessage = `Save failed: ${error.message}.`;
        setHashMismatch(true);
        setIsMismatchDialogOpen(true);
      } else {
        friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
      }
      friendlyErrorMessage += ' Changes remain locally. Click cloud icon to retry.';
      toast({ title: 'Sync Save Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
      logDebug('Save: Operation complete.', { userId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, gettingStartedDismissed,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, fetchData,
  ]);

  useEffect(() => {
    if (!isClerkLoaded) {
      logDebug('Auth Effect: Clerk state not ready.');
      return;
    }

    const currentAuthUserId = userId;

    if (currentAuthUserId && currentAuthUserId !== previousUserIdRef.current) {
      logInfo(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentAuthUserId}). Clearing state and fetching.`);
      clearLocalState();
      previousUserIdRef.current = currentAuthUserId;
      initialFetchDoneRef.current = false;
      logDebug('Auth Effect: Triggering initial fetch...');
      fetchData();
    } else if (!currentAuthUserId && previousUserIdRef.current) {
      logInfo(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`);
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      setSyncStatus('local');
    } else if (!currentAuthUserId && previousUserIdRef.current === undefined) {
      logInfo('Auth Effect: Initial load, no active user session.');
      setSyncStatus('local');
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = true;
    } else if (currentAuthUserId && currentAuthUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
      logInfo('Auth Effect: User session exists, but initial fetch needed. Triggering fetch...');
      fetchData();
    } else {
      logDebug('Auth Effect: No significant auth change.');
      if (isClerkLoaded && isSignedIn && !initialFetchDoneRef.current) {
        logDebug('Auth Effect: Marking initial fetch done as Clerk is loaded and user is signed in.');
        initialFetchDoneRef.current = true;
      }
    }
  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState]);

  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
      logDebug('Change Subscription: Conditions not met.', { isClerkLoaded, isSignedIn, userId, initialFetchDone: initialFetchDoneRef.current });
      return;
    }
    if (hashMismatch) {
      logWarn('Change Subscription: Blocked due to hash mismatch.', { userId });
      return;
    }

    logDebug('Change Subscription: Subscribing to store changes...', { userId });
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore,
    ];

    const handleChange = () => {
      if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
        if (!hasLocalChangesRef.current) {
          logInfo('Change Subscription: First local change detected since last sync.', { userId });
        }
        hasLocalChangesRef.current = true;
        if (syncStatus === 'synced' || syncStatus === 'idle') {
          setSyncStatus('local');
          logInfo('Change Subscription: Status changed to "local" due to changes.', { userId });
        }
      } else {
        logDebug('Change Subscription: Store change detected, but conditions prevent status change.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch, userId });
      }
    };

    const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

    return () => {
      logDebug('Change Subscription: Unsubscribing.', { userId });
      unsubscribes.forEach(unsub => unsub());
    };
  }, [
    isClerkLoaded, isSignedIn, userId, initialFetchDoneRef.current,
    syncStatus, hashMismatch,
  ]);

  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
      logDebug('Getting Started Tracker: Conditions not met.', { isClerkLoaded, isSignedIn, userId, initialFetchDone: initialFetchDoneRef.current });
      return;
    }
    if (hashMismatch) {
      logWarn('Getting Started Tracker: Blocked due to hash mismatch.', { userId });
      return;
    }

    if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
      logDebug('Getting Started Tracker: Change detected.', { gettingStartedDismissed, userId });
      if (!hasLocalChangesRef.current) {
        logInfo('Getting Started Tracker: First local change detected.', { userId });
      }
      hasLocalChangesRef.current = true;
      if (syncStatus === 'synced' || syncStatus === 'idle') {
        setSyncStatus('local');
        logInfo('Getting Started Tracker: Status changed to "local".', { userId });
      }
    } else {
      logDebug('Getting Started Tracker: Change detected, but conditions prevent status change.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch, userId });
    }
  }, [gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, initialFetchDoneRef, hashMismatch, syncStatus]);

  const forceSaveLocal = useCallback(async () => {
    if (!userId) {
        toast({ title: 'Error', description: 'Cannot force save without an authenticated user.', variant: 'destructive' });
        return false;
    }
    logWarn('SyncManager: User chose to force save local data.', { userId });
    const success = await saveData(true);
    if (success) {
      setHashMismatch(false);
      setIsMismatchDialogOpen(false);
      toast({ title: 'Conflict Resolved', description: 'Local data successfully saved to the cloud, overwriting server data.' });
      logInfo('Force Save Local: Successful.', { userId });
    } else {
      logError('Force Save Local: Failed.', undefined, { userId });
      toast({ title: 'Force Save Failed', description: 'Could not overwrite cloud data. Check connection or logs.', variant: 'destructive' });
    }
    return success;
  }, [saveData, toast, userId]);

  const forceFetchServer = useCallback(async () => {
     if (!userId) {
        toast({ title: 'Error', description: 'Cannot force fetch without an authenticated user.', variant: 'destructive' });
        return false;
    }
    logWarn('SyncManager: User chose to force fetch server data.', { userId });
    const success = await fetchData(false, true);
    if (success) {
      setHashMismatch(false);
      setIsMismatchDialogOpen(false);
      toast({ title: 'Conflict Resolved', description: 'Server data loaded. Any unsaved local changes were discarded.' });
      logInfo('Force Fetch Server: Successful.', { userId });
    } else {
      logError('Force Fetch Server: Failed.', undefined, { userId });
      toast({ title: 'Force Fetch Failed', description: 'Could not load data from the cloud. Check connection or logs.', variant: 'destructive' });
    }
    return success;
  }, [fetchData, toast, userId]);

  const retrySync = useCallback(() => {
    if (!isClerkLoaded) {
      toast({ title: 'Cannot Sync', description: 'Authentication status loading...', variant: 'default' });
      return;
    }
    if (!isSignedIn || !userId) {
      toast({ title: 'Cannot Sync', description: 'Please sign in.', variant: 'destructive' });
      return;
    }
    logInfo('Manual Sync/Retry Triggered.', { currentStatus: syncStatus, hashMismatch, userId });

    if (syncStatus === 'error' && hashMismatch) {
      logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', { userId });
      setIsMismatchDialogOpen(true);
      return;
    }

    if (syncStatus === 'local' || (syncStatus === 'error' && !hashMismatch)) {
      logInfo('Manual Sync: Status is local or error (no mismatch). Attempting save...', { userId });
      saveData();
    } else if (syncStatus === 'synced') {
      toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
      fetchData(true);
    } else if (syncStatus === 'syncing') {
      toast({ title: 'Sync Busy', description: 'Please wait for the current operation.' });
    } else {
      logInfo('Manual Sync: Default case (e.g., idle), attempting fetch...', { userId });
      fetchData(true);
    }
  }, [syncStatus, hashMismatch, saveData, fetchData, toast, isSignedIn, userId, isClerkLoaded]);

  return {
    syncStatus,
    retrySync,
    gettingStartedDismissed,
    setGettingStartedDismissed: setGettingStartedDismissedState,
    hashMismatch,
    forceSaveLocal,
    forceFetchServer,
    isMismatchDialogOpen,
    setIsMismatchDialogOpen,
  };
}
