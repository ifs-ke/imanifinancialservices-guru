
// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { DebtItem, DebtStatus } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils';
import { logInfo } from '@/lib/logger';
import { computeDebtStatus, isDebtActive, isDebtPaidOff } from '@/lib/debtUtils';

const generateId = (): string => {
  const prefix = 'debt';
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  } else {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
};

// Helper to manage versioning for acknowledgements
const incrementVersion = (currentVersion?: number): number => (currentVersion || 0) + 1;

const normalizeDebt = (debt: any): DebtItem => {
  const principal = Number(debt.principal) || 0;
  const date = debt.date || new Date().toISOString().split('T')[0];
  const dueDate = debt.dueDate || null;
  const classification = debt.classification === 'institutional' ? 'institutional' : 'personal';
  const term = debt.term || 'short';
  const rawStatus: DebtStatus = debt.status || 'active';
  const computedStatus = computeDebtStatus({
    status: rawStatus,
    dueDate,
    date,
    term,
    principal,
  });

  return {
    ...debt,
    principal,
    date,
    dueDate,
    classification,
    term,
    status: computedStatus,
    notes: debt.notes || null,
    interestRate: debt.interestRate !== undefined && debt.interestRate !== null ? Number(debt.interestRate) : 0,
  };
};

const sortDebts = (debtList: DebtItem[]): DebtItem[] => {
    if (!Array.isArray(debtList)) return [];
    return [...debtList].map(normalizeDebt).sort((a, b) => {
        // First sort by date descending (most recent first)
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const descDiff = (a.description || '').localeCompare(b.description || '');
        if (descDiff !== 0) return descDiff;
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        return (b.principal || 0) - (a.principal || 0);
    });
};

const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = typeof window !== 'undefined' ? sessionStorage : undefined;
  return {
    getItem: (name) => {
      if (!storage) return null;
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str);
        return JSON.parse(decodedStr);
      } catch (e) {
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        const stringifiedValue = JSON.stringify(value);
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {
        // console.error(`Failed to encode/stringify and set item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

// Define DebtItem with _acknowledgementVersion directly if not in lib/types
interface InternalDebtItem extends DebtItem {
  _acknowledgementVersion?: number;
}

export interface DebtState {
    debts: InternalDebtItem[]; // Use internal type that includes version
    isHydrated: boolean;
    acknowledgedPrincipals: Record<string, { principal: number; version: number }>;
    setDebts: (debts: DebtItem[], userId?: string) => void;
    addDebt: (debtData: Omit<DebtItem, 'id'>, userId?: string) => InternalDebtItem;
    updateDebt: (updatedDebt: DebtItem, userId?: string) => void;
    deleteDebt: (id: string, userId?: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[], userId?: string) => InternalDebtItem[];
    clearDebts: (userId?: string) => void;
    acknowledgeDebtChange: (debtId: string) => void;
}

const initialState = {
    debts: [],
    isHydrated: false,
    acknowledgedPrincipals: {},
};

export const useDebtStore = create<DebtState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setDebts: (debts, userIdForLog) => {
                 const validatedDebts = (debts || []).map(d => ({ ...d, _acknowledgementVersion: (d as InternalDebtItem)._acknowledgementVersion || 1 }));
                 logInfo(`DebtStore: Setting debts for user ${userIdForLog || 'unknown'}. Count: ${validatedDebts.length}`, {userId: userIdForLog});
                 set({ debts: sortDebts(validatedDebts), isHydrated: true });
            },
            addDebt: (debtData, userIdForLog) => {
                const newDebt: InternalDebtItem = {
                    id: generateId(),
                    ...debtData,
                    _acknowledgementVersion: 1, // Initial version for new debts
                };
                logInfo(`DebtStore: Adding debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: newDebt.id});
                set((state) => ({ debts: sortDebts([...state.debts, newDebt]) }));
                // New debts are implicitly unacknowledged by not being in acknowledgedPrincipals
                return newDebt;
            },
            updateDebt: (updatedDebtData, userIdForLog) => {
                logInfo(`DebtStore: Updating debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: updatedDebtData.id});
                const currentDebt = get().debts.find(d => d.id === updatedDebtData.id);
                const currentVersion = currentDebt?._acknowledgementVersion || 0;
                const newVersion = incrementVersion(currentVersion);

                const updatedDebtWithVersion: InternalDebtItem = {
                    ...updatedDebtData,
                    _acknowledgementVersion: newVersion,
                };

                set((state) => ({
                    debts: sortDebts(
                        state.debts.map(d => d.id === updatedDebtWithVersion.id ? updatedDebtWithVersion : d)
                    ),
                    acknowledgedPrincipals: {
                        ...state.acknowledgedPrincipals,
                        [updatedDebtWithVersion.id]: { principal: updatedDebtWithVersion.principal, version: newVersion },
                    }
                }));
            },
            deleteDebt: (id, userIdForLog) => {
                logInfo(`DebtStore: Deleting debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: id});
                set((state) => ({
                    debts: sortDebts(state.debts.filter(d => d.id !== id)),
                    acknowledgedPrincipals: (({ [id]: _, ...rest }) => rest)(state.acknowledgedPrincipals)
                }));
            },
            importDebtsBatch: (newDebtsData, userIdForLog) => {
                 const newDebtsWithIdsAndVersion: InternalDebtItem[] = newDebtsData.map(debtData => ({
                     id: generateId(),
                     ...debtData,
                     _acknowledgementVersion: 1,
                 }));
                 logInfo(`DebtStore: Importing batch of ${newDebtsWithIdsAndVersion.length} debts for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog});
                 set((state) => ({ debts: sortDebts([...state.debts, ...newDebtsWithIdsAndVersion]) }));
                 return newDebtsWithIdsAndVersion;
            },
            clearDebts: (userIdForLog) => {
                logInfo(`DebtStore: Clearing debts state for user ${userIdForLog || 'unknown'}.`, {userId: userIdForLog});
                set({ ...initialState, acknowledgedPrincipals: {}, isHydrated: true });
            },
            acknowledgeDebtChange: (debtId) => {
                 const debt = get().debts.find(d => d.id === debtId);
                 if (debt) {
                    const currentVersion = debt._acknowledgementVersion || 0;
                    logInfo(`DebtStore: Acknowledging change for debt ${debtId}`, { debtId, principal: debt.principal, version: currentVersion });
                    set((state) => ({
                        acknowledgedPrincipals: {
                            ...state.acknowledgedPrincipals,
                            [debtId]: { principal: debt.principal, version: currentVersion },
                        }
                    }));
                }
            },
        }),
        {
            name: 'ifcGuru_debts_v3', // Incremented version due to schema change (_acknowledgementVersion)
            storage: createJSONStorage(createSessionStorageWithEncoding),
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   if (!state.acknowledgedPrincipals) {
                       state.acknowledgedPrincipals = {};
                   }
                   if (Array.isArray(state.debts)) {
                       state.debts = state.debts.map(d => ({ ...d, _acknowledgementVersion: (d as InternalDebtItem)._acknowledgementVersion || 1 }));
                   }
                   logInfo("DebtStore: Rehydrated successfully (v3).");
                 }
             },
        }
    )
);

export const selectActiveDebts = (state: DebtState): InternalDebtItem[] =>
    state.debts.filter(isDebtActive);

export const selectPaidOffDebts = (state: DebtState): InternalDebtItem[] =>
    state.debts.filter(isDebtPaidOff);

export const selectTotalDebt = (state: DebtState): number =>
    state.debts.filter(isDebtActive).reduce((sum, debt) => sum + (Number(debt.principal) || 0), 0);
