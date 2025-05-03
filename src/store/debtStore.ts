// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { DebtItem } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort debts
const sortDebts = (debtList: DebtItem[]): DebtItem[] => {
    return [...debtList].sort((a, b) => {
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        // Secondary sort by principal descending if terms are the same
        return b.principal - a.principal;
    });
};

// Custom Session Storage with Base64 encoding (Placeholder for encryption)
const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage; // Use sessionStorage
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str); // Decode Base64
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null; // Return null if decoding fails
      }
    },
    setItem: (name, value) => {
      try {
        const encodedValue = encode(value); // Encode using Base64
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
    setDebts: (debts: DebtItem[]) => void; // Action to overwrite state
    addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
    updateDebt: (updatedDebt: DebtItem) => void;
    deleteDebt: (id: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[]) => DebtItem[];
    clearDebts: () => void; // Action to clear state
    // deleteDebtsBatch: (ids: string[]) => void; // Optional for rollback
}

const initialState = {
    debts: [],
};

export const useDebtStore = create<DebtState>()(
    persist(
        (set, get) => ({
            ...initialState,
            // Action to replace the entire debts array
            setDebts: (debts) => {
                 set({ debts: sortDebts(debts || []) }); // Add default empty array
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
            // Clear function resets the state. Called by useSyncManager.
            clearDebts: () => set(initialState),
        }),
        {
            name: 'ifcGuru_debts', // Session storage key
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use encoded sessionStorage
             // Ensure debts are sorted after deserialization
             deserialize: (str) => {
                const state = JSON.parse(str);
                state.state.debts = sortDebts(state.state.debts || []);
                return state;
            },
             // No complex types like Date in DebtItem currently
             // serialize: (state) => JSON.stringify(state),
        }
    )
);

// Selector for total debt
export const selectTotalDebt = (state: DebtState): number =>
    state.debts.reduce((sum, debt) => sum + debt.principal, 0);

    