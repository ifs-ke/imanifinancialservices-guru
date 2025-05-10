// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useToast } from '@/hooks/use-toast';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';
import type {
  TransactionWithId,
  DebtItem,
  StatementItem,
  OtherLiabilityItem,
  BudgetItem,
  WeeklyReviewData,
  NotificationItem
} from '@/lib/types';

// Store imports
import { useTransactionsStore, TransactionsState } from '@/store/transactionsStore';
import { useDebtStore, DebtState } from '@/store/debtStore';
import { useStatementStore, StatementState } from '@/store/statementStore';
import { useBudgetStore, BudgetState } from '@/store/budgetStore';
import { useWeeklyReviewStore, WeeklyReviewState } from '@/store/weeklyReviewStore';
import { useNotificationStore, NotificationState } from '@/store/notificationStore';

// Constants
const SYNC_API_ENDPOINT = '/api/sync';
const SAVE_API_ENDPOINT = '/api/save';
const STORE_KEYS = [
  'ifcGuru_transactions',
  'ifcGuru_debts',
  'ifcGuru_statementItems',
  'ifcGuru_budgetItems',
  'ifcGuru_weeklyReviews',
  'ifcGuru_notifications'
] as const;

// Types
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncTime: Date | null;
  gettingStartedDismissed: boolean;
  hashMismatch: boolean;
  isMismatchDialogOpen: boolean;
}

interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  startDate?: Date;
  endDate?: Date;
  gettingStartedDismissed: boolean;
}

interface SyncData extends Omit<SyncedData, 'startDate' | 'endDate'> {
  startDate?: Date;
  endDate?: Date;
}

type StoreType = 
  | TransactionsState 
  | DebtState 
  | StatementState 
  | BudgetState 
  | WeeklyReviewState 
  | NotificationState;

type ClearableStore = { clear: () => void };
type ResettableStore = { reset: () => void };

