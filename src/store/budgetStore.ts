// src/store/budgetStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; 
import { format } from 'date-fns'; 
import { logInfo } from '@/lib/logger'; // Import logger

const generateId = (): string => `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const getCurrentPeriodKey = (date: Date = new Date()): string => {
    return format(date, 'yyyy-MM');
};

const sortBudgetItems = (items: BudgetItem[]): BudgetItem[] => {
    if (!Array.isArray(items)) return [];
    const categoryOrder: Record<BudgetItemCategory, number> = {
        'income': 1,
        'recurring-expense': 2,
        'one-time-expense': 3,
        'goal': 4,
        'debt': 5,
    };
    return [...items].sort((a, b) => {
        const periodDiff = (b.period || '').localeCompare(a.period || '');
        if (periodDiff !== 0) return periodDiff;
        const categoryDiff = (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99);
        if (categoryDiff !== 0) return categoryDiff;
        return (a.description || '').localeCompare(b.description || '');
    });
};

const sumByCategoryAndPeriod = (items: BudgetItem[], category: BudgetItemCategory, period: string): number => {
     if (!Array.isArray(items) || !period) return 0;
    return items
        .filter(item => item.category === category && item.period === period)
        .reduce((sum, item) => sum + (item.amount || 0), 0); 
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

export interface BudgetState {
    budgetItems: BudgetItem[]; 
    budgetPeriod: string; 
    isHydrated: boolean; 
    setBudgetItems: (items: BudgetItem[]) => void; 
    setBudgetPeriod: (period: string) => void; 
    addBudgetItem: (itemData: Omit<BudgetItem, 'id' | 'period'>) => BudgetItem; 
    updateBudgetItem: (updatedItem: BudgetItem) => void;
    deleteBudgetItem: (id: string) => void;
    importBudgetsBatch: (newBudgetsData: Omit<BudgetItem, 'id' | 'period'>[]) => BudgetItem[]; 
    clearBudgetItems: () => void; 
}

const initialState = {
    budgetItems: [],
    budgetPeriod: getCurrentPeriodKey(), 
    isHydrated: false,
};

export const useBudgetStore = create<BudgetState>()(
    persist(
        (set, get) => ({
            ...initialState,
             setBudgetItems: (items) => {
                  const validatedItems = (items || []).map(item => ({
                      ...item,
                      period: item.period || getCurrentPeriodKey() 
                  }));
                  set({ budgetItems: sortBudgetItems(validatedItems), isHydrated: true });
             },
             setBudgetPeriod: (period) => {
                 set({ budgetPeriod: period });
             },
            addBudgetItem: (itemData) => {
                const currentPeriod = get().budgetPeriod;
                const newItem: BudgetItem = {
                    id: generateId(),
                    ...itemData,
                    period: currentPeriod, 
                };
                set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, newItem]) }));
                return newItem;
            },
            updateBudgetItem: (updatedItem) => {
                 if (!updatedItem.period) {
                    // console.warn("Attempted to update budget item without a period. Update skipped.", updatedItem); 
                    return; 
                 }
                set((state) => ({
                    budgetItems: sortBudgetItems(
                        state.budgetItems.map(item => (item.id === updatedItem.id ? { ...updatedItem, period: item.period } : item)) 
                    )
                }));
            },
            deleteBudgetItem: (id) => {
                set((state) => ({ budgetItems: sortBudgetItems(state.budgetItems.filter(item => item.id !== id)) }));
            },
            importBudgetsBatch: (newBudgetsData) => {
                 const currentPeriod = get().budgetPeriod;
                 const newBudgetsWithIdsAndPeriod = newBudgetsData.map(budgetData => ({
                     id: generateId(),
                     ...budgetData,
                     period: currentPeriod, 
                 }));
                 set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, ...newBudgetsWithIdsAndPeriod]) }));
                 return newBudgetsWithIdsAndPeriod; 
            },
            clearBudgetItems: () => {
                logInfo("BudgetStore: Clearing budget items and period state.");
                set({ ...initialState, budgetPeriod: getCurrentPeriodKey(), isHydrated: true }); 
            },
        }),
        {
            name: 'ifcGuru_budgetItems', 
            storage: createJSONStorage(createSessionStorageWithEncoding), 
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   if (!state.budgetPeriod || typeof state.budgetPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(state.budgetPeriod)) {
                       state.budgetPeriod = getCurrentPeriodKey(); 
                   }
                   logInfo("BudgetStore: Rehydrated successfully.");
                 }
             },
        }
    )
);

export const selectCurrentBudgetPeriod = (state: BudgetState): string => state.budgetPeriod;

export const selectBudgetItemsForCurrentPeriod = (state: BudgetState): BudgetItem[] => {
    return state.budgetItems.filter(item => item.period === state.budgetPeriod);
}

export const selectTotalBudgetedIncome = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'income', state.budgetPeriod);

export const selectTotalRecurringExpenses = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'recurring-expense', state.budgetPeriod);

export const selectTotalOneTimeExpenses = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'one-time-expense', state.budgetPeriod);

export const selectTotalGoals = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'goal', state.budgetPeriod);

export const selectTotalBudgetedDebt = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'debt', state.budgetPeriod);

export const selectTotalBudgetedExpenses = (state: BudgetState): number =>
    selectTotalRecurringExpenses(state) + selectTotalOneTimeExpenses(state);

export const selectNetBudgeted = (state: BudgetState): number =>
    selectTotalBudgetedIncome(state) - selectTotalBudgetedExpenses(state) - selectTotalGoals(state) - selectTotalBudgetedDebt(state);
