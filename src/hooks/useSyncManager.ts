// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
// import { useAuth } from '@clerk/nextjs'; // Clerk disabled
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
// Logger removed

// Consistent placeholder ID when Clerk is disabled
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';


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
  // const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth(); // Clerk disabled
  const isSignedIn = true; // Mock signed-in state
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder
  const isClerkLoaded = true; // Mock loaded state

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
    // console.log('SyncManager: Clearing local state.', { userId }); // Console log commented out
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
          try { sessionStorage.removeItem(key); } catch (e) { /* console.warn(`Failed to remove ${key} from sessionStorage`, { error: e, userId }); */ } // Console log commented out
      });

      // console.log('SyncManager: Local state cleared.', { userId }); // Console log commented out
      setSyncStatus('local'); // Set status to local after clearing
      setLastSyncTime(null);
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      setHashMismatch(false); // Reset hash mismatch on clear
    } catch (error) {
        // console.error('Error during clearLocalState', { error, userId }); // Console log commented out
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
       // console.debug('Fetch Aborted: Clerk not loaded yet.'); // Console log commented out
       return false; // Clerk is not ready, wait
    }
    if (!isSignedIn || !userId) {
       // console.debug('Fetch Aborted: User not signed in.'); // Console log commented out
       // If the user changed or signed out, ensure local state is cleared
       if (previousUserIdRef.current !== undefined && previousUserIdRef.current !== userId) {
            // console.info('Fetch: User changed or signed out, clearing local state.', { oldUserId: previousUserIdRef.current, newUserId: userId }); // Console log commented out
            clearLocalState();
            previousUserIdRef.current = userId; // Update previous user ID
       }
       setSyncStatus('local'); // No signed-in user, status is local
       return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      // console.debug('Fetch Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId }); // Console log commented out
      return false;
    }

    // console.log(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, { userId }); // Console log commented out
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false); // Reset mismatch flag at the start of fetch

    try {
      // Use standard fetch, Clerk middleware handles auth implicitly
      const response = await fetch('/api/sync');

      if (!response.ok) {
        let errorMessage = `Fetch failed: ${response.statusText} (Status: ${response.status})`;
        try {
            const parsedError = await response.json();
            if (parsedError && typeof parsedError.error === 'string') {
                errorMessage = `Fetch failed: ${parsedError.error} (Status: ${response.status})`; // Use error from JSON body if available
            }
        } catch (parseError) {
             // console.warn("Fetch Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId }); // Console log commented out
             // Keep the original status text error message
        }
        // console.error(`Fetch API Error ${response.status}: ${errorMessage}`, { userId }); // Console log commented out
        throw new Error(errorMessage); // Throw with the detailed error message
      }


      const data: SyncedData & { dataHash?: string } = await response.json();
      // console.debug('Fetch: Received data from server.', { userId }); // Console log commented out
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck) {
          if (!dataHash) {
             // console.warn('Fetch Warning: No dataHash received from server. Skipping integrity check.', { userId }); // Console log commented out
           } else {
             const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
             const dataString = stringify(preparedDataToVerify);
             // console.debug(`Fetch: Verifying received hash: ${dataHash}`, { userId }); // Console log commented out
             const isValid = await verifyHash(dataString, dataHash);

             if (!isValid) {
                // console.error('Fetch Error: Data integrity check failed!', { serverHash: dataHash, clientHashCalculationInputTruncated: dataString.substring(0, 200), userId }); // Console log commented out
               setHashMismatch(true);
               setSyncStatus('error');
               setIsMismatchDialogOpen(true); // Open dialog on hash mismatch
               toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Please resolve the conflict.", variant: 'destructive' });
               return false;
             }
              // console.debug('Fetch: Data integrity check passed.', { userId }); // Console log commented out
           }
      } else {
          // console.info('Fetch: Skipping hash check as requested (Force Fetch).', { userId }); // Console log commented out
      }

      // console.info('Fetch: Overwriting local stores with fetched data...', { userId }); // Console log commented out
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
      // console.info('Fetch: Successfully synced with DB.', { userId }); // Console log commented out
      if(isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      return true;

    } catch (error: any) {
       // console.error('Fetch Error:', error, { userId }); // Console log commented out
      setSyncStatus('error');
       // Improved user-friendly error messaging
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
      initialFetchDoneRef.current = true; // Mark fetch attempt as done
      // console.debug('Fetch: Operation complete.', { userId }); // Console log commented out
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
        // console.debug('Save Aborted: Clerk not loaded yet.', { userId }); // Console log commented out
        return false;
    }
    if (!isSignedIn || !userId) {
        // console.warn('Save Aborted: User not signed in.', { userId }); // Console log commented out
        setSyncStatus('local'); // Cannot save without user
        return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
        // console.debug('Save Aborted: Operation already in progress.', { isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, userId }); // Console log commented out
        return false;
    }

    // console.log(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, { userId }); // Console log commented out
    setSyncStatus('syncing');
    isSavingRef.current = true;

    if (!isForceSave) {
        // console.info('Save: Fetching latest data before saving to check for conflicts...', { userId }); // Console log commented out
        // Important: Fetch WITHOUT skipping hash check to detect conflicts before overwriting
        const fetchSuccess = await fetchData(false, false);
        if (!fetchSuccess) {
            // console.error('Save Aborted: Pre-save fetch failed. Data might be out of sync or hash mismatch occurred.', { userId }); // Console log commented out
            isSavingRef.current = false;
            // Status already set by fetchData (likely 'error' with hashMismatch=true)
            return false;
        }
         // console.info('Save: Pre-save fetch successful, proceeding with save.', { userId }); // Console log commented out
    } else {
        setHashMismatch(false); // Clear mismatch flag when forcing save
         // console.info('Save: Force save initiated, skipping pre-fetch check.', { userId }); // Console log commented out
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
      // console.debug(`Save Client: Calculated client hash: ${dataHash}`, { userId }); // Console log commented out

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
                  errorData.error = `Save failed: ${parsedError.error} (Status: ${response.status})`; // Prepend context
              }
          } catch (parseError) {
              // console.warn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError, userId }); // Console log commented out
              // Keep original status text error
          }

        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
            // console.error('Save API Error 400: Data integrity check failed on server.', { errorData, userId }); // Console log commented out
            setHashMismatch(true);
            setSyncStatus('error');
            setIsMismatchDialogOpen(true); // Open dialog on hash mismatch from server
            toast({ title: 'Save Failed: Data Conflict', description: "Server data changed since last sync. Resolve using the cloud icon.", variant: 'destructive' });
        } else if (response.status === 401) {
             // console.error('Save API Error 401: Unauthorized.', { errorData, userId }); // Console log commented out
             setSyncStatus('error'); // Set status to error
             toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please refresh or log in again.', variant: 'destructive' });
        } else if (response.status === 429) {
             // console.warn('Save API Error 429: Rate limit exceeded.', { userId }); // Console log commented out
             setSyncStatus('error'); // Keep status as error
             toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
         } else {
            // console.error(`Save API Error ${response.status}: ${errorData.error}`, { userId }); // Console log commented out
            throw new Error(errorData.error); // Throw with best available message
        }
        isSavingRef.current = false;
        return false;
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false; // Reset local changes flag after successful save
      // console.info(`Save Successful. Server: ${result.message}`, { userId }); // Console log commented out
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
       // console.error('Save Error:', error, { userId }); // Console log commented out
      setSyncStatus('error'); // Set status to error, but don't set hashMismatch here
       // Improved user-friendly error messaging
       let friendlyErrorMessage = 'Could not save data.';
        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
           friendlyErrorMessage = 'Could not save data: Network error. Please check connection.';
       } else if (error.message?.includes('integrity check failed')) {
           friendlyErrorMessage = `Save failed: ${error.message}.`; // Show the integrity check error directly
           setHashMismatch(true); // Ensure mismatch state is set
           setIsMismatchDialogOpen(true);
       } else {
           friendlyErrorMessage += ` An unknown error occurred (${error.message || String(error)}).`;
       }
      friendlyErrorMessage += ' Changes remain locally. Click cloud icon to retry.';
      toast({ title: 'Sync Save Failed', description: friendlyErrorMessage, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
      // console.debug('Save: Operation complete.', { userId }); // Console log commented out
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, gettingStartedDismissed,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, fetchData, // Pass fetchData as dependency
  ]);

  // Effect to handle user sign-in/sign-out and initial fetch
  useEffect(() => {
    if (!isClerkLoaded) {
        // console.debug('Auth Effect: Clerk state not ready.'); // Console log commented out
        return;
    }

    const currentUserId = userId; // Consistent local var

    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      // console.info(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}). Clearing state and fetching.`); // Console log commented out
      clearLocalState(); // Clear state for the NEW user BEFORE fetching
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false; // Reset initial fetch flag for new user
      // console.debug('Auth Effect: Triggering initial fetch...'); // Console log commented out
      fetchData();
    } else if (!currentUserId && previousUserIdRef.current) {
      // User signed out
      // console.info(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`); // Console log commented out
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      setSyncStatus('local'); // No user, data is local
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
       // Initial load, no active user session.
       // console.info('Auth Effect: Initial load, no active user session.'); // Console log commented out
       setSyncStatus('local'); // No user initially
       previousUserIdRef.current = null;
       initialFetchDoneRef.current = true; // Mark initial "fetch" (non-fetch) as done
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
       // Handles page refresh where user is already logged in but fetch hasn't run
       // console.info('Auth Effect: User session exists, but initial fetch needed. Triggering fetch...'); // Console log commented out
       fetchData();
    } else {
       // console.debug('Auth Effect: No significant auth change.'); // Console log commented out
       // Make sure the initial fetch is marked done if we are loaded and signed in
       if (isClerkLoaded && isSignedIn && !initialFetchDoneRef.current) {
           // console.debug('Auth Effect: Marking initial fetch done as Clerk is loaded and user is signed in.'); // Console log commented out
           initialFetchDoneRef.current = true;
       }
    }

  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState]);


  // Effect to subscribe to store changes and update status/flags
  useEffect(() => {
      if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
          // console.debug('Change Subscription: Conditions not met.', { isClerkLoaded, isSignedIn, userId, initialFetchDone: initialFetchDoneRef.current }); // Console log commented out
          return;
      }
      if (hashMismatch) {
          // console.warn('Change Subscription: Blocked due to hash mismatch.', { userId }); // Console log commented out
          return;
      }

      // console.debug('Change Subscription: Subscribing to store changes...', { userId }); // Console log commented out
      const storesToWatch = [
        useTransactionsStore, useDebtStore, useStatementStore,
        useBudgetStore, useWeeklyReviewStore, // useNotificationStore removed as notifications usually don't trigger saves
      ];

      const handleChange = () => {
          if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
              if (!hasLocalChangesRef.current) {
                  // console.info('Change Subscription: First local change detected since last sync.', { userId }); // Console log commented out
              }
              hasLocalChangesRef.current = true;
              if (syncStatus === 'synced' || syncStatus === 'idle') { // Change from idle too
                 setSyncStatus('local');
                 // console.info('Change Subscription: Status changed to "local" due to changes.', { userId }); // Console log commented out
              }
          } else {
               // console.debug('Change Subscription: Store change detected, but conditions prevent status change.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch, userId }); // Console log commented out
          }
      };

      const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

      return () => {
        // console.debug('Change Subscription: Unsubscribing.', { userId }); // Console log commented out
        unsubscribes.forEach(unsub => unsub());
      };
  }, [
      isClerkLoaded, isSignedIn, userId, initialFetchDoneRef.current,
      syncStatus, hashMismatch,
  ]);

  // Effect to track changes to getting started state
   useEffect(() => {
       if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
           // console.debug('Getting Started Tracker: Conditions not met.', { isClerkLoaded, isSignedIn, userId, initialFetchDone: initialFetchDoneRef.current }); // Console log commented out
           return;
       }
        if (hashMismatch) {
           // console.warn('Getting Started Tracker: Blocked due to hash mismatch.', { userId }); // Console log commented out
           return;
       }

       // Only track changes if the initial fetch is done and no operations are in progress
        if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
            // console.debug('Getting Started Tracker: Change detected.', { gettingStartedDismissed, userId }); // Console log commented out
            if (!hasLocalChangesRef.current) {
                 // console.info('Getting Started Tracker: First local change detected.', { userId }); // Console log commented out
            }
            hasLocalChangesRef.current = true;
            if (syncStatus === 'synced' || syncStatus === 'idle') {
                setSyncStatus('local');
                 // console.info('Getting Started Tracker: Status changed to "local".', { userId }); // Console log commented out
            }
        } else {
             // console.debug('Getting Started Tracker: Change detected, but conditions prevent status change.', { initialFetchDone: initialFetchDoneRef.current, isFetching: isFetchingRef.current, isSaving: isSavingRef.current, isClearing: isClearingRef.current, hashMismatch, userId }); // Console log commented out
        }
   }, [gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, initialFetchDoneRef, hashMismatch, syncStatus]);


   // Function to force save local data (overwrites server)
   const forceSaveLocal = useCallback(async () => {
       // console.warn('SyncManager: User chose to force save local data.', { userId }); // Console log commented out
       const success = await saveData(true); // Pass true to force save
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force save
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Local data successfully saved to the cloud, overwriting server data.' });
           // console.info('Force Save Local: Successful.', { userId }); // Console log commented out
       } else {
           // console.error('Force Save Local: Failed.', { userId }); // Console log commented out
           // Keep dialog open, error toast shown by saveData
            toast({ title: 'Force Save Failed', description: 'Could not overwrite cloud data. Check connection or logs.', variant: 'destructive' });
       }
       return success; // Return success status
   }, [saveData, toast, userId]);

   // Function to force fetch server data (discards local changes)
   const forceFetchServer = useCallback(async () => {
       // console.warn('SyncManager: User chose to force fetch server data.', { userId }); // Console log commented out
       const success = await fetchData(false, true); // Skip hash check on force fetch
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force fetch
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Server data loaded. Any unsaved local changes were discarded.' });
           // console.info('Force Fetch Server: Successful.', { userId }); // Console log commented out
       } else {
           // console.error('Force Fetch Server: Failed.', { userId }); // Console log commented out
           // Keep dialog open, error toast shown by fetchData
           toast({ title: 'Force Fetch Failed', description: 'Could not load data from the cloud. Check connection or logs.', variant: 'destructive' });
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
       // console.info('Manual Sync/Retry Triggered.', { currentStatus: syncStatus, hashMismatch, userId }); // Console log commented out

       if (syncStatus === 'error' && hashMismatch) {
            // console.warn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', { userId }); // Console log commented out
            setIsMismatchDialogOpen(true); // Directly open the dialog if there's a mismatch
            return;
       }

        // If status is local (meaning there are local changes) or error without mismatch, attempt save
        if (syncStatus === 'local' || (syncStatus === 'error' && !hashMismatch)) {
            // console.info('Manual Sync: Status is local or error (no mismatch). Attempting save...', { userId }); // Console log commented out
            saveData(); // saveData includes pre-fetch check
        }
        // If status is synced, maybe user wants to ensure they have the latest? Fetch again.
        else if (syncStatus === 'synced') {
            toast({ title: 'Checking for Updates', description: 'Fetching latest data from cloud...' });
            fetchData(true); // Pass true to indicate it's a retry/refresh
        }
        // If already syncing, inform the user
        else if (syncStatus === 'syncing') {
            toast({ title: 'Sync Busy', description: 'Please wait for the current operation.' });
        }
        // Default/idle case: Fetch data
        else {
            // console.info('Manual Sync: Default case (e.g., idle), attempting fetch...', { userId }); // Console log commented out
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
