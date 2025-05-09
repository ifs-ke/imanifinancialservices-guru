// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { DebtItem } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; 

const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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
        // console.error(`Failed to decode/parse item "${name}" from sessionStorage.`, e); // Console log disabled
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
        // console.error(`Failed to encode/stringify and set item "${name}" for sessionStorage`, e); // Console log disabled
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

interface DebtState {
    debts: DebtItem[];
    isHydrated: boolean; 
    setDebts: (debts: DebtItem[]) => void; 
    addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
    updateDebt: (updatedDebt: DebtItem) => void;
    deleteDebt: (id: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[]) => DebtItem[]; 
    clearDebts: () => void; 
}

const initialState = {
    debts: [],
    isHydrated: false,
};

export const useDebtStore = create<DebtState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setDebts: (debts) => {
                 const validatedDebts = (debts || []).map(d => ({ ...d })); 
                 set({ debts: sortDebts(validatedDebts), isHydrated: true });
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
            clearDebts: () => {
                // console.log("Clearing debt store state."); // Console log disabled
                set({ ...initialState, isHydrated: true }); 
            },
        }),
        {
            name: 'ifcGuru_debts', 
            storage: createJSONStorage(createSessionStorageWithEncoding), // Use the new storage option
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   // console.log("Debt store rehydrated."); // Console log disabled
                 }
             },
             // partialize: (state) => ({ debts: state.debts }),
        }
    )
);

export const selectTotalDebt = (state: DebtState): number =>
    state.debts.reduce((sum, debt) => sum + (debt.principal || 0), 0);
