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
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils


// Define the structure of the synced data (as expected from the API)
interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>; // Now explicitly owned
  sharedReviews: Record<string, WeeklyReviewData>; // Add shared reviews
  startDate?: string; // Date as ISO string
  endDate?: string;   // Date as ISO string
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
  // Get weekly review setters
  const setOwnedReviews = useWeeklyReviewStore(state => state.setOwnedReviews);
  const setSharedReviews = useWeeklyReviewStore(state => state.setSharedReviews);
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

    // Get current state from all stores, including ONLY owned reviews for saving
    const currentState: Omit<SyncedData, 'sharedReviews' | 'dataHash'> = { // Exclude sharedReviews and hash
      transactions: useTransactionsStore.getState().transactions,
      debts: useDebtStore.getState().debts,
      assetItems: useStatementStore.getState().assetItems,
      otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
      budgetItems: useBudgetStore.getState().budgetItems,
      ownedReviews: useWeeklyReviewStore.getState().ownedReviews, // Only save owned reviews
      startDate: useStatementStore.getState().startDate?.toISOString(),
      endDate: useStatementStore.getState().endDate?.toISOString(),
    };

    // Placeholder for hashing data
    const dataString = JSON.stringify(currentState);
    const dataHash = await hashData(dataString); // Use your hashing function

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentState, dataHash }), // Include hash
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
        title: 'Sync Failed',
        description: `Could not save data to the cloud: ${error.message}. Data remains saved locally for this session.`,
        variant: 'destructive',
      });
      throw error; // Re-throw to allow debounced function to handle rejection
    } finally {
      setIsSyncing(false);
      isSavingRef.current = false;
    }
  }, [isSignedIn, userId, toast]); // Dependencies remain the same

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
      const response = await fetch('/api/sync'); // Fetch data including owned and shared reviews

      if (!response.ok) {
          if (response.status === 404 && !initialFetchAttempted.current) {
              console.log("Fetch: No data found in DB for user. Attempting initial save of local (session) data...");
              initialFetchAttempted.current = true;
              await saveDataToDB();
              return;
          } else if (response.status === 404) {
               console.warn("Fetch: No cloud data found for user (after initial attempt/login). Ensuring clean local state.");
               clearLocalState();
               setSyncStatus('local');
               initialFetchAttempted.current = true;
               toast({ title: 'No Cloud Data', description: 'Started with a clean slate as no data was found in the cloud.', variant: 'default' });
               return;
          }
          const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
          throw new Error(`Fetch failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }

      const data: SyncedData = await response.json();
      console.log("Fetch: Received data:", data);

      // Verify data hash
      const { dataHash, ...dataToVerify } = data;
      const calculatedHash = await hashData(JSON.stringify(dataToVerify));
      const isValid = await verifyHash(JSON.stringify(dataToVerify), dataHash || ''); // Use verifyHash

       if (!isValid) {
         throw new Error("Data integrity check failed. Data may be corrupted or tampered with.");
       }


      // --- Cache Reset on Successful Reconnection ---
      console.log("Fetch: Overwriting local state with fetched data...");
      setTransactions(data.transactions || []);
      setDebts(data.debts || []);
      setAssetItems(data.assetItems || []);
      setOtherLiabilityItems(data.otherLiabilityItems || []);
      setBudgetItems(data.budgetItems || []);
      setOwnedReviews(data.ownedReviews || {}); // Set owned reviews
      setSharedReviews(data.sharedReviews || {}); // Set shared reviews
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
       initialFetchAttempted.current = true;
    } finally {
      setIsSyncing(false);
    }
  // Update dependencies for store setters
  }, [
      isSignedIn, userId, toast, saveDataToDB, clearLocalState,
      setTransactions, setDebts, setAssetItems, setOtherLiabilityItems,
      setBudgetItems, setOwnedReviews, setSharedReviews, setStartDate, setEndDate
  ]);


  // --- Effects ---

  // Handle user sign-in/sign-out and userId changes
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    console.log(`Auth Effect: Current User ID: ${currentUserId}, Previous User ID: ${prevUserId}, IsSignedIn: ${isSignedIn}`);

    if (isSignedIn && currentUserId) {
        if (prevUserId === undefined || currentUserId !== prevUserId) {
            console.log(`Auth Effect: User signed in or changed (${prevUserId ?? 'none'} -> ${currentUserId}). Clearing local state and fetching new data.`);
            clearLocalState();
            initialFetchAttempted.current = false;
            fetchDataFromDB();
        } else if (!initialFetchAttempted.current) {
             console.log("Auth Effect: User already signed in, attempting initial fetch...");
             fetchDataFromDB();
        }
    } else if (!isSignedIn && (prevUserId !== null && prevUserId !== undefined)) {
        console.log("Auth Effect: User signed out. Clearing local state.");
        clearLocalState();
        setSyncStatus('local');
    } else if (!isSignedIn) {
        console.log("Auth Effect: Initial load: Not signed in. Status is local.");
        setSyncStatus('local');
        previousUserIdRef.current = null;
    }

    if (previousUserIdRef.current !== currentUserId) {
      previousUserIdRef.current = currentUserId;
    }

  }, [isSignedIn, userId, fetchDataFromDB, clearLocalState]);

   // Subscribe to store changes and trigger debounced save
   useEffect(() => {
       if (!isSignedIn || !userId || !initialFetchAttempted.current) {
           return;
       }
       if (isSyncing || isSavingRef.current) {
           return;
       }

       console.log("Save Subscription: Subscribing to store changes...");

        const triggerSave = (storeName: string) => {
            // Only save if the data changing belongs to the current user
            // This check is primarily relevant for weekly reviews which have ownerId
            // For other stores, the data is assumed to belong to the current user due to fetch/clear logic
             if (storeName === 'Weekly Review' && !Object.values(useWeeklyReviewStore.getState().ownedReviews).some(r => r.ownerId === userId)) {
                 console.log(`Weekly Review store changed, but no changes to owned reviews detected for user ${userId}. Skipping save.`);
                 return; // Don't save if the change wasn't to an owned review
             }

            console.log(`${storeName} store changed, triggering save...`);
            setSyncStatus('local');
            debouncedSave().catch(err => console.error(`Save failed after ${storeName} change:`, err));
        };

       // Subscribe to each store
       const unsubscribes = [
           useTransactionsStore.subscribe((state, prevState) => {
               if (state.isHydrated && state.transactions !== prevState.transactions) triggerSave('Transaction');
           }),
           useDebtStore.subscribe((state, prevState) => {
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
           // Only trigger save if OWNED reviews change. Changes to SHARED reviews shouldn't trigger a save for the current user.
           useWeeklyReviewStore.subscribe((state, prevState) => {
               if (state.ownedReviews !== prevState.ownedReviews) triggerSave('Weekly Review');
           }),
       ];

       return () => {
           console.log("Save Subscription: Unsubscribing from store changes.");
           unsubscribes.forEach(unsub => unsub());
       };
   }, [isSignedIn, userId, debouncedSave, initialFetchAttempted, isSyncing]);


  // --- Retry Function ---
  const retrySync = useCallback(() => {
      if (!isSignedIn || !userId) {
          toast({ title: "Cannot Sync", description: "Please sign in to sync data.", variant: "destructive" });
          return;
      }
      if (syncStatus === 'error' && !isSyncing && !isSavingRef.current) {
          console.log("Sync: Retrying fetch/sync...");
          fetchDataFromDB(true); // Pass true to indicate it's a retry attempt
      } else if (isSyncing || isSavingRef.current) {
          console.log("Sync: Cannot retry, an operation is already in progress.");
          toast({title: "Sync Busy", description: "Please wait for the current sync operation to complete.", variant: "default"});
      } else {
          console.log("Sync: No error to retry, or already syncing/synced.");
          if (syncStatus !== 'error') {
              toast({title: "Already Synced", description: "Data is already synced or currently syncing.", variant: "default"});
          }
      }
  }, [syncStatus, isSyncing, fetchDataFromDB, toast, isSignedIn, userId]);

  return { syncStatus, retrySync };
}

// Placeholder hash function (replace with actual implementation)
async function hashData(data: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
        console.error("Hashing failed:", error);
        // In a real app, you might want to handle this more robustly
        return 'hashing_failed';
    }
}

// Placeholder verify function (replace with actual implementation)
async function verifyHash(data: string, expectedHash: string): Promise<boolean> {
    if (!expectedHash || expectedHash === 'hashing_failed') {
        console.warn("No valid hash provided for verification or hashing failed previously.");
        // Decide behavior: Allow if no hash exists (initial load?), or reject?
        // For now, let's allow if no hash was stored, but reject if hash failed.
        return expectedHash !== 'hashing_failed';
    }
    try {
        const calculatedHash = await hashData(data);
        return calculatedHash === expectedHash;
    } catch (error) {
        console.error("Hash verification failed:", error);
        return false;
    }
}
