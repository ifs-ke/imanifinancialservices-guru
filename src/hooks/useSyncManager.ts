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
  const isSavingRef = useRef(false); // Ref to track save state to avoid race conditions in debounced save

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
  const setReviews = useWeeklyReviewStore(state => state.setReviews);
  const clearReviews = useWeeklyReviewStore(state => state.clearReviews);

  // --- Debounced Save Logic ---
  const debounce = <F extends (...args: any[]) => Promise<void>>(func: F, waitFor: number) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const debounced = (...args: Parameters<F>): Promise<void> => {
          return new Promise((resolve, reject) => { // Add reject
              if (timeout !== null) {
                  clearTimeout(timeout);
              }
              timeout = setTimeout(async () => {
                  try {
                      await func(...args);
                      resolve(); // Resolve on success
                  } catch (error) {
                      console.error("Debounced function error:", error);
                      reject(error); // Reject on error
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
     // Use ref to check if already saving to prevent race conditions with debounce
     if (isSavingRef.current) {
        console.log("Save: Save operation already in progress, skipping.");
        return;
     }

    console.log("Save: Starting save to DB...");
    setIsSyncing(true);
    isSavingRef.current = true; // Mark as saving
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
      throw error; // Re-throw error to be caught by debounced wrapper if needed
    } finally {
      setIsSyncing(false);
      isSavingRef.current = false; // Mark as not saving anymore
    }
  }, [isSignedIn, userId, toast]); // isSyncing removed as dependency, using ref instead

  const debouncedSave = useCallback(debounce(saveDataToDB, 3000), [saveDataToDB]);

  // --- Fetch Data Function ---
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    if (!isSignedIn || !userId) {
      console.log("Fetch: User not signed in.");
      setSyncStatus('local');
      initialFetchAttempted.current = false; // Reset fetch attempt status if signed out
      return;
    }
     // Prevent fetch if a save is in progress
     if (isSavingRef.current && !isRetry) {
         console.log("Fetch: Save operation in progress, skipping fetch.");
         return;
     }
    if (isSyncing && !isRetry) { // Prevent concurrent fetches (allow retry)
        console.log("Fetch: Fetch operation already in progress, skipping.");
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
          const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
          throw new Error(`Fetch failed: ${response.statusText} (${errorData.error || 'No details'})`);
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
  }, [isSignedIn, userId, toast, saveDataToDB]); // isSyncing removed, isSavingRef used internally

  // --- Clear Local State Function ---
   const clearLocalState = useCallback(() => {
     console.log("Clearing local state (session storage)...");
     clearTransactions();
     clearDebts();
     clearStatementItems();
     clearBudgetItems();
     clearReviews();
     sessionStorage.removeItem('ifcGuru_transactions'); // Explicitly remove persisted state
     sessionStorage.removeItem('ifcGuru_debts');
     sessionStorage.removeItem('ifcGuru_statementItems');
     sessionStorage.removeItem('ifcGuru_budgetItems');
     sessionStorage.removeItem('ifcGuru_weeklyReviews');
     setSyncStatus('local'); // Reset status to local
     setLastSyncTime(null);
     initialFetchAttempted.current = false;
   }, [
     clearTransactions,
     clearDebts,
     clearStatementItems,
     clearBudgetItems,
     clearReviews,
   ]);


  // --- Effects ---

  // Fetch data on initial load or when user signs in
  useEffect(() => {
    if (isSignedIn && userId && !initialFetchAttempted.current) {
      fetchDataFromDB();
    } else if (!isSignedIn) {
        // User signed out, clear local (session) state
        clearLocalState();
    }
  }, [isSignedIn, userId, fetchDataFromDB, clearLocalState]);

   // Subscribe to store changes and trigger debounced save ONLY if signed in and not currently fetching
   useEffect(() => {
       if (!isSignedIn || !userId || isSyncing) { // Also check if syncing (fetching)
           return; // Don't subscribe or save if not signed in or currently fetching
       }

       console.log("Subscribing to store changes for save...");

       const unsubscribes = [
           useTransactionsStore.subscribe((currentState, prevState) => {
               // Avoid triggering save immediately after hydration/fetch
               if (useTransactionsStore.getState().isHydrated && currentState !== prevState) {
                   console.log("Transaction store changed, triggering save...");
                   debouncedSave();
               }
           }),
           useDebtStore.subscribe(() => {
                console.log("Debt store changed, triggering save...");
                debouncedSave()
            }),
           useStatementStore.subscribe(() => {
                console.log("Statement store changed, triggering save...");
                debouncedSave()
            }),
           useBudgetStore.subscribe(() => {
                console.log("Budget store changed, triggering save...");
                debouncedSave()
            }),
           useWeeklyReviewStore.subscribe(() => {
                console.log("Weekly review store changed, triggering save...");
                debouncedSave()
            }),
       ];

       return () => {
           console.log("Unsubscribing from store changes.");
           unsubscribes.forEach(unsub => unsub());
       };
   // Only re-subscribe if sign-in status or the debouncedSave function itself changes
   }, [isSignedIn, userId, debouncedSave, isSyncing]);


  // --- Retry Function ---
  const retrySync = useCallback(() => {
      if (syncStatus === 'error' && !isSyncing) { // Only retry if in error state and not already syncing
          console.log("Sync: Retrying fetch/sync...");
          fetchDataFromDB(true); // Pass flag to indicate retry
      } else if (isSyncing) {
          console.log("Sync: Cannot retry, an operation is already in progress.");
          toast({title: "Sync Busy", description: "Please wait for the current sync operation to complete.", variant: "default"});
      }
  }, [syncStatus, fetchDataFromDB, isSyncing, toast]);

  // Return sync status and the retry function
  return { syncStatus, retrySync };
}