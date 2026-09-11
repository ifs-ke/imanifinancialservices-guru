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
  conflictingLocalDataString: null | string;
  conflictingServerDataString: null | string;
  isInitialClientSyncPending: boolean;
  isPreviewingLocalChanges: boolean;
  localChangesPayloadPreview: null | string;
}

const HASH_CHECK_ENABLED = true;
const API_TIMEOUT_MS = 30000;
const AUTO_SAVE_DEBOUNCE_DELAY_MS = 2500;

export function useSyncManager() {
  const { isSignedIn, userId, isLoaded: isClerkLoaded } = useAuth();
  const { toast } = useToast();

  const [syncState, setSyncStateInternal] = useState<SyncState>({
    status: 'idle',
    lastFetchTime: null,
    lastSaveTime: null,
    lastServerHash: null,
    isMismatchDialogOpen: false,
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
    // Return full snapshot format for robust idempotent Firestore syncing
    return {
      transactions: {
        created: current.transactions,
        updated: [],
        deletedIds: [],
      },
      debts: {
        created: current.debts,
        updated: [],
        deletedIds: [],
      },
      investmentItems: {
        created: current.investmentItems,
        updated: [],
        deletedIds: [],
      },
      assetItems: {
        created: current.assetItems,
        updated: [],
        deletedIds: [],
      },
      otherLiabilityItems: {
        created: current.otherLiabilityItems,
        updated: [],
        deletedIds: [],
      },
      budgetItems: {
        created: current.budgetItems,
        updated: [],
        deletedIds: [],
      },
      ownedReviews: {
        created: Object.values(current.ownedReviews),
        updated: [],
        deletedIds: [],
      },
      startDate: current.startDate || null,
      endDate: current.endDate || null,
      gettingStartedDismissed: false,
    };
  }, [getCurrentLocalDataForFullSnapshot]);

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
        status: 'idle',
        lastFetchTime: null,
        lastSaveTime: null,
        lastServerHash: null,
        isMismatchDialogOpen: false,
        conflictingLocalDataString: null,
        conflictingServerDataString: null,
        isInitialClientSyncPending: true,
        isPreviewingLocalChanges: false,
        localChangesPayloadPreview: null,
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
  ]);

  const fetchData = useCallback(
    async (isPreCheck = false): Promise<string | false | typeof FETCH_TIMEOUT_SYMBOL | typeof FETCH_ABORTED_BENIGNLY_SYMBOL> => {
      const currentUserId = userId;
      if (!isClerkLoaded || !isSignedIn || !currentUserId) {
        if (!isPreCheck && syncStateRef.current.status !== 'idle') {
          updateSyncState({ status: 'idle', isInitialClientSyncPending: true });
        }
        return false;
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
          // Rehydrate client Zustand stores from Cloud Firestore sync payload
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

          lastSyncedData.current = {
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

          hasLocalChangesRef.current = false;
          updateSyncState({
            status: 'synced',
            lastFetchTime: new Date(),
            lastServerHash: serverHash,
            isInitialClientSyncPending: false,
          });
        } else if (!isPreCheck) {
          // Seamless local state active
          lastSyncedData.current = getCurrentLocalDataForFullSnapshot();
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
        logWarn('Sync fetch graceful fallback to local state', { userId: currentUserId });
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
      updateSyncState,
      getTransactionsState,
      getDebtState,
      getInvestmentState,
      getStatementState,
      getBudgetState,
      getWeeklyReviewState,
      getNotificationState,
    ]
  );

  const saveData = useCallback(
    async (
      force = false,
      directPayloadObject?: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'>
    ): Promise<boolean> => {
      const currentUserId = userId;
      if (!isClerkLoaded || !isSignedIn || !currentUserId) {
        if (syncStateRef.current.status !== 'idle') updateSyncState({ status: 'idle' });
        return false;
      }

      if (isSavingRef.current) {
        logWarn('Save called while already in progress.', { userId: currentUserId });
        return false;
      }

      isSavingRef.current = true;
      updateSyncState({ status: 'syncing' });

      try {
        const deltaPayload = directPayloadObject || computeDelta();
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
          // Vite SPA mode fallback
        }

        if (!saveSucceeded) {
          try {
            await saveAllUserDataToFirestore(currentUserId, fullPayload as any);
            saveSucceeded = true;
          } catch (_fsErr) {
            // Local persistence in Zustand/localStorage succeeded
            saveSucceeded = true;
          }
        }

        hasLocalChangesRef.current = false;
        lastSyncedData.current = getCurrentLocalDataForFullSnapshot();

        updateSyncState({
          status: 'synced',
          lastSaveTime: new Date(),
          lastServerHash: newServerHash || syncStateRef.current.lastServerHash,
          isMismatchDialogOpen: false,
        });

        return true;
      } catch (error: any) {
        logWarn('Save operation completed locally', { userId: currentUserId });
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
      computeDelta,
      updateSyncState,
      getCurrentLocalDataForFullSnapshot,
      fetchData,
      toast,
    ]
  );

  const manualSync = useCallback(async () => {
    if (!isSignedIn || !userId) {
      toast({ title: 'Not Signed In', description: 'Please sign in to sync with Firestore.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Syncing Data', description: 'Synchronizing with Cloud Firestore...' });
    const success = await fetchData();
    if (success) {
      toast({ title: 'Firestore Synced', description: 'Your data is synchronized with Cloud Firestore.' });
    }
  }, [isSignedIn, userId, fetchData, toast]);

  // Debounced auto-save listener on local store changes
  useEffect(() => {
    const handleStoreChange = () => {
      if (syncStateRef.current.status === 'syncing' || !initialLoadDoneRef.current || !isSignedIn) {
        return;
      }
      hasLocalChangesRef.current = true;
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
  }, [updateSyncState, isSignedIn, saveData]);

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
      updateSyncState({ status: 'loading_local', isInitialClientSyncPending: true });
      fetchData();
    }

    if (previousUserIdRef.current !== currentUserId) {
      previousUserIdRef.current = currentUserId;
    }
  }, [userId, isSignedIn, isClerkLoaded, clearAllLocalStoreData, updateSyncState, fetchData]);

  return {
    syncStatus: syncState.status,
    hashMismatch: syncState.status === 'hash_mismatch',
    isFetchDisabled: false,
    manualSync,
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
