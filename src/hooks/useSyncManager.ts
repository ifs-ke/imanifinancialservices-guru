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

// Define the structure of the data received from the sync API
interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>; // Reviews shared with the current user
  notifications: NotificationItem[];
  startDate?: string; // ISO Date string
  endDate?: string;   // ISO Date string
  gettingStartedDismissed: boolean;
}

// Define the possible sync statuses
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

// Constants
const SAVE_DEBOUNCE_DELAY = 3000; // ms

/**
 * Custom hook to manage data synchronization between Zustand stores and a backend API.
 * Handles initial data fetch, debounced saving on changes, user authentication state changes,
 * data integrity checks, and error handling.
 */
export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  // Getting started state is now managed locally within the hook, synced via profile data
  const [gettingStartedDismissed, setGettingStartedDismissedState] = useState(false);

  // Refs to prevent concurrent operations and track state
  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false); // Track if the initial fetch for the current user has completed
  const previousUserIdRef = useRef<string | null | undefined>(undefined); // Track user changes
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for debounce timer

  // --- Get Store Setters and Clear Actions ---
  // It's generally safer to get setters/actions directly rather than entire stores
  // to minimize dependencies and potential re-renders of this hook.
  const setTransactions = useTransactionsStore(state => state.setTransactions);
  const clearTransactions = useTransactionsStore(state => state.clearTransactions);
  const setDebts = useDebtStore(state => state.setDebts);
  const clearDebts = useDebtStore(state => state.clearDebts);
  const setAssetItems = useStatementStore(state => state.setAssetItems);
  const setOtherLiabilityItems = useStatementStore(state => state.setOtherLiabilityItems);
  const setStartDate = useStatementStore(state => state.setStartDate);
  const setEndDate = useStatementStore(state => state.setEndDate);
  const clearStatementItems = useStatementStore(state => state.clearStatementItems);
  const setBudgetItems = useBudgetStore(state => state.setBudgetItems);
  const clearBudgetItems = useBudgetStore(state => state.clearBudgetItems);
  const setOwnedReviews = useWeeklyReviewStore(state => state.setOwnedReviews);
  const setSharedReviews = useWeeklyReviewStore(state => state.setSharedReviews);
  const clearReviews = useWeeklyReviewStore(state => state.clearReviews);
  const setNotifications = useNotificationStore(state => state.setNotifications);
  const clearNotifications = useNotificationStore(state => state.clearAllNotifications);

  // --- Clear Local State Function ---
  // Security Critical: This function removes all sensitive user data from session storage.
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) {
        console.log("ClearLocalState: Already clearing, skipping.");
        return;
    }
    isClearingRef.current = true;
    console.log("SyncManager: Clearing local state (Zustand stores and sessionStorage)...");

    try {
        // Clear Zustand store states
        clearTransactions();
        clearDebts();
        clearStatementItems(); // Also resets dates
        clearBudgetItems();
        clearReviews();
        clearNotifications();
        setGettingStartedDismissedState(false); // Reset local state flag

        // Explicitly remove items from sessionStorage (belt-and-suspenders approach)
        // Note: Zustand's persist middleware *should* handle this, but explicit removal adds safety.
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
                sessionStorage.removeItem(key);
            } catch (e) {
                console.warn(`Failed to remove ${key} from sessionStorage during clear:`, e);
            }
        });

        console.log("SyncManager: Local state cleared successfully.");
        setSyncStatus('local'); // Reflect that data is now purely local (empty)
        setLastSyncTime(null);
        initialFetchDoneRef.current = false; // Reset initial fetch flag as data is cleared
    } catch (error) {
        console.error("Error during clearLocalState:", error);
        // Consider how to handle errors during clearing - potentially log more severely
    } finally {
        isClearingRef.current = false;
    }
  }, [
    clearTransactions, clearDebts, clearStatementItems, clearBudgetItems,
    clearReviews, clearNotifications, setGettingStartedDismissedState
  ]);

  // --- Save Data Function ---
  // Saves the current state of all stores to the backend API.
  const saveDataToDB = useCallback(async () => {
    // Pre-checks
    if (!isSignedIn || !userId) {
      console.log("Save Aborted: User not signed in.");
      setSyncStatus('local'); // Set status to local if user signed out while save was pending
      return;
    }
     // Prevent concurrent operations
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      console.log("Save Debounced: Another operation is already in progress, skipping immediate save.");
      // Optionally, reschedule the save if needed, or let the next trigger handle it.
      return;
    }

    console.log(`Save Triggered for user ${userId}...`);
    isSavingRef.current = true;
    setSyncStatus('syncing'); // Indicate syncing state

    try {
      // **Gather current state from all stores**
      // Use *.getState() for immediate access without subscribing the hook to every store change.
      const currentState = {
        transactions: useTransactionsStore.getState().transactions,
        debts: useDebtStore.getState().debts,
        assetItems: useStatementStore.getState().assetItems,
        otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
        budgetItems: useBudgetStore.getState().budgetItems,
        ownedReviews: useWeeklyReviewStore.getState().ownedReviews,
        // Note: Shared reviews are received from sync, not saved by the client directly
        notifications: useNotificationStore.getState().notifications,
        startDate: useStatementStore.getState().startDate, // Keep as Date object for preparation
        endDate: useStatementStore.getState().endDate,     // Keep as Date object for preparation
        gettingStartedDismissed: gettingStartedDismissed, // Use local state value
      };

      // **Prepare data for hashing** (ensures consistent sorting and date formats)
      const preparedData = prepareDataForHashing(currentState);

       // --- Debugging: Log prepared data before hashing ---
       try {
           console.log("Save Client: Client-side prepared data for hashing (sample):", JSON.stringify(preparedData, null, 2).substring(0, 1000)); // Log first 1000 chars
       } catch (logError) {
           console.error("Save Client: Error logging prepared data for hashing:", logError);
       }
       // --- End Debugging ---

      const dataString = stringify(preparedData); // Use stable stringify
      const dataHash = await hashData(dataString); // Calculate hash

      console.log(`Save Client: Calculated client hash: ${dataHash}`);

      // **Send data to the save API endpoint**
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send prepared data AND the calculated hash
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      // **Handle API response**
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        // Log detailed error including status code
        console.error(`Save API Error ${response.status}: ${response.statusText}`, errorData);
        throw new Error(`Save failed: ${response.statusText} (${errorData.error || 'No server details'})`);
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced'); // Update status on successful save
      console.log(`Save Successful for user ${userId}. Server: ${result.message}`);

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error'); // Set error status
      toast({
        title: 'Sync Save Failed',
        description: `Could not save data: ${error.message}. Your changes remain locally.`,
        variant: 'destructive',
      });
    } finally {
      isSavingRef.current = false; // Release save lock
    }
  }, [isSignedIn, userId, toast, gettingStartedDismissed]); // Dependencies for the save function

  // --- Fetch Data Function ---
  // Fetches data from the backend API and updates local stores.
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    // Pre-checks
    if (!isSignedIn || !userId || !isClerkLoaded) {
      console.log("Fetch Aborted: User not signed in or Clerk not loaded.");
      // If user *was* signed in previously, clear local state.
      if (previousUserIdRef.current) clearLocalState();
      setSyncStatus('local');
      return;
    }
    // Prevent concurrent operations
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      console.log("Fetch Aborted: Another operation is already in progress.");
      return;
    }

    console.log(`Fetch Triggered for user ${userId}${isRetry ? ' (Retry)' : ''}...`);
    isFetchingRef.current = true;
    setSyncStatus('syncing');

    try {
      // **Call the sync API endpoint**
      const response = await fetch('/api/sync');

      // **Handle API response**
      if (!response.ok) {
         // Handle specific case where user has no data yet (404 could be used, or just check response body)
         // Let's assume a 200 OK with potentially empty data is the standard success case
         // Need to handle non-200 errors robustly
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error(`Fetch API Error ${response.status}: ${response.statusText}`, errorData);
        // Handle specific error for profile data failure
        if (errorData.error?.includes('Failed to fetch user profile data')) {
           throw new Error('Failed to fetch user profile data. Please check server logs.');
        }
        throw new Error(`Fetch failed: ${response.statusText} (${errorData.error || 'No server details'})`);
      }

      // **Process successful response**
      const data: SyncedData & { dataHash?: string } = await response.json();
      console.log("Fetch: Received data from server.");

      const { dataHash, ...fetchedData } = data;

      // **Verify data integrity**
      if (!dataHash) {
        console.warn("Fetch Warning: No dataHash received from server. Skipping integrity check.");
        // Decide if this is acceptable or should be an error
      } else {
        // Prepare received data for hashing (ensure consistency)
        const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
        const dataString = stringify(preparedDataToVerify);
        console.log(`Fetch: Verifying received hash: ${dataHash}`);

        const isValid = await verifyHash(dataString, dataHash);
        if (!isValid) {
          // Security Critical: If hash fails, do NOT load the data.
          console.error("Fetch Error: Data integrity check failed! Server data hash does not match calculated hash. Data might be corrupted or tampered with.");
          throw new Error("Data integrity check failed. Aborting sync.");
        }
        console.log("Fetch: Data integrity check passed.");
      }

      // **Update Zustand stores with fetched data**
      console.log("Fetch: Overwriting local stores with fetched data...");
      // Use the setters to ensure data validation and sorting within stores
      setTransactions(fetchedData.transactions ?? []);
      setDebts(fetchedData.debts ?? []);
      setAssetItems(fetchedData.assetItems ?? []);
      setOtherLiabilityItems(fetchedData.otherLiabilityItems ?? []);
      setBudgetItems(fetchedData.budgetItems ?? []);
      setOwnedReviews(fetchedData.ownedReviews ?? {});
      setSharedReviews(fetchedData.sharedReviews ?? {}); // Update shared reviews
      setNotifications(fetchedData.notifications ?? []);
      // Convert date strings back to Date objects or undefined
      setStartDate(fetchedData.startDate ? new Date(fetchedData.startDate) : undefined);
      setEndDate(fetchedData.endDate ? new Date(fetchedData.endDate) : undefined);
      // Update the local state for gettingStartedDismissed based on fetched data
      setGettingStartedDismissedState(fetchedData.gettingStartedDismissed ?? false);

      setLastSyncTime(new Date());
      setSyncStatus('synced'); // Update status
      initialFetchDoneRef.current = true; // Mark initial fetch as complete
      console.log(`Fetch: Successfully synced with DB for user ${userId}.`);
      if (isRetry) {
        toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' });
      }

    } catch (error: any) {
      console.error('Fetch Error:', error);
      setSyncStatus('error'); // Set error status
      toast({
        title: 'Sync Load Failed',
        description: `Could not load data: ${error.message}. Using local data if available.`,
        variant: 'destructive',
      });
       // Mark initial fetch as done even on error to prevent repeated fetches on load
       // unless it was specifically a fetch error that should be retried.
       // For now, we mark it done to avoid fetch loops if the server keeps erroring.
      initialFetchDoneRef.current = true;
    } finally {
      isFetchingRef.current = false; // Release fetch lock
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    setTransactions, setDebts, setAssetItems, setOtherLiabilityItems,
    setBudgetItems, setOwnedReviews, setSharedReviews, setNotifications,
    setStartDate, setEndDate, setGettingStartedDismissedState // Include setter as dependency
  ]);

  // --- Debounced Save Wrapper ---
  // Triggers a save operation after a delay, cancelling previous pending saves.
  const triggerDebouncedSave = useCallback(() => {
      // Don't save if not signed in or another operation is blocking
      if (!isSignedIn || !userId || isFetchingRef.current || isSavingRef.current || isClearingRef.current) {
          console.log("Debounced Save Skipped: User not signed in or operation in progress.");
          return;
      }

      // Indicate that local changes are pending sync
      setSyncStatus('local');

      // Clear any existing save timeout
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }

      // Set a new timeout to trigger the actual save
      console.log(`Debounced Save: Scheduling save in ${SAVE_DEBOUNCE_DELAY}ms...`);
      saveTimeoutRef.current = setTimeout(() => {
          saveDataToDB().catch(err => {
              // Error handling for the debounced save itself
              console.error("Error during debounced save execution:", err);
              // UI feedback (toast) is handled within saveDataToDB
          });
      }, SAVE_DEBOUNCE_DELAY);

  }, [isSignedIn, userId, saveDataToDB]); // Dependencies for the debouncer


  // --- Effects ---

  // Effect 1: Handle User Authentication Changes (Login/Logout)
  useEffect(() => {
    if (!isClerkLoaded) {
        console.log("Auth Effect: Clerk not loaded, waiting...");
        return; // Wait for Clerk to be ready
    }

    const currentUserId = userId; // Capture current userId

    // **Scenario 1: User Logs In OR User Changes**
    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      console.log(`Auth Effect: User signed in or changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}).`);
      // **Security Critical:** Clear any existing local data immediately to prevent data mixing.
      clearLocalState();
      // Reset tracking refs
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false; // Needs to fetch data for the *new* user
      // Cancel any pending save for the previous user
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      // Trigger initial data fetch for the new user
      console.log("Auth Effect: Triggering initial fetch for new user...");
      fetchDataFromDB();
    }
    // **Scenario 2: User Logs Out**
    else if (!currentUserId && previousUserIdRef.current) {
      console.log(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`);
      // **Security Critical:** Clear local data on logout.
      clearLocalState();
      previousUserIdRef.current = null; // Mark as logged out
      initialFetchDoneRef.current = false; // Reset fetch flag
      // Cancel any pending save
       if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }
    // **Scenario 3: Initial Load (Not Signed In)**
    else if (!currentUserId && previousUserIdRef.current === undefined) {
        console.log("Auth Effect: Initial load, user not signed in.");
        setSyncStatus('local');
        previousUserIdRef.current = null; // Mark initial state as logged out
    }
     // **Scenario 4: Already logged in, state hasn't changed (e.g., page refresh)**
     // No immediate action needed here, let other effects handle data consistency if required.
     // else {
     //    console.log(`Auth Effect: State unchanged (User: ${currentUserId}, Clerk Loaded: ${isClerkLoaded})`);
     // }

  }, [userId, isSignedIn, isClerkLoaded, fetchDataFromDB, clearLocalState]); // Key dependencies

  // Effect 2: Subscribe to Store Changes to Trigger Debounced Save
  useEffect(() => {
    // Only subscribe if user is signed in, Clerk is loaded, and initial fetch is done
    if (!isSignedIn || !userId || !isClerkLoaded || !initialFetchDoneRef.current) {
      console.log("Save Subscription: Conditions not met, not subscribing.");
      return;
    }

    console.log(`Save Subscription: Subscribing to store changes for user ${userId}...`);

    // List of stores to monitor for changes
    const storesToWatch = [
      useTransactionsStore,
      useDebtStore,
      useStatementStore, // Monitors assets, liabilities, AND dates
      useBudgetStore,
      useWeeklyReviewStore, // Monitors owned and shared reviews (though only owned trigger save)
      useNotificationStore, // Monitor notification changes
    ];

    // Callback function triggered on any change in the subscribed stores
    const handleChange = () => {
        // Avoid triggering save if an operation is already in progress
        if (!isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
             // Check if the change originated from this hook's setters (e.g., during fetch)
             // This is tricky, Zustand doesn't easily provide the source of the change.
             // A simple approach is to rely on the isFetchingRef/isSavingRef checks.
             // If we just finished fetching/saving, we might want to skip the immediate save trigger.
            console.log("Save Subscription: Store change detected, triggering debounced save.");
            triggerDebouncedSave();
        } else {
            console.log("Save Subscription: Store change detected, but operation in progress. Save deferred.");
        }
    };

    // Subscribe to each store
    const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

    // Cleanup function: Unsubscribe and clear any pending save timeout on component unmount or dependency change
    return () => {
      console.log("Save Subscription: Unsubscribing from store changes.");
      unsubscribes.forEach(unsub => unsub());
      if (saveTimeoutRef.current) {
        console.log("Save Subscription: Clearing pending save timeout.");
        clearTimeout(saveTimeoutRef.current);
      }
    };
     // Re-subscribe if user context changes or debouncer function changes
  }, [isSignedIn, userId, isClerkLoaded, initialFetchDoneRef, triggerDebouncedSave]);

  // Effect 3: Save gettingStartedDismissed state change immediately (or debounced)
  useEffect(() => {
    // Only trigger save if initial data load is complete and user is logged in
    if (initialFetchDoneRef.current && isSignedIn && userId) {
        console.log("Getting Started State Change: Triggering debounced save...");
        // Use the same debounced save to avoid rapid saves if user clicks quickly
        triggerDebouncedSave();
    }
     // Dependency array includes the state itself and the debouncer
  }, [gettingStartedDismissed, initialFetchDoneRef, isSignedIn, userId, triggerDebouncedSave]);

  // --- Retry Function ---
  // Allows manually triggering a data fetch, typically after an error.
  const retrySync = useCallback(() => {
    if (!isSignedIn || !userId) {
      toast({ title: "Cannot Sync", description: "Please sign in first.", variant: "destructive" });
      return;
    }
    if (syncStatus === 'error' && !isFetchingRef.current && !isSavingRef.current) {
      console.log("Sync Retry: Attempting fetch from DB...");
      fetchDataFromDB(true); // Pass true to indicate it's a retry attempt
    } else if (isFetchingRef.current || isSavingRef.current) {
       toast({ title: "Sync Busy", description: "Please wait for the current sync operation to complete.", variant: "default" });
    } else if (syncStatus === 'syncing') {
        toast({ title: "Already Syncing", description: "Data synchronization is already in progress.", variant: "default" });
    } else {
       // Maybe trigger a forced save/fetch if status is 'synced' or 'local'?
       // For now, only retry on error.
       toast({ title: "No Sync Error", description: "Data is currently synced or syncing. If you suspect issues, try refreshing.", variant: "default" });
       // Optionally trigger a fresh fetch even if not in error state:
       // console.log("Sync Retry: Forcing re-fetch...");
       // fetchDataFromDB(true);
    }
  }, [syncStatus, fetchDataFromDB, toast, isSignedIn, userId]); // Dependencies for retry


  // Return the public interface of the hook
  return {
      syncStatus,
      retrySync,
      gettingStartedDismissed, // Expose the state
      setGettingStartedDismissed: setGettingStartedDismissedState, // Expose the setter
  };
}
