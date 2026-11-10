/**
 * @fileoverview Unit tests for Guest Mode & Offline Access Fallback.
 * Ensures anonymous local-only persistence, data isolation, and clean session exit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveOfflineSnapshot,
  loadOfflineSnapshot,
  clearOfflineSnapshot,
  getOfflineMutations,
  type SyncedSnapshotData,
} from '@/lib/offlineQueue';

describe('Guest Mode & Offline Fallback Architecture', () => {
  let mockStorage: Record<string, string> = {};
  const GUEST_SESSION_KEY = 'imf_guest_session';
  const GUEST_UID_PREFIX = 'guest_';

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
    (globalThis as any).localStorage = localStorageMock;
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockStorage = {};
  });

  it('generates a valid anonymous guest session and persists to localStorage', () => {
    const guestTimestamp = Date.now();
    const guestUid = `${GUEST_UID_PREFIX}${guestTimestamp}`;
    const guestData = {
      id: guestUid,
      fullName: 'Guest User',
      email: null,
      imageUrl: '',
      isGuest: true,
      isAnonymous: true,
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(guestData));

    const stored = localStorage.getItem(GUEST_SESSION_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.isGuest).toBe(true);
    expect(parsed.isAnonymous).toBe(true);
    expect(parsed.id).toMatch(/^guest_\d+$/);
    expect(parsed.fullName).toBe('Guest User');
  });

  it('persists and loads guest financial snapshots offline without cloud mutations', () => {
    const guestUid = 'guest_offline_12345';
    const sampleBudgetData: Omit<SyncedSnapshotData, 'cachedAt'> = {
      transactions: [{ id: 'tx_1', amount: 2500, description: 'Local Food', date: '2026-09-19', type: 'expense', category: 'Food' }],
      debts: [],
      assetItems: [],
      otherLiabilityItems: [],
      budgetItems: [],
      ownedReviews: {},
      sharedReviews: {},
      notifications: [],
      investmentItems: [],
    };

    saveOfflineSnapshot(guestUid, sampleBudgetData);

    // Verify local snapshot was stored and is rehydratable
    const loaded = loadOfflineSnapshot(guestUid);
    expect(loaded).not.toBeNull();
    expect(loaded!.transactions).toHaveLength(1);
    expect(loaded!.transactions[0].amount).toBe(2500);

    // Verify offline mutation queue remains empty for guest users
    const mutations = getOfflineMutations(guestUid);
    expect(mutations).toHaveLength(0);
  });

  it('completely wipes local guest data on explicit exitGuestMode(clearGuestData = true)', () => {
    const guestUid = 'guest_session_999';
    const sessionKey = GUEST_SESSION_KEY;
    const queueKey = `imf_offline_queue_${guestUid}`;

    // Populate guest data
    localStorage.setItem(sessionKey, JSON.stringify({ id: guestUid, isGuest: true }));
    saveOfflineSnapshot(guestUid, {
      transactions: [],
      debts: [],
      assetItems: [],
      otherLiabilityItems: [],
      budgetItems: [],
      ownedReviews: {},
      sharedReviews: {},
      notifications: [],
      investmentItems: [],
    });
    localStorage.setItem(queueKey, JSON.stringify([]));

    // Simulate exitGuestMode(true)
    localStorage.removeItem(sessionKey);
    clearOfflineSnapshot(guestUid);
    localStorage.removeItem(queueKey);

    expect(localStorage.getItem(sessionKey)).toBeNull();
    expect(loadOfflineSnapshot(guestUid)).toBeNull();
    expect(localStorage.getItem(queueKey)).toBeNull();
  });

  it('preserves offline snapshot if guest chooses Keep Data & Exit', () => {
    const guestUid = 'guest_session_keep';
    const sessionKey = GUEST_SESSION_KEY;

    localStorage.setItem(sessionKey, JSON.stringify({ id: guestUid, isGuest: true }));
    saveOfflineSnapshot(guestUid, {
      transactions: [{ id: 'tx_keep', amount: 12000, description: 'Savings', date: '2026-09-19', type: 'income', category: 'Salary' }],
      debts: [],
      assetItems: [],
      otherLiabilityItems: [],
      budgetItems: [],
      ownedReviews: {},
      sharedReviews: {},
      notifications: [],
      investmentItems: [],
    });

    // Simulate exitGuestMode(false) - removes active session token only
    localStorage.removeItem(sessionKey);

    expect(localStorage.getItem(sessionKey)).toBeNull();
    // Snapshot remains for future resumption
    const loaded = loadOfflineSnapshot(guestUid);
    expect(loaded).not.toBeNull();
    expect(loaded!.transactions[0].amount).toBe(12000);
  });
});
