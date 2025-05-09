// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs'; // Re-enable Clerk
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
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth(); // Use actual Clerk auth

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
    // Use the current userId from auth context if available, otherwise log as clearing for an unknown/logged-out user
    const currentContextUserId = userId; // userId from useAuth()
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
      setSyncStatus('local'); // After clearing, data is only local (empty)
      setLastSyncTime(null);
      initialFetchDoneRef.current = false; // Reset initial fetch flag
      hasLocalChangesRef.current = false;
      setHashMismatch(false); // Reset hash mismatch
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
      logDebug('Fetch Aborted: Auth not loaded yet.');
      return false;
    }
    if (!isSignedIn || !userId) { // Strict check for isSignedIn and userId
      logWarn('Fetch Aborted: User not signed in or userId not available.', { currentUserId: userId, isSignedIn });
      // If user ID changed *to null*, clear state
      if (previousUserIdRef.current && previousUserIdRef.current !== userId) {
        logInfo('Fetch: User signed out, clearing local state.', { oldUserId: previousUserIdRef.current });
        clearLocalState();
      }
      previousUserIdRef.current = userId; // Update ref (could be null)
      setSyncStatus('local'); // Set to local as no sync can occur
      initialFetchDoneRef.current = true; // Mark fetch attempt as done
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Fetch Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId });
      return false;
    }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { userId });
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    if(!skipHashCheck) setHashMismatch(false); // Reset hash mismatch only if not skipping check (i.e., normal fetch or retry that isn't a force fetch)


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
            setIsMismatchDialogOpen(true); // Open dialog for user to resolve
            toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Please resolve the conflict.", variant: 'destructive', link: '#' }); 
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
       if (error.message?.includes('Internal Server Error')) {
           friendlyErrorMessage += ` Server error encountered.`;
       } else if (error.message?.includes('Failed to parse') || error.message?.includes('JSON')) {
          friendlyErrorMessage = 'Could not load data: Failed to parse server response.';
       } else if (error.message?.includes('Failed to fetch')) { 
           friendlyErrorMessage += ' Network error. Please check connection.';
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
      logDebug('Save Aborted: Auth not loaded yet.', { currentUserId: userId });
      return false;
    }
    if (!isSignedIn || !userId) { // Strict check for isSignedIn and userId
      logWarn('Save Aborted: User not signed in or userId not available.', { currentUserId: userId, isSignedIn });
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
            logError('Save Aborted: Pre-save fetch failed or hash mismatch detected.', undefined, { userId });
            
            isSavingRef.current = false;
            
            return false;
        }
        logInfo('Save: Pre-save fetch successful, proceeding with save.', { userId });
    } else {
      setHashMismatch(false); 
      setIsMismatchDialogOpen(false); 
      logInfo('Save: Force save initiated, skipping pre-fetch check, proceeding with save.', { userId });
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
          toast({ title: 'Save Failed: Data Conflict', description: "Server data changed since last sync. Resolve using the cloud icon.", variant: 'destructive', link: '#' });
        } else if (response.status === 401) {
            logError('Save API Error 401: Unauthorized.', errorData, { userId });
            setSyncStatus('error');
            toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please refresh or log in again.', variant: 'destructive' });
        } else if (response.status === 429) {
            logWarn('Save API Error 429: Rate limit exceeded.', { userId });
            setSyncStatus('error');
            toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
        }
        else {
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


  // Effect for initial fetch and user changes
  useEffect(() => {
    if (!isClerkLoaded) {
      logDebug('Auth Effect: Auth state not ready. Waiting for load.');
      setSyncStatus('idle');
      return;
    }

    const currentAuthUserId = userId;

    if (currentAuthUserId && currentAuthUserId !== previousUserIdRef.current) {
      // User signed in or changed
      logInfo(`Auth Effect: User signed in or changed (from ${previousUserIdRef.current ?? 'none'} to ${currentAuthUserId}). Clearing local state and fetching data.`, { oldUserId: previousUserIdRef.current, newUserId: currentAuthUserId });
      clearLocalState(); 
      previousUserIdRef.current = currentAuthUserId; 
      initialFetchDoneRef.current = false; 
      logDebug('Auth Effect: Triggering initial fetch for new user...', { newUserId: currentAuthUserId });
      fetchData(); 
    } else if (!currentAuthUserId && previousUserIdRef.current) {
      // User signed out
      logInfo(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`, { oldUserId: previousUserIdRef.current });
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      setSyncStatus('local'); 
    } else if (!currentAuthUserId && previousUserIdRef.current === undefined) {
      // Initial load, no active user session (and wasn't one before)
      logInfo('Auth Effect: Initial load, no active user session. Local state is active.');
      setSyncStatus('local');
      previousUserIdRef.current = null; 
      initialFetchDoneRef.current = true; 
    } else if (currentAuthUserId && currentAuthUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
      // User session exists, but initial fetch hasn't completed (e.g., page refresh while logged in)
      logInfo('Auth Effect: User session exists, but initial fetch not done. Triggering fetch...', { currentAuthUserId });
      fetchData();
    } else {
      logDebug('Auth Effect: No significant auth change, or initial fetch already attempted/completed.', { currentAuthUserId, previousUserId: previousUserIdRef.current, initialFetchDone: initialFetchDoneRef.current });
       if (isClerkLoaded && isSignedIn && !initialFetchDoneRef.current && !isFetchingRef.current) {
           logDebug('Auth Effect: Auth loaded, user signed in, but initial fetch flag still false and not fetching. Retrying fetch.', { currentAuthUserId });
           fetchData();
       }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isSignedIn, isClerkLoaded]); 


  // Effect to monitor Zustand store changes for `syncStatus` update
  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
      logDebug('Change Subscription: Conditions not met (auth not ready or initial fetch not done).', { isClerkLoaded, isSignedIn, currentUserId: userId, initialFetchDone: initialFetchDoneRef.current });
      return;
    }
    if (hashMismatch) {
      logWarn('Change Subscription: Blocked due to hash mismatch. Data is local but potentially conflicting.', { currentUserId: userId });
      
      if (syncStatus !== 'error') setSyncStatus('local'); 
      return;
    }

    logDebug('Change Subscription: Subscribing to store changes...', { currentUserId: userId });
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore,
      
    ];

    const handleChange = () => {
      
      if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
        if (!hasLocalChangesRef.current) {
          logInfo('Change Subscription: First local change detected since last sync.', { currentUserId: userId });
        }
        hasLocalChangesRef.current = true;
        
        if (syncStatus === 'synced' || syncStatus === 'idle') {
          setSyncStatus('local');
          logInfo('Change Subscription: Status changed to "local" due to store changes.', { currentUserId: userId });
        }
      } else {
        logDebug('Change Subscription: Store change detected, but conditions prevent status change or already local.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch, currentUserId: userId, currentStatus: syncStatus });
      }
    };

    const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

    return () => {
      logDebug('Change Subscription: Unsubscribing from store changes.', { currentUserId: userId });
      unsubscribes.forEach(unsub => unsub());
    };
  }, [
    isClerkLoaded, isSignedIn, userId, syncStatus, hashMismatch, 
  ]);

  // Effect to track changes to `gettingStartedDismissed`
  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
      logDebug('Getting Started Tracker: Conditions not met for tracking.', { isClerkLoaded, isSignedIn, currentUserId: userId, initialFetchDone: initialFetchDoneRef.current });
      return;
    }
     if (hashMismatch) { 
       logWarn('Getting Started Tracker: Change detected, but blocked by hash mismatch.', { gettingStartedDismissed, currentUserId: userId });
       return;
     }

    
    if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
      logDebug('Getting Started Tracker: Change detected.', { gettingStartedDismissed, currentUserId: userId });
      if (!hasLocalChangesRef.current) {
        logInfo('Getting Started Tracker: First local change to dismissal status.', { currentUserId: userId });
      }
      hasLocalChangesRef.current = true;
      if (syncStatus === 'synced' || syncStatus === 'idle') {
        setSyncStatus('local');
        logInfo('Getting Started Tracker: Status changed to "local" due to dismissal state change.', { currentUserId: userId });
      }
    } else {
      logDebug('Getting Started Tracker: Dismissal change detected, but conditions prevent status update or already local.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch, currentUserId: userId, currentStatus: syncStatus });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gettingStartedDismissed]); 


  
  const forceSaveLocal = useCallback(async () => {
    if (!userId || !isSignedIn) {
        toast({ title: 'Error', description: 'Cannot force save without an authenticated user.', variant: 'destructive' });
        return false;
    }
    logWarn('SyncManager: User chose to force save local data, overwriting server.', { userId });
    const success = await saveData(true); 
    if (success) {
      setHashMismatch(false); 
      setIsMismatchDialogOpen(false); 
      toast({ title: 'Conflict Resolved', description: 'Local data successfully saved to the cloud, overwriting server data.' });
      logInfo('Force Save Local: Successful.', { userId });
    } else {
      logError('Force Save Local: Failed.', undefined, { userId });
      
    }
    return success;
  }, [saveData, toast, userId, isSignedIn]);

  
  const forceFetchServer = useCallback(async () => {
     if (!userId || !isSignedIn) {
        toast({ title: 'Error', description: 'Cannot force fetch without an authenticated user.', variant: 'destructive' });
        return false;
    }
    logWarn('SyncManager: User chose to force fetch server data, discarding local changes.', { userId });
    const success = await fetchData(false, true); 
    if (success) {
      setHashMismatch(false); 
      setIsMismatchDialogOpen(false); 
      toast({ title: 'Conflict Resolved', description: 'Server data loaded. Any unsaved local changes were discarded.' });
      logInfo('Force Fetch Server: Successful.', { userId });
    } else {
      logError('Force Fetch Server: Failed.', undefined, { userId });
      
    }
    return success;
  }, [fetchData, toast, userId, isSignedIn]);

  
  const retrySync = useCallback(() => {
    if (!isClerkLoaded) {
      toast({ title: 'Cannot Sync', description: 'Authentication status loading...', variant: 'default' });
      return;
    }
    if (!isSignedIn || !userId) { // Strict check
      toast({ title: 'Cannot Sync', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }

    logInfo('Manual Sync/Retry Triggered.', { currentStatus: syncStatus, hashMismatchState: hashMismatch, userId });

    if (syncStatus === 'error' && hashMismatch) {
      logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', { userId });
      setIsMismatchDialogOpen(true); 
      return;
    }

    
    if (hasLocalChangesRef.current || (syncStatus === 'error' && !hashMismatch)) {
      logInfo('Manual Sync: Local changes or non-mismatch error. Attempting save...', { userId });
      saveData(); 
    } else if (syncStatus === 'synced') {
      
      toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
      fetchData(true); 
    } else if (syncStatus === 'syncing') {
      toast({ title: 'Sync Busy', description: 'Please wait for the current operation to complete.' });
    } else { 
      logInfo('Manual Sync: Default case (e.g., idle or no local changes). Attempting fetch...', { userId });
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
