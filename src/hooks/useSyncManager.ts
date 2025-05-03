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
  const [isSyncing, setIsSyncing] = useState(false); // Tracks if an operation (fetch or save) is in progress
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle'); // Initial status depends on sign-in
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
  const setOwnedReviews = useWeeklyReviewStore(state => state.setOwnedReviews);
  const setSharedReviews = useWeeklyReviewStore(state => state.setSharedReviews);
  const clearReviews = useWeeklyReviewStore(state => state.clearReviews);

  // Local state for getting started guide (not persisted in Zustand for simplicity)
  const [gettingStartedDismissed, setGettingStartedDismissed] = useState(false);


  // --- Clear Local State Function ---
   const clearLocalState = useCallback(() => {
     console.log("Clearing local state (session storage)...");
     // Clear Zustand stores first to avoid re-persisting immediately
     clearTransactions();
     clearDebts();
     clearStatementItems();
     clearBudgetItems();
     clearReviews();
     setGettingStartedDismissed(false); // Reset getting started on clear

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
      gettingStartedDismissed: gettingStartedDismissed, // Include getting started state
    };

    // Prepare data for hashing (consistent sorting, date formatting)
    const preparedData = prepareDataForHashing(currentState);
    const dataString = stringify(preparedData); // Use stable stringify
    const dataHash = await hashData(dataString);

    console.log("Save: Calculated client hash:", dataHash);
    // console.log("Save: Data being sent:", JSON.stringify(preparedData).substring(0, 300) + "..."); // Log truncated data for debugging


    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }), // Send prepared data + hash
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
      throw error;
    } finally {
      setIsSyncing(false);
      isSavingRef.current = false;
    }
  }, [isSignedIn, userId, toast, gettingStartedDismissed]); // Added gettingStartedDismissed dependency

  const debouncedSave = useCallback(debounce(saveDataToDB, 3000), [saveDataToDB]);

  // --- Fetch Data Function ---
  const fetchDataFromDB = useCallback(async (isRetry = false) => {
    if (!isSignedIn || !userId || !isLoaded) {
        console.log("Fetch: User not signed in, or Clerk not loaded.");
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
              // Trigger save only if there's actually local data to save
              // Check a primary store like transactions
              if (useTransactionsStore.getState().transactions.length > 0 || useDebtStore.getState().debts.length > 0 /* etc. */) {
                 await saveDataToDB();
              } else {
                 console.log("Fetch: No local data to perform initial save.");
                 setSyncStatus('synced'); // Consider it synced as there's nothing locally or remotely
              }
              return;
          } else if (response.status === 404) {
               console.warn("Fetch: No cloud data found for user (after initial attempt/login). Ensuring clean local state.");
               clearLocalState(); // Clear local state if no cloud data exists after initial checks
               setSyncStatus('local'); // Set status to local as there's nothing to sync *from*
               initialFetchAttempted.current = true;
               // Toast might be annoying here if it's just a new user
               // toast({ title: 'No Cloud Data', description: 'Started with a clean slate.', variant: 'default' });
               return;
          }
          const errorData = await response.json().catch(() => ({ error: 'Unknown error structure' }));
          throw new Error(`Fetch failed: ${response.statusText} (${errorData.error || 'No details'})`);
      }

      const data: SyncedData & { dataHash?: string } = await response.json(); // Expect dataHash from API
      console.log("Fetch: Received data.");

      // Verify data hash
      const { dataHash, ...dataToVerify } = data;
       if (!dataHash) {
           console.warn("Fetch: No dataHash received from server. Skipping integrity check.");
       } else {
           const preparedDataToVerify = prepareDataForHashing(dataToVerify as SyncedData); // Prepare fetched data for hashing
           const dataString = stringify(preparedDataToVerify); // Use stable stringify
           console.log("Fetch: Verifying hash:", dataHash);
           // console.log("Fetch: Data being verified:", dataString.substring(0, 300) + "..."); // Log truncated data for debugging

           const isValid = await verifyHash(dataString, dataHash || ''); // Use verifyHash

           if (!isValid) {
               throw new Error("Data integrity check failed. Fetched data may be corrupted or tampered with.");
           }
           console.log("Fetch: Data integrity check passed.");
        }


      // --- Cache Reset on Successful Reconnection ---
      console.log("Fetch: Overwriting local state with fetched data...");
       // Null checks before setting
       setTransactions(data.transactions ?? []);
       setDebts(data.debts ?? []);
       setAssetItems(data.assetItems ?? []);
       setOtherLiabilityItems(data.otherLiabilityItems ?? []);
       setBudgetItems(data.budgetItems ?? []);
       setOwnedReviews(data.ownedReviews ?? {});
       setSharedReviews(data.sharedReviews ?? {});
       setStartDate(data.startDate ? new Date(data.startDate) : undefined);
       setEndDate(data.endDate ? new Date(data.endDate) : undefined);
       setGettingStartedDismissed(data.gettingStartedDismissed ?? false); // Set getting started state


      setLastSyncTime(new Date());
      setSyncStatus('synced');
      initialFetchAttempted.current = true;
      console.log("Fetch: Successfully synced with DB.");
       if (isRetry) {
           toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' });
       }

    } catch (error: any) {
      console.error('Fetch Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Failed',
        description: `Could not sync data: ${error.message}. Using local data for this session.`,
        variant: 'destructive',
      });
       initialFetchAttempted.current = true; // Mark as attempted even on error
    } finally {
      setIsSyncing(false);
    }
  // Update dependencies
  }, [
      isSignedIn, userId, toast, clearLocalState, saveDataToDB, // Include saveDataToDB for initial save case
      setTransactions, setDebts, setAssetItems, setOtherLiabilityItems,
      setBudgetItems, setOwnedReviews, setSharedReviews, setStartDate, setEndDate, isLoaded
  ]);


  // --- Effects ---

  // Handle user sign-in/sign-out and userId changes
  useEffect(() => {
      if (!isLoaded) return;
      const currentUserId = userId;
      const prevUserId = previousUserIdRef.current;

      console.log(`Auth Effect: Current User ID: ${currentUserId}, Previous User ID: ${prevUserId}, IsSignedIn: ${isSignedIn}`);

      if (isSignedIn && currentUserId) {
          if (prevUserId === undefined || currentUserId !== prevUserId) {
              console.log(`Auth Effect: User signed in or changed (${prevUserId ?? 'none'} -> ${currentUserId}). Clearing local state and fetching new data.`);
              clearLocalState();
              initialFetchAttempted.current = false; // Reset fetch attempt flag for new user
              fetchDataFromDB();
          } else if (!initialFetchAttempted.current) {
               // This case might happen on page refresh if the user was already logged in
              console.log("Auth Effect: User already signed in, attempting initial fetch...");
              fetchDataFromDB();
          }
      } else if (!isSignedIn && (prevUserId !== null && prevUserId !== undefined)) {
          // User signed out
          console.log(`Auth Effect: User signed out (${prevUserId}). Clearing local state.`);
          clearLocalState();
          setSyncStatus('local'); // Explicitly set to local on sign-out
      } else if (!isSignedIn && prevUserId === undefined) {
           // Initial load, not signed in
           console.log("Auth Effect: Initial load: Not signed in. Status is local.");
           setSyncStatus('local');
           previousUserIdRef.current = null; // Set prev to null to track initial state
      }

      // Update previousUserIdRef only if it has actually changed
      if (previousUserIdRef.current !== currentUserId) {
          previousUserIdRef.current = currentUserId;
      }

  }, [isSignedIn, userId, fetchDataFromDB, clearLocalState, isLoaded]);

   // Subscribe to store changes and trigger debounced save
   useEffect(() => {
       // Only subscribe if user is signed in, loaded, and initial fetch was successful (or deemed unnecessary)
       if (!isSignedIn || !userId || !initialFetchAttempted.current || !isLoaded || syncStatus === 'error') {
            console.log("Save Subscription: Skipping - User not ready or sync error.");
           return;
       }
        // Don't subscribe if currently fetching or saving
        if (isSyncing || isSavingRef.current) {
           console.log("Save Subscription: Skipping - Operation in progress.");
           return;
       }


       console.log("Save Subscription: Subscribing to store changes...");

        const triggerSave = (storeName: string) => {
            console.log(`${storeName} store changed, triggering save...`);
            setSyncStatus('local'); // Indicate data is now local until saved
            debouncedSave().catch(err => console.error(`Save failed after ${storeName} change:`, err));
        };

       // Subscribe to each store - Ensure check prevents saving during rehydration/initial set
        const unsubscribes = [
           useTransactionsStore.subscribe((state, prevState) => {
               if (state.isHydrated && state.transactions !== prevState.transactions && !isSyncing && !isSavingRef.current) triggerSave('Transaction');
           }),
           useDebtStore.subscribe((state, prevState) => {
               if (state.debts !== prevState.debts && !isSyncing && !isSavingRef.current) triggerSave('Debt');
           }),
           useStatementStore.subscribe((state, prevState) => {
               if ((state.assetItems !== prevState.assetItems ||
                   state.otherLiabilityItems !== prevState.otherLiabilityItems ||
                   state.startDate !== prevState.startDate ||
                   state.endDate !== prevState.endDate) && !isSyncing && !isSavingRef.current) triggerSave('Statement');
           }),
           useBudgetStore.subscribe((state, prevState) => {
               if (state.budgetItems !== prevState.budgetItems && !isSyncing && !isSavingRef.current) triggerSave('Budget');
           }),
           useWeeklyReviewStore.subscribe((state, prevState) => {
               // Only save if OWNED reviews change
                if (state.ownedReviews !== prevState.ownedReviews && !isSyncing && !isSavingRef.current) triggerSave('Weekly Review');
            }),
       ];


       return () => {
           console.log("Save Subscription: Unsubscribing from store changes.");
           unsubscribes.forEach(unsub => unsub());
       };
   // Rerun subscription setup if sign-in status, user ID, initial fetch status, or sync status changes.
   }, [isSignedIn, userId, debouncedSave, initialFetchAttempted, isSyncing, isLoaded, syncStatus]);


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

  return { syncStatus, retrySync, gettingStartedDismissed, setGettingStartedDismissed };
}
