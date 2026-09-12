import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveOfflineSnapshot,
  loadOfflineSnapshot,
  enqueueOfflineMutation,
  getOfflineMutations,
  clearOfflineMutations,
  getPendingMutationsCount,
} from '@/lib/offlineQueue';

describe('LocalStorage & Offline Storage Subsystem', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};

    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      key: (i: number) => Object.keys(mockStorage)[i] || null,
      get length() {
        return Object.keys(mockStorage).length;
      },
    };

    if (typeof (globalThis as any).window === 'undefined') {
      (globalThis as any).window = {};
    }
    (globalThis as any).window.localStorage = localStorageMock;
    (globalThis as any).window.location = { pathname: '/dashboard' };
  });

  afterEach(() => {
    mockStorage = {};
  });

  describe('Offline Snapshot Caching', () => {
    it('persists financial snapshot into localStorage with ISO cachedAt timestamp', () => {
      const userId = 'usr_offline_test_1';
      const sampleData = {
        transactions: [{ id: 'tx_local_1', date: '2026-03-01', description: 'Groceries', amount: -2500 }],
        debts: [],
        assetItems: [],
        otherLiabilityItems: [],
        budgetItems: [],
        ownedReviews: {},
        sharedReviews: {},
        notifications: [],
        investmentItems: [],
        gettingStartedDismissed: true,
      };

      saveOfflineSnapshot(userId, sampleData as any);

      const raw = (globalThis as any).window.localStorage.getItem(`imf_offline_snapshot_${userId}`);
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw!);
      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.transactions[0].description).toBe('Groceries');
      expect(parsed.cachedAt).toBeDefined();
      expect(new Date(parsed.cachedAt).getTime()).not.toBeNaN();
    });

    it('loads previously cached offline snapshot accurately', () => {
      const userId = 'usr_offline_test_2';
      const sampleData = {
        transactions: [{ id: 'tx_local_2', date: '2026-03-02', description: 'Consulting', amount: 80000 }],
        debts: [],
        assetItems: [],
        otherLiabilityItems: [],
        budgetItems: [],
        ownedReviews: {},
        sharedReviews: {},
        notifications: [],
        investmentItems: [],
        gettingStartedDismissed: false,
      };

      saveOfflineSnapshot(userId, sampleData as any);
      const loaded = loadOfflineSnapshot(userId);

      expect(loaded).not.toBeNull();
      expect(loaded?.transactions[0].amount).toBe(80000);
      expect(loaded?.gettingStartedDismissed).toBe(false);
    });

    it('returns null gracefully when no cached snapshot exists', () => {
      const loaded = loadOfflineSnapshot('non_existent_user');
      expect(loaded).toBeNull();
    });
  });

  describe('Offline Mutation Queue Management', () => {
    it('enqueues pending offline mutations with sequential timestamps and tracks pending count', () => {
      const userId = 'usr_queue_1';
      const mutation1 = enqueueOfflineMutation(userId, {
        transactions: { created: [{ id: 't1', date: '2026-03-01', description: 'A', amount: 100 }], updated: [], deletedIds: [] },
      } as any);

      const mutation2 = enqueueOfflineMutation(userId, {
        debts: { created: [{ id: 'd1', description: 'B', principal: 500, interestRate: 5, minPayment: 50, term: 'short' }], updated: [], deletedIds: [] },
      } as any);

      expect(mutation1.id).toBeDefined();
      expect(mutation2.id).toBeDefined();

      const queue = getOfflineMutations(userId);
      expect(queue).toHaveLength(2);
      expect(queue[0].id).toBe(mutation1.id);
      expect(queue[1].id).toBe(mutation2.id);
      expect(getPendingMutationsCount(userId)).toBe(2);
    });

    it('clears entire offline mutation queue for user after sync', () => {
      const userId = 'usr_queue_3';
      enqueueOfflineMutation(userId, { transactions: { created: [], updated: [], deletedIds: [] } } as any);
      enqueueOfflineMutation(userId, { debts: { created: [], updated: [], deletedIds: [] } } as any);

      expect(getOfflineMutations(userId)).toHaveLength(2);
      clearOfflineMutations(userId);
      expect(getOfflineMutations(userId)).toHaveLength(0);
      expect(getPendingMutationsCount(userId)).toBe(0);
    });
  });
});
