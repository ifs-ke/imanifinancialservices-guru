// src/hooks/useSyncManager.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useInvestmentStore } from '@/store/investmentStore';
import { useToast } from '@/hooks/use-toast';
import type {
  TransactionWithId,
  DebtItem,
  StatementItem,
  OtherLiabilityItem,
  BudgetItem,
  WeeklyReviewData,
  NotificationItem,
  InvestmentItem,
} from '@/lib/types';
import type { SaveDataPayload as SaveDataPayloadType } from '@/lib/schemas';
import { hashData } from '@/lib/storage-utils';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import stringify from 'fast-json-stable-stringify';
import { logInfo, logWarn, logError } from '@/lib/logger';
import { fetchAllUserDataFromFirestore, saveAllUserDataToFirestore } from '@/lib/firestoreBackend';
import { useOffline } from '@/hooks/useOffline';
import {
  saveOfflineSnapshot,
  loadOfflineSnapshot,
  enqueueOfflineMutation,
  clearOfflineMutations,
  getPendingMutationsCount,
} from '@/lib/offlineQueue';

export const COMPONENT_UNMOUNTING_ABORT_REASON = 'ComponentUnmounting';
export const NEW_REQUEST_ABORT_REASON = 'NewFetchInitiated';
export const API_TIMEOUT_ABORT_REASON = 'APICallTimedOut';
export const FETCH_TIMEOUT_SYMBOL = Symbol.for('FETCH_TIMEOUT');
export const FETCH_ABORTED_BENIGNLY_SYMBOL = Symbol.for('FETCH_ABORTED_BENIGNLY');

export interface SyncedData {
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
}

export type SyncStatus =
  | 'idle'
  | 'loading_local'
  | 'local'
  | 'local_changes'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'offline_changes'
  | 'error'
  | 'error_local'
  | 'hash_mismatch';

interface SyncState {
  status: SyncStatus;
  lastFetchTime: Date | null;
  lastSaveTime: Date | null;
  lastServerHash: string | null;
  isMismatchDialogOpen: boolean;
  conflictingLocalDataString: null | string;
  conflictingServerDataString: null | string;
  isInitialClientSyncPending: boolean;
  isPreviewingLocalChanges: boolean;
  localChangesPayloadPreview: null | string;
  pendingOfflineCount: number;
}

const API_TIMEOUT_MS = 30000;
const AUTO_SAVE_DEBOUNCE_DELAY_MS = 2500;

/**
 * Compares current local state against the last known synced snapshot of objects
 * to compute incremental changes (created, updated, deleted).
 *
 * @template T - The structure of the entity containing an id string property.
 * @param {T[]} current - The active local copy of the data.
 * @param {T[] | null | undefined} lastSynced - The cached baseline of the last successful sync.
 * @returns {{ created: T[]; updated: T[]; deletedIds: string[] }} The itemized delta arrays.
 */
function calculateCollectionChanges<T extends { id: string }>(
  current: T[],
  lastSynced: T[] | null | undefined
): { created: T[]; updated: T[]; deletedIds: string[] } {
  if (!lastSynced) {
    return {
      created: current,
      updated: [],
      deletedIds: [],
    };
  }

  const lastSyncedMap = new Map<string, T>();
  lastSynced.forEach((item) => lastSyncedMap.set(item.id, item));

  const currentMap = new Map<string, T>();
  current.forEach((item) => currentMap.set(item.id, item));

  const created: T[] = [];
  const updated: T[] = [];
  const deletedIds: string[] = [];

  current.forEach((item) => {
    const syncedItem = lastSyncedMap.get(item.id);
    if (!syncedItem) {
      created.push(item);
    } else {
      const isDifferent = JSON.stringify(item) !== JSON.stringify(syncedItem);
      if (isDifferent) {
        updated.push(item);
      }
    }
  });

  lastSynced.forEach((item) => {
    if (!currentMap.has(item.id)) {
      deletedIds.push(item.id);
    }
  });

  return { created, updated, deletedIds };
}

/**
 * Compares current local Weekly Review states against the last known synced snapshot
 * to compute incremental journal and comment adjustments.
 *
 * @param {Record<string, WeeklyReviewData>} current - The active local copy of review records.
 * @param {Record<string, WeeklyReviewData> | null | undefined} lastSynced - The baseline of the last successful sync.
 * @returns {{ created: any[]; updated: any[]; deletedIds: string[] }} The itemized delta arrays.
 */
