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
// Logger removed


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
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth(); // Use actual Clerk hook
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

  // Helper for logging context
  const logContext = useCallback(() => ({ userId: userId || 'unknown', syncStatus }), [userId, syncStatus]);

  // Clear all local data (Zustand stores and session storage)
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    console.log('SyncManager: Clearing local state.', logContext()); // Replaced logInfo
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
          try { sessionStorage.removeItem(key); } catch (e) { console.warn(`Failed to remove ${key} from sessionStorage`, { ...logContext(), error: e }); } // Replaced logWarn
      });

      console.log('SyncManager: Local state cleared.', logContext()); // Replaced logInfo
      setSyncStatus('local'); // Set status to local after clearing
      setLastSyncTime(null);
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      setHashMismatch(false); // Reset hash mismatch on clear
    } catch (error) {
        console.error('Error during clearLocalState', { error, ...logContext() }); // Replaced logError
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
       console.log('Fetch Aborted: User state invalid.', logContext()); // Replaced logInfo
       if (previousUserIdRef.current !== undefined && previousUserIdRef.current !== userId) {
            clearLocalState();
       }
       setSyncStatus('local');
       return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      console.log('Fetch Aborted: Operation already in progress.', logContext()); // Replaced logInfo
      return false;
    }

    console.log(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, logContext()); // Replaced logInfo
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false);

    try {
      const response = await fetch('/api/sync');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        const serverErrorMessage = errorData.error || `Fetch failed: ${response.statusText}`;
        console.error(`Fetch API Error ${response.status}: ${response.statusText}`, { errorData, ...logContext() }); // Replaced logError
        throw new Error(serverErrorMessage);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      console.log('Fetch: Received data from server.', logContext()); // Replaced logInfo
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck) {
          if (!dataHash) {
             console.warn('Fetch Warning: No dataHash received from server. Skipping integrity check.', logContext()); // Replaced logWarn
           } else {
             const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
             const dataString = stringify(preparedDataToVerify);
             console.log(`Fetch: Verifying received hash: ${dataHash}`, logContext()); // Replaced logInfo
             const isValid = await verifyHash(dataString, dataHash);

             if (!isValid) {
               console.error('Fetch Error: Data integrity check failed!', { serverHash: dataHash, clientHashCalculationInput: dataString.substring(0, 200), ...logContext() }); // Replaced logError
               setHashMismatch(true);
               setSyncStatus('error');
               setIsMismatchDialogOpen(true); // Open dialog on hash mismatch
               toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Please resolve the conflict.", variant: 'destructive' });
               return false;
             }
              console.log('Fetch: Data integrity check passed.', logContext()); // Replaced logInfo
           }
      } else {
          console.log('Fetch: Skipping hash check as requested (Force Fetch).', logContext()); // Replaced logInfo
      }

      console.log('Fetch: Overwriting local stores with fetched data...', logContext()); // Replaced logInfo
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
      console.log('Fetch: Successfully synced with DB.', logContext()); // Replaced logInfo
      if(isRetry || skipHashCheck) toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' });
      return true;

    } catch (error: any) {
      console.error('Fetch Error', { error, ...logContext() }); // Replaced logError
      setSyncStatus('error');
      toast({ title: 'Sync Load Failed', description: `Could not load data: ${error.message}. Using local data. Click cloud icon to retry.`, variant: 'destructive' });
      return false;
    } finally {
      isFetchingRef.current = false;
      initialFetchDoneRef.current = true; // Ensure this is set in finally
      console.log('Fetch: Operation complete.', logContext()); // Replaced logInfo
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState, logContext
  ]);


  // Save data to the server
  const saveData = useCallback(async (isForceSave = false) => {
    if (!isSignedIn || !userId) {
        console.log('Save Aborted: User state invalid.', logContext()); // Replaced logInfo
        setSyncStatus('local');
        return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
        console.log('Save Aborted: Operation already in progress.', logContext()); // Replaced logInfo
        return false;
    }

    console.log(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, logContext()); // Replaced logInfo
    setSyncStatus('syncing');
    isSavingRef.current = true;

    if (!isForceSave) {
        console.log('Save: Fetching latest data before saving to check for conflicts...', logContext()); // Replaced logInfo
        const fetchSuccess = await fetchData(false, false);
        if (!fetchSuccess) {
            // fetchData sets status/mismatch flags and opens dialog if needed
            console.error('Save Aborted: Pre-save fetch failed. Data might be out of sync or hash mismatch occurred.', logContext()); // Replaced logError
            isSavingRef.current = false;
            // Don't show another toast here, fetchData handles it
            return false;
        }
        console.log('Save: Pre-save fetch successful, proceeding with save.', logContext()); // Replaced logInfo
    } else {
        setHashMismatch(false); // Clear mismatch flag when forcing save
        console.log('Save: Force save initiated, skipping pre-fetch check.', logContext()); // Replaced logInfo
    }

    try {
      const currentState = {
        transactions: getTransactionsState().transactions,
        debts: getDebtState().debts,
        assetItems: getStatementState().assetItems,
        otherLiabilityItems: getStatementState().otherLiabilityItems,
        budgetItems: getBudgetState().budgetItems,
        ownedReviews: getWeeklyReviewState().ownedReviews,
        // notifications: getNotificationState().notifications, // Usually don't save notifications back
        startDate: getStatementState().startDate,
        endDate: getStatementState().endDate,
        gettingStartedDismissed: gettingStartedDismissed,
      };

      const preparedData = prepareDataForHashing(currentState as SyncedData);
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      console.log(`Save Client: Calculated client hash: ${dataHash}`, logContext()); // Replaced logInfo

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
            console.error('Save API Error 400: Data integrity check failed on server.', { errorData, ...logContext() }); // Replaced logError
            setHashMismatch(true);
            setSyncStatus('error');
            setIsMismatchDialogOpen(true); // Open dialog on hash mismatch from server
            toast({ title: 'Save Failed: Data Out of Sync', description: "Data conflicts with server. Resolve using the cloud icon.", variant: 'destructive' });
        } else {
            const serverErrorMessage = `Save failed: ${response.statusText} (${errorData.error || 'No server details'})`;
            console.error(`Save API Error ${response.status}: ${response.statusText}`, { errorData, ...logContext() }); // Replaced logError
            throw new Error(serverErrorMessage);
        }
        isSavingRef.current = false;
        return false;
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false; // Reset local changes flag after successful save
      console.log(`Save Successful. Server: ${result.message}`, logContext()); // Replaced logInfo
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
      console.error('Save Error', { error, ...logContext() }); // Replaced logError
      setSyncStatus('error'); // Set status to error, but don't set hashMismatch here
      toast({ title: 'Sync Save Failed', description: `Could not save: ${error.message}. Changes remain locally. Click cloud icon.`, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
      console.log('Save: Operation complete.', logContext()); // Replaced logInfo
    }
  }, [
    isSignedIn, userId, toast, gettingStartedDismissed,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, fetchData, logContext
  ]);

  // Effect to handle user sign-in/sign-out and initial fetch
  useEffect(() => {
    if (!isClerkLoaded) {
        console.log('Auth Effect: Clerk state not ready.', logContext()); // Replaced logInfo
        return;
    }

    const currentUserId = userId; // Consistent local var

    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      console.log(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}). Clearing state and fetching.`, logContext()); // Replaced logInfo
      clearLocalState(); // Clear state for the NEW user BEFORE fetching
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false; // Reset initial fetch flag for new user
      console.log('Auth Effect: Triggering initial fetch...', logContext()); // Replaced logInfo
      fetchData();
    } else if (!currentUserId && previousUserIdRef.current) {
      console.log(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`, logContext()); // Replaced logInfo
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      setSyncStatus('local'); // No user, data is local
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
       console.log('Auth Effect: Initial load, no active user session.', logContext()); // Replaced logInfo
       setSyncStatus('local');
       previousUserIdRef.current = null;
       initialFetchDoneRef.current = true; // Mark initial "fetch" (non-fetch) as done
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
       // This case handles scenarios like page refresh where user is already logged in
       // but the manager hook is re-initializing.
       console.log('Auth Effect: User session exists, but initial fetch needed. Triggering fetch...', logContext()); // Replaced logInfo
       fetchData();
    } else {
       console.log('Auth Effect: No significant auth change.', logContext()); // Replaced logInfo
    }

  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState, logContext]);


  // Effect to subscribe to store changes and update status/flags
  useEffect(() => {
      if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
          console.log('Change Subscription: Conditions not met.', logContext()); // Replaced logInfo
          return;
      }
      if (hashMismatch) {
          console.warn('Change Subscription: Blocked due to hash mismatch.', logContext()); // Replaced logWarn
          return;
      }

      console.log('Change Subscription: Subscribing to store changes...', logContext()); // Replaced logInfo
      const storesToWatch = [
        useTransactionsStore, useDebtStore, useStatementStore,
        useBudgetStore, useWeeklyReviewStore, // useNotificationStore removed as notifications usually don't trigger saves
      ];

      const handleChange = () => {
          if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
              if (!hasLocalChangesRef.current) {
                  console.log('Change Subscription: First local change detected since last sync.', logContext()); // Replaced logInfo
              }
              hasLocalChangesRef.current = true;
              if (syncStatus === 'synced' || syncStatus === 'idle') { // Change from idle too
                 setSyncStatus('local');
                 console.log('Change Subscription: Status changed to "local" due to changes.', logContext()); // Replaced logInfo
              }
          } else {
               console.log('Change Subscription: Store change detected, but conditions prevent status change.', logContext()); // Replaced logInfo
          }
      };

      const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

      return () => {
        console.log('Change Subscription: Unsubscribing.', logContext()); // Replaced logInfo
        unsubscribes.forEach(unsub => unsub());
      };
  }, [
      isClerkLoaded, isSignedIn, userId, initialFetchDoneRef.current,
      syncStatus, hashMismatch, logContext
  ]);

  // Effect to track changes to getting started state
   useEffect(() => {
       if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
           console.log('Getting Started Tracker: Conditions not met.', logContext()); // Replaced logInfo
           return;
       }
        if (hashMismatch) {
           console.warn('Getting Started Tracker: Blocked due to hash mismatch.', logContext()); // Replaced logWarn
           return;
       }

       if (!isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
           if (!hasLocalChangesRef.current) {
                console.log('Getting Started Tracker: First local change detected.', logContext()); // Replaced logInfo
           }
           hasLocalChangesRef.current = true;
           if (syncStatus === 'synced' || syncStatus === 'idle') {
               setSyncStatus('local');
                console.log('Getting Started Tracker: Status changed to "local".', logContext()); // Replaced logInfo
           }
       } else {
            console.log('Getting Started Tracker: Change detected, but conditions prevent status change.', logContext()); // Replaced logInfo
       }
   }, [gettingStartedDismissed, isClerkLoaded, isSignedIn, userId, initialFetchDoneRef, hashMismatch, syncStatus, logContext]); // Added dependencies


   // Function to force save local data (overwrites server)
   const forceSaveLocal = useCallback(async () => {
       console.warn('SyncManager: User chose to force save local data.', logContext()); // Replaced logWarn
       const success = await saveData(true); // Pass true to force save
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force save
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Local data saved to cloud.' });
           console.log('Force Save Local: Successful.', logContext()); // Replaced logInfo
       } else {
           console.error('Force Save Local: Failed.', logContext()); // Replaced logError
           // Keep dialog open, error toast shown by saveData
       }
       return success; // Return success status
   }, [saveData, toast, logContext]);

   // Function to force fetch server data (discards local changes)
   const forceFetchServer = useCallback(async () => {
       console.warn('SyncManager: User chose to force fetch server data.', logContext()); // Replaced logWarn
       const success = await fetchData(false, true); // Skip hash check on force fetch
       if (success) {
           setHashMismatch(false); // Clear mismatch on successful force fetch
           setIsMismatchDialogOpen(false);
           toast({ title: 'Conflict Resolved', description: 'Server data loaded, local changes discarded.' });
           console.log('Force Fetch Server: Successful.', logContext()); // Replaced logInfo
       } else {
           console.error('Force Fetch Server: Failed.', logContext()); // Replaced logError
           // Keep dialog open, error toast shown by fetchData
       }
       return success; // Return success status
   }, [fetchData, toast, logContext]);

   // Manual retry/sync trigger function
   const retrySync = useCallback(() => {
       if (!isSignedIn || !userId) {
           toast({ title: 'Cannot Sync', description: 'Please sign in.', variant: 'destructive' });
           return;
       }
       console.log('Manual Sync/Retry Triggered.', logContext()); // Replaced logInfo

       if (syncStatus === 'error' && hashMismatch) {
            console.warn('Manual Retry: Hash mismatch detected. Opening resolution dialog.', logContext()); // Replaced logWarn
            setIsMismatchDialogOpen(true);
            return;
       }

       if (syncStatus === 'local' || (syncStatus === 'error' && !hashMismatch)) {
            console.log('Manual Sync: Status is local or error (no mismatch). Attempting save...', logContext()); // Replaced logInfo
            saveData(); // saveData includes pre-fetch check
       }
       else if (syncStatus === 'synced') {
           toast({ title: 'Already Synced', description: 'Checking for updates...' });
           fetchData(true); // Force a re-fetch to confirm
       }
       else if (syncStatus === 'syncing') {
           toast({ title: 'Sync Busy', description: 'Please wait for the current operation.' });
       }
       else {
           console.log('Manual Sync: Default case (e.g., idle), attempting fetch...', logContext()); // Replaced logInfo
           fetchData(true);
       }
   }, [syncStatus, hashMismatch, saveData, fetchData, toast, isSignedIn, userId, logContext]);


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
