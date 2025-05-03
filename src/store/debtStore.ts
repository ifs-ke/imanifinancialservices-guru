// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { DebtItem } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort debts - IMPORTANT for consistent hashing
const sortDebts = (debtList: DebtItem[]): DebtItem[] => {
    return [...debtList].sort((a, b) => {
        // Primary sort: Description ascending
        const descDiff = a.description.localeCompare(b.description);
        if (descDiff !== 0) return descDiff;
        // Secondary sort: Term (short before long)
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        // Tertiary sort: Principal descending
        return b.principal - a.principal;
    });
};

// Custom Session Storage with Base64 encoding
const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage;
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str);
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        const encodedValue = encode(value);
        storage.setItem(name, encodedValue);
      } catch (e) {
         console.error(`Failed to encode item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage.removeItem(name),
  };
};


interface DebtState {
    debts: DebtItem[];
    setDebts: (debts: DebtItem[]) => void;
    addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
    updateDebt: (updatedDebt: DebtItem) => void;
    deleteDebt: (id: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[]) => DebtItem[];
    clearDebts: () => void;
}

const initialState = {
    debts: [],
};

export const useDebtStore = create<DebtState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setDebts: (debts) => {
                 set({ debts: sortDebts(debts || []) });
            },
            addDebt: (debtData) => {
                const newDebt: DebtItem = {
                    id: generateId(),
                    ...debtData,
                };
                set((state) => ({ debts: sortDebts([...state.debts, newDebt]) }));
                return newDebt;
            },
            updateDebt: (updatedDebt) => {
                set((state) => ({
                    debts: sortDebts(
                        state.debts.map(d => d.id === updatedDebt.id ? updatedDebt : d)
                    )
                }));
            },
            deleteDebt: (id) => {
                set((state) => ({ debts: sortDebts(state.debts.filter(d => d.id !== id)) }));
            },
            importDebtsBatch: (newDebtsData) => {
                 const newDebtsWithIds = newDebtsData.map(debtData => ({
                     id: generateId(),
                     ...debtData,
                 }));
                 set((state) => ({ debts: sortDebts([...state.debts, ...newDebtsWithIds]) }));
                 return newDebtsWithIds;
            },
            clearDebts: () => set(initialState),
        }),
        {
            name: 'ifcGuru_debts',
            storage: createJSONStorage(() => createSessionStorageWithEncoding()),
             deserialize: (str) => {
                const state = JSON.parse(str);
                // Sort on hydration to ensure consistency
                state.state.debts = sortDebts(state.state.debts || []);
                return state;
            },
        }
    )
);

// Selector for total debt
export const selectTotalDebt = (state: DebtState): number =>
    state.debts.reduce((sum, debt) => sum + debt.principal, 0);
