// src/store/budgetStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils


// Generate unique IDs
const generateId = (): string => `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort budget items - IMPORTANT for consistent hashing and predictable display
const sortBudgetItems = (items: BudgetItem[]): BudgetItem[] => {
    // Ensure input is an array
    if (!Array.isArray(items)) return [];
    const categoryOrder: Record<BudgetItemCategory, number> = {
        'income': 1,
        'recurring-expense': 2,
        'one-time-expense': 3,
        'goal': 4,
        'debt': 5, // Add debt to sort order
    };
    return [...items].sort((a, b) => {
        // Primary sort: Category order
        const categoryDiff = (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99); // Handle potential invalid categories
        if (categoryDiff !== 0) return categoryDiff;
        // Secondary sort: Description ascending
        return (a.description || '').localeCompare(b.description || '');
    });
};

// Helper to filter and sum items by category
const sumByCategory = (items: BudgetItem[], category: BudgetItemCategory): number => {
     if (!Array.isArray(items)) return 0;
    return items
        .filter(item => item.category === category)
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
        // Attempt to decode Base64
        const decodedStr = decode(str);
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage. Item might not be Base64 encoded or is corrupted.`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        // Encode the stringified value using Base64
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
    budgetItems: BudgetItem[];
    isHydrated: boolean; // Flag for hydration status
    setBudgetItems: (items: BudgetItem[]) => void; // Setter for initializing/overwriting
    addBudgetItem: (itemData: Omit<BudgetItem, 'id'>) => BudgetItem;
    updateBudgetItem: (updatedItem: BudgetItem) => void;
    deleteBudgetItem: (id: string) => void;
    clearBudgetItems: () => void; // Action to clear local state
}

// Define the initial state
const initialState = {
    budgetItems: [],
    isHydrated: false,
};

export const useBudgetStore = create<BudgetState>()(
    persist(
        (set, get) => ({
            ...initialState,
             // Setter function for initializing/overwriting budget items (e.g., from sync)
             setBudgetItems: (items) => {
                  // Validate and sort before setting
                  const validatedItems = (items || []).map(item => ({ ...item })); // Simple clone/validation
                  set({ budgetItems: sortBudgetItems(validatedItems), isHydrated: true });
             },
             // Add a single budget item
            addBudgetItem: (itemData) => {
                const newItem: BudgetItem = {
                    id: generateId(),
                    ...itemData,
                };
                set((state) => ({ budgetItems: sortBudgetItems([...state.budgetItems, newItem]) }));
                return newItem; // Return the newly created item with ID
            },
             // Update an existing budget item
            updateBudgetItem: (updatedItem) => {
                set((state) => ({
                    budgetItems: sortBudgetItems(
                        state.budgetItems.map(item => (item.id === updatedItem.id ? updatedItem : item))
                    )
                }));
            },
            // Delete a budget item by ID
            deleteBudgetItem: (id) => {
                set((state) => ({ budgetItems: sortBudgetItems(state.budgetItems.filter(item => item.id !== id)) }));
            },
             // Clear all budget items from the store (used on logout/user change)
            clearBudgetItems: () => {
                console.log("Clearing budget store state.");
                set({ ...initialState, isHydrated: true }); // Reset state but keep hydrated flag true
            },
        }),
        {
            name: 'ifcGuru_budgetItems', // Name for persisted data
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with Base64
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   console.log("Budget store rehydrated.");
                 }
             },
             // No special serialization needed for this structure (no Date objects)
             deserialize: (str) => {
                const state = JSON.parse(str);
                // Sort on hydration to ensure consistency
                state.state.budgetItems = sortBudgetItems(state.state.budgetItems || []);
                state.state.isHydrated = true; // Mark as hydrated
                return state;
            },
            // GDPR/Security Note: Same session storage limitations apply here.
            // Base64 is not encryption. `clearBudgetItems` is vital for security on logout.
        }
    )
);

// ===== Selectors =====
// These selectors derive data from the store state.

/**
 * Selects the total budgeted income.
 */
export const selectTotalBudgetedIncome = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'income');

/**
 * Selects the total budgeted recurring expenses.
 */
export const selectTotalRecurringExpenses = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'recurring-expense');

/**
 * Selects the total budgeted one-time expenses.
 */
export const selectTotalOneTimeExpenses = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'one-time-expense');

/**
 * Selects the total budgeted goals.
 */
export const selectTotalGoals = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'goal');

/**
 * Selects the total budgeted debt allocation.
 */
export const selectTotalBudgetedDebt = (state: BudgetState): number =>
    sumByCategory(state.budgetItems, 'debt');

/**
 * Selects the total budgeted expenses (recurring + one-time).
 */
export const selectTotalBudgetedExpenses = (state: BudgetState): number =>
    selectTotalRecurringExpenses(state) + selectTotalOneTimeExpenses(state);

/**
 * Selects the net budgeted amount (Income - Expenses - Goals - Debt Allocation).
 */
export const selectNetBudgeted = (state: BudgetState): number =>
    selectTotalBudgetedIncome(state) - selectTotalBudgetedExpenses(state) - selectTotalGoals(state) - selectTotalBudgetedDebt(state);
