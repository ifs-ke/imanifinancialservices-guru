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
     sessionStorage.removeItem('ifcGuru_transactions');
     sessionStorage.removeItem('ifcGuru_debts');
     sessionStorage.removeItem('ifcGuru_statementItems');
     sessionStorage.removeItem('ifcGuru_budgetItems');
     sessionStorage.removeItem('ifcGuru_weeklyReviews');
     console.log("Local state cleared.");
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
                  } finally {
                      timeout = null; // Clear timeout ref after execution
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
       setSyncStatus((prev) => (prev === 'error' || prev === 'syncing') ? 'error' : 'local'); // Stay error or syncing or revert to local
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
      const response = await fetch('/api/save', {
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
      setSyncStatus('synced');
      console.log("Save: Successfully saved to DB.", result);

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Save Failed',
        description: `Could not save data to the cloud: ${error.message}`,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsSyncing(false);
      isSavingRef.current = false;
    }
  }, [isSignedIn, userId, toast]);

  const debouncedSave = useCallback(debounce(saveDataToDB, 3000), [saveDataToDB]);

  // --- Fetch Data Function ---
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    if (!isSignedIn || !userId) {
      console.log("Fetch: User not signed in.");
      // Don't clear local state here, handle it based on userId change in useEffect
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
              console.log("Fetch: No data found in DB for user. Attempting initial save...");
              initialFetchAttempted.current = true;
              // Important: Do not clear local state here, save the existing local data first
              await saveDataToDB(); // This will set status to synced or error
              return; // Exit fetch after attempting save
          } else if (response.status === 404) {
               console.warn("Fetch: Data not found in DB for user, but initial fetch/save already attempted or unnecessary.");
               // If data is still not found, it implies the user has no cloud data.
               // We should clear any potential stale local data from a previous user.
               clearLocalState(); // Clear potentially stale local data
               setSyncStatus('local'); // User has no cloud data, so they are effectively 'local'
               toast({ title: 'No Cloud Data', description: 'Started with a clean slate as no data was found in the cloud.', variant: 'default' });
               return; // Stop here
          }
          const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
          throw new Error(`Fetch failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }
      const data: SyncedData = await response.json();

      console.log("Fetch: Received data:", data);

      // Update Zustand stores with fetched data - This overwrites local state
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
           toast({ title: 'Sync Successful', description: 'Data successfully synced after retry.' });
       }

    } catch (error: any) {
      console.error('Fetch Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Failed',
        description: `Could not fetch data from the cloud: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId, toast, saveDataToDB, clearLocalState /* Add clearLocalState dependency */]);


  // --- Effects ---

  // Handle user sign-in/sign-out and userId changes
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    console.log(`Sync Effect: Current User ID: ${currentUserId}, Previous User ID: ${prevUserId}, IsSignedIn: ${isSignedIn}`);

    if (isSignedIn && currentUserId) {
        if (prevUserId === undefined || currentUserId !== prevUserId) {
            // User signed in OR changed user
            console.log(`User signed in or changed (${prevUserId ?? 'none'} -> ${currentUserId}). Clearing local state and fetching new data.`);
            clearLocalState(); // Clear any previous user's state FIRST
            initialFetchAttempted.current = false; // Reset fetch attempt for the new user
            fetchDataFromDB(); // Fetch data for the new user
        } else if (!initialFetchAttempted.current) {
             // Same user, but initial fetch wasn't done (e.g., page refresh while logged in)
             console.log("User already signed in, attempting initial fetch...");
             fetchDataFromDB();
        }
    } else if (!isSignedIn && (prevUserId !== null && prevUserId !== undefined)) {
        // User signed out
        console.log("User signed out. Clearing local state.");
        clearLocalState();
    } else if (!isSignedIn) {
        // Initial load state, not signed in
        console.log("Initial load: Not signed in. Setting status to local.");
        setSyncStatus('local');
        previousUserIdRef.current = null; // Explicitly set to null when not signed in
    }

    // Update the previousUserIdRef *after* the logic runs
    if (previousUserIdRef.current !== currentUserId) {
      previousUserIdRef.current = currentUserId;
    }

  }, [isSignedIn, userId, fetchDataFromDB, clearLocalState]);

   // Subscribe to store changes and trigger debounced save
   useEffect(() => {
       // Only save if signed in, fetch is complete, and not currently syncing/saving
       if (!isSignedIn || !userId || !initialFetchAttempted.current || isSyncing || isSavingRef.current) {
           // console.log("Save Subscription: Skipping due to conditions:", { isSignedIn, userId, initialFetchAttempted: initialFetchAttempted.current, isSyncing, isSavingRef: isSavingRef.current });
           return;
       }

       console.log("Subscribing to store changes for save...");

       const unsubscribes = [
           useTransactionsStore.subscribe((currentState, prevState) => {
               // Avoid triggering save immediately after hydration/fetch by checking isHydrated
               // Also check if the actual transaction list has changed
               if (useTransactionsStore.getState().isHydrated && currentState.transactions !== prevState.transactions) {
                   console.log("Transaction store changed, triggering save...");
                   setSyncStatus('local'); // Indicate data is local before save attempt
                   debouncedSave().catch(err => console.error("Save failed after transaction change:", err));
               }
           }),
           useDebtStore.subscribe((currentState, prevState) => {
               if (currentState.debts !== prevState.debts) {
                 console.log("Debt store changed, triggering save...");
                 setSyncStatus('local');
                 debouncedSave().catch(err => console.error("Save failed after debt change:", err));
               }
           }),
           useStatementStore.subscribe((currentState, prevState) => {
                // Check individual relevant fields in statement store
               if (currentState.assetItems !== prevState.assetItems ||
                   currentState.otherLiabilityItems !== prevState.otherLiabilityItems ||
                   currentState.startDate !== prevState.startDate ||
                   currentState.endDate !== prevState.endDate) {
                   console.log("Statement store changed, triggering save...");
                   setSyncStatus('local');
                   debouncedSave().catch(err => console.error("Save failed after statement change:", err));
               }
           }),
           useBudgetStore.subscribe((currentState, prevState) => {
               if (currentState.budgetItems !== prevState.budgetItems) {
                 console.log("Budget store changed, triggering save...");
                 setSyncStatus('local');
                 debouncedSave().catch(err => console.error("Save failed after budget change:", err));
               }
           }),
           useWeeklyReviewStore.subscribe((currentState, prevState) => {
                if (currentState.reviews !== prevState.reviews) {
                    console.log("Weekly review store changed, triggering save...");
                    setSyncStatus('local');
                    debouncedSave().catch(err => console.error("Save failed after weekly review change:", err));
                }
           }),
       ];

       return () => {
           console.log("Unsubscribing from store changes.");
           unsubscribes.forEach(unsub => unsub());
       };
   // Only depend on necessary values to avoid re-subscribing too often
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [isSignedIn, userId, debouncedSave, initialFetchAttempted, isSyncing]);


  // --- Retry Function ---
  const retrySync = useCallback(() => {
      if (!isSignedIn || !userId) {
          toast({ title: "Cannot Sync", description: "Please sign in to sync data.", variant: "destructive" });
          return;
      }
      if (syncStatus === 'error' && !isSyncing && !isSavingRef.current) {
          console.log("Sync: Retrying fetch/sync...");
          fetchDataFromDB(true);
      } else if (isSyncing || isSavingRef.current) {
          console.log("Sync: Cannot retry, an operation is already in progress.");
          toast({title: "Sync Busy", description: "Please wait for the current sync operation to complete.", variant: "default"});
      } else {
          console.log("Sync: No error to retry.");
      }
  }, [syncStatus, isSyncing, fetchDataFromDB, toast, isSignedIn, userId]);

  // Return sync status and the retry function
  return { syncStatus, retrySync };
}

    