// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore'; // Import notification store
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types'; // Import NotificationItem
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';

// Define the structure of the synced data (as expected from the API)
interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[]; // Add notifications
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

// Define the possible sync statuses
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded } = useAuth();
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
  const setNotifications = useNotificationStore(state => state.setNotifications); // Add notification setter
  const clearNotifications = useNotificationStore(state => state.clearAllNotifications); // Add notification clearer

  // --- Clear Local State Function ---
  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    console.log("SyncManager: Clearing local state (session storage)...");
    isClearingRef.current = true;

    clearTransactions();
    clearDebts();
    clearStatementItems();
    clearBudgetItems();
    clearReviews();
    clearNotifications(); // Clear notifications
    setGettingStartedDismissedState(false);

    sessionStorage.removeItem('ifcGuru_transactions');
    sessionStorage.removeItem('ifcGuru_debts');
    sessionStorage.removeItem('ifcGuru_statementItems');
    sessionStorage.removeItem('ifcGuru_budgetItems');
    sessionStorage.removeItem('ifcGuru_weeklyReviews');
    sessionStorage.removeItem('ifcGuru_notifications'); // Remove notifications from storage

    console.log("SyncManager: Local state (sessionStorage) cleared.");
    setSyncStatus('local');
    setLastSyncTime(null);
    initialFetchDoneRef.current = false;
    isClearingRef.current = false;
  }, [
    clearTransactions,
    clearDebts,
    clearStatementItems,
    clearBudgetItems,
    clearReviews,
    clearNotifications,
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
        notifications: useNotificationStore.getState().notifications, // Add notifications
        startDate: useStatementStore.getState().startDate?.toISOString(),
        endDate: useStatementStore.getState().endDate?.toISOString(),
        gettingStartedDismissed: gettingStartedDismissed,
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
    } finally {
      isSavingRef.current = false;
    }
  }, [isSignedIn, userId, toast, gettingStartedDismissed]); // Add gettingStartedDismissed dependency

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
           clearLocalState();
           setSyncStatus('synced');
           initialFetchDoneRef.current = true;
           return;
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

      console.log("Fetch: Overwriting local state with fetched data...");
      setTransactions(data.transactions ?? []);
      setDebts(data.debts ?? []);
      setAssetItems(data.assetItems ?? []);
      setOtherLiabilityItems(data.otherLiabilityItems ?? []);
      setBudgetItems(data.budgetItems ?? []);
      setOwnedReviews(data.ownedReviews ?? {});
      setSharedReviews(data.sharedReviews ?? {});
      setNotifications(data.notifications ?? []); // Set notifications
      setStartDate(data.startDate ? new Date(data.startDate) : undefined);
      setEndDate(data.endDate ? new Date(data.endDate) : undefined);
      setGettingStartedDismissedState(data.gettingStartedDismissed ?? false);

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
      initialFetchDoneRef.current = true;
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    isSignedIn, userId, isLoaded, toast, clearLocalState,
    setTransactions, setDebts, setAssetItems, setOtherLiabilityItems,
    setBudgetItems, setOwnedReviews, setSharedReviews, setNotifications, // Add setNotifications
    setStartDate, setEndDate,
  ]);

  // --- Debounced Save Wrapper ---
  const triggerDebouncedSave = useCallback(() => {
      if (!isSignedIn || !userId) return;
      if (isFetchingRef.current || isSavingRef.current || isClearingRef.current) return;

      setSyncStatus('local');
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
          saveDataToDB().catch(err => console.error("Debounced save failed:", err));
      }, 3000);
  }, [isSignedIn, userId, saveDataToDB]);

  // --- Effects ---

  // Initial Fetch on Load / User Change
  useEffect(() => {
    if (!isLoaded) return;

    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    console.log(`Auth Effect: Current User ID: ${currentUserId}, Previous User ID: ${prevUserId}, SignedIn: ${isSignedIn}`);

    if (isSignedIn && currentUserId) {
      if (currentUserId !== prevUserId) {
        console.log(`Auth Effect: User signed in or changed (${prevUserId ?? 'none'} -> ${currentUserId}). Fetching data.`);
        initialFetchDoneRef.current = false;
        if (prevUserId !== undefined) {
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
            previousUserIdRef.current = null;
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
      return;
    }

    console.log("Save Subscription: Subscribing to store changes...");

    const stores = [
      useTransactionsStore,
      useDebtStore,
      useStatementStore,
      useBudgetStore,
      useWeeklyReviewStore,
      useNotificationStore, // Subscribe to notification changes too
    ];

    const unsubscribes = stores.map(useStore =>
      useStore.subscribe(
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
      fetchDataFromDB(true);
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
      setGettingStartedDismissed: setGettingStartedDismissedState,
  };
}
