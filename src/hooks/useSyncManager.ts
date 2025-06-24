
// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore, getWeekKey } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useToast } from '@/hooks/use-toast';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem, InvestmentItem } from '@/lib/types';
import type { SaveDataPayload as SaveDataPayloadType } from '@/lib/schemas';
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
  isPreviewingLocalChanges: boolean;
  localChangesPayloadPreview: string | null;
}

const IS_FETCH_DISABLED = false;
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
    isPreviewingLocalChanges: false,
    localChangesPayloadPreview: null,
  });
  
  const lastSyncedData = useRef<SyncedData | null>(null);
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

  const computeDelta = useCallback((): Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'> | null => {
    const currentData = getCurrentLocalDataForFullSnapshot();

    if (!lastSyncedData.current) {
        logWarn("computeDelta: lastSyncedData is null. Treating all current local data as a 'created' delta for initial save.", { userId }, userId);

        const hasAnyData = 
            currentData.transactions.length > 0 ||
            currentData.debts.length > 0 ||
            currentData.investmentItems.length > 0 ||
            currentData.assetItems.length > 0 ||
            currentData.otherLiabilityItems.length > 0 ||
            currentData.budgetItems.length > 0 ||
            Object.keys(currentData.ownedReviews).length > 0;

        if (!hasAnyData) {
            return null; // Nothing to save.
        }

        const reviewsToCreate = Object.entries(currentData.ownedReviews).map(([weekKey, reviewData]) => ({
            ...reviewData,
            weekKey,
        }));

        const initialPayload: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'> = {
            transactions: { created: currentData.transactions.length > 0 ? currentData.transactions : undefined },
            debts: { created: currentData.debts.length > 0 ? currentData.debts : undefined },
            investmentItems: { created: currentData.investmentItems.length > 0 ? currentData.investmentItems : undefined },
            assetItems: { created: currentData.assetItems.length > 0 ? currentData.assetItems : undefined },
            otherLiabilityItems: { created: currentData.otherLiabilityItems.length > 0 ? currentData.otherLiabilityItems : undefined },
            budgetItems: { created: currentData.budgetItems.length > 0 ? currentData.budgetItems : undefined },
            ownedReviews: { created: reviewsToCreate.length > 0 ? reviewsToCreate : undefined },
            startDate: currentData.startDate ?? null,
            endDate: currentData.endDate ?? null,
            gettingStartedDismissed: currentData.gettingStartedDismissed,
        };
        
        return initialPayload;
    }
    
    const previousData = lastSyncedData.current;
    
    const delta: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'> = {};
    let hasChanges = false;
    
    // Generic diffing function for item collections
    const diffCollection = <T extends { id: string }>(currentItems: T[], previousItems: T[]) => {
      const currentIds = new Set(currentItems.map(i => i.id));
      const previousIds = new Set(previousItems.map(i => i.id));

      const created = currentItems.filter(i => !previousIds.has(i.id));
      const deletedIds = previousItems.filter(i => !currentIds.has(i.id)).map(i => i.id);

      const updated: T[] = [];
      currentItems.forEach(currentItem => {
          if (previousIds.has(currentItem.id)) {
              const previousItem = previousItems.find(p => p.id === currentItem.id)!;
              const currentString = stringify(prepareDataForHashing({ item: currentItem }));
              const previousString = stringify(prepareDataForHashing({ item: previousItem }));
              if (currentString !== previousString) {
                  updated.push(currentItem);
              }
          }
      });
      
      const changes = {
          created: created.length > 0 ? created : undefined,
          updated: updated.length > 0 ? updated : undefined,
          deletedIds: deletedIds.length > 0 ? deletedIds : undefined,
      };

      if (changes.created || changes.updated || changes.deletedIds) {
        hasChanges = true;
        return changes;
      }
      return undefined;
    };
    
    delta.transactions = diffCollection(currentData.transactions, previousData.transactions);
    delta.debts = diffCollection(currentData.debts, previousData.debts);
    delta.investmentItems = diffCollection(currentData.investmentItems, previousData.investmentItems);
    delta.assetItems = diffCollection(currentData.assetItems, previousData.assetItems);
    delta.otherLiabilityItems = diffCollection(currentData.otherLiabilityItems, previousData.otherLiabilityItems);
    delta.budgetItems = diffCollection(currentData.budgetItems, previousData.budgetItems);
    
    // Diff for ownedReviews (Record<string, WeeklyReviewData>)
    const currentReviews = currentData.ownedReviews;
    const previousReviews = previousData.ownedReviews;
    const currentReviewKeys = new Set(Object.keys(currentReviews));
    const previousReviewKeys = new Set(Object.keys(previousReviews));

    const createdReviews = Array.from(currentReviewKeys).filter(k => !previousReviewKeys.has(k)).map(k => ({...currentReviews[k], weekKey: k}));
    const deletedReviewIds = Array.from(previousReviewKeys).filter(k => !currentReviewKeys.has(k));
    const updatedReviews = Array.from(currentReviewKeys).filter(k => previousReviewKeys.has(k))
      .filter(k => stringify(prepareDataForHashing({item: currentReviews[k]})) !== stringify(prepareDataForHashing({item: previousReviews[k]})))
      .map(k => ({...currentReviews[k], weekKey: k}));
      
    if (createdReviews.length > 0 || updatedReviews.length > 0 || deletedReviewIds.length > 0) {
        delta.ownedReviews = {
            created: createdReviews.length > 0 ? createdReviews : undefined,
            updated: updatedReviews.length > 0 ? updatedReviews : undefined,
            deletedIds: deletedReviewIds.length > 0 ? deletedReviewIds : undefined,
        };
        hasChanges = true;
    }

    if (currentData.startDate !== previousData.startDate) {
        delta.startDate = currentData.startDate ?? null;
        hasChanges = true;
    }
    if (currentData.endDate !== previousData.endDate) {
        delta.endDate = currentData.endDate ?? null;
        hasChanges = true;
    }
    if (currentData.gettingStartedDismissed !== previousData.gettingStartedDismissed) {
        delta.gettingStartedDismissed = currentData.gettingStartedDismissed;
        hasChanges = true;
    }

    return hasChanges ? delta : null;
  }, [userId, getCurrentLocalDataForFullSnapshot]);


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
      lastSyncedData.current = null;
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
        isPreviewingLocalChanges: false,
        localChangesPayloadPreview: null,
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

    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (!isPreCheck && syncStateRef.current.status !== 'idle') {
          updateSyncState({ status: 'idle', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: true, isPreviewingLocalChanges: false, localChangesPayloadPreview: null });
      }
      return false;
    }
    if (IS_FETCH_DISABLED && !isPreCheck) {
      logInfo('SyncManager: Fetching disabled, maintaining local state.', { userId: currentUserId }, currentUserId);
      updateSyncState({ status: 'local', isInitialClientSyncPending: false, isPreviewingLocalChanges: false, localChangesPayloadPreview: null });
      return false;
    }

    if ((isFetchingRef.current && !isPreCheck) || isClearingRef.current) {
      logDebug('Fetch aborted: another fetch/clear operation in progress.', { userId: currentUserId, isFetching: isFetchingRef.current, isClearing: isClearingRef.current, isPreCheck }, currentUserId);
      return FETCH_ABORTED_BENIGNLY_SYMBOL;
    }

    isFetchingRef.current = true;
    if (!isPreCheck) updateSyncState({ status: 'syncing' });
    logInfo(`SyncManager: Fetching data from server... (isPreCheck: ${isPreCheck})`, { userId: currentUserId }, currentUserId);

    const startTime = performance.now();

    activeFetchControllerRef.current?.abort(NEW_REQUEST_ABORT_REASON);
    const currentFetchController = new AbortController();
    activeFetchControllerRef.current = currentFetchController;
    const timeoutId = setTimeout(() => currentFetchController.abort(API_TIMEOUT_ABORT_REASON), API_TIMEOUT_MS);

    let serverHashToReturn: string | false | typeof FETCH_TIMEOUT_SYMBOL | typeof FETCH_ABORTED_BENIGNLY_SYMBOL = false;

    try {
      const response = await fetch('/api/sync', { signal: currentFetchController.signal });
      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;

      if (currentFetchController.signal.aborted) {
        throw new Error(currentFetchController.signal.reason || 'Fetch aborted');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error: ${response.status} ${response.statusText}`.trim() }));
        throw new Error(errorData.error || `Failed to fetch data: ${response.status} ${response.statusText}`.trim());
      }
      
      const serverData = await response.json();
      const { dataHash: serverHash, ...dataToLoad } = serverData;

      if (isPreCheck) {
        logInfo(`SyncManager: Pre-check fetch successful. Server hash: ${serverHash}`, { userId: currentUserId }, currentUserId);
        return serverHash;
      }

      const localHashOfLoadedData = await hashData(stringify(prepareDataForHashing(dataToLoad)));
      if (HASH_CHECK_ENABLED && localHashOfLoadedData !== serverHash) {
          logError('CRITICAL: Fetched data hash mismatch! Server hash does not match local hash of data just received.',
              new Error('Fetched data hash mismatch'),
              { userIdFromFetchScope: currentUserId, serverHash, localHashOfLoadedData },
              currentUserId
          );
          updateSyncState({
              status: 'hash_mismatch', lastServerHash: serverHash, isMismatchDialogOpen: true,
              conflictingLocalDataString: "Local data state is unavailable due to fetch error.",
              conflictingServerDataString: stringify(prepareDataForHashing(dataToLoad as any)),
              isInitialClientSyncPending: false,
          });
          return false;
      }

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

      lastSyncedData.current = getCurrentLocalDataForFullSnapshot();
      hasLocalChangesRef.current = false;
      
      updateSyncState({
          status: 'synced', lastFetchTime: new Date(), lastServerHash: serverHash,
          isMismatchDialogOpen: false, gettingStartedDismissed: dataToLoad.gettingStartedDismissed || false,
          conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: false,
      });

      logInfo('SyncManager: Data fetched and loaded successfully.', { userId: currentUserId, serverHash, durationMs: duration }, currentUserId);
      toast({ title: 'Data Synced', description: `Latest data loaded from server. (Duration: ${duration.toFixed(0)}ms)` });
      return serverHash;
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error.message || String(error);
      const stableCurrentUserId = currentUserId;

      if (errorMessage.includes(API_TIMEOUT_ABORT_REASON)) {
          logWarn(`Fetch aborted: API call timed out after ${API_TIMEOUT_MS}ms.`, { userId: stableCurrentUserId }, stableCurrentUserId);
          if (!isPreCheck) {
              updateSyncState({ status: 'error', isInitialClientSyncPending: false });
              toast({ title: 'Sync Timed Out', description: 'Could not retrieve data from the server in time.', variant: 'destructive' });
          }
          return FETCH_TIMEOUT_SYMBOL;
      }

      if (errorMessage.includes(NEW_REQUEST_ABORT_REASON) || errorMessage.includes(COMPONENT_UNMOUNTING_ABORT_REASON)) {
          logInfo(`Fetch benignly aborted. Reason: ${errorMessage}`, { userId: stableCurrentUserId, isPreCheck }, stableCurrentUserId);
          if (!isPreCheck && syncStateRef.current.status === 'syncing') {
              updateSyncState({ status: hasLocalChangesRef.current ? 'local_changes' : 'local', isInitialClientSyncPending: false });
          }
          return FETCH_ABORTED_BENIGNLY_SYMBOL;
      }
      
      logError(`Error fetching data (isPreCheck: ${isPreCheck}):`, error, { userIdFromFetchScope: stableCurrentUserId }, stableCurrentUserId);
      if (!isPreCheck) {
        updateSyncState({ status: 'error', isInitialClientSyncPending: false });
        toast({ title: 'Sync Load Failed', description: `${errorMessage || 'Could not retrieve data from server.'}`, variant: 'destructive' });
      }
      return false;
    } finally {
      isFetchingRef.current = false;
      if (activeFetchControllerRef.current === currentFetchController) {
        activeFetchControllerRef.current = null;
      }
      if (!isPreCheck) {
          updateSyncState({ isInitialClientSyncPending: false });
      }
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, getTransactionsState, getDebtState, getInvestmentState, getStatementState, getBudgetState, getWeeklyReviewState, getNotificationState, getCurrentLocalDataForFullSnapshot]);


  const saveData = useCallback(async (force = false, directPayloadObject?: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'>): Promise<boolean> => {
    const currentUserId = userId;
    if (!isClerkLoaded || !isSignedIn || !currentUserId) {
      if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle', isInitialClientSyncPending: true });
      return false;
    }
    if (isSavingRef.current || isFetchingRef.current || isClearingRef.current) {
      logDebug('Save aborted: another sync operation in progress or clearing.', { userId: currentUserId, isSaving: isSavingRef.current, isFetching: isFetchingRef.current, isClearing: isClearingRef.current }, currentUserId);
      return false;
    }

    isSavingRef.current = true;
    updateSyncState({ status: 'syncing' });
    
    if (autoSaveDebounceTimerRef.current) {
      clearTimeout(autoSaveDebounceTimerRef.current);
      autoSaveDebounceTimerRef.current = null;
    }
    
    const payloadObjectToProcess = directPayloadObject || computeDelta();
    if (!payloadObjectToProcess) {
        logInfo("Save aborted: No changes to save (delta was null or empty).", { userId: currentUserId }, currentUserId);
        updateSyncState({ status: 'synced' });
        isSavingRef.current = false;
        return true;
    }
    logInfo('SyncManager: Saving delta data to server...', { userId: currentUserId, force }, currentUserId);

    const preparedDataForHashing = prepareDataForHashing(payloadObjectToProcess as any);
    const canonicalPayloadStringForHashing = stringify(preparedDataForHashing);
    const payloadDataHash = await hashData(canonicalPayloadStringForHashing);
    
    const lastKnownServerHashForSave = force ? null : syncStateRef.current.lastServerHash;

    const localAbortController = new AbortController();
    const timeoutId = setTimeout(() => localAbortController.abort(API_TIMEOUT_ABORT_REASON), API_TIMEOUT_MS);
    
    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payloadObjectToProcess,
          payloadDataHash: payloadDataHash,
          lastKnownServerHash: lastKnownServerHashForSave
        }),
        signal: localAbortController.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Server error during save: ${response.status} ${response.statusText}`.trim() }));
        throw { ...errorData, status: response.status };
      }

      const saveResponseData = await response.json();
      const newServerHash = saveResponseData.newServerHash;
      
      lastSyncedData.current = getCurrentLocalDataForFullSnapshot();
      hasLocalChangesRef.current = false;

      updateSyncState({
        status: 'synced',
        lastSaveTime: new Date(),
        lastServerHash: newServerHash,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        isInitialClientSyncPending: false,
      });
      
      logInfo('SyncManager: Data saved successfully.', { userId: currentUserId, newHash: newServerHash, wasForceSave: force }, currentUserId);
      toast({ title: 'Data Saved', description: 'Changes saved to server.' });
      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      const errorMessage = error.error || error.message || 'Unknown save error';

      if (error.status === 409 && HASH_CHECK_ENABLED) {
        logError('Save rejected by server due to 409 Conflict (stale data).', new Error(errorMessage), { userIdFromSaveScope: currentUserId }, currentUserId);
        updateSyncState({
           status: 'hash_mismatch', isMismatchDialogOpen: true,
           conflictingLocalDataString: canonicalPayloadStringForHashing,
           conflictingServerDataString: error.currentServerHash ? `Server Hash: ${error.currentServerHash}` : "Server state has changed.",
           isInitialClientSyncPending: false,
        });
        toast({ title: 'Save Failed: Data Conflict', description: errorMessage, variant: 'destructive', duration: Infinity });
        return false;
      }
      
      if (error.status === 400 && HASH_CHECK_ENABLED && errorMessage.toLowerCase().includes("integrity")) {
         logError('Save rejected by server due to payload data integrity check failure.', new Error(errorMessage), { userIdFromSaveScope: currentUserId }, currentUserId);
         updateSyncState({
           status: 'hash_mismatch', isMismatchDialogOpen: true,
           conflictingLocalDataString: canonicalPayloadStringForHashing,
           conflictingServerDataString: "Server could not verify the integrity of the sent data. This might be a temporary issue.",
           isInitialClientSyncPending: false,
         });
         toast({ title: 'Save Failed: Data Integrity Issue', description: errorMessage, variant: 'destructive', duration: Infinity });
         return false;
      }

      logError('Error saving data:', error, { userIdFromSaveScope: currentUserId }, currentUserId);
      toast({ title: 'Save Failed', description: errorMessage, variant: 'destructive' });
      updateSyncState({ status: 'error', isInitialClientSyncPending: false });
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, isClerkLoaded, isSignedIn, updateSyncState, toast, computeDelta, getCurrentLocalDataForFullSnapshot]);

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
        logWarn("Manual sync: Conflict dialog is open. User needs to resolve via dialog.", {userId: currentUserId}, currentUserId);
        toast({title: "Conflict Exists", description: "Please resolve the data conflict using the dialog.", variant: "destructive"});
        return;
    }
    if (HASH_CHECK_ENABLED && syncStateRef.current.status === 'hash_mismatch' && !syncStateRef.current.isMismatchDialogOpen) {
        logWarn("Manual sync: hash_mismatch status but dialog not open. Re-opening dialog.", {userId: currentUserId}, currentUserId);
        updateSyncState({ isMismatchDialogOpen: true });
        return;
    }

    if (hasLocalChangesRef.current) {
      try {
        const delta = computeDelta();
        if (delta) {
            logInfo('Manual Sync: Local changes delta detected. Opening preview dialog.', { userId: currentUserId }, currentUserId);
            updateSyncState({
              isPreviewingLocalChanges: true,
              localChangesPayloadPreview: stringify(prepareDataForHashing(delta as any)),
              status: 'local_changes',
            });
            return;
        } else {
             logInfo("Manual Sync: hasLocalChanges was true, but delta was null. Resetting state and attempting fetch.", { userId: currentUserId }, currentUserId);
             hasLocalChangesRef.current = false;
        }
      } catch (e: any) {
          logError("Error computing delta for preview dialog in manualSync", e, { userId: currentUserId }, currentUserId);
          toast({ title: "Error Preparing Sync", description: "Could not compute local changes for preview.", variant: "destructive" });
          updateSyncState({ status: 'error' });
          return;
      }
    }
    
    logInfo('Manual Sync: No local changes. Fetching server state.', { userId: currentUserId }, currentUserId);
    updateSyncState({ status: 'syncing' });
    await fetchData();

  }, [userId, isClerkLoaded, isSignedIn, fetchData, toast, updateSyncState, computeDelta]);

  const confirmAndProceedWithSave = useCallback(async (modifiedPayloadObject?: Record<string, any>) => {
    const currentUserId = userId;
    logInfo("Local Changes Preview: User confirmed. Proceeding with save.", { userId: currentUserId, wasModified: !!modifiedPayloadObject }, currentUserId);
    updateSyncState({ isPreviewingLocalChanges: false, localChangesPayloadPreview: null });
    
    let deltaToSave = modifiedPayloadObject;
    if (!deltaToSave) {
        deltaToSave = computeDelta() || undefined;
    }
    
    const saveSuccess = await saveData(false, deltaToSave as Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'> | undefined);
    
    if (!saveSuccess) {
      logWarn('Previewed Save: saveData failed. Status already set by saveData.', { userId: currentUserId }, currentUserId);
    }
  }, [userId, saveData, updateSyncState, computeDelta]);

  const cancelLocalChangesPreview = useCallback(() => {
    logInfo("Local Changes Preview: User cancelled.", { userId }, userId);
    updateSyncState({ 
      isPreviewingLocalChanges: false, 
      localChangesPayloadPreview: null,
      status: 'local_changes'
    });
  }, [userId, updateSyncState]);

  const forceSave = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Save initiated by user from conflict dialog.", { userId: currentUserId }, currentUserId);
    const delta = computeDelta();
    if (!delta) {
        logInfo("Force Save: No local changes detected in delta. Assuming user wants to force-resync.", { userId: currentUserId }, currentUserId);
        await forceFetch();
        return true;
    }
    const success = await saveData(true, delta); 
    if (success) {
        updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null });
    }
    return success;
  }, [saveData, userId, updateSyncState, computeDelta]);

  const forceFetch = useCallback(async () => {
    const currentUserId = userId;
    logInfo("Force Fetch initiated by user from conflict dialog.", { userId: currentUserId }, currentUserId);
    if (IS_FETCH_DISABLED) {
        toast({ title: 'Cloud Sync Disabled', description: 'Cannot fetch from server. Fetching is currently off.', variant: 'destructive' });
        updateSyncState({ isMismatchDialogOpen: false, status: 'local', conflictingLocalDataString: null, conflictingServerDataString: null, isInitialClientSyncPending: false });
        return false;
    }
    clearAllLocalStoreData();
    const fetchResult = await fetchData();
    if (fetchResult !== false && fetchResult !== FETCH_TIMEOUT_SYMBOL && fetchResult !== FETCH_ABORTED_BENIGNLY_SYMBOL) {
      updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null, status: 'synced' });
      return true;
    }
    updateSyncState({ isMismatchDialogOpen: false, conflictingLocalDataString: null, conflictingServerDataString: null });
    if(syncStateRef.current.status !== 'error' && syncStateRef.current.status !== 'hash_mismatch') {
        updateSyncState({status: syncStateRef.current.lastServerHash ? 'local' : 'idle'});
    }
    return false;
  }, [clearAllLocalStoreData, fetchData, updateSyncState, toast, userId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && hasLocalChangesRef.current && isSignedIn) {
            logInfo("Tab became visible with local changes, triggering manual sync.", { userId }, userId);
            manualSync();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSignedIn, manualSync, userId]);


  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) {
      return;
    }

    if (!isSignedIn && prevUserId) {
      logInfo(`SyncManager effect (user change): User SIGNED OUT. Was: ${prevUserId}. Clearing local data.`, { userId: prevUserId }, prevUserId);
      clearAllLocalStoreData(); 
      initialLoadDoneRef.current = false;
      previousUserIdRef.current = null;
      return;
    }

    if (isSignedIn && currentUserId && (currentUserId !== prevUserId)) {
      logInfo(`SyncManager effect (user change): User signed IN or SWITCHED. New: ${currentUserId}, Old: ${prevUserId ?? 'none'}. Clearing for new user.`, { userId: currentUserId }, currentUserId);
      clearAllLocalStoreData(); 
      initialLoadDoneRef.current = false; 
      previousUserIdRef.current = currentUserId;
    }

    if (isSignedIn && currentUserId && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      logInfo(`SyncManager: Initial setup for user ${currentUserId}.`, { userId: currentUserId }, currentUserId);
      updateSyncState({
        status: 'loading_local',
        isInitialClientSyncPending: true,
      });
      manualSync();
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState, manualSync]);


  useEffect(() => {
    const handleStoreChange = () => {
        if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
          return;
        }
        hasLocalChangesRef.current = true;
        if (syncStateRef.current.status === 'synced' || syncStateRef.current.status === 'local') {
          updateSyncState({ status: 'local_changes' });
        }
    };

    const storesToWatch = [
      useTransactionsStore, useDebtStore, useStatementStore,
      useBudgetStore, useWeeklyReviewStore, useInvestmentStore
    ];
    const unsubscribes = storesToWatch.map(store => store.subscribe(handleStoreChange));
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [updateSyncState, isSignedIn]);

  return {
    syncStatus: syncState.status,
    isFetchDisabled: IS_FETCH_DISABLED,
    manualSync,
    forceSave,
    forceFetch,
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (isOpen: boolean) => updateSyncState({ isMismatchDialogOpen: isOpen }),
    lastSyncTime: syncState.lastFetchTime || syncState.lastSaveTime,
    gettingStartedDismissed: syncState.gettingStartedDismissed,
    setGettingStartedDismissed: (dismissed: boolean) => {
      updateSyncState({ gettingStartedDismissed: dismissed });
      hasLocalChangesRef.current = true;
      if (syncStateRef.current.status !== 'local_changes') {
          updateSyncState({ status: 'local_changes' });
      }
    },
    conflictingLocalDataString: syncState.conflictingLocalDataString,
    conflictingServerDataString: syncState.conflictingServerDataString,
    isInitialClientSyncPending: syncState.isInitialClientSyncPending,
    isPreviewingLocalChanges: syncState.isPreviewingLocalChanges,
    localChangesPayloadPreview: syncState.localChangesPayloadPreview,
    confirmAndProceedWithSave,
    cancelLocalChangesPreview,
  };
}
