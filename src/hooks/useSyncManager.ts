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
// Logger removed

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
    // console.log('SyncManager: Clearing local state.'); // Console log commented out
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
          try { sessionStorage.removeItem(key); } catch (e) { /* console.warn(`Failed to remove ${key} from sessionStorage`, { error: e }); */ } // Console log commented out
      });

      // console.log('SyncManager: Local state cleared.'); // Console log commented out
      setSyncStatus('local'); // Set status to local after clearing
      setLastSyncTime(null);
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      setHashMismatch(false); // Reset hash mismatch on clear
    } catch (error) {
        // console.error('Error during clearLocalState', { error }); // Console log commented out
    } finally {
        isClearingRef.current = false;
    }
  }, [
      getTransactionsState, getDebtState, getStatementState, getBudgetState,
      getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState,
  ]);

  // Fetch data from the server
  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    // Check Clerk auth state *before* proceeding
    if (!isClerkLoaded) {
       // console.log('Fetch Aborted: Clerk not loaded yet.'); // Console log commented out
       return false; // Clerk is not ready, wait
    }
    if (!isSignedIn || !userId) {
       // console.log('Fetch Aborted: User not signed in.'); // Console log commented out
       // If the user changed or signed out, ensure local state is cleared
       if (previousUserIdRef.current !== undefined && previousUserIdRef.current !== userId) {
            clearLocalState();
            previousUserIdRef.current = userId; // Update previous user ID
       }
       setSyncStatus('local'); // No signed-in user, status is local
       return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      // console.log('Fetch Aborted: Operation already in progress.'); // Console log commented out
      return false;
    }

    // console.log(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`); // Console log commented out
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false); // Reset mismatch flag at the start of fetch

    try {
      // Use standard fetch, Clerk middleware handles auth implicitly
      const response = await fetch('/api/sync');

      if (!response.ok) {
        let errorData = { error: `Fetch failed: ${response.statusText} (Status: ${response.status})` };
        try {
            const parsedError = await response.json();
            if (parsedError && typeof parsedError.error === 'string') {
                errorData.error = parsedError.error;
            }
        } catch (parseError) {
             // console.warn("Fetch Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError }); // Console log commented out
             errorData.error = `Fetch failed: ${response.statusText} (Status: ${response.status}, failed to parse error response)`;
        }
        // console.error(`Fetch API Error ${response.status}: ${errorData.error}`); // Console log commented out
        throw new Error(errorData.error);
      }


      const data: SyncedData & { dataHash?: string } = await response.json();
      // console.log('Fetch: Received data from server.'); // Console log commented out
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck) {
          if (!dataHash) {
             // console.warn('Fetch Warning: No dataHash received from server. Skipping integrity check.'); // Console log commented out
           } else {
             const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
             const dataString = stringify(preparedDataToVerify);
             // console.log(`Fetch: Verifying received hash: ${dataHash}`); // Console log commented out
             const isValid = await verifyHash(dataString, dataHash);

             if (!isValid) {
                // console.error('Fetch Error: Data integrity check failed!', { serverHash: dataHash, clientHashCalculationInputTruncated: dataString.substring(0, 200) }); // Console log commented out
               setHashMismatch(true);
               setSyncStatus('error');
               setIsMismatchDialogOpen(true); // Open dialog on hash mismatch
               toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Please resolve the conflict.", variant: 'destructive' });
               return false;
             }
              // console.log('Fetch: Data integrity check passed.'); // Console log commented out
           }
      } else {
          // console.log('Fetch: Skipping hash check as requested (Force Fetch).'); // Console log commented out
      }

      // console.log('Fetch: Overwriting local stores with fetched data...'); // Console log commented out
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
      // console.log('Fetch: Successfully synced with DB.'); // Console log commented out
      if(isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      return true;

    } catch (error: any) {
       // console.error('Fetch Error:', { error, message: error.message }); // Console log commented out
      setSyncStatus('error');
       const friendlyErrorMessage = error.message?.includes('Fetch failed:')
         ? error.message
         : error.message?.includes('Failed to fetch')
         ? 'Network error. Please check your connection.'
         : `An unknown error occurred: ${error.message || String(error)}`; // Include original error if possible
      toast({ title: 'Sync Load Failed', description: `Could not load data: ${friendlyErrorMessage}. Using local data if available. Click cloud icon to retry.`, variant: 'destructive' });
      return false;
    } finally {
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true; // Mark fetch attempt as done
      // console.log('Fetch: Operation complete.'); // Console log commented out
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
        // console.log('Save Aborted: Clerk not loaded yet.'); // Console log commented out
        return false;
    }
    if (!isSignedIn || !userId) {
        // console.log('Save Aborted: User not signed in.'); // Console log commented out
        setSyncStatus('local'); // Cannot save without user
        return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
        // console.log('Save Aborted: Operation already in progress.'); // Console log commented out
        return false;
    }

    // console.log(`Save Triggered${isForceSave ? ' (Force)' : ''}...`); // Console log commented out
    setSyncStatus('syncing');
    isSavingRef.current = true;

    if (!isForceSave) {
        // console.log('Save: Fetching latest data before saving to check for conflicts...'); // Console log commented out
        const fetchSuccess = await fetchData(false, false); // Perform fetch WITH hash check
        if (!fetchSuccess) {
            // console.error('Save Aborted: Pre-save fetch failed. Data might be out of sync or hash mismatch occurred.'); // Console log commented out
            isSavingRef.current = false;
            // Status already set by fetchData (likely 'error' with hashMismatch=true)
            return false;
        }
         // console.log('Save: Pre-save fetch successful, proceeding with save.'); // Console log commented out
    } else {
        setHashMismatch(false); // Clear mismatch flag when forcing save
         // console.log('Save: Force save initiated, skipping pre-fetch check.'); // Console log commented out
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
      // console.log(`Save Client: Calculated client hash: ${dataHash}`); // Console log commented out

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
                  errorData.error = parsedError.error;
              }
          } catch (parseError) {
              // console.warn("Save Error: Failed to parse error response body as JSON.", { status: response.status, statusText: response.statusText, parseError }); // Console log commented out
              errorData.error = `Save failed: ${response.statusText} (Status: ${response.status}, failed to parse error response)`;
          }

        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
            // console.error('Save API Error 400: Data integrity check failed on server.', { errorData }); // Console log commented out
            setHashMismatch(true);
            setSyncStatus('error');
            setIsMismatchDialogOpen(true); // Open dialog on hash mismatch from server
            toast({ title: 'Save Failed: Data Out of Sync', description: "Data conflicts with server. Resolve using the cloud icon.", variant: 'destructive' });
        } else if (response.status === 401) {
             // Handle unauthorized specifically
             // console.error('Save API Error 401: Unauthorized.', { errorData }); // Console log commented out
             setSyncStatus('error'); // Set status to error
             toast({ title: 'Save Failed: Unauthorized', description: 'Your session may have expired. Please try refreshing the page or logging in again.', variant: 'destructive' });
        } else if (response.status === 429) {
             // console.warn('Save API Error 429: Rate limit exceeded.'); // Console log commented out
             setSyncStatus('error'); // Keep status as error
             toast({ title: 'Save Failed: Too Many Requests', description: "Please wait a moment and try saving again.", variant: 'destructive' });
         }
        else {
            // console.error(`Save API Error ${response.status}: ${errorData.error}`); // Console log commented out
            throw new Error(errorData.error); // Throw with best available message
        }
        isSavingRef.current = false;
        return false;
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false; // Reset local changes flag after successful save
      // console.log(`Save Successful. Server: ${result.message}`); // Console log commented out
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
       // console.error('Save Error:', { error, message: error.message }); // Console log commented out
      setSyncStatus('error'); // Set status to error, but don't set hashMismatch here
       const friendlyErrorMessage = error.message?.includes('Save failed:')
         ? error.message
         : error.message?.includes('Failed to fetch')
         ? 'Network error. Please check your connection.'
         : `An unknown error occurred: ${error.message || String(error)}`; // Include original error if possible
      toast({ title: 'Sync Save Failed', description: `Could not save data: ${friendlyErrorMessage}. Changes remain locally. Click cloud icon to retry.`, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
      // console.log('Save: Operation complete.'); // Console log commented out
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, gettingStartedDismissed,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, fetchData, // Pass fetchData as dependency
  ]);

  // Effect to handle user sign-in/sign-out and initial fetch
  useEffect(() => {
    if (!isClerkLoaded) {
        // console.log('Auth Effect: Clerk state not ready.'); // Console log commented out
        return;
    }

    const currentUserId = userId; // Consistent local var

    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      // console.log(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}). Clearing state and fetching.`); // Console log commented out
      clearLocalState(); // Clear state for the NEW user BEFORE fetching
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false; // Reset initial fetch flag for new user
      // console.log('Auth Effect: Triggering initial fetch...'); // Console log commented out
      fetchData();
    } else if (!currentUserId && previousUserIdRef.current) {
      // User signed out
      // console.log(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`); // Console log commented out
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      setSyncStatus('local'); // No user, data is local
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
       // Initial load, no active user session.
       // console.log('Auth Effect: Initial load, no active user session.'); // Console log commented out
       setSyncStatus('local'); // No user initially
       previousUserIdRef.current = null;
       initialFetchDoneRef.current = true; // Mark initial "fetch" (non-fetch) as done
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
       // Handles page refresh where user is already logged in
       // console.log('Auth Effect: User session exists, but initial fetch needed. Triggering fetch...'); // Console log commented out
       fetchData();
    } else {
       // console.log('Auth Effect: No significant auth change.'); // Console log commented out
       // Make sure the initial fetch is marked done if we are loaded and signed in
       if (isClerkLoaded && isSignedIn && !initialFetchDoneRef.current) {
           // console.log('Auth Effect: Marking initial fetch done as Clerk is loaded and user is signed in.'); // Console log commented out
           initialFetchDoneRef.current = true;
       }
    }

  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState]);


  // Effect to subscribe to store changes and update status/flags
  useEffect(() => {
      if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
          // console.log('Change Subscription: Conditions not met.'); // Console log commented out
          return;
      }
      if (hashMismatch) {
          // console.warn('Change Subscription: Blocked due to hash mismatch.'); // Console log commented out
          return;
      }

      // console.log('Change Subscription: Subscribing to store changes...'); // Console log commented out
      const storesToWatch = [
        useTransactionsStore, useDebtStore, useStatementStore,
        useBudgetStore, useWeeklyReviewStore, // useNotificationStore removed as notifications usually don't trigger saves
      ];

      const handleChange = () => {
          if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
              if (!hasLocalChangesRef.current) {
                  // console.log('Change Subscription: First local change detected since last sync.'); // Console log commented out
              }
              hasLocalChangesRef.current = true;
              if (syncStatus === 'synced' || syncStatus === 'idle') { // Change from idle too
                 setSyncStatus('local');
                 // console.log('Change Subscription: Status changed to "local" due to changes.'); // Console log commented out
              }
          } else {
               // console.log('Change Subscription: Store change detected, but conditions prevent status change.'); // Console log commented out
          }
      };

      const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

      return () => {
        // console.log('Change Subscription: Unsubscribing.'); // Console log commented out
        unsubscribes.forEach(unsub => unsub());
      };
  }, [
      isClerkLoaded, isSignedIn, userId, initialFetchDoneRef.current,
      syncStatus, hashMismatch,
  ]);

  // Effect to track changes to getting started state
   useEffect(() => {
       if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
           // console.log('Getting Started Tracker: Conditions not met.'); // Console log commented out
           return;
       }
        if (hashMismatch) {
           // console.warn('Getting Started Tracker: Blocked due to hash mismatch.'); // Console log commented out
           return;
       }

       if (!isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
           if (!hasLocalChangesRef.current) {
                // console.log('Getting Started Tracker: First local change detected.'); // Console log commented out
           }
           hasLocalChangesRef.current = true;
           if (syncStatus === 'synced' || syncStatus === 'idle') {
               setSyncStatus('local');
                // console.log('Getting Started Tracker: Status changed to "local".'); // Console log commented out
           }
       } else {
            // console.log('Getting Started Tracker: Change detected, but conditions prevent status change.'); // Console log commented out
       }
   }, [gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, initialFetchDoneRef, hashMismatch, syncStatus]);


   // Function to force save local data (overwrites server)
   const forceSaveLocal = useCallback(async () => {
       // console.warn('SyncManager: User chose to force save local data.'); // Console log commented out
       const success = await saveData(true); // Pass true to force save
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force save
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Local data saved to cloud.' });
           // console.log('Force Save Local: Successful.'); // Console log commented out
       } else {
           // console.error('Force Save Local: Failed.'); // Console log commented out
           // Keep dialog open, error toast shown by saveData
       }
       return success; // Return success status
   }, [saveData, toast]);

   // Function to force fetch server data (discards local changes)
   const forceFetchServer = useCallback(async () => {
       // console.warn('SyncManager: User chose to force fetch server data.'); // Console log commented out
       const success = await fetchData(false, true); // Skip hash check on force fetch
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force fetch
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Server data loaded, local changes discarded.' });
           // console.log('Force Fetch Server: Successful.'); // Console log commented out
       } else {
           // console.error('Force Fetch Server: Failed.'); // Console log commented out
           // Keep dialog open, error toast shown by fetchData
       }
       return success; // Return success status
   }, [fetchData, toast]);

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
       // console.log('Manual Sync/Retry Triggered.'); // Console log commented out

       if (syncStatus === 'error' && hashMismatch) {
            // console.warn('Manual Retry: Hash mismatch detected. Opening resolution dialog.'); // Console log commented out
            setIsMismatchDialogOpen(true);
            return;
       }

       if (syncStatus === 'local' || (syncStatus === 'error' && !hashMismatch)) {
            // console.log('Manual Sync: Status is local or error (no mismatch). Attempting save...'); // Console log commented out
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
           // console.log('Manual Sync: Default case (e.g., idle), attempting fetch...'); // Console log commented out
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
