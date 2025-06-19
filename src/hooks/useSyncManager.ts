
// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';
import type { SaveDataPayload as SaveDataPayloadType, TransactionItemForAPIType, DebtItemForAPIType, BaseItemForAPIType, BudgetItemForAPIType, InvestmentItemForAPIType, WeeklyReviewDataForAPIType } from '@/lib/schemas';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger';

export const COMPONENT_UNMOUNTING_ABORT_REASON = 'ComponentUnmounting';
export const NEW_REQUEST_ABORT_REASON = 'NewFetchInitiated';
export const API_TIMEOUT_ABORT_REASON = 'APICallTimedOut';
export const FETCH_TIMEOUT_SYMBOL = Symbol.for('FETCH_TIMEOUT');
export const FETCH_ABORTED_BENIGNLY_SYMBOL = Symbol.for('FETCH_ABORTED_BENIGNLY');

interface SyncedData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  investmentItems: InvestmentItem[];
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed: boolean;
}

export type SyncStatus =
  | 'idle'
  | 'loading_local'
  | 'local'
  | 'local_changes'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'error_local'
  | 'hash_mismatch';

interface SyncState {
  status: SyncStatus;
  lastFetchTime: Date | null;
  lastSaveTime: Date | null;
  lastServerHash: string | null;
  isMismatchDialogOpen: boolean;
  gettingStartedDismissed: boolean;
  conflictingLocalDataString: string | null;
  conflictingServerDataString: string | null;
  isInitialClientSyncPending: boolean;
}

