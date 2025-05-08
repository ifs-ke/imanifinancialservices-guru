// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs'; // Use Clerk's client-side hook
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
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'; // Import logger

// No longer need placeholder ID
// const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';


interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[]; // Add notifications here
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';


export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth(); // Use Clerk's hook

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

  // Get Zustand store actions directly
  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  // Clear all local data (Zustand stores and session storage)
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    logDebug('SyncManager: Clearing local state.', { userId });
    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();
      setGettingStartedDismissedState(false); // Reset getting started guide state

      // Explicitly remove items from session storage
      const storeKeys = ['ifcGuru_transactions', 'ifcGuru_debts', 'ifcGuru_statementItems', 'ifcGuru_budgetItems', 'ifcGuru_weeklyReviews', 'ifcGuru_notifications'];
      storeKeys.forEach(key => {
          try { sessionStorage.removeItem(key); } catch (e) { logWarn(`Failed to remove ${key} from sessionStorage`, { error: e, userId }); }
      });

      logInfo('SyncManager: Local state cleared.', { userId });
      setSyncStatus('local'); // Set status to local after clearing
      setLastSyncTime(null);
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      setHashMismatch(false); // Reset hash mismatch on clear
    } catch (error) {
        logError('Error during clearLocalState', error, { userId });
    } finally {
        isClearingRef.current = false;
    }
  }, [
      userId, getTransactionsState, getDebtState, getStatementState, getBudgetState,
      getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState,
  ]);

  // Fetch data from the server
  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    // Check Clerk auth state *before* proceeding
    if (!isClerkLoaded) {
       logDebug('Fetch Aborted: Clerk not loaded yet.');
       return false; // Clerk is not ready, wait
    }
    if (!isSignedIn || !userId) {
       logDebug('Fetch Aborted: User not signed in.');
       // If the user changed or signed out, ensure local state is cleared
       if (previousUserIdRef.current !== undefined && previousUserIdRef.current !== userId) {
            logInfo('Fetch: User changed or signed out, clearing local state.', { oldUserId: previousUserIdRef.current, newUserId: userId });
            clearLocalState();
            previousUserIdRef.current = userId; // Update previous user ID
       }
       setSyncStatus('local'); // No signed-in user, status is local
       return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Fetch Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId });
      return false;
    }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { userId });
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false); // Reset mismatch flag at the start of fetch

    try {
      // Use standard fetch, Clerk middleware handles auth implicitly
      const response = await fetch('/api/sync');

      if (!response.ok) {
        let errorBody = '';
        let errorMessage = `Fetch failed: ${response.statusText} (Status: ${response.status})`;
        try {
            const parsedError = await response.json();
            if (parsedError && typeof parsedError.error === 'string') {
                errorMessage = parsedError.error; // Use error from JSON body if available
            }
        } catch (parseError) {
             logWarn("Fetch Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId });
             // Keep the original status text error message
        }
        logError(`Fetch API Error ${response.status}: ${errorMessage}`, undefined, { userId });
        throw new Error(errorMessage); // Throw with the detailed error message
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
               setIsMismatchDialogOpen(true); // Open dialog on hash mismatch
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
      getNotificationState().setNotifications(fetchedData.notifications ?? []); // Update notifications store
      getStatementState().setStartDate(fetchedData.startDate ? new Date(fetchedData.startDate) : undefined);
      getStatementState().setEndDate(fetchedData.endDate ? new Date(fetchedData.endDate) : undefined);
      setGettingStartedDismissedState(fetchedData.gettingStartedDismissed ?? false);

      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false;
      logInfo('Fetch: Successfully synced with DB.', { userId });
      if(isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      return true;

    } catch (error: any) {
       logError('Fetch Error:', error, { userId });
      setSyncStatus('error');
       // Improved user-friendly error messaging
       let friendlyErrorMessage = 'Could not load data.';
       if (error.message?.includes('Failed to fetch')) {
           friendlyErrorMessage += ' Network error. Please check connection.';
       } else if (error.message?.includes('Internal Server Error') || error.message?.includes('Failed to fetch') || error.message?.includes('database')) {
           friendlyErrorMessage += ` Server error (${error.message}).`;
       } else {
           friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
       }
       friendlyErrorMessage += ' Using local data if available. Click cloud icon to retry.';
      toast({ title: 'Sync Load Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true; // Mark fetch attempt as done
      logDebug('Fetch: Operation complete.', { userId });
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState,
  ]);


  // Save data to the server
  const saveData = useCallback(async (isForceSave = false) => {
    // Check Clerk auth state *before* proceeding
    if (!isClerkLoaded) {
        logDebug('Save Aborted: Clerk not loaded yet.', { userId });
        return false;
    }
    if (!isSignedIn || !userId) {
        logWarn('Save Aborted: User not signed in.', { userId });
        setSyncStatus('local'); // Cannot save without user
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
        const fetchSuccess = await fetchData(false, false); // Perform fetch WITH hash check
        if (!fetchSuccess) {
            logError('Save Aborted: Pre-save fetch failed. Data might be out of sync or hash mismatch occurred.', undefined, { userId });
            isSavingRef.current = false;
            // Status already set by fetchData (likely 'error' with hashMismatch=true)
            return false;
        }
         logInfo('Save: Pre-save fetch successful, proceeding with save.', { userId });
    } else {
        setHashMismatch(false); // Clear mismatch flag when forcing save
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

      // Use standard fetch, Clerk middleware handles auth implicitly
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
                  errorData.error = parsedError.error; // Use error message from server
              }
          } catch (parseError) {
              logWarn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId });
              // Keep original status text error
          }

        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
            logError('Save API Error 400: Data integrity check failed on server.', undefined, { errorData, userId });
            setHashMismatch(true);
            setSyncStatus('error');
            setIsMismatchDialogOpen(true); // Open dialog on hash mismatch from server
            toast({ title: 'Save Failed: Data Out of Sync', description: "Data conflicts with server. Resolve using the cloud icon.", variant: 'destructive' });
        } else if (response.status === 401) {
             logError('Save API Error 401: Unauthorized.', undefined, { errorData, userId });
             setSyncStatus('error'); // Set status to error
             toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please try refreshing the page or logging in again.', variant: 'destructive' });
        } else if (response.status === 429) {
             logWarn('Save API Error 429: Rate limit exceeded.', { userId });
             setSyncStatus('error'); // Keep status as error
             toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
         }
        else {
            logError(`Save API Error ${response.status}: ${errorData.error}`, undefined, { userId });
            throw new Error(errorData.error); // Throw with best available message
        }
        isSavingRef.current = false;
        return false;
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false; // Reset local changes flag after successful save
      logInfo(`Save Successful. Server: ${result.message}`, { userId });
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
       logError('Save Error:', error, { userId });
      setSyncStatus('error'); // Set status to error, but don't set hashMismatch here
       // Improved user-friendly error messaging
       let friendlyErrorMessage = 'Could not save data.';
       if (error.message?.includes('Failed to fetch')) {
           friendlyErrorMessage += ' Network error. Please check connection.';
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
    getWeeklyReviewState, fetchData, // Pass fetchData as dependency
  ]);

  // Effect to handle user sign-in/sign-out and initial fetch
  useEffect(() => {
    if (!isClerkLoaded) {
        logDebug('Auth Effect: Clerk state not ready.');
        return;
    }

    const currentUserId = userId; // Consistent local var

    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      logInfo(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}). Clearing state and fetching.`);
      clearLocalState(); // Clear state for the NEW user BEFORE fetching
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false; // Reset initial fetch flag for new user
      logDebug('Auth Effect: Triggering initial fetch...');
      fetchData();
    } else if (!currentUserId && previousUserIdRef.current) {
      // User signed out
      logInfo(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`);
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      setSyncStatus('local'); // No user, data is local
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
       // Initial load, no active user session.
       logInfo('Auth Effect: Initial load, no active user session.');
       setSyncStatus('local'); // No user initially
       previousUserIdRef.current = null;
       initialFetchDoneRef.current = true; // Mark initial "fetch" (non-fetch) as done
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
       // Handles page refresh where user is already logged in
       logInfo('Auth Effect: User session exists, but initial fetch needed. Triggering fetch...');
       fetchData();
    } else {
       logDebug('Auth Effect: No significant auth change.');
       // Make sure the initial fetch is marked done if we are loaded and signed in
       if (isClerkLoaded && isSignedIn && !initialFetchDoneRef.current) {
           logDebug('Auth Effect: Marking initial fetch done as Clerk is loaded and user is signed in.');
           initialFetchDoneRef.current = true;
       }
    }

  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState]);


  // Effect to subscribe to store changes and update status/flags
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
        useBudgetStore, useWeeklyReviewStore, // useNotificationStore removed as notifications usually don't trigger saves
      ];

      const handleChange = () => {
          if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
              if (!hasLocalChangesRef.current) {
                  logInfo('Change Subscription: First local change detected since last sync.', { userId });
              }
              hasLocalChangesRef.current = true;
              if (syncStatus === 'synced' || syncStatus === 'idle') { // Change from idle too
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

  // Effect to track changes to getting started state
   useEffect(() => {
       if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
           logDebug('Getting Started Tracker: Conditions not met.', { isClerkLoaded, isSignedIn, userId, initialFetchDone: initialFetchDoneRef.current });
           return;
       }
        if (hashMismatch) {
           logWarn('Getting Started Tracker: Blocked due to hash mismatch.', { userId });
           return;
       }

       if (!isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
           if (!hasLocalChangesRef.current) {
                logInfo('Getting Started Tracker: First local change detected.', { userId });
           }
           hasLocalChangesRef.current = true;
           if (syncStatus === 'synced' || syncStatus === 'idle') {
               setSyncStatus('local');
                logInfo('Getting Started Tracker: Status changed to "local".', { userId });
           }
       } else {
            logDebug('Getting Started Tracker: Change detected, but conditions prevent status change.', { isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch, userId });
       }
   }, [gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, initialFetchDoneRef, hashMismatch, syncStatus]);


   // Function to force save local data (overwrites server)
   const forceSaveLocal = useCallback(async () => {
       logWarn('SyncManager: User chose to force save local data.', { userId });
       const success = await saveData(true); // Pass true to force save
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force save
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Local data saved to cloud.' });
           logInfo('Force Save Local: Successful.', { userId });
       } else {
           logError('Force Save Local: Failed.', undefined, { userId });
           // Keep dialog open, error toast shown by saveData
       }
       return success; // Return success status
   }, [saveData, toast, userId]);

   // Function to force fetch server data (discards local changes)
   const forceFetchServer = useCallback(async () => {
       logWarn('SyncManager: User chose to force fetch server data.', { userId });
       const success = await fetchData(false, true); // Skip hash check on force fetch
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force fetch
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Server data loaded, local changes discarded.' });
           logInfo('Force Fetch Server: Successful.', { userId });
       } else {
           logError('Force Fetch Server: Failed.', undefined, { userId });
           // Keep dialog open, error toast shown by fetchData
       }
       return success; // Return success status
   }, [fetchData, toast, userId]);

   // Manual retry/sync trigger function
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
            saveData(); // saveData includes pre-fetch check
       }
       else if (syncStatus === 'synced') {
           toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
           fetchData(true); // Force a re-fetch to confirm/update
       }
       else if (syncStatus === 'syncing') {
           toast({ title: 'Sync Busy', description: 'Please wait for the current operation.' });
       }
       else {
           logInfo('Manual Sync: Default case (e.g., idle), attempting fetch...', { userId });
           fetchData(true);
       }
   }, [syncStatus, hashMismatch, saveData, fetchData, toast, isSignedIn, userId, isClerkLoaded]);


  // Return state and actions
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
