// src/store/budgetStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';

// Generate unique IDs
const generateId = (): string => `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort budget items
const sortBudgetItems = (items: BudgetItem[]): BudgetItem[] => {
    const categoryOrder: Record<BudgetItemCategory, number> = {
        'income': 1,
        'recurring-expense': 2,
        'one-time-expense': 3,
        'goal': 4,
    };
    return [...items].sort((a, b) => {
        const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
        if (categoryDiff !== 0) return categoryDiff;
        return a.description.localeCompare(b.description);
    });
};

// Helper to filter and sum items by category
const sumByCategory = (items: BudgetItem[], category: BudgetItemCategory): number => {
    return items.filter(item => item.category === category).reduce((sum, item) => sum + item.amount, 0);
};

interface BudgetState {
    budgetItems: BudgetItem[];
    setBudgetItems: (items: BudgetItem[]) => void; // Action to overwrite state
    addBudgetItem: (itemData: Omit<BudgetItem, 'id'>) => BudgetItem;
    updateBudgetItem: (updatedItem: BudgetItem) => void;
    deleteBudgetItem: (id: string) => void;
    // Derived state/selectors can be defined here or calculated in components
}

export const useBudgetStore = create<BudgetState>()(
    persist(
        (set, get) => ({
            budgetItems: [],
             // Action to replace the entire budget items array
             setBudgetItems: (items) => {
                 set({ budgetItems: sortBudgetItems(items || []) }); // Add default empty array
             },
            addBudgetItem: (itemData) => {
                const newItem: BudgetItem = {
                    id: generateId(),
                    ...itemData,
                };
                set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, newItem]) }));
                return newItem;
            },
            updateBudgetItem: (updatedItem) => {
                set((state) => ({
                    budgetItems: sortBudgetItems(
                        state.budgetItems.map(item => (item.id === updatedItem.id ? updatedItem : item))
                    )
                }));
            },
            deleteBudgetItem: (id) => {
                set((state) => ({ budgetItems: sortBudgetItems(state.budgetItems.filter(item => item.id !== id)) }));
            },
        }),
        {
            name: 'ifcGuru_budgetItems', // Local storage key updated
            storage: createJSONStorage(() => localStorage),
            // Ensure items are sorted after deserialization
            deserialize: (str) => {
                const state = JSON.parse(str);
                state.state.budgetItems = sortBudgetItems(state.state.budgetItems || []);
                return state;
            },
        }
    )
);

// Selectors for summary data
export const selectTotalBudgetedIncome = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'income');

export const selectTotalRecurringExpenses = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'recurring-expense');

export const selectTotalOneTimeExpenses = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'one-time-expense');

export const selectTotalGoals = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'goal');

export const selectTotalBudgetedExpenses = (state: BudgetState): number =>
    selectTotalRecurringExpenses(state) + selectTotalOneTimeExpenses(state);

export const selectNetBudgeted = (state: BudgetState): number =>
    selectTotalBudgetedIncome(state) - selectTotalBudgetedExpenses(state) - selectTotalGoals(state);