const IS_FETCH_DISABLED = false; // User choice now: dashboard defaults to manual sync for stores
const HASH_CHECK_ENABLED = true;
const API_TIMEOUT_MS = 60000;
const AUTO_SAVE_DEBOUNCE_DELAY_MS = 60000;

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();

  const [syncState, setSyncStateInternal] = useState<SyncState>({
    status: 'idle',
    lastFetchTime: null,
    lastSaveTime: null,
    lastServerHash: null,
    isMismatchDialogOpen: false,
    gettingStartedDismissed: false,
    conflictingLocalDataString: null,
    conflictingServerDataString: null,
    isInitialClientSyncPending: true,
  });

  const isSavingRef = useRef(false);
  const isFetchingRef = useRef(false);
  const isClearingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const previousUserIdRef = useRef<string | null | undefined>(null);
  const hasLocalChangesRef = useRef(false);
  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const autoSaveDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);


  const getTransactionsState = useTransactionsStore.getState;
  const getDebtState = useDebtStore.getState;
  const getInvestmentState = useInvestmentStore.getState;
  const getStatementState = useStatementStore.getState;
  const getBudgetState = useBudgetStore.getState;
  const getWeeklyReviewState = useWeeklyReviewStore.getState;
  const getNotificationState = useNotificationStore.getState;

  const syncStateRef = useRef(syncState);
  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  const updateSyncState = useCallback((partialState: Partial<SyncState>) => {
    setSyncStateInternal(prev => ({ ...prev, ...partialState }));
  }, []);


  const getCurrentLocalDataForFullSnapshot = useCallback((): SyncedData => {
    return {
      transactions: getTransactionsState().transactions,
      debts: getDebtState().debts,
      investmentItems: getInvestmentState().investmentItems,
      assetItems: getStatementState().assetItems,
      otherLiabilityItems: getStatementState().otherLiabilityItems,
      budgetItems: getBudgetState().budgetItems,
      ownedReviews: getWeeklyReviewState().ownedReviews,
      sharedReviews: getWeeklyReviewState().sharedReviews,
      notifications: getNotificationState().notifications,
      startDate: getStatementState().startDate?.toISOString(),
      endDate: getStatementState().endDate?.toISOString(),
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
    };
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState]);

  const getCurrentLocalDataForSave = useCallback((): Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'> => {
    const transactions = getTransactionsState().transactions.map(t => ({...t, date: t.date.toISOString()})) as TransactionItemForAPIType[];
    const debts = getDebtState().debts as DebtItemForAPIType[];
    const investmentItems = getInvestmentState().investmentItems.map(i => ({...i, purchaseDate: i.purchaseDate.toISOString()})) as InvestmentItemForAPIType[];
    const assetItems = getStatementState().assetItems as BaseItemForAPIType[];
    const otherLiabilityItems = getStatementState().otherLiabilityItems as BaseItemForAPIType[];
    const budgetItems = getBudgetState().budgetItems as BudgetItemForAPIType[];
    const ownedReviews = Object.values(getWeeklyReviewState().ownedReviews).map(r => ({
        ...r,
        weekKey: r.weekKey!,
        transactionComments: r.transactionComments || {},
    })) as (WeeklyReviewDataForAPIType & { weekKey: string })[];


    return {
      transactions: { created: transactions, updated: [], deletedIds: [] },
      debts: { created: debts, updated: [], deletedIds: [] },
      investmentItems: { created: investmentItems, updated: [], deletedIds: [] },
      assetItems: { created: assetItems, updated: [], deletedIds: [] },
      otherLiabilityItems: { created: otherLiabilityItems, updated: [], deletedIds: [] },
      budgetItems: { created: budgetItems, updated: [], deletedIds: [] },
      ownedReviews: { created: ownedReviews, updated: [], deletedIds: [] },
      startDate: getStatementState().startDate?.toISOString() || null,
      endDate: getStatementState().endDate?.toISOString() || null,
      gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
    };
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState]);


  const clearAllLocalStoreData = useCallback(() => {
    const currentUserIdForLog = previousUserIdRef.current || userId || 'unknown_user_at_clear';
    if (isClearingRef.current) {
      logWarn('clearAllLocalStoreData called while already clearing.', { userId: currentUserIdForLog }, currentUserIdForLog);
      return;
    }
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing all local Zustand store data.', { userId: currentUserIdForLog }, currentUserIdForLog);

    if (autoSaveDebounceTimerRef.current) {
      clearTimeout(autoSaveDebounceTimerRef.current);
      autoSaveDebounceTimerRef.current = null;
    }

    try {
      getTransactionsState().clearTransactions();
      getDebtState().clearDebts();
      getInvestmentState().clearInvestmentItems();
      getStatementState().clearStatementItems();
      getBudgetState().clearBudgetItems();
      getWeeklyReviewState().clearReviews();
      getNotificationState().clearAllNotifications();
      updateSyncState({
        status: 'idle',
        lastFetchTime: null,
        lastSaveTime: null,
        lastServerHash: null,
        gettingStartedDismissed: false,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        isInitialClientSyncPending: true,
      });
      hasLocalChangesRef.current = false;
      if (currentUserIdForLog !== 'unknown_user_at_clear') {
        localStorage.removeItem(`ifcGuru_uiPrefs_${currentUserIdForLog}`);
      }
      logInfo('SyncManager: All local store data cleared.', { userId: currentUserIdForLog }, currentUserIdForLog);
    } catch (error: any) {
      logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog }, currentUserIdForLog);
      updateSyncState({ status: 'error_local', isInitialClientSyncPending: true });
    } finally {
      isClearingRef.current = false;
    }
  }, [getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, updateSyncState, userId]);

  const fetchData = useCallback(async (isPreCheck = false): Promise<string | false | typeof FETCH_TIMEOUT_SYMBOL | typeof FETCH_ABORTED_BENIGNLY_SYMBOL> => {
    const currentUserId = userId;
    const wasInitialClientSyncPending = syncStateRef.current.isInitialClientSyncPending;

    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (!isPreCheck && syncStateRef.current.status !== 'idle') {
          updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: true });
      }
      return false;
    }
    if (IS_FETCH_DISABLED && !isPreCheck) {
      logInfo('SyncManager: Fetching disabled, maintaining local state.', { userId: currentUserId }, currentUserId);
      updateSyncState({ status: 'local', isInitialClientSyncPending: false });
      return false;
    }

    if ((isFetchingRef.current && !isPreCheck) || isClearingRef.current) {
      logDebug('Fetch aborted: another fetch/clear operation in progress.', { userId: currentUserId, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, isPreCheck }, currentUserId);
      return FETCH_ABORTED_BENIGNLY_SYMBOL;
    }

    isFetchingRef.current = true;
    if (!isPreCheck) updateSyncState({ status: 'syncing' });
    logInfo(`SyncManager: Fetching data from server... (isPreCheck: ${isPreCheck}, wasInitialClientSyncPending: ${wasInitialClientSyncPending})`, { userId: currentUserId }, currentUserId);

    const startTime = performance.now();

    activeFetchControllerRef.current?.abort(NEW_REQUEST_ABORT_REASON);
    const currentFetchController = new AbortController();
    activeFetchControllerRef.current = currentFetchController;
    const timeoutId = setTimeout(() => currentFetchController.abort(API_TIMEOUT_ABORT_REASON), API_TIMEOUT_MS);

    let serverHashToReturn: string | false | typeof FETCH_TIMEOUT_SYMBOL | typeof FETCH_ABORTED_BENIGNLY_SYMBOL = false;
    let nextIsInitialClientSyncPending = syncStateRef.current.isInitialClientSyncPending;

    try {
      const response = await fetch('/api/sync', { signal: currentFetchController.signal });
      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;

      if (currentFetchController.signal.aborted) {
        const reason = currentFetchController.signal.reason || 'Fetch aborted';
        logInfo(`Fetch aborted internally before processing response. Reason: ${reason}`, { userId: currentUserId, reason, isPreCheck }, currentUserId);
        if (reason === API_TIMEOUT_ABORT_REASON) {
          if (!isPreCheck) updateSyncState({ status: 'error' });
          serverHashToReturn = FETCH_TIMEOUT_SYMBOL;
        } else {
          if (!isPreCheck && syncStateRef.current.status === 'syncing') {
              updateSyncState({ status: hasLocalChangesRef.current ? 'local_changes' : 'local' });
          }
          serverHashToReturn = FETCH_ABORTED_BENIGNLY_SYMBOL;
        }
      } else if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status} ${response.statusText}`.trim() }));
        throw new Error(errorData.error || `Failed to fetch data: ${response.status} ${response.statusText}`.trim());
      } else {
        const serverData = await response.json();
        const { dataHash: serverHash, ...dataToLoad } = serverData;
        nextIsInitialClientSyncPending = false; // Successful fetch (even if empty) concludes initial pending

        if (isPreCheck) {
          logInfo(`SyncManager: Pre-check fetch successful. Server hash: ${serverHash}`, { userId: currentUserId }, currentUserId);
          serverHashToReturn = serverHash;
        } else {
          const currentLocalSnapshotString = stringify(prepareDataForHashing(getCurrentLocalDataForFullSnapshot()));
          if (HASH_CHECK_ENABLED && syncStateRef.current.lastServerHash && serverHash !== syncStateRef.current.lastServerHash && hasLocalChangesRef.current) {
            logError('CRITICAL: Server hash changed while local changes exist! Forcing conflict dialog.',
              new Error('Server data changed unexpectedly while local edits pending.'),
              { userIdFromFetchScope: currentUserId, oldServerHash: syncStateRef.current.lastServerHash, newServerHash: serverHash },
              currentUserId
            );
            updateSyncState({
              status: 'hash_mismatch',
              lastServerHash: serverHash,
              isMismatchDialogOpen: true,
              conflictingLocalDataString: currentLocalSnapshotString,
              conflictingServerDataString: stringify(prepareDataForHashing(dataToLoad as any)),
            });
            serverHashToReturn = false;
          } else if (HASH_CHECK_ENABLED) {
            const localHashOfLoadedData = await hashData(stringify(prepareDataForHashing(dataToLoad as any)));
            if (localHashOfLoadedData !== serverHash) {
              logError('CRITICAL: Fetched data hash mismatch! Server hash does not match local hash of data just received.',
                new Error('Fetched data hash mismatch'),
                { userIdFromFetchScope: currentUserId, serverHash, localHashOfLoadedData },
                currentUserId
              );
              updateSyncState({
                status: 'hash_mismatch',
                lastServerHash: serverHash,
                isMismatchDialogOpen: true,
                conflictingLocalDataString: currentLocalSnapshotString,
                conflictingServerDataString: stringify(prepareDataForHashing(dataToLoad as any)),
              });
              serverHashToReturn = false;
            } else {
              // Successful load and hash match
              getTransactionsState().setTransactions(dataToLoad.transactions || []);
              getDebtState().setDebts(dataToLoad.debts || []);
              getInvestmentState().setInvestmentItems(dataToLoad.investmentItems || []);
              getStatementState().setAssetItems(dataToLoad.assetItems || []);
              getStatementState().setOtherLiabilityItems(dataToLoad.otherLiabilityItems || []);
              getBudgetState().setBudgetItems(dataToLoad.budgetItems || []);
              getWeeklyReviewState().setOwnedReviews(dataToLoad.ownedReviews || {});
              getWeeklyReviewState().setSharedReviews(dataToLoad.sharedReviews || {});
              getNotificationState().setNotifications(dataToLoad.notifications || []);
              getStatementState().setStartDate(dataToLoad.startDate ? new Date(dataToLoad.startDate) : undefined);
              getStatementState().setEndDate(dataToLoad.endDate ? new Date(dataToLoad.endDate) : undefined);

              updateSyncState({
                status: 'synced',
                lastFetchTime: new Date(),
                lastServerHash: serverHash,
                isMismatchDialogOpen: false,
                gettingStartedDismissed: dataToLoad.gettingStartedDismissed || false,
                conflictingLocalDataString: null,
                conflictingServerDataString: null,
              });
              hasLocalChangesRef.current = false;
              logInfo('SyncManager: Data fetched and loaded successfully.', { userId: currentUserId, serverHash, durationMs: duration }, currentUserId);
              if (!isPreCheck) {
                toast({ title: 'Data Synced', description: `Latest data loaded from server. (Duration: ${duration.toFixed(0)}ms)` });
              }
              serverHashToReturn = serverHash;
            }
          } else { // Hash check disabled, load directly
              getTransactionsState().setTransactions(dataToLoad.transactions || []);
              getDebtState().setDebts(dataToLoad.debts || []);
              getInvestmentState().setInvestmentItems(dataToLoad.investmentItems || []);
              getStatementState().setAssetItems(dataToLoad.assetItems || []);
              getStatementState().setOtherLiabilityItems(dataToLoad.otherLiabilityItems || []);
              getBudgetState().setBudgetItems(dataToLoad.budgetItems || []);
              getWeeklyReviewState().setOwnedReviews(dataToLoad.ownedReviews || {});
              getWeeklyReviewState().setSharedReviews(dataToLoad.sharedReviews || {});
              getNotificationState().setNotifications(dataToLoad.notifications || []);
              getStatementState().setStartDate(dataToLoad.startDate ? new Date(dataToLoad.startDate) : undefined);
              getStatementState().setEndDate(dataToLoad.endDate ? new Date(dataToLoad.endDate) : undefined);
              updateSyncState({
                status: 'synced', // Or 'local' if fetch is generally off but was forced
                lastFetchTime: new Date(),
                lastServerHash: HASH_CHECK_ENABLED ? serverHash : null, // Only store if hash check was part of it
                isMismatchDialogOpen: false,
                gettingStartedDismissed: dataToLoad.gettingStartedDismissed || false,
                conflictingLocalDataString: null,
                conflictingServerDataString: null,
              });
              hasLocalChangesRef.current = false;
              serverHashToReturn = HASH_CHECK_ENABLED ? serverHash : 'hash_check_disabled';
              logInfo('SyncManager: Data fetched (hash check disabled).', { userId: currentUserId, durationMs: duration }, currentUserId);
          }
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown fetch error");
      const stableCurrentUserId = currentUserId;
      const abortReason = currentFetchController.signal.reason;
      nextIsInitialClientSyncPending = false; // Fetch attempt concluded

      logError(`Error fetching data (isPreCheck: ${isPreCheck}):`, errorToLog, { userIdFromFetchScope: stableCurrentUserId, originalErrorDetails: String(error), abortReason }, stableCurrentUserId);

      if (error.name === 'AbortError') {
        if (abortReason === API_TIMEOUT_ABORT_REASON) {
            if (!isPreCheck) {
                updateSyncState({ status: 'error' });
                toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
            }
            serverHashToReturn = FETCH_TIMEOUT_SYMBOL;
        } else {
            if (!isPreCheck && syncStateRef.current.status === 'syncing') {
                updateSyncState({ status: hasLocalChangesRef.current ? 'local_changes' : 'local' });
            }
            serverHashToReturn = FETCH_ABORTED_BENIGNLY_SYMBOL;
        }
      } else {
        if (!isPreCheck) {
          updateSyncState({ status: 'error' });
          toast({ title: 'Sync Load Failed', description: `${errorMessage || 'Could not retrieve data from server.'}`, variant: 'destructive' });
        }
        serverHashToReturn = false;
      }
    } finally {
      isFetchingRef.current = false;
      if (activeFetchControllerRef.current === currentFetchController) {
        activeFetchControllerRef.current = null;
      }
      // Only update isInitialClientSyncPending if it's not a pre-check
      if (!isPreCheck) {
          updateSyncState({ isInitialClientSyncPending: nextIsInitialClientSyncPending });
      }
    }
    return serverHashToReturn;
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, getCurrentLocalDataForFullSnapshot]);


  const saveData = useCallback(async (force = false): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: true });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save aborted: another sync operation in progress or clearing.', { userId: currentUserId, isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current }, currentUserId);
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    logInfo('SyncManager: Saving data to server...', { userId: currentUserId, force, hashCheckEnabled: HASH_CHECK_ENABLED }, currentUserId);

    if (autoSaveDebounceTimerRef.current) {
      clearTimeout(autoSaveDebounceTimerRef.current);
      autoSaveDebounceTimerRef.current = null;
    }

    const startTime = performance.now();
    const dataPayloadForSave = getCurrentLocalDataForSave();

    const preparedDataForHashing = prepareDataForHashing(dataPayloadForSave as any);
    const payloadDataHash = await hashData(stringify(preparedDataForHashing));
    const lastKnownServerHashForSave = force ? null : syncStateRef.current.lastServerHash;

    const localAbortController = new AbortController();
    const timeoutId = setTimeout(() => localAbortController.abort(API_TIMEOUT_ABORT_REASON), API_TIMEOUT_MS);

    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dataPayloadForSave,
          payloadDataHash: payloadDataHash,
          lastKnownServerHash: lastKnownServerHashForSave
        }),
        signal: localAbortController.signal,
      });
      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error during save: ${response.status} ${response.statusText}`.trim() }));
        const errorMsgLower = (errorData.error as string || "").toLowerCase();

        if (response.status === 409 && HASH_CHECK_ENABLED && errorMsgLower.includes("data is out of sync")) {
          logError(
            'Save rejected by server due to 409 Conflict (stale data). Client will show conflict dialog.',
            new Error(errorData.error || 'Server indicated data is stale.'),
            { userIdFromSaveScope: currentUserId, clientPayloadHash: payloadDataHash, clientLastKnownServerHash: lastKnownServerHashForSave, errorDetails: errorData.error, serverResponseStatus: response.status },
            currentUserId
          );
          updateSyncState({
             status: 'hash_mismatch',
             isMismatchDialogOpen: true,
             conflictingLocalDataString: stringify(preparedDataForHashing),
             conflictingServerDataString: errorData.currentServerHash ? `Server Hash: ${errorData.currentServerHash}. This indicates the server's data changed since your last sync.` : "Server data preview not available for this save conflict. Try fetching the latest data.",
          });
          toast({ title: 'Save Failed: Data Conflict', description: errorData.error || 'Your data is out of sync with the server. Please sync again before saving.', variant: 'destructive', duration: Infinity });
          return false;
        }
        if (response.status === 400 && HASH_CHECK_ENABLED && errorMsgLower.includes("data integrity check failed")) {
           logError(
             'Save rejected by server due to payload data integrity check (payloadDataHash mismatch). Client will now show conflict dialog.',
             new Error(errorData.error || 'Server-side hash validation of payload failed'),
             { userIdFromSaveScope: currentUserId, clientPayloadHash: payloadDataHash, errorDetails: errorData.error, serverResponseStatus: response.status },
             currentUserId
           );
           updateSyncState({
             status: 'hash_mismatch',
             isMismatchDialogOpen: true,
             conflictingLocalDataString: stringify(preparedDataForHashing),
             conflictingServerDataString: "Server-side validation of the data you sent failed. This means the server received your data but calculated a different integrity hash for it than your application did. This could be due to data corruption during transmission or a temporary server-side issue. Retrying might help. If it persists, it could indicate a deeper problem.",
           });
           toast({ title: 'Save Failed: Data Integrity Issue', description: errorData.error || 'The server could not verify the integrity of the data sent. Please try syncing again or contact support.', variant: 'destructive', duration: Infinity });
           return false;
        }
        throw new Error(errorData.error || `Failed to save data to server: ${response.status} ${response.statusText}`.trim());
      }

      const saveResponseData = await response.json();
      const newServerHash = saveResponseData.newServerHash;

      updateSyncState({
        status: 'synced',
        lastSaveTime: new Date(),
        lastServerHash: newServerHash,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
      });
      hasLocalChangesRef.current = false;
      logInfo('SyncManager: Data saved successfully.', { userId: currentUserId, newHash: newServerHash, durationMs: duration }, currentUserId);
      toast({ title: 'Data Saved', description: `Changes saved to server. (Duration: ${duration.toFixed(0)}ms)` });
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(errorMessage || "Unknown save error");
      const stableCurrentUserId = currentUserId;
      let finalStatus: SyncStatus = 'error';

      if (error.name === 'AbortError' && localAbortController.signal.reason === API_TIMEOUT_ABORT_REASON) {
        logWarn(`Save aborted: API call timed out after ${API_TIMEOUT_MS}ms.`, { userId: stableCurrentUserId }, stableCurrentUserId);
        toast({ title: 'Save Timed Out', description: 'Could not save data to the server in time.', variant: 'destructive' });
      } else if (error.name === 'AbortError') {
        const reason = localAbortController.signal.reason || error.message;
        logInfo(`Save aborted: ${reason}`, { userId: stableCurrentUserId, reason }, stableCurrentUserId);
        finalStatus = hasLocalChangesRef.current ? 'local_changes' : 'local';
      } else {
        logError('Error saving data:', errorToLog, { userIdFromSaveScope: stableCurrentUserId, originalErrorDetails: String(error) }, stableCurrentUserId);
        toast({ title: 'Save Failed', description: `${errorMessage || 'Could not save data to server.'}`, variant: 'destructive' });
      }
      // Always set isInitialClientSyncPending to false after a save attempt (success or failure)
      updateSyncState({ status: finalStatus, isInitialClientSyncPending: false });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getCurrentLocalDataForSave]);

  const manualSync = useCallback(async () => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      toast({ title: 'Not Signed In', description: 'Please sign in to sync your data.', variant: 'destructive' });
      return;
    }

    if (autoSaveDebounceTimerRef.current) {
      clearTimeout(autoSaveDebounceTimerRef.current);
      autoSaveDebounceTimerRef.current = null;
      logDebug("Manual sync initiated, cleared pending auto-save timer.", { userId: currentUserId }, currentUserId);
    }

    logInfo('SyncManager: Manual sync triggered.', { currentStatus: syncStateRef.current.status, userId: currentUserId }, currentUserId);

    if (HASH_CHECK_ENABLED && syncStateRef.current.isMismatchDialogOpen) {
        logWarn("Manual sync: Dialog is open for hash_mismatch. User needs to resolve via dialog.", {userId: currentUserId}, currentUserId);
        toast({title: "Conflict Exists", description: "Please resolve the data conflict using the dialog.", variant: "destructive"});
        return;
    }
    if (HASH_CHECK_ENABLED && syncStateRef.current.status === 'hash_mismatch' && !syncStateRef.current.isMismatchDialogOpen) {
        logWarn("Manual sync: hash_mismatch status but dialog not open. Re-opening dialog.", {userId: currentUserId}, currentUserId);
        updateSyncState({ isMismatchDialogOpen: true });
        return;
    }

    updateSyncState({ status: 'syncing' });

    if (IS_FETCH_DISABLED) {
      logInfo('Manual Sync: Fetch is disabled. Setting status to local.', { userId: currentUserId }, currentUserId);
      updateSyncState({ status: 'local', isInitialClientSyncPending: false }); // A manual action implies initial pending state is over
      toast({ title: 'Local Data Active', description: 'Cloud fetching is disabled. Using local data.' });
      return;
    }

    if (hasLocalChangesRef.current || syncStateRef.current.status === 'local_changes') {
      logInfo('Manual Sync: Local changes detected. Attempting to save.', { userId: currentUserId }, currentUserId);
      const saveSuccess = await saveData();
      if (saveSuccess) {
        logInfo('Manual Sync: Save successful. Now fetching latest from server to ensure full consistency.', { userId: currentUserId }, currentUserId);
        const fetchResult = await fetchData(); // fetchData will handle setting isInitialClientSyncPending to false
        if (fetchResult === false && syncStateRef.current.status !== 'hash_mismatch') updateSyncState({ status: 'error' });
        else if (fetchResult === FETCH_TIMEOUT_SYMBOL) {
            updateSyncState({ status: 'error' }); // isInitialClientSyncPending handled by fetchData
            toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
        } else if (fetchResult === FETCH_ABORTED_BENIGNLY_SYMBOL) {
            logInfo("Manual Sync: Fetch after save was benignly aborted.", { userId: currentUserId }, currentUserId);
             if(syncStateRef.current.status === 'syncing') updateSyncState({ status: 'synced' });
        }
      } else {
        logWarn('Manual Sync: saveData failed. Status already set by saveData. isInitialClientSyncPending already set to false by saveData.', { userId: currentUserId }, currentUserId);
      }
    } else {
      logInfo('Manual Sync: No local changes detected. Fetching server state.', { userId: currentUserId }, currentUserId);
      const fetchResult = await fetchData(); // fetchData will handle setting isInitialClientSyncPending to false
       if (fetchResult === false && syncStateRef.current.status !== 'hash_mismatch') { updateSyncState({ status: 'error' }); }
       else if (fetchResult === FETCH_TIMEOUT_SYMBOL) {
           updateSyncState({ status: 'error' });
           toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
       } else if (fetchResult === FETCH_ABORTED_BENIGNLY_SYMBOL) {
           logInfo("Manual Sync: Initial fetch was benignly aborted.", { userId: currentUserId }, currentUserId);
            if(syncStateRef.current.status === 'syncing') updateSyncState({ status: syncStateRef.current.lastServerHash ? 'local' : 'idle' });
       }
    }
  }, [userId, isClerkLoaded, isSignedIn, saveData, fetchData, toast, updateSyncState]);

  const forceSave = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Save initiated by user from conflict dialog.", { userId: currentUserId }, currentUserId);
    const success = await saveData(true); // isInitialClientSyncPending will be set to false by saveData
    if (success) {
        updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null });
    } else {
        if(syncStateRef.current.status !== 'hash_mismatch') {
             // If not hash_mismatch after failed force save, means some other error; status set by saveData
        }
    }
    return success;
  }, [saveData, userId, updateSyncState]);

  const forceFetch = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Fetch initiated by user from conflict dialog.", { userId: currentUserId }, currentUserId);
    if (IS_FETCH_DISABLED) {
        toast({ title: 'Cloud Sync Disabled', description: 'Cannot fetch from server. Fetching is currently off.', variant: 'destructive' });
        updateSyncState({ isMismatchDialogOpen: false, status: 'local', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: false });
        return false;
    }
    clearAllLocalStoreData(); // Resets isInitialClientSyncPending to true
    const fetchResult = await fetchData(); // Will set isInitialClientSyncPending to false
    if (fetchResult !== false && fetchResult !== FETCH_TIMEOUT_SYMBOL && fetchResult !== FETCH_ABORTED_BENIGNLY_SYMBOL) {
      updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null, status: 'synced' });
      return true;
    }
    // If fetch failed or was aborted, fetchData has already updated status and isInitialClientSyncPending.
    // We just need to ensure the dialog is closed.
    updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null });
    if(syncStateRef.current.status !== 'error' && syncStateRef.current.status !== 'hash_mismatch') { // Ensure status is reasonable if no error
        updateSyncState({status: syncStateRef.current.lastServerHash ? 'local' : 'idle'});
    }
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);


  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      logDebug('SyncManager effect (user change): Auth not loaded yet.', { currentUserId }, currentUserId);
      return;
    }

    if (!isSignedIn && prevUserId) {
      logInfo(`SyncManager effect (user change): User SIGNED OUT. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId }, prevUserId);
      clearAllLocalStoreData(); // This resets isInitialClientSyncPending to true
      initialLoadDoneRef.current = false;
      previousUserIdRef.current = null;
      return;
    }

    if (isSignedIn && currentUserId && (currentUserId !== prevUserId)) {
      logInfo(`SyncManager effect (user change): User signed IN or SWITCHED. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing for new user.`, { userId: currentUserId }, currentUserId);
      clearAllLocalStoreData(); // This resets isInitialClientSyncPending to true
      initialLoadDoneRef.current = false; // This flag tracks if the *overall one-time-per-app-load setup* for a user has run
      previousUserIdRef.current = currentUserId;
    }

    // This block is for the very first setup *after* Clerk is loaded and user is signed in, for this app instance.
    if (isSignedIn && currentUserId && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true; // Mark that this block has run for the current app lifecycle
      logInfo(`SyncManager: Initial one-time setup for user ${currentUserId}. Loading preferences. isInitialClientSyncPending: ${syncStateRef.current.isInitialClientSyncPending}`, { userId: currentUserId }, currentUserId);
      const storedPrefsString = localStorage.getItem(`ifcGuru_uiPrefs_${currentUserId}`);
      let loadedLastServerHash = null;
      let loadedGettingStartedDismissed = false;

      if (storedPrefsString) {
        try {
          const prefs = JSON.parse(storedPrefsString);
          loadedGettingStartedDismissed = prefs.gettingStartedDismissed || false;
          if (HASH_CHECK_ENABLED) {
            loadedLastServerHash = prefs.lastServerHash || null;
          }
        } catch (e: any) {
          logError('Error parsing UI preferences from localStorage for user', e, { userId: currentUserId }, currentUserId);
        }
      }

      updateSyncState({
        status: loadedLastServerHash ? 'local' : 'idle', // Initial status before any network op for this session
        lastServerHash: loadedLastServerHash,
        gettingStartedDismissed: loadedGettingStartedDismissed,
        isMismatchDialogOpen: false, // Ensure dialog is closed on new session setup
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        lastFetchTime: null,
        lastSaveTime: null,
        // isInitialClientSyncPending is true by default or reset by clearAllLocalStoreData
      });
      logInfo(`SyncManager: Initial preferences loaded for ${currentUserId}. Status: ${syncStateRef.current.status}. Awaiting user action for first sync.`, { userId: currentUserId, loadedLastServerHash, loadedGettingStartedDismissed, currentIsInitialPending: syncStateRef.current.isInitialClientSyncPending }, currentUserId);
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState]);


  useEffect(() => {
    if (initialLoadDoneRef.current && isSignedIn && userId) {
      const stateToPersist = {
        gettingStartedDismissed: syncStateRef.current.gettingStartedDismissed,
        lastServerHash: HASH_CHECK_ENABLED ? syncStateRef.current.lastServerHash : undefined,
      };
      localStorage.setItem(`ifcGuru_uiPrefs_${userId}`, JSON.stringify(stateToPersist));
      logDebug('SyncManager: Persisted UI preferences & lastServerHash to localStorage.', { userId, preferences: stateToPersist, hashCheckEnabled: HASH_CHECK_ENABLED }, userId);
    }
  }, [syncState.gettingStartedDismissed, syncState.lastServerHash, userId, isSignedIn]);


  const handleStoreChange = useCallback(() => {
    const currentUserId = userId;
    if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn || !currentUserId) {
      return;
    }
    if (!hasLocalChangesRef.current) {
        logInfo("SyncManager: Local store change detected, marking hasLocalChangesRef.", { userId: currentUserId }, currentUserId);
    }
    hasLocalChangesRef.current = true;
    if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'idle') {
      updateSyncState({ status: 'local_changes' });
      logDebug("SyncManager: Status updated to 'local_changes' due to store modification.", { userId: currentUserId }, currentUserId);
    }

    if (autoSaveDebounceTimerRef.current) {
        clearTimeout(autoSaveDebounceTimerRef.current);
    }
    autoSaveDebounceTimerRef.current = setTimeout(() => {
        const localUserId = userId;
        if (hasLocalChangesRef.current &&
            isSignedIn && localUserId &&
            initialLoadDoneRef.current &&
            !isSavingRef.current && !isFetchingRef.current && !isClearingRef.current &&
            syncStateRef.current.status !== 'syncing' && syncStateRef.current.status !== 'hash_mismatch'
        ) {
            logInfo("SyncManager: Auto-save triggered by debounce.", { userId: localUserId }, localUserId);
            saveData();
        } else {
            logDebug("SyncManager: Auto-save debounce fired, but conditions not met for save.", {
                userId: localUserId,
                hasLocalChanges: hasLocalChangesRef.current,
                isSignedIn,
                initialLoadDone: initialLoadDoneRef.current,
                isSaving: isSavingRef.current,
                isFetching: isFetchingRef.current,
                isClearing: isClearingRef.current,
                currentStatus: syncStateRef.current.status,
            }, localUserId);
        }
    }, AUTO_SAVE_DEBOUNCE_DELAY_MS);

  }, [updateSyncState, userId, isSignedIn, saveData]);

  useEffect(() => {
    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useInvestmentStore
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => {
        unsubscribes.forEach(unsubscribe => unsubscribe());
        if (autoSaveDebounceTimerRef.current) {
            clearTimeout(autoSaveDebounceTimerRef.current);
        }
    };
  }, [handleStoreChange]);

  useEffect(() => {
    return () => {
      activeFetchControllerRef.current?.abort(COMPONENT_UNMOUNTING_ABORT_REASON);
       if (autoSaveDebounceTimerRef.current) {
            clearTimeout(autoSaveDebounceTimerRef.current);
      }
    };
  }, []);


  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED,
    retrySync: manualSync,
    manualSync,
    forceSave,
    forceFetch,
    hashMismatch: HASH_CHECK_ENABLED && syncState.status === 'hash_mismatch',
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => {
        const currentUserId = userId;
        logDebug(`SyncManager: setIsMismatchDialogOpen called with ${isOpen}`, {currentStatus: syncStateRef.current.status, userId: currentUserId}, currentUserId);
        if (!isOpen && syncStateRef.current.status === 'hash_mismatch') {
            const nextStatus = hasLocalChangesRef.current ? 'local_changes' : (syncStateRef.current.lastServerHash ? 'local' : 'idle');
            logInfo(`SyncManager: Mismatch dialog closed without resolution. Resetting status from 'hash_mismatch' to '${nextStatus}'. isInitialClientSyncPending remains ${syncStateRef.current.isInitialClientSyncPending}.`, { userId: currentUserId }, currentUserId);
            updateSyncState({ isMismatchDialogOpen: false, status: nextStatus, conflictingLocalDataString: null, conflictingServerDataString: null });
        } else {
            updateSyncState({ isMismatchDialogOpen: isOpen });
        }
    },
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      const currentUserId = userId;
      updateSyncState({ gettingStartedDismissed: dismissed });
      if (isSignedIn && currentUserId && (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local' || syncStateRef.current.status === 'local_changes' || syncStateRef.current.status === 'idle')) {
        if (!hasLocalChangesRef.current) {
           logInfo("SyncManager: gettingStartedDismissed changed, marking for sync.", { userId: currentUserId, dismissed }, currentUserId);
        }
        hasLocalChangesRef.current = true;
        if (syncStateRef.current.status !== 'local_changes') {
            updateSyncState({ status: 'local_changes' });
        }
        if (autoSaveDebounceTimerRef.current) clearTimeout(autoSaveDebounceTimerRef.current);
        autoSaveDebounceTimerRef.current = setTimeout(() => {
            if (hasLocalChangesRef.current && isSignedIn && currentUserId && !isSavingRef.current && !isFetchingRef.current && syncStateRef.current.status !== 'syncing' && syncStateRef.current.status !== 'hash_mismatch') {
                saveData();
            }
        }, AUTO_SAVE_DEBOUNCE_DELAY_MS);
      }
    },
    conflictingLocalDataString: syncState.conflictingLocalDataString,
    conflictingServerDataString: syncState.conflictingServerDataString,
    isInitialClientSyncPending: syncState.isInitialClientSyncPending,
  };
}

    