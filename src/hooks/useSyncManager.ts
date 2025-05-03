// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useToast } from '@/hooks/use-toast';

// Define the structure of the synced data
interface SyncedData {
  transactions: any[];
  debts: any[];
  assetItems: any[];
  otherLiabilityItems: any[];
  budgetItems: any[];
  reviews: Record<string, any>;
  startDate?: string; // Date as ISO string
  endDate?: string;   // Date as ISO string
}

// Define the possible sync statuses
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

export function useSyncManager() {
  const { isSignedIn, userId } = useAuth();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false); // Tracks if an operation (fetch or save) is in progress
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local'); // Initial status is local
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const initialFetchAttempted = useRef(false); // Track if initial fetch has been done

  // Get store setters
  const setTransactions = useTransactionsStore(state => state.setTransactions);
  const setDebts = useDebtStore(state => state.setDebts);
  const setAssetItems = useStatementStore(state => state.setAssetItems);
  const setOtherLiabilityItems = useStatementStore(state => state.setOtherLiabilityItems);
  const setStartDate = useStatementStore(state => state.setStartDate);
  const setEndDate = useStatementStore(state => state.setEndDate);
  const setBudgetItems = useBudgetStore(state => state.setBudgetItems);
  const setReviews = useWeeklyReviewStore(state => state.setReviews);

  // --- Debounced Save Logic ---
  const debounce = <F extends (...args: any[]) => Promise<void>>(func: F, waitFor: number) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const debounced = (...args: Parameters<F>): Promise<void> => {
          return new Promise((resolve) => {
              if (timeout !== null) {
                  clearTimeout(timeout);
              }
              timeout = setTimeout(async () => {
                  try {
                      await func(...args);
                  } finally {
                      resolve(); // Resolve promise after func execution (or failure)
                  }
              }, waitFor);
          });
      };

      return debounced;
  };


  // --- Save Data Function ---
  const saveDataToDB = useCallback(async () => {
     if (!isSignedIn || !userId) {
       console.log("Save: User not signed in.");
       setSyncStatus((prev) => prev === 'error' ? 'error' : 'local'); // Stay error or revert to local
       return;
     }
     if (isSyncing) { // Prevent concurrent saves/fetches
        console.log("Save: Operation already in progress, skipping save.");
        return;
     }

    console.log("Save: Starting save to DB...");
    setIsSyncing(true);
    setSyncStatus('syncing'); // Indicate syncing status

    // Get current state from all stores
    const currentState: SyncedData = {
      transactions: useTransactionsStore.getState().transactions,
      debts: useDebtStore.getState().debts,
      assetItems: useStatementStore.getState().assetItems,
      otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
      budgetItems: useBudgetStore.getState().budgetItems,
      reviews: useWeeklyReviewStore.getState().reviews,
      startDate: useStatementStore.getState().startDate?.toISOString(),
      endDate: useStatementStore.getState().endDate?.toISOString(),
    };

    try {
      const response = await fetch('/api/save', { // Use the save endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentState),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
        throw new Error(`Save failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced'); // Mark as synced after successful save
      console.log("Save: Successfully saved to DB.", result);
      // Success toast might be too noisy for auto-save, consider UI indicator change only

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error'); // Set status to error on failure
      toast({
        title: 'Save Failed',
        description: `Could not save data to the cloud: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [isSignedIn, userId, toast, isSyncing]); // Added isSyncing dependency

  const debouncedSave = useCallback(debounce(saveDataToDB, 3000), [saveDataToDB]);

  // --- Fetch Data Function ---
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    if (!isSignedIn || !userId) {
      console.log("Fetch: User not signed in.");
      setSyncStatus('local');
      initialFetchAttempted.current = false; // Reset fetch attempt status if signed out
      return;
    }
    if (isSyncing && !isRetry) { // Allow retry even if another operation was in progress? Maybe not needed.
        console.log("Fetch: Operation already in progress, skipping fetch.");
        return;
    }

    console.log("Fetch: Starting fetch from DB...");
    setIsSyncing(true);
    setSyncStatus('syncing');

    try {
      const response = await fetch('/api/sync'); // Use the sync/fetch endpoint
      if (!response.ok) {
          if (response.status === 404 && !initialFetchAttempted.current) {
              // User's data not found on the server, likely first time sync.
              // Push local data first.
              console.log("Fetch: No data found in DB for user. Attempting initial save...");
              initialFetchAttempted.current = true; // Mark that we tried the initial fetch
              await saveDataToDB(); // This will set status to synced or error
              // No need to re-fetch here, save handles the state update
              return;
          } else if (response.status === 404) {
              // Data still not found after initial save attempt or subsequent fetches
               console.warn("Fetch: Data not found in DB for user, but initial fetch/save already attempted.");
               setSyncStatus('local'); // Revert to local, maybe show a different error?
               toast({ title: 'No Cloud Data', description: 'No saved data found in the cloud for this user.', variant: 'default' });
               return; // Stop here
          }
          throw new Error(`Fetch failed: ${response.statusText}`);
      }
      const data: SyncedData = await response.json();

      console.log("Fetch: Received data:", data);

      // Update Zustand stores with fetched data
      // Note: This overwrites local state. Implement merging if needed.
      setTransactions(data.transactions || []);
      setDebts(data.debts || []);
      setAssetItems(data.assetItems || []);
      setOtherLiabilityItems(data.otherLiabilityItems || []);
      setBudgetItems(data.budgetItems || []);
      setReviews(data.reviews || {});
      setStartDate(data.startDate ? new Date(data.startDate) : undefined);
      setEndDate(data.endDate ? new Date(data.endDate) : undefined);


      setLastSyncTime(new Date());
      setSyncStatus('synced');
      initialFetchAttempted.current = true; // Mark initial fetch as successful
      console.log("Fetch: Successfully synced with DB.");
       if (isRetry) {
           toast({ title: 'Sync Successful', description: 'Data successfully synced after retry.' });
       } else {
           // Initial sync toast might be too noisy if it happens on every load
           // toast({ title: 'Sync Complete', description: 'Data synced with the cloud.' });
       }

    } catch (error: any) {
      console.error('Fetch Error:', error);
      setSyncStatus('error'); // Set status to error on fetch failure
      toast({
        title: 'Sync Failed',
        description: `Could not fetch data from the cloud: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId, toast, saveDataToDB, isSyncing]); // Dependencies for fetching


  // --- Effects ---

  // Fetch data on initial load or when user signs in
  useEffect(() => {
    if (isSignedIn && userId && !initialFetchAttempted.current) {
      fetchDataFromDB();
    } else if (!isSignedIn) {
      setSyncStatus('local');
      setLastSyncTime(null);
      initialFetchAttempted.current = false; // Reset on sign out
    }
  }, [isSignedIn, userId, fetchDataFromDB]);

   // Subscribe to store changes and trigger debounced save ONLY if signed in
   useEffect(() => {
       if (!isSignedIn || !userId) {
           return; // Don't subscribe or save if not signed in
       }

       const unsubscribes = [
           useTransactionsStore.subscribe(debouncedSave),
           useDebtStore.subscribe(debouncedSave),
           useStatementStore.subscribe(debouncedSave),
           useBudgetStore.subscribe(debouncedSave),
           useWeeklyReviewStore.subscribe(debouncedSave),
       ];

       return () => {
           unsubscribes.forEach(unsub => unsub());
       };
   }, [isSignedIn, userId, debouncedSave]); // Rerun effect if sign-in status changes


  // --- Retry Function ---
  const retrySync = useCallback(() => {
      if (syncStatus === 'error') {
          console.log("Sync: Retrying fetch/sync...");
          fetchDataFromDB(true); // Pass flag to indicate retry
      }
  }, [syncStatus, fetchDataFromDB]);

  return { isSyncing, syncStatus, lastSyncTime, retrySync }; // Return retrySync for the UI
}
