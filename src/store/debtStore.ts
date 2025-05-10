// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { DebtItem } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; 
import { logInfo } from '@/lib/logger'; // Import logger

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
        // console.error(`Failed to decode/parse item "${name}" from sessionStorage.`, e); 
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
    setDebts: (debts: DebtItem[], userId?: string) => void; 
    addDebt: (debtData: Omit<DebtItem, 'id'>, userId?: string) => DebtItem;
    updateDebt: (updatedDebt: DebtItem, userId?: string) => void;
    deleteDebt: (id: string, userId?: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[], userId?: string) => DebtItem[]; 
    clearDebts: (userId?: string) => void; 
}

const initialState = {
    debts: [],
    isHydrated: false,
};

export const useDebtStore = create<DebtState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setDebts: (debts, userIdForLog) => {
                 const validatedDebts = (debts || []).map(d => ({ ...d })); 
                 logInfo(`DebtStore: Setting debts for user ${userIdForLog || 'unknown'}. Count: ${validatedDebts.length}`, {userId: userIdForLog});
                 set({ debts: sortDebts(validatedDebts), isHydrated: true });
            },
            addDebt: (debtData, userIdForLog) => {
                const newDebt: DebtItem = {
                    id: generateId(),
                    ...debtData,
                };
                logInfo(`DebtStore: Adding debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: newDebt.id});
                set((state) => ({ debts: sortDebts([...state.debts, newDebt]) }));
                return newDebt; 
            },
            updateDebt: (updatedDebt, userIdForLog) => {
                logInfo(`DebtStore: Updating debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: updatedDebt.id});
                set((state) => ({
                    debts: sortDebts(
                        state.debts.map(d => d.id === updatedDebt.id ? updatedDebt : d)
                    )
                }));
            },
            deleteDebt: (id, userIdForLog) => {
                logInfo(`DebtStore: Deleting debt for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog, debtId: id});
                set((state) => ({ debts: sortDebts(state.debts.filter(d => d.id !== id)) }));
            },
            importDebtsBatch: (newDebtsData, userIdForLog) => {
                 const newDebtsWithIds = newDebtsData.map(debtData => ({
                     id: generateId(),
                     ...debtData,
                 }));
                 logInfo(`DebtStore: Importing batch of ${newDebtsWithIds.length} debts for user ${userIdForLog || 'unknown'}`, {userId: userIdForLog});
                 set((state) => ({ debts: sortDebts([...state.debts, ...newDebtsWithIds]) }));
                 return newDebtsWithIds; 
            },
            clearDebts: (userIdForLog) => {
                logInfo(`DebtStore: Clearing debts state for user ${userIdForLog || 'unknown'}.`, {userId: userIdForLog});
                set({ ...initialState, isHydrated: true }); 
            },
        }),
        {
            name: 'ifcGuru_debts', 
            storage: createJSONStorage(createSessionStorageWithEncoding), 
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   logInfo("DebtStore: Rehydrated successfully.");
                 }
             },
        }
    )
);

export const selectTotalDebt = (state: DebtState): number =>
    state.debts.reduce((sum, debt) => sum + (debt.principal || 0), 0);