export function useSyncManager() {
  // Hooks
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();

  // State
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSyncTime: null,
    gettingStartedDismissed: false,
    hashMismatch: false,
    isMismatchDialogOpen: false
  });

  // Refs
  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const internalPreviousUserId = useRef<string | null | undefined>(undefined);
  const hasLocalChangesRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Store getters with proper typing
  const storeGetters = useMemo(() => ({
    transactions: useTransactionsStore.getState,
    debts: useDebtStore.getState,
    statement: useStatementStore.getState,
    budget: useBudgetStore.getState,
    weeklyReview: useWeeklyReviewStore.getState,
    notification: useNotificationStore.getState
  }), []);

  // Helper functions
  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncState(prev => ({ ...prev, ...partialState }));
  }, []);

  const cleanupAsyncOperations = useCallback((reason = 'Operation cleanup') => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(reason);
      abortControllerRef.current = null;
      logDebug('Async operations aborted', { reason, userId });
    }
  }, [userId]);

  // Data operations
  const clearLocalState = useCallback(async () => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    const contextUserId = internalPreviousUserId.current;

    try {
      logInfo('Clearing local state', { userId: contextUserId });

      // Clear all stores with proper type checking
      Object.values(storeGetters).forEach(store => {
        const storeInstance = store();
        if ('clear' in storeInstance) {
          (storeInstance as ClearableStore).clear();
        } else if ('reset' in storeInstance) {
          (storeInstance as ResettableStore).reset();
        }
      });

      // Clear session storage
      STORE_KEYS.forEach(key => {
        try {
          sessionStorage.removeItem(key);
        } catch (e) {
          logWarn(`Failed to remove ${key} from sessionStorage`, { error: e, userId: contextUserId });
        }
      });

      updateSyncState({
        status: 'local',
        lastSyncTime: null,
        gettingStartedDismissed: false,
        hashMismatch: false,
        isMismatchDialogOpen: false
      });
      hasLocalChangesRef.current = false;
    } catch (error) {
      logError('Error during clearLocalState', error, { userId: contextUserId });
    } finally {
      isClearingRef.current = false;
    }
  }, [storeGetters, updateSyncState]);

  // Centralized error handling
  const handleError = useCallback((operation: string, error: unknown, fallbackMessage: string) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`${operation} error`, error, { userId });
    
    return {
      title: `${operation} Failed`,
      description: `${fallbackMessage} ${errorMessage ? `(${errorMessage})` : ''}`.trim(),
      variant: 'destructive' as const
    };
  }, [userId]);

  const verifyDataHash = useCallback(async (data: SyncedData, serverHash: string) => {
    const preparedData = prepareDataForHashing(data);
    const dataString = stringify(preparedData);
    const isValid = await verifyHash(dataString, serverHash);
    
    if (!isValid) {
      logError('Data integrity check failed', {
        serverHash,
        clientHashInput: dataString.substring(0, 200),
        userId
      });
    }
    
    return isValid;
  }, [userId]);

  const handleHashMismatch = useCallback(() => {
    updateSyncState({ 
      status: 'error', 
      hashMismatch: true, 
      isMismatchDialogOpen: true 
    });
    
    toast({
      title: 'Data Sync Mismatch',
      description: "Local and server data don't match. Please resolve the conflict.",
      variant: 'destructive',
      link: '#'
    });
  }, [toast, updateSyncState]);

  const getCurrentState = useCallback((): SyncData => {
    const state = {
      transactions: storeGetters.transactions().transactions,
      debts: storeGetters.debts().debts,
      assetItems: storeGetters.statement().assetItems,
      otherLiabilityItems: storeGetters.statement().otherLiabilityItems,
      budgetItems: storeGetters.budget().budgetItems,
      ownedReviews: storeGetters.weeklyReview().ownedReviews,
      sharedReviews: storeGetters.weeklyReview().sharedReviews,
      notifications: storeGetters.notification().notifications,
      startDate: storeGetters.statement().startDate,
      endDate: storeGetters.statement().endDate,
      gettingStartedDismissed: syncState.gettingStartedDismissed,
    };

    return state;
  }, [storeGetters, syncState.gettingStartedDismissed]);

  const prepareDataForSave = useCallback(async (currentState: SyncData) => {
    const preparedData = prepareDataForHashing(currentState);
    const dataString = stringify(preparedData);
    const dataHash = await hashData(dataString);
    logDebug('Client hash calculated', { hash: dataHash, userId });
    return { preparedData, dataHash };
  }, [userId]);

  const parseErrorResponse = useCallback(async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return { error: `Request failed with status ${response.status}` };
    }
  }, []);

  const updateStoresWithFetchedData = useCallback(async (fetchedData: SyncedData) => {
    const currentState = getCurrentState();
    const preparedFetched = prepareDataForHashing(fetchedData);
    const preparedLocal = prepareDataForHashing(currentState);
    
    if (stringify(preparedFetched) !== stringify(preparedLocal)) {
      logInfo('Updating stores with fetched data', { userId });
      storeGetters.transactions().setTransactions(fetchedData.transactions ?? []);
      storeGetters.debts().setDebts(fetchedData.debts ?? []);
      storeGetters.statement().setAssetItems(fetchedData.assetItems ?? []);
      storeGetters.statement().setOtherLiabilityItems(fetchedData.otherLiabilityItems ?? []);
      storeGetters.budget().setBudgetItems(fetchedData.budgetItems ?? []);
      storeGetters.weeklyReview().setOwnedReviews(fetchedData.ownedReviews ?? {});
    }

    // Always update these secondary stores
    storeGetters.weeklyReview().setSharedReviews(fetchedData.sharedReviews ?? {});
    storeGetters.notification().setNotifications(fetchedData.notifications ?? []);
    storeGetters.statement().setStartDate(fetchedData.startDate ? new Date(fetchedData.startDate) : undefined);
    storeGetters.statement().setEndDate(fetchedData.endDate ? new Date(fetchedData.endDate) : undefined);
  }, [getCurrentState, storeGetters, userId]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    // Validation
    if (!isClerkLoaded || !isSignedIn || !userId) {
      logDebug('Fetch aborted - invalid auth state', { isClerkLoaded, isSignedIn, userId });
      updateSyncState({ status: 'local' });
      initialFetchDoneRef.current = true;
      return false;
    }
  
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Fetch aborted - operation in progress', {
        isSaving: isSavingRef.current,
        isFetching: isFetchingRef.current,
        isClearing: isClearingRef.current,
        userId
      });
      return false;
    }
  
    // Setup
    isFetchingRef.current = true;
    updateSyncState({ status: 'syncing' });
    if (!skipHashCheck) updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
  
    cleanupAsyncOperations('Starting new fetch');
    abortControllerRef.current = new AbortController();
  
    try {
      // API call
      const response = await fetch(SYNC_API_ENDPOINT, {
        signal: abortControllerRef.current.signal
      });
  
      if (abortControllerRef.current?.signal.aborted) {
        logDebug('Fetch aborted by signal', { userId });
        updateSyncState({ status: 'local' });
        return false;
      }
  
      if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        throw new Error(errorData.error || 'Fetch failed');
      }
  
      // Process response
      const data: SyncedData & { dataHash?: string } = await response.json();
      const { dataHash: serverHash, ...fetchedData } = data;
  
      // Verify hash if needed
      if (!skipHashCheck && serverHash) {
        const isValid = await verifyDataHash(fetchedData, serverHash);
        if (!isValid) {
          handleHashMismatch();
          return false;
        }
      }
  
      // Update stores
      await updateStoresWithFetchedData(fetchedData);
  
      // Update sync state
      updateSyncState({
        status: 'synced',
        lastSyncTime: new Date(),
        gettingStartedDismissed: fetchedData.gettingStartedDismissed ?? false,
        hashMismatch: false,
        isMismatchDialogOpen: false
      });
  
      hasLocalChangesRef.current = false;
      initialFetchDoneRef.current = true;
  
      if (isRetry || skipHashCheck) {
        toast({ title: 'Sync Successful', description: 'Data successfully loaded from the cloud.' });
      }
  
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        logDebug('Fetch aborted intentionally', { userId, reason: error.message });
        updateSyncState((prev: { status: string; }) => ({
          ...prev,
          status: prev.status === 'syncing' ? 'local' : prev.status
        }));
        return false;
      }
  
      const { title, description } = handleError(
        'Sync Load',
        error,
        'Could not load data. Your local data (if any) is preserved. Click cloud icon to retry.'
      );
  
      toast({ title, description });
      updateSyncState({ status: 'error' });
      return false;
    } finally {
      isFetchingRef.current = false;
      logDebug('Fetch operation complete', { userId });
    }
  }, [
    isClerkLoaded,
    isSignedIn,
    userId,
    toast,
    updateSyncState,
    cleanupAsyncOperations,
    parseErrorResponse,
    verifyDataHash,
    handleHashMismatch,
    updateStoresWithFetchedData,
    handleError
  ]);
  

  const saveData = useCallback(async (isForceSave = false) => {
    // Validation
    if (!isClerkLoaded || !isSignedIn || !userId) {
      logError('Save aborted - invalid auth state', { isClerkLoaded, isSignedIn, userId });
      updateSyncState({ status: 'local' });
      return false;
    }

    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save aborted - operation in progress', {
        isSaving: isSavingRef.current,
        isFetching: isFetchingRef.current,
        isClearing: isClearingRef.current,
        userId
      });
      return false;
    }

    // Setup
    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });

    if (!isForceSave) {
      const preSaveFetchSuccess = await fetchData(false, false);
      if (!preSaveFetchSuccess) {
        logError('Save aborted - pre-save fetch failed', { userId });
        updateSyncState({ status: 'error' });
        isSavingRef.current = false;
        return false;
      }
    } else {
      updateSyncState({ hashMismatch: false, isMismatchDialogOpen: false });
    }

    cleanupAsyncOperations('Starting new save');
    abortControllerRef.current = new AbortController();

    try {
      // Prepare data
      const currentState = getCurrentState();
      const { preparedData, dataHash } = await prepareDataForSave(currentState);

      // API call
      const response = await fetch(SAVE_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
        signal: abortControllerRef.current.signal
      });

      if (abortControllerRef.current?.signal.aborted) {
        logDebug('Save aborted by signal', { userId });
        updateSyncState({ status: 'local' });
        return false;
      }

      if (!response.ok) {
        const errorData = await parseErrorResponse(response);
        
        if (response.status === 400 && errorData.error?.includes('integrity check failed')) {
          handleHashMismatch();
          return false;
        }

        let description = 'Could not save data';
        if (response.status === 401) {
          description = 'Please refresh or log in again.';
        } else if (response.status === 429) {
          description = 'Please wait a moment and try again.';
        } else if (errorData.error) {
          description += ` (${errorData.error})`;
        }

        toast({
          title: response.status === 401 ? 'Session Expired' : 
                response.status === 429 ? 'Too Many Requests' : 'Save Failed',
          description,
          variant: 'destructive'
        });
        
        return false;
      }

      // Success
      await response.json();
      updateSyncState({
        status: 'synced',
        lastSyncTime: new Date(),
        hashMismatch: false,
        isMismatchDialogOpen: false
      });

      hasLocalChangesRef.current = false;
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;
    } catch (error: unknown) {
      const { title, description } = handleError(
        'Save',
        error,
        'Could not save data.'
      );
      
      toast({ title, description });
      return false;
    } finally {
      isSavingRef.current = false;
      logDebug('Save operation complete', { userId });
    }
  }, [
    isClerkLoaded,
    isSignedIn,
    userId,
    fetchData,
    toast,
    updateSyncState,
    cleanupAsyncOperations,
    getCurrentState,
    prepareDataForSave,
    parseErrorResponse,
    handleHashMismatch,
    handleError
  ]);

  // Store change handler
  const handleStoreChange = useCallback(() => {
    if (isFetchingRef.current || isSavingRef.current || isClearingRef.current) {
      return;
    }

    if (!hasLocalChangesRef.current) {
      logInfo('First local change detected', { userId });
    }
    hasLocalChangesRef.current = true;

    if (['synced', 'idle', 'error'].includes(syncState.status)) {
      updateSyncState({ status: 'local' });
    }
  }, [syncState.status, updateSyncState, userId]);

  // Effect hooks
  useEffect(() => {
    const handleAuthChange = async () => {
      if (!isClerkLoaded) {
        logDebug('Auth not loaded', { userId });
        updateSyncState({ status: 'idle' });
        return;
      }

      const currentUserId = userId;
      const previousUserId = internalPreviousUserId.current;

      // No change needed if state is consistent
      if (currentUserId === previousUserId) {
        if ((currentUserId && initialFetchDoneRef.current) || 
            (!currentUserId && !initialFetchDoneRef.current)) {
          return;
        }
      }

      cleanupAsyncOperations('Auth state change');

      if (currentUserId && currentUserId !== previousUserId) {
        // New user signed in or user changed
        logInfo('User changed', { previousUserId, currentUserId });
        await clearLocalState();
        internalPreviousUserId.current = currentUserId;
        initialFetchDoneRef.current = false;
        await fetchData();
      } else if (!currentUserId && previousUserId) {
        // User signed out
        logInfo('User signed out', { previousUserId });
        await clearLocalState();
        internalPreviousUserId.current = null;
        initialFetchDoneRef.current = false;
        updateSyncState({
          status: 'local',
          lastSyncTime: null,
          hashMismatch: false,
          isMismatchDialogOpen: false
        });
      } else if (!currentUserId && !previousUserId) {
        // Initial state with no user
        logInfo('Initial state - no user', { userId: currentUserId });
        updateSyncState({
          status: 'local',
          lastSyncTime: null,
          hashMismatch: false,
          isMismatchDialogOpen: false
        });
        initialFetchDoneRef.current = true;
      }
    };

    handleAuthChange();
    return () => cleanupAsyncOperations('Component unmount');
  }, [userId, isSignedIn, isClerkLoaded, clearLocalState, fetchData, updateSyncState, cleanupAsyncOperations]);

  // Store change subscription
  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId || !initialFetchDoneRef.current) {
      return;
    }

    const storesToWatch = [
      useTransactionsStore,
      useDebtStore,
      useStatementStore,
      useBudgetStore,
      useWeeklyReviewStore
    ];

    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => unsubscribes.forEach(unsub => unsub());
  }, [isClerkLoaded, isSignedIn, userId, handleStoreChange]);

  // Public API
  const forceSaveLocal = useCallback(async () => {
    if (!userId || !isSignedIn) {
      toast({ 
        title: 'Error', 
        description: 'Cannot force save without an authenticated user.', 
        variant: 'destructive' 
      });
      return false;
    }

    logWarn('User chose to force save local data', { userId });
    const success = await saveData(true);
    
    if (success) {
      toast({ 
        title: 'Conflict Resolved', 
        description: 'Local data successfully saved to the cloud.' 
      });
    }
    
    return success;
  }, [saveData, toast, userId, isSignedIn]);

  const forceFetchServer = useCallback(async () => {
    if (!userId || !isSignedIn) {
      toast({ 
        title: 'Error', 
        description: 'Cannot force fetch without an authenticated user.', 
        variant: 'destructive' 
      });
      return false;
    }

    logWarn('User chose to force fetch server data', { userId });
    const success = await fetchData(false, true);
    
    if (success) {
      toast({ 
        title: 'Conflict Resolved', 
        description: 'Server data loaded. Any unsaved local changes were discarded.' 
      });
    }
    
    return success;
  }, [fetchData, toast, userId, isSignedIn]);

  const retrySync = useCallback(async () => {
    if (!isClerkLoaded) {
      toast({ 
        title: 'Cannot Sync', 
        description: 'Authentication status loading...', 
        variant: 'default' 
      });
      return;
    }

    if (!isSignedIn || !userId) {
      toast({ 
        title: 'Cannot Sync', 
        description: 'Please sign in to sync your data.', 
        variant: 'destructive' 
      });
      return;
    }

    if (syncState.hashMismatch) {
      updateSyncState({ isMismatchDialogOpen: true });
      return;
    }

    if (hasLocalChangesRef.current || syncState.status === 'error') {
      await saveData(false);
    } else if (['synced', 'idle', 'local'].includes(syncState.status)) {
      await fetchData(true);
    }
  }, [
    syncState.status,
    syncState.hashMismatch,
    isClerkLoaded,
    isSignedIn,
    userId,
    saveData,
    fetchData,
    toast,
    updateSyncState
  ]);

  return {
    syncStatus: syncState.status,
    retrySync,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      updateSyncState({ gettingStartedDismissed: dismissed });
      if (isSignedIn && userId && initialFetchDoneRef.current) {
        handleStoreChange();
      }
    },
    hashMismatch: syncState.hashMismatch,
    forceSaveLocal,
    forceFetchServer,
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (open: boolean) => updateSyncState({ isMismatchDialogOpen: open }),
    lastSyncTime: syncState.lastSyncTime,
  };
}