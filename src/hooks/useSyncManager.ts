// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback } from 'react';
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
  startDate?: string; // Add date strings
  endDate?: string;
}

export function useSyncManager() {
  const { isSignedIn, userId } = useAuth();
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'local' | 'error'>('local');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Get store setters
  const setTransactions = useTransactionsStore(state => state.setTransactions);
  const setDebts = useDebtStore(state => state.setDebts);
  const setAssetItems = useStatementStore(state => state.setAssetItems);
  const setOtherLiabilityItems = useStatementStore(state => state.setOtherLiabilityItems);
  const setStartDate = useStatementStore(state => state.setStartDate);
  const setEndDate = useStatementStore(state => state.setEndDate);
  const setBudgetItems = useBudgetStore(state => state.setBudgetItems);
  const setReviews = useWeeklyReviewStore(state => state.setReviews);

  // Function to fetch data from the API
  const fetchDataFromDB = useCallback(async () => {
    if (!isSignedIn || !userId) {
      console.log("Sync: User not signed in.");
      setSyncStatus('local'); // Remain local if not signed in
      return;
    }

    console.log("Sync: Starting fetch from DB...");
    setIsSyncing(true);
    setSyncStatus('syncing');

    try {
      const response = await fetch('/api/sync'); // Fetch all data
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
      const data = await response.json();

      console.log("Sync: Received data:", data);

      // **Important:** Perform comparison and merging logic here if needed.
      // For this example, we'll overwrite local state with DB state upon initial sync.
      // In a real-world scenario, you'd compare timestamps or use a more sophisticated merge strategy.

      // Update Zustand stores with fetched data
      if (data.transactions) setTransactions(data.transactions);
      if (data.debts) setDebts(data.debts);
      if (data.assetItems) setAssetItems(data.assetItems);
      if (data.otherLiabilityItems) setOtherLiabilityItems(data.otherLiabilityItems);
      if (data.budgetItems) setBudgetItems(data.budgetItems);
      if (data.reviews) setReviews(data.reviews); // Assuming setReviews accepts the whole object
      if (data.startDate) setStartDate(new Date(data.startDate)); // Parse dates
      if (data.endDate) setEndDate(new Date(data.endDate));

      setLastSyncTime(new Date());
      setSyncStatus('synced');
      console.log("Sync: Successfully synced with DB.");
      toast({ title: 'Sync Complete', description: 'Data synced with the cloud.' });

    } catch (error: any) {
      console.error('Sync Error:', error);
      setSyncStatus('error');
      toast({
        title: 'Sync Failed',
        description: `Could not sync data with the cloud: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId, toast]); // Dependencies for fetching

  // Fetch data on initial load or when user signs in
  useEffect(() => {
    if (isSignedIn && userId) {
      fetchDataFromDB();
    } else {
      setSyncStatus('local'); // Reset to local if user signs out
      setLastSyncTime(null);
    }
  }, [isSignedIn, userId, fetchDataFromDB]);

  // Function to save data to the API (placeholder)
  // This would be called periodically or triggered by specific actions.
  const saveDataToDB = useCallback(async () => {
     if (!isSignedIn || !userId) {
       console.log("Save: User not signed in.");
       setSyncStatus('local');
       return;
     }
     if (syncStatus === 'syncing') {
        console.log("Save: Already syncing, skipping save.");
        return;
     }

    console.log("Save: Starting save to DB...");
    setIsSyncing(true); // Indicate activity, though 'syncing' status might be better
    setSyncStatus('syncing');

    // Get current state from all stores
    const currentState: SyncedData = {
      transactions: useTransactionsStore.getState().transactions,
      debts: useDebtStore.getState().debts,
      assetItems: useStatementStore.getState().assetItems,
      otherLiabilityItems: useStatementStore.getState().otherLiabilityItems,
      budgetItems: useBudgetStore.getState().budgetItems,
      reviews: useWeeklyReviewStore.getState().reviews,
      startDate: useStatementStore.getState().startDate?.toISOString(), // Serialize dates
      endDate: useStatementStore.getState().endDate?.toISOString(),
    };

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentState),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to parse error
        throw new Error(`Failed to save data: ${response.statusText} ${errorData.error || ''}`);
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      console.log("Save: Successfully saved to DB.", result);
      // Optionally show a subtle success toast or update UI indicator
      // toast({ title: 'Data Saved', description: 'Changes saved to the cloud.' });

    } catch (error: any) {
      console.error('Save Error:', error);
      setSyncStatus('error'); // Keep status as error until next successful sync
      toast({
        title: 'Save Failed',
        description: `Could not save data to the cloud: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  }, [isSignedIn, userId, toast, syncStatus]); // Dependencies for saving

  // **Debounced Save Logic:**
  // Use a debounce function (e.g., from lodash or a simple custom one)
  // to call saveDataToDB after a period of inactivity following store changes.
  // This requires subscribing to changes in each store.

  // Example conceptual debounce (replace with actual implementation):
  const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const debounced = (...args: Parameters<F>) => {
          if (timeout !== null) {
              clearTimeout(timeout);
              timeout = null;
          }
          timeout = setTimeout(() => func(...args), waitFor);
      };

      return debounced;
  };

  const debouncedSave = useCallback(debounce(saveDataToDB, 3000), [saveDataToDB]); // Save after 3 seconds of inactivity

   // Subscribe to store changes and trigger debounced save
   useEffect(() => {
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
   }, [debouncedSave]);


  return { isSyncing, syncStatus, lastSyncTime, forceSync: fetchDataFromDB, forceSave: saveDataToDB };
}
