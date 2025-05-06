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
const RETRY_DELAY = 60000; // 1 minute in ms

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

  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track retry timeout
  // Ref to track if a local change has occurred *after* the initial sync
  const hasLocalChangesRef = useRef(false);

  // --- Get Store Setters and Clear Actions ---
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
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    console.log("SyncManager: Clearing local state...");
    try {
        clearTransactions();
        clearDebts();
        clearStatementItems();
        clearBudgetItems();
        clearReviews();
        clearNotifications();
        setGettingStartedDismissedState(false);
        // Clear sessionStorage items (redundant but safe)
        const storeKeys = ['ifcGuru_transactions', 'ifcGuru_debts', 'ifcGuru_statementItems', 'ifcGuru_budgetItems', 'ifcGuru_weeklyReviews', 'ifcGuru_notifications'];
        storeKeys.forEach(key => { try { sessionStorage.removeItem(key); } catch (e) { console.warn(`Failed to remove ${key} from sessionStorage:`, e); } });
        console.log("SyncManager: Local state cleared.");
        setSyncStatus('local');
        setLastSyncTime(null);
        initialFetchDoneRef.current = false;
        hasLocalChangesRef.current = false; // Reset local changes flag
    } catch (error) { console.error("Error during clearLocalState:", error); }
    finally { isClearingRef.current = false; }
  }, [
    clearTransactions, clearDebts, clearStatementItems, clearBudgetItems,
    clearReviews, clearNotifications, setGettingStartedDismissedState
  ]);

  // --- Save Data Function ---
  const saveDataToDB = useCallback(async () => {
    if (!isSignedIn || !userId) { console.log("Save Aborted: User not signed in."); setSyncStatus('local'); return; }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) { console.log("Save Debounced: Operation in progress."); return; }

    console.log(`Save Triggered for user ${userId}...`);
    isSavingRef.current = true;
    setSyncStatus('syncing');

    try {
      const currentState = {
        transactions: useTransactionsStore.getState().transactions,
        debts: useDebtStore.getState().debts,
        assetItems: useStatementStore.getState().assetItems,
        otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
        budgetItems: useBudgetStore.getState().budgetItems,
        ownedReviews: useWeeklyReviewStore.getState().ownedReviews,
        notifications: useNotificationStore.getState().notifications,
        startDate: useStatementStore.getState().startDate,
        endDate: useStatementStore.getState().endDate,
        gettingStartedDismissed: gettingStartedDismissed,
      };
      const preparedData = prepareDataForHashing(currentState);
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
      hasLocalChangesRef.current = false; // Reset local changes flag on successful save
      console.log(`Save Successful for user ${userId}. Server: ${result.message}`);

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Save Failed',
        description: `Could not save data: ${error.message}. Your changes remain locally.`,
        variant: 'destructive',
      });
    } finally {
      isSavingRef.current = false;
    }
  }, [isSignedIn, userId, toast, gettingStartedDismissed]);

  // --- Fetch Data Function ---
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    if (!isSignedIn || !userId || !isClerkLoaded) { console.log("Fetch Aborted: User not signed in or Clerk not loaded."); if (previousUserIdRef.current) clearLocalState(); setSyncStatus('local'); return; }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) { console.log("Fetch Aborted: Operation in progress."); return; }

    console.log(`Fetch Triggered for user ${userId}${isRetry ? ' (Retry)' : ''}...`);
    isFetchingRef.current = true;
    setSyncStatus('syncing');

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

      if (!dataHash) { console.warn("Fetch Warning: No dataHash received from server. Skipping integrity check."); }
      else {
        const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
        const dataString = stringify(preparedDataToVerify);
        console.log(`Fetch: Verifying received hash: ${dataHash}`);
        const isValid = await verifyHash(dataString, dataHash);
        if (!isValid) { console.error("Fetch Error: Data integrity check failed!"); throw new Error("Data integrity check failed. Aborting sync."); }
        console.log("Fetch: Data integrity check passed.");
      }

      console.log("Fetch: Overwriting local stores with fetched data...");
      setTransactions(fetchedData.transactions ?? []);
      setDebts(fetchedData.debts ?? []);
      setAssetItems(fetchedData.assetItems ?? []);
      setOtherLiabilityItems(fetchedData.otherLiabilityItems ?? []);
      setBudgetItems(fetchedData.budgetItems ?? []);
      setOwnedReviews(fetchedData.ownedReviews ?? {});
      setSharedReviews(fetchedData.sharedReviews ?? {});
      setNotifications(fetchedData.notifications ?? []);
      setStartDate(fetchedData.startDate ? new Date(fetchedData.startDate) : undefined);
      setEndDate(fetchedData.endDate ? new Date(fetchedData.endDate) : undefined);
      setGettingStartedDismissedState(fetchedData.gettingStartedDismissed ?? false);

      setLastSyncTime(new Date());
      setSyncStatus('synced');
      initialFetchDoneRef.current = true;
      hasLocalChangesRef.current = false; // Reset local changes flag after successful fetch
      console.log(`Fetch: Successfully synced with DB for user ${userId}.`);
      if (isRetry) { toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' }); }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current); // Clear any pending retry
        retryTimeoutRef.current = null;
      }

    } catch (error: any) {
      console.error('Fetch Error:', error);
       setSyncStatus('error');
        toast({
          title: 'Sync Load Failed',
          description: `Could not load data: ${error.message}. Using local data if available. Retrying in 1 minute.`,
          variant: 'destructive',
        });

       // Schedule a retry if not already scheduled
       if (!retryTimeoutRef.current) {
           retryTimeoutRef.current = setTimeout(() => {
                console.log("SyncManager: Auto-retrying sync after error...");
                fetchDataFromDB(true);
            }, RETRY_DELAY);
       }
      initialFetchDoneRef.current = true;
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    setTransactions, setDebts, setAssetItems, setOtherLiabilityItems,
    setBudgetItems, setOwnedReviews, setSharedReviews, setNotifications,
    setStartDate, setEndDate, setGettingStartedDismissedState
  ]);

  // --- Debounced Save Wrapper ---
  const triggerDebouncedSave = useCallback(() => {
      if (!isSignedIn || !userId || isFetchingRef.current || isSavingRef.current || isClearingRef.current) { console.log("Debounced Save Skipped: User/Operation state prevents save."); return; }

      // If the initial fetch is done, mark that local changes exist
      if (initialFetchDoneRef.current) {
         hasLocalChangesRef.current = true;
          // Update status to 'local' only if not already 'syncing' or 'error'
          if (syncStatus !== 'syncing' && syncStatus !== 'error') {
             setSyncStatus('local');
          }
          console.log("Debounced Save: Marked local changes as pending.");
      }


      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
      console.log(`Debounced Save: Scheduling save in ${SAVE_DEBOUNCE_DELAY}ms...`);
      saveTimeoutRef.current = setTimeout(() => {
          saveDataToDB().catch(err => { console.error("Error during debounced save execution:", err); });
      }, SAVE_DEBOUNCE_DELAY);

  }, [isSignedIn, userId, saveDataToDB, syncStatus]); // Removed hasLocalChangesRef from deps

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
      fetchDataFromDB();
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
      fetchDataFromDB();
    }
  }, [userId, isSignedIn, isClerkLoaded, fetchDataFromDB, clearLocalState]);

  // Effect 2: Subscribe to Store Changes to Trigger Debounced Save
  useEffect(() => {
    // Subscribe only after Clerk is loaded and user is signed in.
    // We now allow subscribing *before* initial fetch completes.
    // This ensures that if a user makes changes *before* the first fetch finishes,
    // those changes still trigger a save *after* the fetch completes.
    if (!isSignedIn || !userId || !isClerkLoaded) {
        console.log("Save Subscription: Conditions not met (User/Clerk state).");
        // Clear any pending save timeout if user signs out
        if (saveTimeoutRef.current) {
            console.log("Save Subscription: Clearing pending save timeout due to user state change.");
            clearTimeout(saveTimeoutRef.current);
        }
        return;
    }

    console.log(`Save Subscription: Subscribing to store changes for user ${userId}...`);
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useNotificationStore,
    ];

    const handleChange = () => {
        // Only trigger save if initial fetch is done and no critical operation is running.
        if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
            console.log("Save Subscription: Store change detected, triggering debounced save.");
            triggerDebouncedSave();
        } else {
            console.log("Save Subscription: Store change detected, but initial fetch not done or operation in progress. Save deferred.");
        }
    };

    const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));

    return () => {
      console.log("Save Subscription: Unsubscribing from store changes.");
      unsubscribes.forEach(unsub => unsub());
      if (saveTimeoutRef.current) {
        console.log("Save Subscription: Clearing pending save timeout on cleanup.");
        clearTimeout(saveTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
           clearTimeout(retryTimeoutRef.current);
           retryTimeoutRef.current = null;
       }
    };
    // Depend on initialFetchDoneRef now as well
  }, [isSignedIn, userId, isClerkLoaded, initialFetchDoneRef, triggerDebouncedSave]);


  // Effect 3: Save gettingStartedDismissed state change
  useEffect(() => {
    if (initialFetchDoneRef.current && isSignedIn && userId) {
      console.log("Getting Started State Change: Triggering debounced save...");
      triggerDebouncedSave();
    }
  }, [gettingStartedDismissed, initialFetchDoneRef, isSignedIn, userId, triggerDebouncedSave]);

  // --- Retry Function ---
  const retrySync = useCallback(() => {
    if (!isSignedIn || !userId) { toast({ title: "Cannot Sync", description: "Please sign in first.", variant: "destructive" }); return; }
    if (syncStatus === 'error' && !isFetchingRef.current && !isSavingRef.current) {
      console.log("Sync Retry: Attempting fetch from DB...");
      fetchDataFromDB(true);
       if (retryTimeoutRef.current) { // Clear retry if manually retrying
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
    } else if (isFetchingRef.current || isSavingRef.current) {
       toast({ title: "Sync Busy", description: "Wait for current operation.", variant: "default" });
    } else if (syncStatus === 'syncing') {
        toast({ title: "Already Syncing", description: "Sync in progress.", variant: "default" });
    } else if (hasLocalChangesRef.current) {
        // If not in error, but local changes exist, try saving directly
        console.log("Sync Retry: Local changes detected, attempting immediate save...");
        saveDataToDB();
    } else {
       toast({ title: "No Sync Error", description: "Data appears up-to-date.", variant: "default" });
       // Optionally trigger a fresh fetch:
       // console.log("Sync Retry: Forcing re-fetch...");
       // fetchDataFromDB(true);
    }
  }, [syncStatus, fetchDataFromDB, saveDataToDB, toast, isSignedIn, userId]);

    // Effect 4: Clear the retry timeout when the component unmounts
   useEffect(() => {
        return () => {
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
        };
    }, []);

  return {
      syncStatus,
      retrySync,
      gettingStartedDismissed,
      setGettingStartedDismissed: setGettingStartedDismissedState,
  };
}
