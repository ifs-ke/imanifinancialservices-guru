// src/store/budgetStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils
import { format } from 'date-fns'; // For formatting dates

// Generate unique IDs
const generateId = (): string => `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Function to get the current period key (YYYY-MM)
const getCurrentPeriodKey = (date: Date = new Date()): string => {
    return format(date, 'yyyy-MM');
};

// Helper to sort budget items - IMPORTANT for consistent hashing and predictable display
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
        // Primary sort: Period descending (most recent first)
        const periodDiff = (b.period || '').localeCompare(a.period || '');
        if (periodDiff !== 0) return periodDiff;
        // Secondary sort: Category order
        const categoryDiff = (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99);
        if (categoryDiff !== 0) return categoryDiff;
        // Tertiary sort: Description ascending
        return (a.description || '').localeCompare(b.description || '');
    });
};

// Helper to filter and sum items by category for a specific period
const sumByCategoryAndPeriod = (items: BudgetItem[], category: BudgetItemCategory, period: string): number => {
     if (!Array.isArray(items) || !period) return 0;
    return items
        .filter(item => item.category === category && item.period === period)
        .reduce((sum, item) => sum + (item.amount || 0), 0); // Ensure amount is treated as number
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
        console.error(`Failed to decode item "${name}" from sessionStorage. Item might not be Base64 encoded or is corrupted.`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        const encodedValue = encode(value);
        storage.setItem(name, encodedValue);
      } catch (e) {
         console.error(`Failed to encode and set item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage.removeItem(name),
  };
};

interface BudgetState {
    budgetItems: BudgetItem[]; // All items for all periods are stored here
    budgetPeriod: string; // Currently selected period (e.g., "YYYY-MM")
    isHydrated: boolean; // Flag for hydration status
    setBudgetItems: (items: BudgetItem[]) => void; // Setter for initializing/overwriting all items
    setBudgetPeriod: (period: string) => void; // Setter for changing the active period
    addBudgetItem: (itemData: Omit<BudgetItem, 'id' | 'period'>) => BudgetItem; // Automatically adds to current period
    updateBudgetItem: (updatedItem: BudgetItem) => void;
    deleteBudgetItem: (id: string) => void;
    importBudgetsBatch: (newBudgetsData: Omit<BudgetItem, 'id' | 'period'>[]) => BudgetItem[]; // Imports to current period
    clearBudgetItems: () => void; // Action to clear local state
}

// Define the initial state, including the current period
const initialState = {
    budgetItems: [],
    budgetPeriod: getCurrentPeriodKey(), // Set initial period to current month
    isHydrated: false,
};

export const useBudgetStore = create<BudgetState>()(
    persist(
        (set, get) => ({
            ...initialState,
             // Setter function for initializing/overwriting all budget items (e.g., from sync)
             setBudgetItems: (items) => {
                  const validatedItems = (items || []).map(item => ({
                      ...item,
                      period: item.period || getCurrentPeriodKey() // Ensure period exists
                  }));
                  set({ budgetItems: sortBudgetItems(validatedItems), isHydrated: true });
             },
             // Setter for changing the active budget period
             setBudgetPeriod: (period) => {
                 set({ budgetPeriod: period });
             },
             // Add a single budget item to the current budget period
            addBudgetItem: (itemData) => {
                const currentPeriod = get().budgetPeriod;
                const newItem: BudgetItem = {
                    id: generateId(),
                    ...itemData,
                    period: currentPeriod, // Associate with the current period
                };
                set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, newItem]) }));
                return newItem;
            },
             // Update an existing budget item (period cannot be changed via update)
            updateBudgetItem: (updatedItem) => {
                 if (!updatedItem.period) {
                    console.warn("Attempted to update budget item without a period. Update skipped.", updatedItem);
                    return; // Do not update if period is missing
                 }
                set((state) => ({
                    budgetItems: sortBudgetItems(
                        state.budgetItems.map(item => (item.id === updatedItem.id ? { ...updatedItem, period: item.period } : item)) // Ensure period remains unchanged
                    )
                }));
            },
            // Delete a budget item by ID
            deleteBudgetItem: (id) => {
                set((state) => ({ budgetItems: sortBudgetItems(state.budgetItems.filter(item => item.id !== id)) }));
            },
             // Import multiple budget items to the current period
            importBudgetsBatch: (newBudgetsData) => {
                 const currentPeriod = get().budgetPeriod;
                 const newBudgetsWithIdsAndPeriod = newBudgetsData.map(budgetData => ({
                     id: generateId(),
                     ...budgetData,
                     period: currentPeriod, // Associate with the current period
                 }));
                 set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, ...newBudgetsWithIdsAndPeriod]) }));
                 return newBudgetsWithIdsAndPeriod;
             },
             // Clear all budget items and reset period
            clearBudgetItems: () => {
                console.log("Clearing budget store state.");
                set({ ...initialState, budgetPeriod: getCurrentPeriodKey(), isHydrated: true }); // Reset state but keep hydrated flag true
            },
        }),
        {
            name: 'ifcGuru_budgetItems', // Name for persisted data
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with Base64
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   // Ensure a valid budgetPeriod exists on rehydration
                   if (!state.budgetPeriod || typeof state.budgetPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(state.budgetPeriod)) {
                       state.budgetPeriod = getCurrentPeriodKey(); // Default to current month if invalid/missing
                   }
                   console.log("Budget store rehydrated.");
                 }
             },
             deserialize: (str) => {
                const state = JSON.parse(str);
                // Sort on hydration to ensure consistency
                state.state.budgetItems = sortBudgetItems(state.state.budgetItems || []);
                 // Ensure budgetPeriod is valid on load
                 if (!state.state.budgetPeriod || typeof state.state.budgetPeriod !== 'string' || !/^\d{4}-\d{2}$/.test(state.state.budgetPeriod)) {
                       state.state.budgetPeriod = getCurrentPeriodKey();
                   }
                state.state.isHydrated = true; // Mark as hydrated
                return state;
            },
        }
    )
);

// ===== Selectors =====
// These selectors now accept the period as an argument or read from state

/** Selects the currently active budget period (YYYY-MM). */
export const selectCurrentBudgetPeriod = (state: BudgetState): string => state.budgetPeriod;

/** Selects all budget items for the currently active period. */
export const selectBudgetItemsForCurrentPeriod = (state: BudgetState): BudgetItem[] => {
    return state.budgetItems.filter(item => item.period === state.budgetPeriod);
}

/** Selects total income for the current period. */
export const selectTotalBudgetedIncome = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'income', state.budgetPeriod);

/** Selects total recurring expenses for the current period. */
export const selectTotalRecurringExpenses = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'recurring-expense', state.budgetPeriod);

/** Selects total one-time expenses for the current period. */
export const selectTotalOneTimeExpenses = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'one-time-expense', state.budgetPeriod);

/** Selects total goals for the current period. */
export const selectTotalGoals = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'goal', state.budgetPeriod);

/** Selects total debt allocation for the current period. */
export const selectTotalBudgetedDebt = (state: BudgetState): number =>
    sumByCategoryAndPeriod(state.budgetItems, 'debt', state.budgetPeriod);

/** Selects total expenses (recurring + one-time) for the current period. */
export const selectTotalBudgetedExpenses = (state: BudgetState): number =>
    selectTotalRecurringExpenses(state) + selectTotalOneTimeExpenses(state);

/** Selects net budgeted amount for the current period. */
export const selectNetBudgeted = (state: BudgetState): number =>
    selectTotalBudgetedIncome(state) - selectTotalBudgetedExpenses(state) - selectTotalGoals(state) - selectTotalBudgetedDebt(state);
