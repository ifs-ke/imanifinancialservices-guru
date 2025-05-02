
// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DebtItem } from '@/lib/types';

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

interface DebtState {
    debts: DebtItem[];
    addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
    updateDebt: (updatedDebt: DebtItem) => void;
    deleteDebt: (id: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[]) => DebtItem[];
    // deleteDebtsBatch: (ids: string[]) => void; // Optional for rollback
}

export const useDebtStore = create<DebtState>()(
    persist(
        (set, get) => ({
            debts: [], // Initialize with empty array
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
            // deleteDebtsBatch: (ids) => {
            //     const idsSet = new Set(ids);
            //     set((state) => ({ debts: sortDebts(state.debts.filter(d => !idsSet.has(d.id))) }));
            // },
        }),
        {
            name: 'debtConqueror_debts', // Local storage key
            storage: createJSONStorage(() => localStorage),
             // Ensure debts are sorted after deserialization
             deserialize: (str) => {
                const state = JSON.parse(str);
                state.state.debts = sortDebts(state.state.debts || []);
                return state;
            },
        }
    )
);

// Selector for total debt
export const selectTotalDebt = (state: DebtState): number =>
    state.debts.reduce((sum, debt) => sum + debt.principal, 0);
