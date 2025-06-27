// src/store/budgetStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { BudgetItem, BudgetItemCategory, PublishedBudget } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils';
import { format } from 'date-fns';
import { logInfo, logWarn } from '@/lib/logger';
import { BudgetItemCategorySchema as BudgetItemCategoryValidationSchema } from '@/lib/schemas';

export { BudgetItemCategoryValidationSchema as BudgetItemCategorySchema };


const generateId = (prefix: 'budget' | 'pub'): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  } else {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
};

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
        'unplanned-expense': 6,
        'unbudgeted-income': 7
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
        return JSON.parse(decodedStr, (key, value) => {
            if (key === 'publishedAt' && typeof value === 'string') {
                const parsedDate = new Date(value);
                return !isNaN(parsedDate.getTime()) ? parsedDate : new Date(0);
            }
            return value;
        });
      } catch (e) {
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        const stringifiedValue = JSON.stringify(value, (key, val) => {
            if (key === 'publishedAt' && val instanceof Date) {
                return val.toISOString();
            }
            return val;
        });
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

export interface BudgetState {
    budgetItems: BudgetItem[];
    publishedBudgets: Record<string, PublishedBudget>;
    budgetPeriod: string;
    isHydrated: boolean;
    setBudgetItems: (items: BudgetItem[]) => void;
    setBudgetPeriod: (period: string) => void;
    addBudgetItem: (itemData: Omit<BudgetItem, 'id' | 'period'>) => BudgetItem;
    updateBudgetItem: (updatedItem: BudgetItem) => void;
    deleteBudgetItem: (id: string) => void;
    importBudgetsBatch: (newBudgetsData: Omit<BudgetItem, 'id' | 'period'>[]) => BudgetItem[];
    clearBudgetItems: () => void;
    publishCurrentBudget: () => void;
    deletePublishedBudget: (id: string) => void;
}

const initialState = {
    budgetItems: [],
    publishedBudgets: {},
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
                    id: generateId('budget'),
                    ...itemData,
                    period: currentPeriod,
                };
                set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, newItem]) }));
                return newItem;
            },
            updateBudgetItem: (updatedItem) => {
                 if (!updatedItem.period) {
                    logWarn("Attempted to update budget item without a period. Update skipped.", updatedItem);
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
                     id: generateId('budget'),
                     ...budgetData,
                     period: currentPeriod,
                 }));
                 set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, ...newBudgetsWithIdsAndPeriod]) }));
                 return newBudgetsWithIdsAndPeriod;
            },
            publishCurrentBudget: () => {
                const { budgetPeriod, budgetItems } = get();
                if (!budgetPeriod) return;

                const itemsForPeriod = budgetItems.filter(item => item.period === budgetPeriod);
                if (itemsForPeriod.length === 0) return;

                const id = generateId('pub');

                const totalIncome = itemsForPeriod.filter(i => i.category === 'income').reduce((sum, i) => sum + i.amount, 0);
                const totalSpending = itemsForPeriod.filter(i => i.category !== 'income').reduce((sum, i) => sum + i.amount, 0);
                const net = totalIncome - totalSpending;

                const newPublishedBudget: PublishedBudget = {
                    id,
                    period: budgetPeriod,
                    items: itemsForPeriod,
                    publishedAt: new Date(),
                    totalIncome,
                    totalSpending,
                    net,
                };

                set(state => ({
                    publishedBudgets: {
                        ...state.publishedBudgets,
                        [id]: newPublishedBudget
                    }
                }));
            },
            deletePublishedBudget: (id) => {
                set((state) => {
                    const { [id]: _, ...remainingPublished } = state.publishedBudgets;
                    logInfo(`BudgetStore: Deleting published budget with id: ${id}`);
                    return { publishedBudgets: remainingPublished };
                });
            },
            clearBudgetItems: () => {
                logInfo("BudgetStore: Clearing budget items and period state.");
                set({ ...initialState, budgetPeriod: getCurrentPeriodKey(), isHydrated: true });
            },
        }),
        {
            name: 'ifcGuru_budgetItems_v2', // New version for new shape
            storage: createJSONStorage(createSessionStorageWithEncoding),
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   if (!state.budgetPeriod || typeof state.budgetPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(state.budgetPeriod)) {
                       state.budgetPeriod = getCurrentPeriodKey();
                   }
                   if (!state.publishedBudgets) {
                       state.publishedBudgets = {};
                   }
                   logInfo("BudgetStore: Rehydrated successfully (v2).");
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
    selectTotalRecurringExpenses(state) + 
    selectTotalOneTimeExpenses(state) +
    selectTotalGoals(state) +
    selectTotalBudgetedDebt(state);

export const selectNetBudgeted = (state: BudgetState): number =>
    selectTotalBudgetedIncome(state) - selectTotalBudgetedExpenses(state);
