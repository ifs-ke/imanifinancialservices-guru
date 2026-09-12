// src/lib/offlineQueue.ts
import type { SaveDataPayload as SaveDataPayloadType } from '@/lib/schemas';
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
import { logInfo, logWarn, logError } from '@/lib/logger';

export interface SyncedSnapshotData {
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
  cachedAt: string;
  dataHash?: string;
}

export interface OfflineMutationItem {
  id: string;
  timestamp: string;
  userId: string;
  payload: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'>;
  payloadDataHash?: string;
  retryCount: number;
}

const SNAPSHOT_PREFIX = 'imf_offline_snapshot_';
const QUEUE_PREFIX = 'imf_offline_queue_';

/**
 * Saves a full data snapshot into local storage for zero-latency offline access.
 *
 * @param {string} userId - The authenticated user's unique identifier.
 * @param {Omit<SyncedSnapshotData, 'cachedAt'>} data - Financial dataset snapshot.
 */
export function saveOfflineSnapshot(
  userId: string,
  data: Omit<SyncedSnapshotData, 'cachedAt'>
): void {
  if (typeof window === 'undefined' || !userId) return;

  try {
    const key = `${SNAPSHOT_PREFIX}${userId}`;
    const payloadWithMeta: SyncedSnapshotData = {
      ...data,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(payloadWithMeta));
    logInfo('OfflineQueue: Saved local data snapshot.', { userId });
  } catch (error) {
    logWarn('OfflineQueue: Failed to save offline snapshot to localStorage.', { userId, error });
  }
}

/**
 * Loads the cached financial snapshot from local storage for offline operation.
 *
 * @param {string} userId - The authenticated user's unique identifier.
 * @returns {SyncedSnapshotData | null} Cached data snapshot or null if unavailable.
 */
export function loadOfflineSnapshot(userId: string): SyncedSnapshotData | null {
  if (typeof window === 'undefined' || !userId) return null;

  try {
    const key = `${SNAPSHOT_PREFIX}${userId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SyncedSnapshotData;
  } catch (error) {
    logError('OfflineQueue: Failed to load offline snapshot.', error, { userId });
    return null;
  }
}

/**
 * Enqueues an offline mutation to be sent to Firestore when network connectivity resumes.
 *
 * @param {string} userId - The authenticated user's unique identifier.
 * @param {Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'>} payload - Delta changes.
 * @param {string} [payloadDataHash] - Precomputed SHA-256 data hash.
 * @returns {OfflineMutationItem} The created queue item.
 */
export function enqueueOfflineMutation(
  userId: string,
  payload: Omit<SaveDataPayloadType, 'payloadDataHash' | 'lastKnownServerHash'>,
  payloadDataHash?: string
): OfflineMutationItem {
  const item: OfflineMutationItem = {
    id: `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    userId,
    payload,
    payloadDataHash,
    retryCount: 0,
  };

  if (typeof window === 'undefined' || !userId) return item;

  try {
    const key = `${QUEUE_PREFIX}${userId}`;
    const existingQueue = getOfflineMutations(userId);
    existingQueue.push(item);
    window.localStorage.setItem(key, JSON.stringify(existingQueue));
    logInfo('OfflineQueue: Enqueued offline mutation.', { userId, mutationId: item.id });
  } catch (error) {
    logWarn('OfflineQueue: Failed to enqueue offline mutation.', { userId, error });
  }

  return item;
}

/**
 * Retrieves all pending offline mutations for a user.
 *
 * @param {string} userId - The authenticated user's unique identifier.
 * @returns {OfflineMutationItem[]} Array of queued mutations.
 */
export function getOfflineMutations(userId: string): OfflineMutationItem[] {
  if (typeof window === 'undefined' || !userId) return [];

  try {
    const key = `${QUEUE_PREFIX}${userId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineMutationItem[];
  } catch (error) {
    logWarn('OfflineQueue: Failed to retrieve offline mutations.', { userId, error });
    return [];
  }
}

/**
 * Clears the offline mutation queue after successful synchronization.
 *
 * @param {string} userId - The authenticated user's unique identifier.
 */
export function clearOfflineMutations(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;

  try {
    const key = `${QUEUE_PREFIX}${userId}`;
    window.localStorage.removeItem(key);
    logInfo('OfflineQueue: Cleared offline mutations queue.', { userId });
  } catch (error) {
    logWarn('OfflineQueue: Failed to clear offline queue.', { userId, error });
  }
}

/**
 * Returns the count of pending offline mutations awaiting synchronization.
 *
 * @param {string} userId - The authenticated user's unique identifier.
 * @returns {number} Number of pending mutations in the queue.
 */
export function getPendingMutationsCount(userId: string): number {
  if (typeof window === 'undefined' || !userId) return 0;
  return getOfflineMutations(userId).length;
}
