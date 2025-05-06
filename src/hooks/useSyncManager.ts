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
  const [gettingStartedDismissed, setGettingStartedDismissedState] = useState(false);
  const [hashMismatch, setHashMismatch] = useState(false); // <-- New state for hash mismatch

  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLocalChangesRef = useRef(false);

  // --- Get Store Setters and Clear Actions ---
  // Using static getState() methods within callbacks to ensure access to latest state
  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  // --- Clear Local State Function ---
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    console.log("SyncManager: Clearing local state...");
    try {
        getTransactionsState().clearTransactions();
        getDebtState().clearDebts();
        getStatementState().clearStatementItems();
        getBudgetState().clearBudgetItems();
        getWeeklyReviewState().clearReviews();
        getNotificationState().clearAllNotifications();
        setGettingStartedDismissedState(false);
        const storeKeys = ['ifcGuru_transactions', 'ifcGuru_debts', 'ifcGuru_statementItems', 'ifcGuru_budgetItems', 'ifcGuru_weeklyReviews', 'ifcGuru_notifications'];
        storeKeys.forEach(key => { try { sessionStorage.removeItem(key); } catch (e) { console.warn(`Failed to remove ${key} from sessionStorage:`, e); } });
        console.log("SyncManager: Local state cleared.");
        setSyncStatus('local');
        setLastSyncTime(null);
        initialFetchDoneRef.current = false;
        hasLocalChangesRef.current = false;
        setHashMismatch(false); // Reset hash mismatch on clear
    } catch (error) { console.error("Error during clearLocalState:", error); }
    finally { isClearingRef.current = false; }
  }, [
      getTransactionsState, getDebtState, getStatementState, getBudgetState,
      getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState
  ]);

  // --- Save Data Function (used internally and for force save) ---
  const saveData = useCallback(async (isForceSave = false) => {
    if (!isSignedIn || !userId) { console.log("Save Aborted: User not signed in."); setSyncStatus('local'); return false; }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) { console.log("Save Debounced/Aborted: Operation in progress."); return false; }

    console.log(`Save Triggered for user ${userId}${isForceSave ? ' (Force)' : ''}...`);
    isSavingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false); // Assume mismatch is resolved when attempting save

    try {
      // Access latest state using getState() within the callback
      const currentState = {
        transactions: getTransactionsState().transactions,
        debts: getDebtState().debts,
        assetItems: getStatementState().assetItems,
        otherLiabilityItems: getStatementState().otherLiabilityItems,
        budgetItems: getBudgetState().budgetItems,
        ownedReviews: getWeeklyReviewState().ownedReviews,
        notifications: getNotificationState().notifications,
        startDate: getStatementState().startDate, // Access latest dates
        endDate: getStatementState().endDate,
        gettingStartedDismissed: gettingStartedDismissed, // Access latest local state
      };
      const preparedData = prepareDataForHashing(currentState as SyncData); // Cast to SyncData for preparation
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      console.log(`Save Client: Calculated client hash: ${dataHash}`);

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error(`Save API Error ${response.status}: ${response.statusText}`, errorData);
        throw new Error(`Save failed: ${response.statusText} (${errorData.error || 'No server details'})`);
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false;
      console.log(`Save Successful for user ${userId}. Server: ${result.message}`);
      return true; // Indicate success

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Save Failed',
        description: `Could not save data: ${error.message}. Your changes remain locally. ${isForceSave ? '' : 'Click the cloud icon to retry saving.'}`,
        variant: 'destructive',
      });
      return false; // Indicate failure
    } finally {
      isSavingRef.current = false;
    }
  }, [
      isSignedIn, userId, toast, gettingStartedDismissed,
      getTransactionsState, getDebtState, getStatementState, getBudgetState,
      getWeeklyReviewState, getNotificationState
  ]); // Include local state and getState refs

  // --- Fetch Data Function (used internally and for force fetch) ---
  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    if (!isSignedIn || !userId || !isClerkLoaded) { console.log("Fetch Aborted: User not signed in or Clerk not loaded."); if (previousUserIdRef.current) clearLocalState(); setSyncStatus('local'); return false; }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) { console.log("Fetch Aborted: Operation in progress."); return false; }

    console.log(`Fetch Triggered for user ${userId}${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`);
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false); // Reset mismatch state at the beginning of fetch

    try {
      const response = await fetch('/api/sync');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error(`Fetch API Error ${response.status}: ${response.statusText}`, errorData);
        const serverErrorMessage = errorData.error || `Fetch failed: ${response.statusText}`;
        throw new Error(serverErrorMessage);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      console.log("Fetch: Received data from server.");
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck) { // Only verify hash if not skipping
        if (!dataHash) { console.warn("Fetch Warning: No dataHash received from server. Skipping integrity check."); }
        else {
          const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
          const dataString = stringify(preparedDataToVerify);
          console.log(`Fetch: Verifying received hash: ${dataHash}`);
          const isValid = await verifyHash(dataString, dataHash);
          if (!isValid) {
             console.error("Fetch Error: Data integrity check failed!");
             setHashMismatch(true); // <-- Set hash mismatch state
             setSyncStatus('error');
             toast({
               title: 'Data Sync Mismatch',
               description: "Local data and server data don't match. Resolve the conflict.",
               variant: 'destructive',
             });
             isFetchingRef.current = false; // Ensure fetching stops
             return false; // Indicate failure due to mismatch
           }
          console.log("Fetch: Data integrity check passed.");
        }
      } else {
          console.log("Fetch: Skipping hash check as requested (Force Fetch).");
      }


      console.log("Fetch: Overwriting local stores with fetched data...");
      // Use the setters from getState()
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
      initialFetchDoneRef.current = true;
      hasLocalChangesRef.current = false;
      console.log(`Fetch: Successfully synced with DB for user ${userId}.`);
      if (isRetry || skipHashCheck) { toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' }); }
      return true; // Indicate success

    } catch (error: any) {
      console.error('Fetch Error:', error);
       setSyncStatus('error');
        toast({
          title: 'Sync Load Failed',
          description: `Could not load data: ${error.message}. Using local data if available. Click the cloud icon to retry.`,
          variant: 'destructive',
        });
      initialFetchDoneRef.current = true; // Mark initial fetch done even on error
      return false; // Indicate failure
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState
  ]);

  // --- Debounced Save Wrapper ---
  const triggerDebouncedSave = useCallback(() => {
      if (!isSignedIn || !userId || isFetchingRef.current || isSavingRef.current || isClearingRef.current) { console.log("Debounced Save Skipped: User/Operation state prevents save."); return; }
      if (hashMismatch) { console.log("Debounced Save Skipped: Hash mismatch detected. Resolve conflict first."); return; } // Don't save if mismatch exists

      if (initialFetchDoneRef.current) {
         hasLocalChangesRef.current = true;
          if (syncStatus === 'synced') { // Only change to 'local' if previously 'synced'
             setSyncStatus('local');
             console.log("Debounced Save: Status changed to 'local' due to changes.");
          }
      }

      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
      console.log(`Debounced Save: Scheduling save in ${SAVE_DEBOUNCE_DELAY}ms...`);
      saveTimeoutRef.current = setTimeout(() => {
          saveData().catch(err => { console.error("Error during debounced save execution:", err); }); // Use saveData
      }, SAVE_DEBOUNCE_DELAY);

  }, [isSignedIn, userId, saveData, syncStatus, hashMismatch]); // Add hashMismatch dependency

  // --- Effects ---

  // Effect 1: Handle User Authentication Changes
  useEffect(() => {
    if (!isClerkLoaded) { console.log("Auth Effect: Clerk not loaded."); return; }
    const currentUserId = userId;
    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      console.log(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}).`);
      clearLocalState();
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      console.log("Auth Effect: Triggering initial fetch...");
      fetchData(); // Use fetchData
    } else if (!currentUserId && previousUserIdRef.current) {
      console.log(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`);
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSyncStatus('local');
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
      console.log("Auth Effect: Initial load, user not signed in.");
      setSyncStatus('local');
      previousUserIdRef.current = null;
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
      console.log("Auth Effect: Already logged in, triggering initial fetch...");
      fetchData(); // Use fetchData
    }
  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState]);

  // Effect 2: Subscribe to Store Changes to Trigger Debounced Save
  useEffect(() => {
    if (!isSignedIn || !userId || !isClerkLoaded) {
        console.log("Save Subscription: Conditions not met (User/Clerk state).");
        if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
        return;
    }
    if (hashMismatch) { // Prevent subscribing if hash mismatch
      console.log("Save Subscription: Blocked due to hash mismatch.");
      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
      return;
    }

    console.log(`Save Subscription: Subscribing to store changes for user ${userId}...`);
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useNotificationStore,
    ];

    const handleChange = () => {
        // Access current state within the handler using refs or direct state access
        if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
            console.log("Save Subscription: Store change detected, triggering debounced save.");
            triggerDebouncedSave();
        } else {
            console.log("Save Subscription: Store change detected, but conditions not met. Save deferred.");
        }
    };

    const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

    return () => {
      console.log("Save Subscription: Unsubscribing from store changes.");
      unsubscribes.forEach(unsub => unsub());
      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
    };
  }, [isSignedIn, userId, isClerkLoaded, initialFetchDoneRef, triggerDebouncedSave, hashMismatch]); // Add hashMismatch dependency

  // Effect 3: Save gettingStartedDismissed state change
  useEffect(() => {
    // Only trigger save if the app has finished its initial load/sync
    if (initialFetchDoneRef.current && isSignedIn && userId && !hashMismatch) { // Check mismatch
      console.log("Getting Started State Change: Triggering debounced save...");
      triggerDebouncedSave();
    }
  }, [gettingStartedDismissed, initialFetchDoneRef, isSignedIn, userId, triggerDebouncedSave, hashMismatch]); // Add hashMismatch dependency

   // --- Public Actions for Resolving Mismatch ---
   const forceSaveLocal = useCallback(async () => {
       if (!hashMismatch) return false;
       console.log("SyncManager: User chose to force save local data.");
       setSyncStatus('syncing'); // Show syncing state during force save
       const success = await saveData(true); // Force save
       if (success) {
           setHashMismatch(false); // Reset mismatch on successful force save
           toast({ title: 'Conflict Resolved', description: 'Local data was saved to the cloud.' });
       } else {
           setSyncStatus('error'); // Revert to error if force save fails
           // Toast is handled within saveData
       }
       return success;
   }, [hashMismatch, saveData, toast]);

   const forceFetchServer = useCallback(async () => {
       if (!hashMismatch) return false;
       console.log("SyncManager: User chose to force fetch server data.");
       setSyncStatus('syncing'); // Show syncing state during force fetch
       const success = await fetchData(false, true); // Force fetch, skip hash check
       if (success) {
           setHashMismatch(false); // Reset mismatch on successful force fetch
           toast({ title: 'Conflict Resolved', description: 'Server data loaded, local changes discarded.' });
       } else {
           setSyncStatus('error'); // Revert to error if force fetch fails
           // Toast is handled within fetchData
       }
       return success;
   }, [hashMismatch, fetchData, toast]);


  // --- Retry Function ---
  const retrySync = useCallback(() => {
    if (!isSignedIn || !userId) { toast({ title: "Cannot Sync", description: "Please sign in first.", variant: "destructive" }); return; }
    if (syncStatus === 'error' && !hashMismatch && !isFetchingRef.current && !isSavingRef.current) {
      console.log("Sync Retry: Attempting fetch from DB...");
      fetchData(true);
    } else if (hashMismatch) {
        toast({ title: "Resolve Conflict", description: "Please resolve the data mismatch first.", variant: "warning" });
    } else if (isFetchingRef.current || isSavingRef.current) {
       toast({ title: "Sync Busy", description: "Wait for current operation.", variant: "default" });
    } else if (syncStatus === 'syncing') {
        toast({ title: "Already Syncing", description: "Sync in progress.", variant: "default" });
    } else if (hasLocalChangesRef.current) {
        console.log("Sync Retry: Local changes detected, attempting immediate save...");
        saveData();
    } else if (syncStatus !== 'error') {
       toast({ title: "No Sync Error", description: "Data appears up-to-date.", variant: "default" });
       // Optionally trigger a fresh fetch even if not in error:
       // console.log("Sync Retry: Forcing re-fetch...");
       // fetchData(true);
    }
  }, [syncStatus, hashMismatch, fetchData, saveData, toast, isSignedIn, userId]);


  return {
      syncStatus,
      retrySync,
      gettingStartedDismissed,
      setGettingStartedDismissed: setGettingStartedDismissedState,
      hashMismatch, // Expose mismatch state
      forceSaveLocal, // Expose action to resolve by saving local
      forceFetchServer, // Expose action to resolve by fetching server
  };
}

    