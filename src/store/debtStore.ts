// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { DebtItem } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; 
import { logInfo } from '@/lib/logger';

const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to manage versioning for acknowledgements
const incrementVersion = (currentVersion?: number): number => (currentVersion || 0) + 1;

const sortDebts = (debtList: DebtItem[]): DebtItem[] => {
    if (!Array.isArray(debtList)) return [];
    return [...debtList].sort((a, b) => {
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

export interface DebtState {
    debts: DebtItem[];
    isHydrated: boolean; 
    acknowledgedPrincipals: Record<string, { principal: number; version: number }>; // Tracks acknowledged principal value and version for pulsing dot
    setDebts: (debts: DebtItem[], userId?: string) => void; 
    addDebt: (debtData: Omit<DebtItem, 'id'>, userId?: string) => DebtItem;
    updateDebt: (updatedDebt: DebtItem, userId?: string) => void;
    deleteDebt: (id: string, userId?: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[], userId?: string) => DebtItem[]; 
    clearDebts: (userId?: string) => void; 
    acknowledgeDebtChange: (debtId: string) => void; // Action to acknowledge a change
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
                 const validatedDebts = (debts || []).map(d => ({ ...d, _acknowledgementVersion: (d as any)._acknowledgementVersion || 1 })); 
                 logInfo(`DebtStore: Setting debts for user ${userIdForLog || 'unknown'}. Count: ${validatedDebts.length}`, {userId: userIdForLog});
                 set({ debts: sortDebts(validatedDebts), isHydrated: true });
            },
            addDebt: (debtData, userIdForLog) => {
                const newDebt: DebtItem & { _acknowledgementVersion: number } = {
                    id: generateId(),
                    ...debtData,
                    _acknowledgementVersion: 1, // Initial version for new debts
                };
                logInfo(`DebtStore: Adding debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: newDebt.id});
                set((state) => ({ debts: sortDebts([...state.debts, newDebt]) }));
                // New debts are implicitly unacknowledged by not being in acknowledgedPrincipals
                return newDebt; 
            },
            updateDebt: (updatedDebt, userIdForLog) => {
                logInfo(`DebtStore: Updating debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: updatedDebt.id});
                const currentVersion = (get().debts.find(d => d.id === updatedDebt.id) as any)?._acknowledgementVersion || 0;
                const newVersion = incrementVersion(currentVersion);

                set((state) => ({
                    debts: sortDebts(
                        state.debts.map(d => d.id === updatedDebt.id ? { ...updatedDebt, _acknowledgementVersion: newVersion } : d)
                    ),
                    // Automatically acknowledge the principal of the edited debt
                    acknowledgedPrincipals: {
                        ...state.acknowledgedPrincipals,
                        [updatedDebt.id]: { principal: updatedDebt.principal, version: newVersion },
                    }
                }));
            },
            deleteDebt: (id, userIdForLog) => {
                logInfo(`DebtStore: Deleting debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: id});
                set((state) => ({ 
                    debts: sortDebts(state.debts.filter(d => d.id !== id)),
                    acknowledgedPrincipals: (({ [id]: _, ...rest }) => rest)(state.acknowledgedPrincipals) // Remove from acknowledgements
                }));
            },
            importDebtsBatch: (newDebtsData, userIdForLog) => {
                 const newDebtsWithIdsAndVersion = newDebtsData.map(debtData => ({
                     id: generateId(),
                     ...debtData,
                     _acknowledgementVersion: 1, // Initial version
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
                    const currentVersion = (debt as any)._acknowledgementVersion || 0;
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
            name: 'ifcGuru_debts_v2', // Consider versioning if schema changes significantly
            storage: createJSONStorage(createSessionStorageWithEncoding), 
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   if (!state.acknowledgedPrincipals) { // Ensure acknowledgedPrincipals exists
                       state.acknowledgedPrincipals = {};
                   }
                   // Ensure all debts have an _acknowledgementVersion
                   if (Array.isArray(state.debts)) {
                       state.debts = state.debts.map(d => ({ ...d, _acknowledgementVersion: (d as any)._acknowledgementVersion || 1 }));
                   }
                   logInfo("DebtStore: Rehydrated successfully.");
                 }
             },
        }
    )
);

export const selectTotalDebt = (state: DebtState): number =>
    state.debts.reduce((sum, debt) => sum + (debt.principal || 0), 0);

