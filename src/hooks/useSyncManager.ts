// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs/client'; // Use client-side auth
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import { hashData, verifyHash } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError } from '@/lib/logger'; // Import Logtail helpers

interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

const SAVE_DEBOUNCE_DELAY = 3000;

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissedState] = useState(false);
  const [hashMismatch, setHashMismatch] = useState(false);

  const isFetchingRef = useRef(false);
  const isSavingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLocalChangesRef = useRef(false);

  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  const logContext = useCallback(() => ({ userId: userId || 'unknown' }), [userId]);

  const clearLocalState = useCallback(() => {
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing local state.', logContext());
    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();
      setGettingStartedDismissedState(false);
      const storeKeys = ['ifcGuru_transactions', 'ifcGuru_debts', 'ifcGuru_statementItems', 'ifcGuru_budgetItems', 'ifcGuru_weeklyReviews', 'ifcGuru_notifications'];
      storeKeys.forEach(key => { try { sessionStorage.removeItem(key); } catch (e) { logWarn(`Failed to remove ${key} from sessionStorage:`, { ...logContext(), error: e }); } });
      logInfo('SyncManager: Local state cleared.', logContext());
      setSyncStatus('local');
      setLastSyncTime(null);
      initialFetchDoneRef.current = false;
      hasLocalChangesRef.current = false;
      setHashMismatch(false);
    } catch (error) { logError('Error during clearLocalState:', error, logContext()); }
    finally { isClearingRef.current = false; }
  }, [
      getTransactionsState, getDebtState, getStatementState, getBudgetState,
      getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState, logContext
  ]);

  const fetchData = useCallback(async (isRetry = false, skipHashCheck = false) => {
    if (!isSignedIn || !userId || !isClerkLoaded) { logInfo('Fetch Aborted: User not signed in or Clerk not loaded.', logContext()); if (previousUserIdRef.current) clearLocalState(); setSyncStatus('local'); return false; }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) { logInfo('Fetch Aborted: Operation in progress.', logContext()); return false; }

    logInfo(`Fetch Triggered${isRetry ? ' (Retry)' : ''}${skipHashCheck ? ' (Skip Hash Check)' : ''}...`, logContext());
    isFetchingRef.current = true;
    setSyncStatus('syncing');
    setHashMismatch(false);

    try {
      const response = await fetch('/api/sync');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        const serverErrorMessage = errorData.error || `Fetch failed: ${response.statusText}`;
        logError(`Fetch API Error ${response.status}: ${response.statusText}`, errorData, logContext());
        throw new Error(serverErrorMessage);
      }

      const data: SyncedData & { dataHash?: string } = await response.json();
      logInfo('Fetch: Received data from server.', logContext());
      const { dataHash, ...fetchedData } = data;

      if (!skipHashCheck) {
        if (!dataHash) { logWarn('Fetch Warning: No dataHash received from server. Skipping integrity check.', logContext()); }
        else {
          const preparedDataToVerify = prepareDataForHashing(fetchedData as SyncedData);
          const dataString = stringify(preparedDataToVerify);
          logInfo(`Fetch: Verifying received hash: ${dataHash}`, logContext());
          const isValid = await verifyHash(dataString, dataHash);
          if (!isValid) {
            logError('Fetch Error: Data integrity check failed!', undefined, { ...logContext(), clientHashCalculationInput: dataString.substring(0, 200) });
            setHashMismatch(true);
            setSyncStatus('error');
            toast({ title: 'Data Sync Mismatch', description: "Local and server data don't match. Resolve conflict using cloud icon.", variant: 'destructive' });
            isFetchingRef.current = false;
            return false;
          }
          logInfo('Fetch: Data integrity check passed.', logContext());
        }
      } else {
        logInfo('Fetch: Skipping hash check as requested (Force Fetch).', logContext());
      }

      logInfo('Fetch: Overwriting local stores with fetched data...', logContext());
      getTransactionsState().setTransactions(fetchedData.transactions ?? []);
      getDebtState().setDebts(fetchedData.debts ?? []);
      getStatementState().setAssetItems(fetchedData.assetItems ?? []);
      getStatementState().setOtherLiabilityItems(fetchedData.otherLiabilityItems ?? []);
      getBudgetState().setBudgetItems(fetchedData.budgetItems ?? []);
      getWeeklyReviewState().setOwnedReviews(fetchedData.ownedReviews ?? {});
      getWeeklyReviewState().setSharedReviews(fetchedData.sharedReviews ?? {});
      getNotificationState().setNotifications(fetchedData.notifications ?? []);
      getStatementState().setStartDate(fetchedData.startDate ? new Date(fetchedData.startDate) : undefined);
      getStatementState().setEndDate(fetchedData.endDate ? new Date(fetchedData.endDate) : undefined);
      setGettingStartedDismissedState(fetchedData.gettingStartedDismissed ?? false);

      setLastSyncTime(new Date());
      setSyncStatus('synced');
      initialFetchDoneRef.current = true;
      hasLocalChangesRef.current = false;
      logInfo('Fetch: Successfully synced with DB.', logContext());
      if (isRetry || skipHashCheck) { toast({ title: 'Sync Successful', description: 'Data successfully synced with the cloud.' }); }
      return true;

    } catch (error: any) {
      logError('Fetch Error:', error, logContext());
      setSyncStatus('error');
      toast({ title: 'Sync Load Failed', description: `Could not load data: ${error.message}. Using local. Click cloud icon to retry.`, variant: 'destructive' });
      initialFetchDoneRef.current = true;
      return false;
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    isSignedIn, userId, isClerkLoaded, toast, clearLocalState,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, setGettingStartedDismissedState, logContext
  ]);

  const saveData = useCallback(async (isForceSave = false) => {
    if (!isSignedIn || !userId) { logInfo('Save Aborted: User not signed in.', logContext()); setSyncStatus('local'); return false; }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) { logInfo('Save Aborted: Operation in progress.', logContext()); return false; }

    logInfo(`Save Triggered${isForceSave ? ' (Force)' : ''}...`, logContext());
    setSyncStatus('syncing');
    isSavingRef.current = true;

    if (!isForceSave) {
      logInfo('Save: Fetching latest data before saving...', logContext());
      const fetchSuccess = await fetchData(false, false);
      if (!fetchSuccess) {
        logError('Save Aborted: Fetch failed before save. Hash mismatch or other error.', undefined, logContext());
        isSavingRef.current = false;
        return false;
      }
      logInfo('Save: Pre-save fetch successful.', logContext());
    }
    setHashMismatch(false);

    try {
      const currentState = {
        transactions: getTransactionsState().transactions,
        debts: getDebtState().debts,
        assetItems: getStatementState().assetItems,
        otherLiabilityItems: getStatementState().otherLiabilityItems,
        budgetItems: getBudgetState().budgetItems,
        ownedReviews: getWeeklyReviewState().ownedReviews,
        notifications: getNotificationState().notifications,
        startDate: getStatementState().startDate,
        endDate: getStatementState().endDate,
        gettingStartedDismissed: gettingStartedDismissed,
      };
      const preparedData = prepareDataForHashing(currentState as SyncedData);
      const dataString = stringify(preparedData);
      const dataHash = await hashData(dataString);
      logInfo(`Save Client: Calculated client hash: ${dataHash}`, logContext());

      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preparedData, dataHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        const serverErrorMessage = `Save failed: ${response.statusText} (${errorData.error || 'No server details'})`;
        logError(`Save API Error ${response.status}: ${response.statusText}`, errorData, logContext());
        throw new Error(serverErrorMessage);
      }

      const result = await response.json();
      setLastSyncTime(new Date());
      setSyncStatus('synced');
      hasLocalChangesRef.current = false;
      logInfo(`Save Successful. Server: ${result.message}`, logContext());
      toast({ title: 'Data Saved', description: 'Changes saved to cloud.' });
      return true;

    } catch (error: any) {
      logError('Save Error:', error, logContext());
      setSyncStatus('error');
      toast({ title: 'Sync Save Failed', description: `Could not save: ${error.message}. Changes remain local. Click cloud icon to retry.`, variant: 'destructive' });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [
    isSignedIn, userId, toast, gettingStartedDismissed,
    getTransactionsState, getDebtState, getStatementState, getBudgetState,
    getWeeklyReviewState, getNotificationState, fetchData, logContext
  ]);

  const triggerDebouncedSave = useCallback(() => {
    if (!isSignedIn || !userId || isFetchingRef.current || isSavingRef.current || isClearingRef.current) { logInfo('Debounced Save Skipped: User/Operation state prevents save.', logContext()); return; }
    if (hashMismatch) { logInfo('Debounced Save Skipped: Hash mismatch detected.', logContext()); return; }

    if (initialFetchDoneRef.current) {
      hasLocalChangesRef.current = true;
      if (syncStatus === 'synced') {
        setSyncStatus('local');
        logInfo('Debounced Save: Status changed to "local" due to changes.', logContext());
      }
    }

    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
    logInfo(`Debounced Save: Scheduling save in ${SAVE_DEBOUNCE_DELAY}ms...`, logContext());
    saveTimeoutRef.current = setTimeout(() => {
      saveData().catch(err => { logError('Error during debounced save execution:', err, logContext()); });
    }, SAVE_DEBOUNCE_DELAY);
  }, [isSignedIn, userId, saveData, syncStatus, hashMismatch, logContext]);

  useEffect(() => {
    if (!isClerkLoaded) { logInfo('Auth Effect: Clerk not loaded.', logContext()); return; }
    const currentUserId = userId;
    if (currentUserId && currentUserId !== previousUserIdRef.current) {
      logInfo(`Auth Effect: User signed in/changed (${previousUserIdRef.current ?? 'none'} -> ${currentUserId}).`, logContext());
      clearLocalState();
      previousUserIdRef.current = currentUserId;
      initialFetchDoneRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      logInfo('Auth Effect: Triggering initial fetch...', logContext());
      fetchData();
    } else if (!currentUserId && previousUserIdRef.current) {
      logInfo(`Auth Effect: User signed out (was ${previousUserIdRef.current}). Clearing local state.`, logContext());
      clearLocalState();
      previousUserIdRef.current = null;
      initialFetchDoneRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSyncStatus('local');
    } else if (!currentUserId && previousUserIdRef.current === undefined) {
      logInfo('Auth Effect: Initial load, user not signed in.', logContext());
      setSyncStatus('local');
      previousUserIdRef.current = null;
    } else if (currentUserId && currentUserId === previousUserIdRef.current && !initialFetchDoneRef.current) {
      logInfo('Auth Effect: Already logged in, triggering initial fetch...', logContext());
      fetchData();
    }
  }, [userId, isSignedIn, isClerkLoaded, fetchData, clearLocalState, logContext]);

  useEffect(() => {
    if (!isSignedIn || !userId || !isClerkLoaded) {
      logInfo('Save Subscription: Conditions not met (User/Clerk state).', logContext());
      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
      return;
    }
    if (hashMismatch) {
      logInfo('Save Subscription: Blocked due to hash mismatch.', logContext());
      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
      return;
    }

    logInfo('Save Subscription: Subscribing to store changes...', logContext());
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useNotificationStore,
    ];

    const handleChange = () => {
      if (initialFetchDoneRef.current && !isFetchingRef.current && !isSavingRef.current && !isClearingRef.current && !hashMismatch) {
        logInfo('Save Subscription: Store change detected, triggering debounced save.', logContext());
        triggerDebouncedSave();
      } else {
        logInfo('Save Subscription: Store change detected, but conditions not met. Save deferred.', logContext());
      }
    };

    const unsubscribes = storesToWatch.map(useStore => useStore.subscribe(handleChange));
    return () => {
      logInfo('Save Subscription: Unsubscribing from store changes.', logContext());
      unsubscribes.forEach(unsub => unsub());
      if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); }
    };
  }, [isSignedIn, userId, isClerkLoaded, initialFetchDoneRef, triggerDebouncedSave, hashMismatch, logContext]);

  useEffect(() => {
    if (initialFetchDoneRef.current && isSignedIn && userId && !hashMismatch) {
      logInfo('Getting Started State Change: Triggering debounced save...', logContext());
      triggerDebouncedSave();
    }
  }, [gettingStartedDismissed, initialFetchDoneRef, isSignedIn, userId, triggerDebouncedSave, hashMismatch, logContext]);

  const forceSaveLocal = useCallback(async () => {
    if (!hashMismatch) return false;
    logWarn('SyncManager: User chose to force save local data for hash mismatch.', logContext());
    setSyncStatus('syncing');
    const success = await saveData(true);
    if (success) {
      setHashMismatch(false);
      toast({ title: 'Conflict Resolved', description: 'Local data saved to cloud.' });
      logInfo('Force Save Local: Successful.', logContext());
    } else {
      setSyncStatus('error');
      logError('Force Save Local: Failed.', undefined, logContext());
    }
    return success;
  }, [hashMismatch, saveData, toast, logContext]);

  const forceFetchServer = useCallback(async () => {
    if (!hashMismatch) return false;
    logWarn('SyncManager: User chose to force fetch server data for hash mismatch.', logContext());
    setSyncStatus('syncing');
    const success = await fetchData(false, true);
    if (success) {
      setHashMismatch(false);
      toast({ title: 'Conflict Resolved', description: 'Server data loaded, local changes discarded.' });
      logInfo('Force Fetch Server: Successful.', logContext());
    } else {
      setSyncStatus('error');
      logError('Force Fetch Server: Failed.', undefined, logContext());
    }
    return success;
  }, [hashMismatch, fetchData, toast, logContext]);

  const retrySync = useCallback(() => {
    if (!isSignedIn || !userId) { toast({ title: 'Cannot Sync', description: 'Please sign in.', variant: 'destructive' }); return; }
    logInfo('Manual Sync Retry Triggered.', logContext());
    if (syncStatus === 'error' && !hashMismatch && !isFetchingRef.current && !isSavingRef.current) {
      logInfo('Sync Retry: Attempting fetch from DB...', logContext());
      fetchData(true);
    } else if (syncStatus === 'error' && hashMismatch) {
      toast({ title: 'Resolve Conflict', description: 'Click cloud icon to resolve data mismatch.', variant: 'warning' });
    } else if (hasLocalChangesRef.current && !isSavingRef.current && !isFetchingRef.current) {
      logInfo('Sync Retry: Local changes detected, attempting immediate save...', logContext());
      saveData();
    } else if (isFetchingRef.current || isSavingRef.current) {
      toast({ title: 'Sync Busy', description: 'Wait for current operation.' });
    } else if (syncStatus === 'syncing') {
      toast({ title: 'Already Syncing', description: 'Sync in progress.' });
    } else if (syncStatus === 'synced') {
      toast({ title: 'Already Synced', description: 'Data is up-to-date.' });
    } else {
      logInfo('Sync Retry: Default case, attempting fetch...', logContext());
      fetchData(true);
    }
  }, [syncStatus, hashMismatch, hasLocalChangesRef, fetchData, saveData, toast, isSignedIn, userId, logContext]);

  return {
    syncStatus,
    retrySync,
    gettingStartedDismissed,
    setGettingStartedDismissed: setGettingStartedDismissedState,
    hashMismatch,
    forceSaveLocal,
    forceFetchServer,
  };
}
