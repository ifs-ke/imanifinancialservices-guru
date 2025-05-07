
// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
// import { useAuth } from '@clerk/nextjs/client'; // Clerk disabled
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
import { logInfo, logWarn, logError } from '@/lib/logger';

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

const SAVE_DEBOUNCE_DELAY = 3000; // 3 seconds
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';

export function useSyncManager() {
  // const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth(); // Clerk disabled
  const isSignedIn = true; // Assume signed in when Clerk is disabled
  const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder
  const isClerkLoaded = true; // Assume loaded

  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissedState] = useState(false);
  const [hashMismatch, setHashMismatch] = useState(false);

  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(undefined); // Track the user ID to detect changes/logout
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLocalChangesRef = useRef(false); // Track if changes were made since last sync

  // Get Zustand store actions directly
  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  const logContext = useCallback(() => ({ userId: userId || 'unknown', syncStatus }), [userId, syncStatus]);

  // Clear all local data (Zustand stores and session storage)
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing local state.', logContext());
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
          try { sessionStorage.removeItem(key); } catch (e) { logWarn(`Failed to remove ${key} from sessionStorage`, { ...logContext(), error: e }); }
      });

      logInfo('SyncManager: Local state cleared.', logContext());
      setSyncStatus('local'); // Set status to local after clearing
      setLastSyncTime(null);
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      setHashMismatch(false); // Reset hash mismatch on clear
    } catch (error) {
        logError('Error during clearLocalState', error, logContext());
    } finally {
        isClearingRef.current = false;
    }
  }, [
      getTransactionsState, getDebtState, getStatementState, getBudgetState,
      getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState, logContext
  ]);

  // Fetch data from the server
  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    if (!isSignedIn || !userId || !isClerkLoaded) { // Check conditions even if Clerk disabled (uses placeholder)
       logInfo('Fetch Aborted: User state invalid.', logContext());
       if (previousUserIdRef.current) clearLocalState(); // Clear if there was a previous user
       setSyncStatus('local');
       return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logInfo('Fetch Aborted: Operation already in progress.', logContext());
      return false;
    }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, logContext());
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false); // Reset mismatch before fetch attempt

    try {
      const response = await fetch('/api/sync');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        const serverErrorMessage = errorData.error || `Fetch failed: ${response.statusText}`;
        logError(`Fetch API Error ${response.status}: ${response.statusText}`, errorData, logContext());
        throw new Error(serverErrorMessage);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      logInfo('Fetch: Received data from server.', logContext());
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck) {
          if (!dataHash) {
             logWarn('Fetch Warning: No dataHash received from server. Skipping integrity check.', logContext());
           } else {
             // Prepare fetched data for hash verification on the client
             const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
             const dataString = stringify(preparedDataToVerify);
             logInfo(`Fetch: Verifying received hash: ${dataHash}`, logContext());
             const isValid = await verifyHash(dataString, dataHash);

             if (!isValid) {
               logError('Fetch Error: Data integrity check failed!', undefined, { ...logContext(), serverHash: dataHash, clientHashCalculationInput: dataString.substring(0, 200) });
               setHashMismatch(true);
               setSyncStatus('error'); // Set status to error on mismatch
               toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Resolve conflict using cloud icon.", variant: 'destructive' });
               isFetchingRef.current = false;
               return false; // Stop processing if hash fails
             }
              logInfo('Fetch: Data integrity check passed.', logContext());
           }
      } else {
          logInfo('Fetch: Skipping hash check as requested (Force Fetch).', logContext());
      }

      // Proceed to update local state only if hash check passed or was skipped
      logInfo('Fetch: Overwriting local stores with fetched data...', logContext());
      getTransactionsState().setTransactions(fetchedData.transactions ?? []);
      getDebtState().setDebts(fetchedData.debts ?? []);
      getStatementState().setAssetItems(fetchedData.assetItems ?? []);
      getStatementState().setOtherLiabilityItems(fetchedData.otherLiabilityItems ?? []);
      getBudgetState().setBudgetItems(fetchedData.budgetItems ?? []);
      getWeeklyReviewState().setOwnedReviews(fetchedData.ownedReviews ?? {});
      getWeeklyReviewState().setSharedReviews(fetchedData.sharedReviews ?? {});
      getNotificationState().setNotifications(fetchedData.notifications ?? []); // Sync notifications
      // Update date range and getting started state from fetched data
      getStatementState().setStartDate(fetchedData.startDate ? new Date(fetchedData.startDate) : undefined);
      getStatementState().setEndDate(fetchedData.endDate ? new Date(fetchedData.endDate) : undefined);
      setGettingStartedDismissedState(fetchedData.gettingStartedDismissed ?? false);


      setLastSyncTime(new Date());
      setSyncStatus('synced');
      initialFetchDoneRef.current = true;
      hasLocalChangesRef.current = false; // Reset local changes flag
      logInfo('Fetch: Successfully synced with DB.', logContext());
      if(isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' });
      return true;

    } catch (error: any) {
      logError('Fetch Error', error, logContext());
      setSyncStatus('error'); // Set status to error on fetch failure
      toast({ title: 'Sync Load Failed', description: `Could not load data: ${error.message}. Using local data if available. Click cloud icon to retry.`, variant: 'destructive' });
      initialFetchDoneRef.current = true; // Mark initial fetch as done even on error, to prevent infinite loops
      return false;
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState, logContext // Include all dependencies
  ]);


  // Save data to the server
  const saveData = useCallback(async (isForceSave = false) => {
    if (!isSignedIn || !userId) { // Check conditions even if Clerk disabled
        logInfo('Save Aborted: User state invalid.', logContext());
        setSyncStatus('local');
        return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
        logInfo('Save Aborted: Operation already in progress.', logContext());
        return false;
    }

    logInfo(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, logContext());
    setSyncStatus('syncing');
    isSavingRef.current = true;

    // Pre-fetch check - only if not forcing save
    if (!isForceSave) {
        logInfo('Save: Fetching latest data before saving to check for conflicts...', logContext());
        const fetchSuccess = await fetchData(false, false); // Pass skipHashCheck=false
        if (!fetchSuccess) {
            // If fetch failed due to hash mismatch or other error, abort save
            logError('Save Aborted: Pre-save fetch failed. Data might be out of sync or hash mismatch occurred.', undefined, logContext());
            // Status is already set to 'error' by fetchData in case of mismatch/failure
            isSavingRef.current = false;
            return false;
        }
        logInfo('Save: Pre-save fetch successful, proceeding with save.', logContext());
    } else {
        // If forcing save, reset the hash mismatch flag as we are intentionally overwriting
        setHashMismatch(false);
        logInfo('Save: Force save initiated, skipping pre-fetch check.', logContext());
    }

    try {
      // Gather current state from all stores
      const currentState = {
        transactions: getTransactionsState().transactions,
        debts: getDebtState().debts,
        assetItems: getStatementState().assetItems,
        otherLiabilityItems: getStatementState().otherLiabilityItems,
        budgetItems: getBudgetState().budgetItems,
        ownedReviews: getWeeklyReviewState().ownedReviews,
        // DO NOT include sharedReviews, they are fetched, not saved by the current user
        notifications: getNotificationState().notifications, // Include notifications
        startDate: getStatementState().startDate,
        endDate: getStatementState().endDate,
        gettingStartedDismissed: gettingStartedDismissed,
      };

      // Prepare data and hash it
      const preparedData = prepareDataForHashing(currentState as SyncedData);
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      logInfo(`Save Client: Calculated client hash: ${dataHash}`, logContext());


      // Send data and hash to the server
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        // Check specifically for integrity check failure
        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
            logError('Save API Error 400: Data integrity check failed on server.', errorData, logContext());
            setHashMismatch(true); // Set mismatch state
            setSyncStatus('error');
            toast({ title: 'Save Failed: Data Out of Sync', description: "Data couldn't be saved because it conflicts with server data. Resolve using the cloud icon.", variant: 'destructive' });
        } else {
            const serverErrorMessage = `Save failed: ${response.statusText} (${errorData.error || 'No server details'})`;
            logError(`Save API Error ${response.status}: ${response.statusText}`, errorData, logContext());
            throw new Error(serverErrorMessage); // Throw for other errors
        }
        isSavingRef.current = false; // Ensure ref is reset on handled error
        return false; // Indicate failure
      }

      // Handle successful save
      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false; // Reset local changes flag on successful save
      logInfo(`Save Successful. Server: ${result.message}`, logContext());
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
      // Catch errors not handled by the 400 check above (e.g., network errors, 500 errors)
      logError('Save Error', error, logContext());
      setSyncStatus('error'); // Set status to generic error
      toast({ title: 'Sync Save Failed', description: `Could not save: ${error.message}. Changes remain locally. Click cloud icon to retry.`, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [
    isSignedIn, userId, toast, gettingStartedDismissed, // Include gettingStartedDismissed
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, fetchData, logContext // Include fetchData and logContext
  ]);


  // Debounced save trigger
  const triggerDebouncedSave = useCallback(() => {
     if (!isSignedIn || !userId || isFetchingRef.current || isSavingRef.current || isClearingRef.current) {
        logInfo('Debounced Save Skipped: User/Operation state prevents save.', logContext());
        return;
     }
     // Don't trigger automatic save if there's a hash mismatch
     if (hashMismatch) {
         logWarn('Debounced Save Skipped: Hash mismatch detected. Manual resolution required.', logContext());
         return;
     }

      // If initial fetch isn't done, don't save yet (prevents saving default/empty state)
      if (!initialFetchDoneRef.current) {
           logInfo('Debounced Save Skipped: Initial fetch not complete.', logContext());
           return;
      }

     hasLocalChangesRef.current = true; // Mark that local changes exist
     if (syncStatus === 'synced') {
         setSyncStatus('local'); // Change status to indicate unsaved local changes
         logInfo('Debounced Save: Status changed to "local" due to changes.', logContext());
     }

    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
    logInfo(`Debounced Save: Scheduling save in ${SAVE_DEBOUNCE_DELAY}ms...`, logContext());
    saveTimeoutRef.current = setTimeout(() => {
        logInfo('Debounced Save: Timeout elapsed, attempting save...', logContext());
        saveData().catch(err => { logError('Error during debounced save execution', err, logContext()); });
    }, SAVE_DEBOUNCE_DELAY);
  }, [isSignedIn, userId, saveData, syncStatus, hashMismatch, logContext]); // Add hashMismatch dependency


  // Effect to handle user sign-in/sign-out and initial fetch
  useEffect(() => {
    // Always check isClerkLoaded even if disabled, helps structure the logic flow
    if (!isClerkLoaded) {
        logInfo('Auth Effect: Clerk not loaded yet.', logContext());
        return;
    }

    const currentUserId = userId; // Use placeholder if Clerk disabled

    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      // User signed in or changed
      logInfo(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}). Clearing state and fetching.`, logContext());
      clearLocalState(); // Clear previous user's data
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false; // Reset initial fetch flag
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); // Cancel any pending save
      logInfo('Auth Effect: Triggering initial fetch...', logContext());
      fetchData(); // Fetch data for the new user
    } else if (!currentUserId && previousUserIdRef.current) {
      // User signed out
      logInfo(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`, logContext());
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSyncStatus('local'); // Set to local as there's no user to sync with
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
       // Initial load, user not logged in (or Clerk disabled)
       logInfo('Auth Effect: Initial load, no active user session.', logContext());
       setSyncStatus('local');
       previousUserIdRef.current = null; // Explicitly set to null for clarity
       initialFetchDoneRef.current = true; // Mark initial "fetch" as done (it's just local state)
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
        // Page reloaded or component re-mounted while user is still logged in, but initial fetch wasn't marked done
       logInfo('Auth Effect: User session exists, but initial fetch needed. Triggering fetch...', logContext());
       fetchData();
    }
     // else: User is the same, and initial fetch is done - no action needed here.

  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState, logContext]); // Dependencies


  // Effect to subscribe to store changes and trigger debounced save
  useEffect(() => {
      if (!isSignedIn || !userId || !isClerkLoaded || !initialFetchDoneRef.current) {
          logInfo('Save Subscription: Conditions not met (User/Clerk/Initial Fetch state).', logContext());
          if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); } // Clear pending saves if conditions change
          return;
      }
      // Do not subscribe if there's a hash mismatch - needs manual resolution
      if (hashMismatch) {
          logWarn('Save Subscription: Blocked due to hash mismatch.', logContext());
          if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
          return;
      }


      logInfo('Save Subscription: Subscribing to store changes...', logContext());
      const storesToWatch = [
        useTransactionsStore, useDebtStore, useStatementStore,
        useBudgetStore, useWeeklyReviewStore, useNotificationStore,
      ];

      const handleChange = () => {
          // Check conditions again inside the handler, as state might change between subscribe and trigger
          if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
              logInfo('Save Subscription: Store change detected, triggering debounced save.', logContext());
              triggerDebouncedSave();
          } else {
               logInfo('Save Subscription: Store change detected, but conditions not met for immediate trigger. Save deferred.', logContext());
          }
      };

      // Subscribe to all relevant stores
      const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

      // Cleanup function
      return () => {
        logInfo('Save Subscription: Unsubscribing from store changes.', logContext());
        unsubscribes.forEach(unsub => unsub());
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current); // Clean up timer on unmount
          logInfo('Save Subscription: Cleared pending save timeout on unmount.', logContext());
        }
      };
  }, [
      isSignedIn, userId, isClerkLoaded, initialFetchDoneRef.current, // Use .current here
      triggerDebouncedSave, hashMismatch, logContext // Add hashMismatch and logContext
  ]);

  // Effect to save getting started state change
   useEffect(() => {
       // Only trigger save if initial fetch is done, user is signed in, and no hash mismatch
       if (initialFetchDoneRef.current && isSignedIn && userId && !hashMismatch) {
           logInfo('Getting Started State Change: Triggering debounced save...', logContext());
           triggerDebouncedSave();
       } else {
            logInfo('Getting Started State Change: Conditions not met, save deferred.', logContext());
       }
   }, [gettingStartedDismissed, initialFetchDoneRef.current, isSignedIn, userId, triggerDebouncedSave, hashMismatch, logContext]); // Add dependencies


   // --- Manual Actions ---

   // Force save local data, overwriting server (resolves mismatch)
   const forceSaveLocal = useCallback(async () => {
       if (!hashMismatch) return false; // Only allow if there's a mismatch
       logWarn('SyncManager: User chose to force save local data for hash mismatch.', logContext());
       const success = await saveData(true); // Pass true to force save
       if (success) {
           setHashMismatch(false); // Reset mismatch on successful forced save
           toast({ title: 'Conflict Resolved', description: 'Local data saved to cloud.' });
           logInfo('Force Save Local: Successful.', logContext());
       } else {
           // Save failed, status should already be 'error' from saveData
           logError('Force Save Local: Failed.', undefined, logContext());
       }
       return success;
   }, [hashMismatch, saveData, toast, logContext]);

   // Force fetch server data, overwriting local (resolves mismatch)
   const forceFetchServer = useCallback(async () => {
       if (!hashMismatch) return false; // Only allow if there's a mismatch
       logWarn('SyncManager: User chose to force fetch server data for hash mismatch.', logContext());
       const success = await fetchData(false, true); // Pass true to skip hash check on fetch
       if (success) {
           setHashMismatch(false); // Reset mismatch on successful forced fetch
           toast({ title: 'Conflict Resolved', description: 'Server data loaded, local changes discarded.' });
           logInfo('Force Fetch Server: Successful.', logContext());
       } else {
           // Fetch failed, status should already be 'error' from fetchData
            logError('Force Fetch Server: Failed.', undefined, logContext());
       }
       return success;
   }, [hashMismatch, fetchData, toast, logContext]);

  // Manual retry logic, primarily for 'error' or 'local' states
   const retrySync = useCallback(() => {
       if (!isSignedIn || !userId) {
           toast({ title: 'Cannot Sync', description: 'Please sign in.', variant: 'destructive' });
           return;
       }
       logInfo('Manual Sync Retry Triggered.', logContext());

       if (syncStatus === 'error' && hashMismatch) {
            logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', logContext());
            // The UI should open the mismatch dialog based on hashMismatch state
            // No direct action here, just inform user via toast if needed
            toast({ title: 'Resolve Conflict', description: 'Data conflict detected. Use the cloud icon to resolve.', variant: 'warning' });
            // Or potentially directly trigger the dialog open function if passed down:
            // openMismatchDialog();
            return;
       }

        if (syncStatus === 'error' && !hashMismatch) {
           // If error state without mismatch, attempt fetch first
           logInfo('Manual Retry: Error state detected (no mismatch), attempting fetch...', logContext());
           fetchData(true); // Pass true to indicate it's a retry
       } else if (syncStatus === 'local' && hasLocalChangesRef.current) {
           // If local changes exist, attempt to save them
           logInfo('Manual Retry: Local changes detected, attempting immediate save...', logContext());
           saveData(); // Attempt save, which includes pre-fetch check
        } else if (syncStatus === 'local' && !hasLocalChangesRef.current) {
            // If local status but no specific changes tracked, likely just needs initial fetch or re-fetch
            logInfo('Manual Retry: Local status (no changes tracked), attempting fetch...', logContext());
            fetchData(true); // Attempt fetch
        } else if (isFetchingRef.current || isSavingRef.current) {
           toast({ title: 'Sync Busy', description: 'Please wait for the current sync operation to complete.' });
       } else if (syncStatus === 'syncing') {
           toast({ title: 'Already Syncing', description: 'Sync is currently in progress.' });
       } else if (syncStatus === 'synced') {
           toast({ title: 'Already Synced', description: 'Data is up-to-date.' });
           // Optionally trigger a fetch anyway if the user insists
           // fetchData(true);
       } else {
           // Fallback case, usually means 'idle' or unexpected state
           logInfo('Manual Retry: Default case, attempting fetch...', logContext());
           fetchData(true);
       }
   }, [syncStatus, hashMismatch, hasLocalChangesRef.current, fetchData, saveData, toast, isSignedIn, userId, logContext]); // Include all needed dependencies


  // Return state and actions
  return {
    syncStatus,
    retrySync,
    gettingStartedDismissed,
    setGettingStartedDismissed: setGettingStartedDismissedState, // Expose the setter
    hashMismatch,
    forceSaveLocal, // Expose force save action
    forceFetchServer, // Expose force fetch action
  };
}
