// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types'; // Ensure types include necessary fields
// Import hashing utils (currently placeholders)
// import { hashData, verifyHash } from '@/lib/storage-utils';


// Define the structure of the synced data (as expected from the API)
interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  reviews: Record<string, WeeklyReviewData>;
  startDate?: string; // Date as ISO string
  endDate?: string;   // Date as ISO string
  // Add hash field if implemented server-side
  // dataHash?: string;
}

// Define the possible sync statuses
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

export function useSyncManager() {
  const { isSignedIn, userId } = useAuth();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false); // Tracks if an operation (fetch or save) is in progress
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSignedIn ? 'idle' : 'local'); // Initial status depends on sign-in
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const initialFetchAttempted = useRef(false); // Track if initial fetch has been done
  const isSavingRef = useRef(false); // Ref to track save state to avoid race conditions in debounced save
  const previousUserIdRef = useRef<string | null | undefined>(undefined); // Ref to store the previous userId

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

  // --- Clear Local State Function ---
   const clearLocalState = useCallback(() => {
     console.log("Clearing local state (session storage)...");
     // Clear Zustand stores first to avoid re-persisting immediately
     clearTransactions();
     clearDebts();
     clearStatementItems();
     clearBudgetItems();
     clearReviews();

     // Explicitly remove persisted state from sessionStorage
     // This is crucial for ensuring no data leaks between users on the same browser
     // and fulfills the "erase on exit" requirement as sessionStorage is session-bound.
     sessionStorage.removeItem('ifcGuru_transactions');
     sessionStorage.removeItem('ifcGuru_debts');
     sessionStorage.removeItem('ifcGuru_statementItems');
     sessionStorage.removeItem('ifcGuru_budgetItems');
     sessionStorage.removeItem('ifcGuru_weeklyReviews');

     console.log("Local state (sessionStorage) cleared.");
     setSyncStatus('local'); // Reset status to local
     setLastSyncTime(null);
     initialFetchAttempted.current = false; // Allow refetch if user signs in again
     previousUserIdRef.current = undefined; // Reset previous user ID tracking
   }, [
     clearTransactions,
     clearDebts,
     clearStatementItems,
     clearBudgetItems,
     clearReviews,
   ]);


  // --- Debounced Save Logic ---
  const debounce = <F extends (...args: any[]) => Promise<void>>(func: F, waitFor: number) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const debounced = (...args: Parameters<F>): Promise<void> => {
          return new Promise((resolve, reject) => {
              if (timeout !== null) {
                  clearTimeout(timeout);
              }
              timeout = setTimeout(async () => {
                  try {
                      await func(...args);
                      resolve();
                  } catch (error) {
                      console.error("Debounced function error:", error);
                      reject(error);
                  } finally {
                      timeout = null;
                  }
              }, waitFor);
          });
      };

      return debounced;
  };


  // --- Save Data Function ---
  const saveDataToDB = useCallback(async () => {
     if (!isSignedIn || !userId) {
       console.log("Save: User not signed in. Data remains local (sessionStorage).");
       setSyncStatus((prev) => (prev === 'error' || prev === 'syncing') ? 'error' : 'local');
       return;
     }
     if (isSavingRef.current) {
        console.log("Save: Save operation already in progress, skipping.");
        return;
     }

    console.log("Save: Starting save to DB...");
    setIsSyncing(true);
    isSavingRef.current = true;
    setSyncStatus('syncing');

    // Get current state from all stores
    const currentState: Omit<SyncedData, 'dataHash'> = { // Exclude hash if not implemented
      transactions: useTransactionsStore.getState().transactions,
      debts: useDebtStore.getState().debts,
      assetItems: useStatementStore.getState().assetItems,
      otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
      budgetItems: useBudgetStore.getState().budgetItems,
      reviews: useWeeklyReviewStore.getState().reviews,
      startDate: useStatementStore.getState().startDate?.toISOString(),
      endDate: useStatementStore.getState().endDate?.toISOString(),
    };

    // Placeholder: Hashing data before sending (replace with actual implementation if needed)
    // const dataString = JSON.stringify(currentState);
    // const dataHash = await hashData(dataString); // Use your hashing function

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send currentState and potentially the hash
        // body: JSON.stringify({ ...currentState, dataHash }),
        body: JSON.stringify(currentState), // Send without hash for now
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
        throw new Error(`Save failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      console.log("Save: Successfully saved to DB.", result);
      // Clear local storage only AFTER successful save if implementing offline first beyond sessionStorage
      // For sessionStorage, this is not strictly necessary as it clears on session end anyway.
      // clearLocalPersistence(); // Example call if using localStorage/IndexedDB

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Failed',
        description: `Could not save data to the cloud: ${error.message}. Data remains saved locally for this session.`,
        variant: 'destructive',
      });
      throw error; // Re-throw to allow debounced function to handle rejection
    } finally {
      setIsSyncing(false);
      isSavingRef.current = false;
    }
  }, [isSignedIn, userId, toast]); // Removed store state dependencies as they are accessed via getState()

  const debouncedSave = useCallback(debounce(saveDataToDB, 3000), [saveDataToDB]);

  // --- Fetch Data Function ---
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    if (!isSignedIn || !userId) {
      console.log("Fetch: User not signed in.");
      return;
    }
    if (isSavingRef.current && !isRetry) {
         console.log("Fetch: Save operation in progress, skipping fetch.");
         return;
     }
    if (isSyncing && !isRetry) {
        console.log("Fetch: Fetch operation already in progress, skipping.");
        return;
    }

    console.log("Fetch: Starting fetch from DB...");
    setIsSyncing(true);
    setSyncStatus('syncing');

    try {
      const response = await fetch('/api/sync');

      if (!response.ok) {
          if (response.status === 404 && !initialFetchAttempted.current) {
              console.log("Fetch: No data found in DB for user. Attempting initial save of local (session) data...");
              initialFetchAttempted.current = true;
              // Save current local (sessionStorage) state to the DB for the first time
              await saveDataToDB();
              return; // Exit fetch after save attempt (saveDataToDB sets status)
          } else if (response.status === 404) {
               console.warn("Fetch: No cloud data found for user (after initial attempt/login). Ensuring clean local state.");
               // If data is still not found, it implies the user has no cloud data.
               // Clear local state to ensure no data from a previous session/user remains.
               clearLocalState();
               setSyncStatus('local'); // User is online but has no cloud data -> state is effectively 'local'
               initialFetchAttempted.current = true; // Mark fetch as attempted
               toast({ title: 'No Cloud Data', description: 'Started with a clean slate as no data was found in the cloud.', variant: 'default' });
               return; // Stop here
          }
          const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
          throw new Error(`Fetch failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }

      const data: SyncedData = await response.json();
      console.log("Fetch: Received data:", data);

      // Placeholder: Verify data hash if implemented
      // const receivedDataString = JSON.stringify({ /* structure matching hashed data */ });
      // const isValid = await verifyHash(receivedDataString, data.dataHash || '');
      // if (!isValid) {
      //   throw new Error("Data integrity check failed. Tampered data received.");
      // }

      // --- Cache Reset on Successful Reconnection ---
      // Fetch successful, overwrite local (sessionStorage) state with fetched data.
      // This effectively resets the local cache with the authoritative server state.
      console.log("Fetch: Overwriting local state with fetched data...");
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
      initialFetchAttempted.current = true;
      console.log("Fetch: Successfully synced with DB.");
       if (isRetry) {
           toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' });
       }

    } catch (error: any) {
      console.error('Fetch Error:', error);
      setSyncStatus('error'); // Set status to error on fetch failure
      toast({
        title: 'Sync Failed',
        description: `Could not fetch data from the cloud: ${error.message}. Using local data for this session.`,
        variant: 'destructive',
      });
       // Do NOT clear local state on fetch error, allow offline use of existing session data.
       // Set initialFetchAttempted to true even on error to prevent repeated initial save attempts.
       initialFetchAttempted.current = true;
    } finally {
      setIsSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId, toast, saveDataToDB, clearLocalState]); // Added clearLocalState


  // --- Effects ---

  // Handle user sign-in/sign-out and userId changes
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    console.log(`Auth Effect: Current User ID: ${currentUserId}, Previous User ID: ${prevUserId}, IsSignedIn: ${isSignedIn}`);

    if (isSignedIn && currentUserId) {
        if (prevUserId === undefined || currentUserId !== prevUserId) {
            // User signed in OR changed user
            console.log(`Auth Effect: User signed in or changed (${prevUserId ?? 'none'} -> ${currentUserId}). Clearing local state and fetching new data.`);
            // Crucially clear local state BEFORE fetching new data to prevent data merging/leakage.
            clearLocalState();
            initialFetchAttempted.current = false;
            fetchDataFromDB(); // Fetch data for the new user
        } else if (!initialFetchAttempted.current) {
             // Same user, but initial fetch wasn't done (e.g., page refresh while logged in)
             console.log("Auth Effect: User already signed in, attempting initial fetch...");
             fetchDataFromDB();
        }
    } else if (!isSignedIn && (prevUserId !== null && prevUserId !== undefined)) {
        // User signed out
        console.log("Auth Effect: User signed out. Clearing local state.");
        clearLocalState();
        setSyncStatus('local'); // Explicitly set to local on sign out
    } else if (!isSignedIn) {
        // Initial load state, not signed in
        console.log("Auth Effect: Initial load: Not signed in. Status is local.");
        setSyncStatus('local');
        previousUserIdRef.current = null;
    }

    // Update the previousUserIdRef *after* the logic runs
    if (previousUserIdRef.current !== currentUserId) {
      previousUserIdRef.current = currentUserId;
    }

  }, [isSignedIn, userId, fetchDataFromDB, clearLocalState]);

   // Subscribe to store changes and trigger debounced save
   useEffect(() => {
       // Only attempt save if signed in AND initial fetch is complete (or deemed unnecessary).
       if (!isSignedIn || !userId || !initialFetchAttempted.current) {
           return;
       }
       // Avoid saving immediately after a sync operation that is still in progress
       if (isSyncing || isSavingRef.current) {
           return;
       }

       console.log("Save Subscription: Subscribing to store changes...");

        const triggerSave = (storeName: string) => {
            console.log(`${storeName} store changed, triggering save...`);
            setSyncStatus('local'); // Indicate data is local (unsaved)
            debouncedSave().catch(err => console.error(`Save failed after ${storeName} change:`, err));
        };

       // Subscribe to each store, checking if it's hydrated and the relevant data changed
       const unsubscribes = [
           useTransactionsStore.subscribe((state, prevState) => {
               if (state.isHydrated && state.transactions !== prevState.transactions) triggerSave('Transaction');
           }),
           useDebtStore.subscribe((state, prevState) => {
                // Assuming DebtStore doesn't need explicit hydration flag like transactions
               if (state.debts !== prevState.debts) triggerSave('Debt');
           }),
           useStatementStore.subscribe((state, prevState) => {
               if (state.assetItems !== prevState.assetItems ||
                   state.otherLiabilityItems !== prevState.otherLiabilityItems ||
                   state.startDate !== prevState.startDate ||
                   state.endDate !== prevState.endDate) triggerSave('Statement');
           }),
           useBudgetStore.subscribe((state, prevState) => {
               if (state.budgetItems !== prevState.budgetItems) triggerSave('Budget');
           }),
           useWeeklyReviewStore.subscribe((state, prevState) => {
               if (state.reviews !== prevState.reviews) triggerSave('Weekly Review');
           }),
       ];

       return () => {
           console.log("Save Subscription: Unsubscribing from store changes.");
           unsubscribes.forEach(unsub => unsub());
       };
   // Dependencies ensure subscription logic re-runs if auth state changes or save function updates.
   }, [isSignedIn, userId, debouncedSave, initialFetchAttempted, isSyncing]);


  // --- Retry Function ---
  const retrySync = useCallback(() => {
      if (!isSignedIn || !userId) {
          toast({ title: "Cannot Sync", description: "Please sign in to sync data.", variant: "destructive" });
          return;
      }
      // Allow retry only if there was a previous error AND not currently syncing/saving
      if (syncStatus === 'error' && !isSyncing && !isSavingRef.current) {
          console.log("Sync: Retrying fetch/sync...");
          fetchDataFromDB(true); // Pass true to indicate it's a retry attempt
      } else if (isSyncing || isSavingRef.current) {
          console.log("Sync: Cannot retry, an operation is already in progress.");
          toast({title: "Sync Busy", description: "Please wait for the current sync operation to complete.", variant: "default"});
      } else {
          console.log("Sync: No error to retry, or already syncing/synced.");
          // Optionally provide feedback if syncStatus is not 'error'
          if (syncStatus !== 'error') {
              toast({title: "Already Synced", description: "Data is already synced or currently syncing.", variant: "default"});
          }
      }
  }, [syncStatus, isSyncing, fetchDataFromDB, toast, isSignedIn, userId]);

  // Return sync status and the retry function
  return { syncStatus, retrySync };
}