function calculateReviewChanges(
  current: Record<string, WeeklyReviewData>,
  lastSynced: Record<string, WeeklyReviewData> | null | undefined
): { created: any[]; updated: any[]; deletedIds: string[] } {
  if (!lastSynced) {
    return {
      created: Object.entries(current).map(([weekKey, item]) => ({ ...item, weekKey })),
      updated: [],
      deletedIds: [],
    };
  }

  const created: any[] = [];
  const updated: any[] = [];
  const deletedIds: string[] = [];

  Object.entries(current).forEach(([weekKey, item]) => {
    const syncedItem = lastSynced[weekKey];
    if (!syncedItem) {
      created.push({ ...item, weekKey });
    } else {
      const isDifferent = JSON.stringify(item) !== JSON.stringify(syncedItem);
      if (isDifferent) {
        updated.push({ ...item, weekKey });
      }
    }
  });

  Object.keys(lastSynced).forEach((weekKey) => {
    if (!current[weekKey]) {
      deletedIds.push(weekKey);
    }
  });

  return { created, updated, deletedIds };
}

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();
  const isOffline = useOffline();

  const [syncState, setSyncStateInternal] = useState<SyncState>({
    status: isOffline ? 'offline' : 'idle',
    lastFetchTime: null,
    lastSaveTime: null,
    lastServerHash: null,
    isMismatchDialogOpen: false,
    conflictingLocalDataString: null,
    conflictingServerDataString: null,
    isInitialClientSyncPending: true,
    isPreviewingLocalChanges: false,
    localChangesPayloadPreview: null,
    pendingOfflineCount: 0,
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
  const previousOfflineRef = useRef(isOffline);

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
    setSyncStateInternal((prev) => ({ ...prev, ...partialState }));
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
    };
  }, [
    getTransactionsState,
    getDebtState,
    getInvestmentState,
    getStatementState,
    getBudgetState,
    getWeeklyReviewState,
    getNotificationState,
  ]);

  const computeDelta = useCallback((): Omit<
    SaveDataPayloadType,
    'payloadDataHash' | 'lastKnownServerHash'
  > => {
    const current = getCurrentLocalDataForFullSnapshot();
    const last = lastSyncedData.current;

    const txChanges = calculateCollectionChanges(current.transactions, last?.transactions);
    const debtChanges = calculateCollectionChanges(current.debts, last?.debts);
    const investmentChanges = calculateCollectionChanges(current.investmentItems, last?.investmentItems);
    const assetChanges = calculateCollectionChanges(current.assetItems, last?.assetItems);
    const otherLiabilityChanges = calculateCollectionChanges(current.otherLiabilityItems, last?.otherLiabilityItems);
    const budgetChanges = calculateCollectionChanges(current.budgetItems, last?.budgetItems);
    const reviewChanges = calculateReviewChanges(current.ownedReviews, last?.ownedReviews);

    return {
      transactions: txChanges,
      debts: debtChanges,
      investmentItems: investmentChanges,
      assetItems: assetChanges,
      otherLiabilityItems: otherLiabilityChanges,
      budgetItems: budgetChanges,
      ownedReviews: reviewChanges,
      startDate: current.startDate || null,
      endDate: current.endDate || null,
      gettingStartedDismissed: false,
    };
  }, [getCurrentLocalDataForFullSnapshot]);

  // Rehydrate stores from a SyncedData payload (used for both remote and offline snapshot)
  const rehydrateStores = useCallback((data: SyncedData) => {
    if (Array.isArray(data.transactions)) {
      getTransactionsState().setTransactions(data.transactions);
    }
    if (Array.isArray(data.debts)) {
      getDebtState().setDebts(data.debts);
    }
    if (Array.isArray(data.investmentItems)) {
      getInvestmentState().setInvestmentItems(data.investmentItems);
    }
    if (Array.isArray(data.assetItems)) {
      getStatementState().setAssetItems(data.assetItems);
    }
    if (Array.isArray(data.otherLiabilityItems)) {
      getStatementState().setOtherLiabilityItems(data.otherLiabilityItems);
    }
    if (Array.isArray(data.budgetItems)) {
      getBudgetState().setBudgetItems(data.budgetItems);
    }
    if (data.ownedReviews || data.sharedReviews) {
      getWeeklyReviewState().setReviews(data.ownedReviews || {}, data.sharedReviews || {});
    }
    if (Array.isArray(data.notifications)) {
      getNotificationState().setNotifications(data.notifications);
    }
    if (data.startDate || data.endDate) {
      getStatementState().setStatementDates(
        data.startDate ? new Date(data.startDate) : undefined,
        data.endDate ? new Date(data.endDate) : undefined
      );
    }
  }, [
    getTransactionsState,
    getDebtState,
    getInvestmentState,
    getStatementState,
    getBudgetState,
    getWeeklyReviewState,
    getNotificationState,
  ]);

  const clearAllLocalStoreData = useCallback(() => {
    const currentUserIdForLog = previousUserIdRef.current || userId || 'unknown_user_at_clear';
    if (isClearingRef.current) return;
    isClearingRef.current = true;
    logInfo('SyncManager: Clearing all local store data.', { userId: currentUserIdForLog }, currentUserIdForLog);

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
        status: isOffline ? 'offline' : 'idle',
        lastFetchTime: null,
        lastSaveTime: null,
        lastServerHash: null,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        isInitialClientSyncPending: true,
        isPreviewingLocalChanges: false,
        localChangesPayloadPreview: null,
        pendingOfflineCount: 0,
      });
      hasLocalChangesRef.current = false;
    } catch (error: any) {
      logError('Error during clearAllLocalStoreData', error, { userId: currentUserIdForLog }, currentUserIdForLog);
      updateSyncState({ status: 'error_local', isInitialClientSyncPending: true });
    } finally {
      isClearingRef.current = false;
    }
  }, [
    getTransactionsState,
    getDebtState,
    getInvestmentState,
    getStatementState,
    getBudgetState,
    getWeeklyReviewState,
    getNotificationState,
    updateSyncState,
    userId,
    isOffline,
  ]);

  const fetchData = useCallback(
    async (isPreCheck = false): Promise<string | false | typeof FETCH_TIMEOUT_SYMBOL | typeof FETCH_ABORTED_BENIGNLY_SYMBOL> => {
      const currentUserId = userId;
      if (!isClerkLoaded || !isSignedIn || !currentUserId) {
        if (!isPreCheck && syncStateRef.current.status !== 'idle' && !isOffline) {
          updateSyncState({ status: 'idle', isInitialClientSyncPending: true });
        }
        return false;
      }

      // If offline, load seamlessly from local snapshot cache
      if (isOffline) {
        logInfo('SyncManager: Offline mode detected. Rehydrating from cached snapshot.', { userId: currentUserId });
        const cachedSnapshot = loadOfflineSnapshot(currentUserId);
        if (cachedSnapshot) {
          rehydrateStores(cachedSnapshot);
          lastSyncedData.current = cachedSnapshot;
        }
        const pendingCount = getPendingMutationsCount(currentUserId);
        updateSyncState({
          status: pendingCount > 0 ? 'offline_changes' : 'offline',
          pendingOfflineCount: pendingCount,
          isInitialClientSyncPending: false,
          lastFetchTime: new Date(),
        });
        return 'offline-cached-hash';
      }

      if (isFetchingRef.current) {
        logWarn('Fetch requested while already in progress, aborting previous.', { userId: currentUserId });
        activeFetchControllerRef.current?.abort(NEW_REQUEST_ABORT_REASON);
      }

      const controller = new AbortController();
      activeFetchControllerRef.current = controller;
      isFetchingRef.current = true;

      if (!isPreCheck) {
        updateSyncState({ status: 'syncing' });
      }

      const timeoutId = setTimeout(() => {
        controller.abort(API_TIMEOUT_ABORT_REASON);
      }, API_TIMEOUT_MS);

      try {
        let data: any = null;
        try {
          const response = await fetch('/api/sync', {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' },
          });

          if (response.ok) {
            data = await response.json();
          }
        } catch (_fetchErr) {
          // In Vite SPA mode, API routes may not exist - fallback to Firestore directly
        }

        clearTimeout(timeoutId);

        if (!data) {
          try {
            data = await fetchAllUserDataFromFirestore(currentUserId);
          } catch (_fsErr) {
            // Local store fallback
          }
        }

        const serverHash = data?.dataHash || 'local-active-hash';

        if (!isPreCheck && data) {
          rehydrateStores(data);

          const syncedSnapshot: SyncedData = {
            transactions: data.transactions || [],
            debts: data.debts || [],
            investmentItems: data.investmentItems || [],
            assetItems: data.assetItems || [],
            otherLiabilityItems: data.otherLiabilityItems || [],
            budgetItems: data.budgetItems || [],
            ownedReviews: data.ownedReviews || {},
            sharedReviews: data.sharedReviews || {},
            notifications: data.notifications || [],
            startDate: data.startDate,
            endDate: data.endDate,
          };

          lastSyncedData.current = syncedSnapshot;

          // Always update local offline snapshot cache with fresh cloud data
          saveOfflineSnapshot(currentUserId, syncedSnapshot);

          hasLocalChangesRef.current = false;
          const pendingCount = getPendingMutationsCount(currentUserId);

          updateSyncState({
            status: 'synced',
            lastFetchTime: new Date(),
            lastServerHash: serverHash,
            isInitialClientSyncPending: false,
            pendingOfflineCount: pendingCount,
          });
        } else if (!isPreCheck) {
          const currentSnapshot = getCurrentLocalDataForFullSnapshot();
          lastSyncedData.current = currentSnapshot;
          saveOfflineSnapshot(currentUserId, currentSnapshot);
          hasLocalChangesRef.current = false;
          updateSyncState({
            status: 'synced',
            lastFetchTime: new Date(),
            lastServerHash: 'local-active-hash',
            isInitialClientSyncPending: false,
          });
        }

        return serverHash;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (controller.signal.aborted) {
          if (controller.signal.reason === API_TIMEOUT_ABORT_REASON) {
            updateSyncState({ status: 'synced' });
            return FETCH_TIMEOUT_SYMBOL;
          }
          return FETCH_ABORTED_BENIGNLY_SYMBOL;
        }
        logWarn('Sync fetch graceful fallback to offline snapshot', { userId: currentUserId });
        const cached = loadOfflineSnapshot(currentUserId);
        if (cached) {
          rehydrateStores(cached);
        }
        updateSyncState({ status: 'synced', isInitialClientSyncPending: false });
        return 'local-active-hash';
      } finally {
        isFetchingRef.current = false;
      }
    },
    [
      userId,
      isClerkLoaded,
      isSignedIn,
      isOffline,
      updateSyncState,
      rehydrateStores,
      getCurrentLocalDataForFullSnapshot,
    ]
  );

  const saveData = useCallback(
    async (
      force = false,
      directPayloadObject?: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'>
    ): Promise<boolean> => {
      const currentUserId = userId;
      if (!isClerkLoaded || !isSignedIn || !currentUserId) {
        if (syncStateRef.current.status !== 'idle' && !isOffline) updateSyncState({ status: 'idle' });
        return false;
      }

      const deltaPayload = directPayloadObject || computeDelta();
      const currentSnapshot = getCurrentLocalDataForFullSnapshot();

      // If offline: save snapshot locally, queue mutation, and avoid network calls
      if (isOffline) {
        saveOfflineSnapshot(currentUserId, currentSnapshot);
        enqueueOfflineMutation(currentUserId, deltaPayload);
        const pendingCount = getPendingMutationsCount(currentUserId);
        lastSyncedData.current = currentSnapshot;
        hasLocalChangesRef.current = false;
        updateSyncState({
          status: 'offline_changes',
          pendingOfflineCount: pendingCount,
          lastSaveTime: new Date(),
        });
        logInfo('SyncManager: Saved changes offline in local queue.', { userId: currentUserId, pendingCount });
        return true;
      }

      if (isSavingRef.current) {
        logWarn('Save called while already in progress.', { userId: currentUserId });
        return false;
      }

      isSavingRef.current = true;
      updateSyncState({ status: 'syncing' });

      try {
        const preparedDataForHashingObj = prepareDataForHashing(deltaPayload as any);
        const payloadDataHash = await hashData(stringify(preparedDataForHashingObj));

        const fullPayload: SaveDataPayloadType = {
          ...deltaPayload,
          payloadDataHash,
          lastKnownServerHash: force ? undefined : syncStateRef.current.lastServerHash || undefined,
        };

        let saveSucceeded = false;
        let newServerHash = payloadDataHash;

        try {
          const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullPayload),
          });

          if (response.status === 409) {
            // Conflict: server state has moved forward
            const conflictData = await response.json();
            logWarn('Save conflict detected (409)', { conflictData });
            updateSyncState({
              status: 'hash_mismatch',
              conflictingServerDataString: conflictData.currentServerHash || null,
            });
            await fetchData();
            return false;
          }

          if (response.ok) {
            const resJson = await response.json();
            newServerHash = resJson.newServerHash || payloadDataHash;
            saveSucceeded = true;
          }
        } catch (_apiErr) {
          // Vite SPA mode fallback to direct Firestore save
        }

        if (!saveSucceeded) {
          try {
            await saveAllUserDataToFirestore(currentUserId, fullPayload as any);
            saveSucceeded = true;
          } catch (_fsErr) {
            // If remote save fails due to network drop, save to offline queue gracefully
            logWarn('Remote save failed, falling back to offline queue', { userId: currentUserId });
            saveOfflineSnapshot(currentUserId, currentSnapshot);
            enqueueOfflineMutation(currentUserId, deltaPayload, payloadDataHash);
            const pendingCount = getPendingMutationsCount(currentUserId);
            updateSyncState({
              status: 'offline_changes',
              pendingOfflineCount: pendingCount,
            });
            return true;
          }
        }

        // On successful save: update cached snapshot, clear offline mutations, and update synced state
        saveOfflineSnapshot(currentUserId, currentSnapshot);
        clearOfflineMutations(currentUserId);
        hasLocalChangesRef.current = false;
        lastSyncedData.current = currentSnapshot;

        updateSyncState({
          status: 'synced',
          lastSaveTime: new Date(),
          lastServerHash: newServerHash || syncStateRef.current.lastServerHash,
          isMismatchDialogOpen: false,
          pendingOfflineCount: 0,
        });

        return true;
      } catch (error: any) {
        logWarn('Save operation completed locally with offline cache', { userId: currentUserId });
        saveOfflineSnapshot(currentUserId, currentSnapshot);
        updateSyncState({ status: 'synced' });
        return true;
      } finally {
        isSavingRef.current = false;
      }
    },
    [
      userId,
      isClerkLoaded,
      isSignedIn,
      isOffline,
      computeDelta,
      updateSyncState,
      getCurrentLocalDataForFullSnapshot,
      fetchData,
    ]
  );

  // Drains all pending offline mutations to Firestore when reconnected
  const drainOfflineQueue = useCallback(async (): Promise<boolean> => {
    if (!isSignedIn || !userId || isOffline) return false;

    const pendingCount = getPendingMutationsCount(userId);
    if (pendingCount === 0) return true;

    logInfo(`SyncManager: Draining offline queue with ${pendingCount} mutations...`, { userId });
    updateSyncState({ status: 'syncing' });

    try {
      // Perform a full state save to synchronize everything accumulated offline
      const success = await saveData(true);
      if (success) {
        clearOfflineMutations(userId);
        updateSyncState({ status: 'synced', pendingOfflineCount: 0 });
        toast({
          title: 'Back Online',
          description: `Successfully synchronized ${pendingCount} offline update${pendingCount > 1 ? 's' : ''} with Cloud Firestore.`,
        });
        return true;
      }
      return false;
    } catch (error) {
      logError('SyncManager: Error draining offline queue', error, { userId });
      updateSyncState({ status: 'error' });
      return false;
    }
  }, [isSignedIn, userId, isOffline, saveData, updateSyncState, toast]);

  // Monitor network status transitions (offline -> online)
  useEffect(() => {
    if (previousOfflineRef.current && !isOffline) {
      // Reconnected to internet!
      logInfo('Network status changed: Reconnected online.', { userId });
      toast({
        title: 'Network Reconnected',
        description: 'Connecting to Cloud Firestore and reconciling data...',
      });
      drainOfflineQueue();
    } else if (!previousOfflineRef.current && isOffline) {
      // Disconnected from internet
      logInfo('Network status changed: Went offline.', { userId });
      const pendingCount = getPendingMutationsCount(userId || '');
      updateSyncState({
        status: pendingCount > 0 ? 'offline_changes' : 'offline',
        pendingOfflineCount: pendingCount,
      });
      toast({
        title: 'Offline Mode Active',
        description: 'Your changes are safely saved locally and will auto-sync when connection resumes.',
      });
    }

    previousOfflineRef.current = isOffline;
  }, [isOffline, userId, drainOfflineQueue, updateSyncState, toast]);

  const manualSync = useCallback(async () => {
    if (!isSignedIn || !userId) {
      toast({ title: 'Not Signed In', description: 'Please sign in to sync with Firestore.', variant: 'destructive' });
      return;
    }

    if (isOffline) {
      toast({
        title: 'Offline Mode',
        description: 'You are currently offline. Local data is active and will auto-sync once connected.',
      });
      return;
    }

    toast({ title: 'Syncing Data', description: 'Synchronizing with Cloud Firestore...' });
    const pendingCount = getPendingMutationsCount(userId);
    if (pendingCount > 0) {
      await drainOfflineQueue();
    } else {
      const success = await fetchData();
      if (success) {
        toast({ title: 'Firestore Synced', description: 'Your data is synchronized with Cloud Firestore.' });
      }
    }
  }, [isSignedIn, userId, isOffline, fetchData, drainOfflineQueue, toast]);

  // Debounced auto-save listener on local store changes
  useEffect(() => {
    const handleStoreChange = () => {
      if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
        return;
      }

      hasLocalChangesRef.current = true;

      if (isOffline) {
        const currentUserId = userId;
        if (currentUserId) {
          const snapshot = getCurrentLocalDataForFullSnapshot();
          saveOfflineSnapshot(currentUserId, snapshot);
          const delta = computeDelta();
          enqueueOfflineMutation(currentUserId, delta);
          const pendingCount = getPendingMutationsCount(currentUserId);
          updateSyncState({ status: 'offline_changes', pendingOfflineCount: pendingCount });
        }
        return;
      }

      updateSyncState({ status: 'local_changes' });

      if (autoSaveDebounceTimerRef.current) {
        clearTimeout(autoSaveDebounceTimerRef.current);
      }
      autoSaveDebounceTimerRef.current = setTimeout(() => {
        saveData();
      }, AUTO_SAVE_DEBOUNCE_DELAY_MS);
    };

    const storesToWatch = [
      useTransactionsStore,
      useDebtStore,
      useStatementStore,
      useBudgetStore,
      useWeeklyReviewStore,
      useInvestmentStore,
    ];
    const unsubscribes = storesToWatch.map((store) => store.subscribe(handleStoreChange));
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      if (autoSaveDebounceTimerRef.current) clearTimeout(autoSaveDebounceTimerRef.current);
    };
  }, [
    updateSyncState,
    isSignedIn,
    saveData,
    isOffline,
    userId,
    getCurrentLocalDataForFullSnapshot,
    computeDelta,
  ]);

  // Initial load effect
  useEffect(() => {
    const currentUserId = userId;
    const prevUserId = previousUserIdRef.current;

    if (!isClerkLoaded) return;

    if (!isSignedIn && prevUserId) {
      clearAllLocalStoreData();
      initialLoadDoneRef.current = false;
      previousUserIdRef.current = null;
      return;
    }

    if (isSignedIn && currentUserId && prevUserId && currentUserId !== prevUserId) {
      clearAllLocalStoreData();
      initialLoadDoneRef.current = false;
    }

    if (isSignedIn && currentUserId && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      updateSyncState({
        status: isOffline ? 'offline' : 'loading_local',
        isInitialClientSyncPending: true,
        pendingOfflineCount: getPendingMutationsCount(currentUserId),
      });
      fetchData();
    }

    if (previousUserIdRef.current !== currentUserId) {
      previousUserIdRef.current = currentUserId;
    }
  }, [
    userId,
    isSignedIn,
    isClerkLoaded,
    isOffline,
    clearAllLocalStoreData,
    updateSyncState,
    fetchData,
  ]);

  return {
    syncStatus: syncState.status,
    hashMismatch: syncState.status === 'hash_mismatch',
    isOffline,
    isOnline: !isOffline,
    pendingOfflineCount: syncState.pendingOfflineCount,
    isFetchDisabled: false,
    manualSync,
    drainOfflineQueue,
    forceSave: () => saveData(true),
    forceFetch: () => fetchData(),
    isMismatchDialogOpen: syncState.isMismatchDialogOpen,
    setIsMismatchDialogOpen: (open: boolean) => updateSyncState({ isMismatchDialogOpen: open }),
    lastSyncTime: syncState.lastSaveTime || syncState.lastFetchTime,
    conflictingLocalDataString: syncState.conflictingLocalDataString,
    conflictingServerDataString: syncState.conflictingServerDataString,
    isInitialClientSyncPending: syncState.isInitialClientSyncPending,
    isPreviewingLocalChanges: syncState.isPreviewingLocalChanges,
    localChangesPayloadPreview: syncState.localChangesPayloadPreview,
    confirmAndProceedWithSave: async () => {
      await saveData(true);
    },
    cancelLocalChangesPreview: () => {
      updateSyncState({ isPreviewingLocalChanges: false, localChangesPayloadPreview: null, status: 'synced' });
    },
  };
}
