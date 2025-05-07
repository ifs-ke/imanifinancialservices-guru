
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
const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

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
  const [isMismatchDialogOpen, setIsMismatchDialogOpen] = useState(false); // State for dialog

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
    if (!isSignedIn || !userId || !isClerkLoaded) {
       logInfo('Fetch Aborted: User state invalid.', logContext());
       if (previousUserIdRef.current) clearLocalState();
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
    setHashMismatch(false);

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
             const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
             const dataString = stringify(preparedDataToVerify);
             logInfo(`Fetch: Verifying received hash: ${dataHash}`, logContext());
             const isValid = await verifyHash(dataString, dataHash);

             if (!isValid) {
               logError('Fetch Error: Data integrity check failed!', undefined, { ...logContext(), serverHash: dataHash, clientHashCalculationInput: dataString.substring(0, 200) });
               setHashMismatch(true);
               setSyncStatus('error');
               setIsMismatchDialogOpen(true); // Open dialog on hash mismatch
               toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Please resolve the conflict.", variant: 'destructive' });
               return false;
             }
              logInfo('Fetch: Data integrity check passed.', logContext());
           }
      } else {
          logInfo('Fetch: Skipping hash check as requested (Force Fetch).', logContext());
      }

      logInfo('Fetch: Overwriting local stores with fetched data...', logContext());
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
      logInfo('Fetch: Successfully synced with DB.', logContext());
      if(isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' });
      return true;

    } catch (error: any) {
      logError('Fetch Error', error, logContext());
      setSyncStatus('error');
      toast({ title: 'Sync Load Failed', description: `Could not load data: ${error.message}. Using local data. Click cloud icon to retry.`, variant: 'destructive' });
      return false;
    } finally {
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true; // Ensure this is set in finally
      logInfo('Fetch: Operation complete.', logContext());
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState, logContext
  ]);


  // Save data to the server
  const saveData = useCallback(async (isForceSave = false) => {
    if (!isSignedIn || !userId) {
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

    if (!isForceSave) {
        logInfo('Save: Fetching latest data before saving to check for conflicts...', logContext());
        const fetchSuccess = await fetchData(false, false);
        if (!fetchSuccess) {
            logError('Save Aborted: Pre-save fetch failed. Data might be out of sync or hash mismatch occurred.', undefined, logContext());
            isSavingRef.current = false;
            return false;
        }
        logInfo('Save: Pre-save fetch successful, proceeding with save.', logContext());
    } else {
        setHashMismatch(false);
        logInfo('Save: Force save initiated, skipping pre-fetch check.', logContext());
    }

    try {
      const currentState = {
        transactions: getTransactionsState().transactions,
        debts: getDebtState().debts,
        assetItems: getStatementState().assetItems,
        otherLiabilityItems: getStatementState().otherLiabilityItems,
        budgetItems: getBudgetState().budgetItems,
        ownedReviews: getWeeklyReviewState().ownedReviews,
        notifications: getNotificationState().notifications,
        startDate: getStatementState().startDate,
        endDate: getStatementState().endDate,
        gettingStartedDismissed: gettingStartedDismissed,
      };

      const preparedData = prepareDataForHashing(currentState as SyncedData);
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      logInfo(`Save Client: Calculated client hash: ${dataHash}`, logContext());

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
            logError('Save API Error 400: Data integrity check failed on server.', errorData, logContext());
            setHashMismatch(true);
            setSyncStatus('error');
            setIsMismatchDialogOpen(true); // Open dialog on hash mismatch
            toast({ title: 'Save Failed: Data Out of Sync', description: "Data conflicts with server. Resolve using the cloud icon.", variant: 'destructive' });
        } else {
            const serverErrorMessage = `Save failed: ${response.statusText} (${errorData.error || 'No server details'})`;
            logError(`Save API Error ${response.status}: ${response.statusText}`, errorData, logContext());
            throw new Error(serverErrorMessage);
        }
        isSavingRef.current = false;
        return false;
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false;
      logInfo(`Save Successful. Server: ${result.message}`, logContext());
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
      logError('Save Error', error, logContext());
      setSyncStatus('error');
      toast({ title: 'Sync Save Failed', description: `Could not save: ${error.message}. Changes remain locally. Click cloud icon.`, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [
    isSignedIn, userId, toast, gettingStartedDismissed,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, fetchData, logContext
  ]);


  // Debounced save trigger
  const triggerDebouncedSave = useCallback(() => {
     if (!isSignedIn || !userId || isFetchingRef.current || isSavingRef.current || isClearingRef.current) {
        logInfo('Debounced Save Skipped: User/Operation state prevents save.', logContext());
        return;
     }
     if (hashMismatch) {
         logWarn('Debounced Save Skipped: Hash mismatch. Manual resolution required.', logContext());
         return;
     }

      if (!initialFetchDoneRef.current) {
           logInfo('Debounced Save Skipped: Initial fetch not complete.', logContext());
           return;
      }

     hasLocalChangesRef.current = true;
     if (syncStatus === 'synced') {
         setSyncStatus('local');
         logInfo('Debounced Save: Status changed to "local" due to changes.', logContext());
     }

    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
    logInfo(`Debounced Save: Scheduling save in ${SAVE_DEBOUNCE_DELAY}ms...`, logContext());
    saveTimeoutRef.current = setTimeout(() => {
        logInfo('Debounced Save: Timeout elapsed, attempting save...', logContext());
        // Save data is now manual or triggered by specific actions, not debounced timer
        // If you still want automatic debounced save, uncomment the line below
        // saveData().catch(err => { logError('Error during debounced save execution', err, logContext()); });
    }, SAVE_DEBOUNCE_DELAY);
  }, [isSignedIn, userId, syncStatus, hashMismatch, logContext]); // Removed saveData from here


  // Effect to handle user sign-in/sign-out and initial fetch
  useEffect(() => {
    if (!isClerkLoaded) {
        logInfo('Auth Effect: Clerk not loaded yet.', logContext());
        return;
    }

    const currentUserId = userId;

    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      logInfo(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}). Clearing state and fetching.`, logContext());
      clearLocalState();
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      logInfo('Auth Effect: Triggering initial fetch...', logContext());
      fetchData();
    } else if (!currentUserId && previousUserIdRef.current) {
      logInfo(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`, logContext());
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSyncStatus('local');
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
       logInfo('Auth Effect: Initial load, no active user session.', logContext());
       setSyncStatus('local');
       previousUserIdRef.current = null;
       initialFetchDoneRef.current = true;
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
       logInfo('Auth Effect: User session exists, but initial fetch needed. Triggering fetch...', logContext());
       fetchData();
    }

  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState, logContext]);


  // Effect to subscribe to store changes and trigger debounced save
  useEffect(() => {
      if (!isSignedIn || !userId || !isClerkLoaded || !initialFetchDoneRef.current) {
          logInfo('Save Subscription: Conditions not met.', logContext());
          if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
          return;
      }
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
          if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
              logInfo('Save Subscription: Store change detected, marking local changes.', logContext());
              hasLocalChangesRef.current = true;
              if (syncStatus === 'synced') {
                 setSyncStatus('local');
              }
              // Removed automatic triggerDebouncedSave() to make saving manual on error/local
          } else {
               logInfo('Save Subscription: Store change detected, but conditions not met for status change.', logContext());
          }
      };

      const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

      return () => {
        logInfo('Save Subscription: Unsubscribing from store changes.', logContext());
        unsubscribes.forEach(unsub => unsub());
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          logInfo('Save Subscription: Cleared pending save timeout on unmount.', logContext());
        }
      };
  }, [
      isSignedIn, userId, isClerkLoaded, initialFetchDoneRef.current,
      syncStatus, hashMismatch, logContext // Add syncStatus
  ]);

  // Effect to save getting started state change
   useEffect(() => {
       if (initialFetchDoneRef.current && isSignedIn && userId && !hashMismatch) {
           logInfo('Getting Started State Change: Marking local changes...', logContext());
           hasLocalChangesRef.current = true;
           if (syncStatus === 'synced') {
             setSyncStatus('local');
           }
           // Removed automatic triggerDebouncedSave()
       } else {
            logInfo('Getting Started State Change: Conditions not met, save deferred.', logContext());
       }
   }, [gettingStartedDismissed, initialFetchDoneRef.current, isSignedIn, userId, syncStatus, hashMismatch, logContext]);


   const forceSaveLocal = useCallback(async () => {
       logWarn('SyncManager: User chose to force save local data.', logContext());
       const success = await saveData(true); // Pass true to force save
       if (success) {
           setHashMismatch(false);
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Local data saved to cloud.' });
           logInfo('Force Save Local: Successful.', logContext());
       } else {
           logError('Force Save Local: Failed.', undefined, logContext());
       }
       return success;
   }, [saveData, toast, logContext]);

   const forceFetchServer = useCallback(async () => {
       logWarn('SyncManager: User chose to force fetch server data.', logContext());
       const success = await fetchData(false, true);
       if (success) {
           setHashMismatch(false);
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Server data loaded, local changes discarded.' });
           logInfo('Force Fetch Server: Successful.', logContext());
       } else {
            logError('Force Fetch Server: Failed.', undefined, logContext());
       }
       return success;
   }, [fetchData, toast, logContext]);

   const retrySync = useCallback(() => {
       if (!isSignedIn || !userId) {
           toast({ title: 'Cannot Sync', description: 'Please sign in.', variant: 'destructive' });
           return;
       }
       logInfo('Manual Sync Retry Triggered.', logContext());

       if (syncStatus === 'error' && hashMismatch) {
            logWarn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', logContext());
            setIsMismatchDialogOpen(true); // Directly open the dialog
            return;
       }

       // If there are local changes, attempt to save them. saveData includes a pre-fetch.
       if (hasLocalChangesRef.current || syncStatus === 'local') {
            logInfo('Manual Retry: Local changes or local status, attempting immediate save...', logContext());
            saveData(); // This will also pre-fetch to check for server changes
       } else if (syncStatus === 'error' && !hashMismatch) {
           logInfo('Manual Retry: Error state (no mismatch), attempting fetch...', logContext());
           fetchData(true);
       } else if (syncStatus === 'synced') {
           toast({ title: 'Already Synced', description: 'Data is up-to-date. Fetching again to confirm.' });
           fetchData(true); // Re-fetch to confirm
       } else if (isFetchingRef.current || isSavingRef.current) {
           toast({ title: 'Sync Busy', description: 'Please wait for the current operation to complete.' });
       } else {
           logInfo('Manual Retry: Default case, attempting fetch...', logContext());
           fetchData(true);
       }
   }, [syncStatus, hashMismatch, hasLocalChangesRef.current, fetchData, saveData, toast, isSignedIn, userId, logContext]);


  // Return state and actions
  return {
    syncStatus,
    retrySync,
    gettingStartedDismissed,
    setGettingStartedDismissed: setGettingStartedDismissedState,
    hashMismatch,
    forceSaveLocal,
    forceFetchServer,
    isMismatchDialogOpen, // Expose dialog state
    setIsMismatchDialogOpen, // Expose dialog setter
  };
}
