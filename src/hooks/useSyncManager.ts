// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing'; // Import preparation helper
import stringify from 'fast-json-stable-stringify'; // Import stable stringify

// Define the structure of the synced data (as expected from the API)
interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean; // Include getting started state
}

// Define the possible sync statuses
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle'); // Initial status
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissedState] = useState(false); // Local state for this hook

  // Refs to manage operation states and prevent race conditions/loops
  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false); // Prevent saving during clear
  const initialFetchDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get store setters and clear actions
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

  // --- Clear Local State Function ---
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return; // Prevent recursive clear
    console.log("SyncManager: Clearing local state (session storage)...");
    isClearingRef.current = true;

    // Clear Zustand stores first
    clearTransactions();
    clearDebts();
    clearStatementItems();
    clearBudgetItems();
    clearReviews();
    setGettingStartedDismissedState(false); // Reset local state

    // Explicitly remove persisted state from sessionStorage
    sessionStorage.removeItem('ifcGuru_transactions');
    sessionStorage.removeItem('ifcGuru_debts');
    sessionStorage.removeItem('ifcGuru_statementItems');
    sessionStorage.removeItem('ifcGuru_budgetItems');
    sessionStorage.removeItem('ifcGuru_weeklyReviews');

    console.log("SyncManager: Local state (sessionStorage) cleared.");
    setSyncStatus('local'); // Reset status
    setLastSyncTime(null);
    initialFetchDoneRef.current = false;
    isClearingRef.current = false;
  }, [
    clearTransactions,
    clearDebts,
    clearStatementItems,
    clearBudgetItems,
    clearReviews,
  ]);

  // --- Save Data Function ---
  const saveDataToDB = useCallback(async () => {
    if (!isSignedIn || !userId) {
      console.log("Save: User not signed in. Data remains local.");
      setSyncStatus('local');
      return;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      console.log("Save: Operation already in progress, skipping.");
      return;
    }

    console.log("Save: Starting save to DB...");
    isSavingRef.current = true;
    setSyncStatus('syncing');

    try {
      // Get current state from all stores
      const currentState: Omit<SyncedData, 'sharedReviews' | 'dataHash'> = {
        transactions: useTransactionsStore.getState().transactions,
        debts: useDebtStore.getState().debts,
        assetItems: useStatementStore.getState().assetItems,
        otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
        budgetItems: useBudgetStore.getState().budgetItems,
        ownedReviews: useWeeklyReviewStore.getState().ownedReviews,
        startDate: useStatementStore.getState().startDate?.toISOString(),
        endDate: useStatementStore.getState().endDate?.toISOString(),
        gettingStartedDismissed: gettingStartedDismissed, // Use the local state managed by the hook
      };

      const preparedData = prepareDataForHashing(currentState);
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);

      console.log("Save: Calculated client hash:", dataHash);

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
        throw new Error(`Save failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      console.log("Save: Successfully saved to DB.", result.message);

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Failed',
        description: `Could not save data: ${error.message}. Data remains local.`,
        variant: 'destructive',
      });
      // Don't re-throw, allow UI to reflect error state
    } finally {
      isSavingRef.current = false;
    }
  }, [isSignedIn, userId, toast, gettingStartedDismissed]); // Ensure gettingStartedDismissed is a dependency

  // --- Fetch Data Function ---
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    if (!isSignedIn || !userId || !isLoaded) {
      console.log("Fetch: User not signed in, or Clerk not loaded.");
      setSyncStatus('local');
      return;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      console.log("Fetch: Another operation in progress, skipping fetch.");
      return;
    }

    console.log("Fetch: Starting fetch from DB...");
    isFetchingRef.current = true;
    setSyncStatus('syncing');

    try {
      const response = await fetch('/api/sync');

      if (!response.ok) {
        if (response.status === 404) {
           console.log("Fetch: No data found in DB for user.");
           // Clear local state to ensure consistency if cloud is empty
           clearLocalState();
           setSyncStatus('synced'); // Consider it synced as there's nothing remote to sync from
           initialFetchDoneRef.current = true;
           return; // No data to process
        }
        const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
        throw new Error(`Fetch failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      console.log("Fetch: Received data.");

      const { dataHash, ...dataToVerify } = data;
      if (!dataHash) {
        console.warn("Fetch: No dataHash received from server. Skipping integrity check.");
      } else {
        const preparedDataToVerify = prepareDataForHashing(dataToVerify as SyncedData);
        const dataString = stringify(preparedDataToVerify);
        console.log("Fetch: Verifying hash:", dataHash);

        const isValid = await verifyHash(dataString, dataHash);
        if (!isValid) {
          throw new Error("Data integrity check failed. Fetched data mismatch.");
        }
        console.log("Fetch: Data integrity check passed.");
      }

      // --- Update Stores with Fetched Data ---
      console.log("Fetch: Overwriting local state with fetched data...");
      setTransactions(data.transactions ?? []);
      setDebts(data.debts ?? []);
      setAssetItems(data.assetItems ?? []);
      setOtherLiabilityItems(data.otherLiabilityItems ?? []);
      setBudgetItems(data.budgetItems ?? []);
      setOwnedReviews(data.ownedReviews ?? {});
      setSharedReviews(data.sharedReviews ?? {});
      setStartDate(data.startDate ? new Date(data.startDate) : undefined);
      setEndDate(data.endDate ? new Date(data.endDate) : undefined);
      setGettingStartedDismissedState(data.gettingStartedDismissed ?? false); // Update local state

      setLastSyncTime(new Date());
      setSyncStatus('synced');
      initialFetchDoneRef.current = true;
      console.log("Fetch: Successfully synced with DB.");
      if (isRetry) {
        toast({ title: 'Sync Successful', description: 'Data successfully synced.' });
      }

    } catch (error: any) {
      console.error('Fetch Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Failed',
        description: `Could not load data: ${error.message}. Using local data if available.`,
        variant: 'destructive',
      });
      initialFetchDoneRef.current = true; // Mark as attempted even on error
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    isSignedIn, userId, isLoaded, toast, clearLocalState,
    setTransactions, setDebts, setAssetItems, setOtherLiabilityItems,
    setBudgetItems, setOwnedReviews, setSharedReviews, setStartDate, setEndDate,
  ]);

  // --- Debounced Save Wrapper ---
  const triggerDebouncedSave = useCallback(() => {
      if (!isSignedIn || !userId) return; // Don't save if not signed in
      if (isFetchingRef.current || isSavingRef.current || isClearingRef.current) return; // Don't save during other operations

      setSyncStatus('local'); // Mark as needing sync
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
          saveDataToDB().catch(err => console.error("Debounced save failed:", err));
      }, 3000); // 3-second debounce
  }, [isSignedIn, userId, saveDataToDB]);

  // --- Effects ---

  // Initial Fetch on Load / User Change
  useEffect(() => {
    if (!isLoaded) return; // Wait for Clerk

    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    console.log(`Auth Effect: Current User ID: ${currentUserId}, Previous User ID: ${prevUserId}, SignedIn: ${isSignedIn}`);

    if (isSignedIn && currentUserId) {
      if (currentUserId !== prevUserId) {
        console.log(`Auth Effect: User signed in or changed (${prevUserId ?? 'none'} -> ${currentUserId}). Fetching data.`);
        initialFetchDoneRef.current = false; // Reset fetch flag
        if (prevUserId !== undefined) { // Clear state only if switching from another user or undefined
           clearLocalState();
        }
        fetchDataFromDB();
        previousUserIdRef.current = currentUserId;
      } else if (!initialFetchDoneRef.current) {
        console.log("Auth Effect: User already signed in, attempting initial fetch.");
        fetchDataFromDB();
      }
    } else if (!isSignedIn) {
       if (prevUserId !== null && prevUserId !== undefined) {
            console.log(`Auth Effect: User signed out (${prevUserId}). Clearing local state.`);
            clearLocalState();
            previousUserIdRef.current = null; // Mark as signed out
       } else if (prevUserId === undefined) {
            console.log("Auth Effect: Initial load, not signed in.");
            setSyncStatus('local');
            previousUserIdRef.current = null;
       }
    }
  }, [isSignedIn, userId, isLoaded, fetchDataFromDB, clearLocalState]);

  // Subscribe to Store Changes for Saving
  useEffect(() => {
    if (!isSignedIn || !userId || !isLoaded || !initialFetchDoneRef.current) {
      return; // Only subscribe when logged in, loaded, and initial fetch is done
    }

    console.log("Save Subscription: Subscribing to store changes...");

    const stores = [
      useTransactionsStore,
      useDebtStore,
      useStatementStore,
      useBudgetStore,
      useWeeklyReviewStore,
    ];

    const unsubscribes = stores.map(useStore =>
      useStore.subscribe(
          // Only trigger save if not fetching/saving/clearing
          () => {
              if (!isFetchingRef.current && !isSavingRef.current && !isClearingRef.current) {
                  triggerDebouncedSave();
              }
          }
      )
    );

    return () => {
      console.log("Save Subscription: Unsubscribing.");
      unsubscribes.forEach(unsub => unsub());
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isSignedIn, userId, isLoaded, initialFetchDoneRef, triggerDebouncedSave]);

  // Effect to save gettingStartedDismissed state when it changes locally
  useEffect(() => {
    // Only trigger save if the initial fetch is done (to avoid saving default false on load)
    // and the user is signed in.
    if (initialFetchDoneRef.current && isSignedIn && userId) {
        console.log("Getting Started State Changed: Triggering save...");
        triggerDebouncedSave();
    }
  }, [gettingStartedDismissed, initialFetchDoneRef, isSignedIn, userId, triggerDebouncedSave]);

  // --- Retry Function ---
  const retrySync = useCallback(() => {
    if (!isSignedIn || !userId) {
      toast({ title: "Cannot Sync", description: "Please sign in.", variant: "destructive" });
      return;
    }
    if (syncStatus === 'error' && !isFetchingRef.current && !isSavingRef.current) {
      console.log("Sync: Retrying fetch...");
      fetchDataFromDB(true); // Pass true to indicate retry
    } else if (isFetchingRef.current || isSavingRef.current) {
      toast({ title: "Sync Busy", description: "Please wait for the current operation.", variant: "default" });
    } else {
       toast({ title: "No Error", description: "Data is already synced or syncing.", variant: "default" });
    }
  }, [syncStatus, fetchDataFromDB, toast, isSignedIn, userId]);

  // Public hook interface
  return {
      syncStatus,
      retrySync,
      gettingStartedDismissed,
      setGettingStartedDismissed: setGettingStartedDismissedState, // Expose the local state setter
  };
}
