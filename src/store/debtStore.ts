// src/store/debtStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { DebtItem } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort debts - IMPORTANT for consistent hashing and predictable display order
const sortDebts = (debtList: DebtItem[]): DebtItem[] => {
    // Ensure input is an array
    if (!Array.isArray(debtList)) return [];
    return [...debtList].sort((a, b) => {
        // Primary sort: Description ascending
        const descDiff = (a.description || '').localeCompare(b.description || '');
        if (descDiff !== 0) return descDiff;
        // Secondary sort: Term (short before long)
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        // Tertiary sort: Principal descending (larger debts first)
        return (b.principal || 0) - (a.principal || 0);
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


interface DebtState {
    debts: DebtItem[];
    isHydrated: boolean; // Flag for hydration status
    setDebts: (debts: DebtItem[]) => void; // Setter for initializing/overwriting
    addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
    updateDebt: (updatedDebt: DebtItem) => void;
    deleteDebt: (id: string) => void;
    importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[]) => DebtItem[]; // For CSV import
    clearDebts: () => void; // Action to clear local state
}

// Define the initial state
const initialState = {
    debts: [],
    isHydrated: false,
};

export const useDebtStore = create<DebtState>()(
    persist(
        (set, get) => ({
            ...initialState,
            // Setter function for initializing/overwriting debts (e.g., from sync)
            setDebts: (debts) => {
                 // Validate and sort before setting
                 const validatedDebts = (debts || []).map(d => ({ ...d })); // Simple validation/clone
                 set({ debts: sortDebts(validatedDebts), isHydrated: true });
            },
            // Add a single debt item
            addDebt: (debtData) => {
                const newDebt: DebtItem = {
                    id: generateId(),
                    ...debtData,
                };
                set((state) => ({ debts: sortDebts([...state.debts, newDebt]) }));
                return newDebt; // Return the newly created debt with ID
            },
            // Update an existing debt item
            updateDebt: (updatedDebt) => {
                set((state) => ({
                    debts: sortDebts(
                        state.debts.map(d => d.id === updatedDebt.id ? updatedDebt : d)
                    )
                }));
            },
            // Delete a debt item by ID
            deleteDebt: (id) => {
                set((state) => ({ debts: sortDebts(state.debts.filter(d => d.id !== id)) }));
            },
            // Import multiple debt items (e.g., from CSV)
            importDebtsBatch: (newDebtsData) => {
                 const newDebtsWithIds = newDebtsData.map(debtData => ({
                     id: generateId(),
                     ...debtData,
                 }));
                 set((state) => ({ debts: sortDebts([...state.debts, ...newDebtsWithIds]) }));
                 return newDebtsWithIds; // Return the added debts with their new IDs
            },
             // Clear all debts from the store (used on logout/user change)
            clearDebts: () => {
                console.log("Clearing debt store state.");
                set({ ...initialState, isHydrated: true }); // Reset state but keep hydrated flag true
            },
        }),
        {
            name: 'ifcGuru_debts', // Name for persisted data
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with Base64
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   console.log("Debt store rehydrated.");
                 }
             },
             // No special serialization needed for this structure (no Date objects)
             deserialize: (str) => {
                const state = JSON.parse(str);
                // Sort on hydration to ensure consistency
                state.state.debts = sortDebts(state.state.debts || []);
                state.state.isHydrated = true; // Mark as hydrated
                return state;
            },
            // GDPR/Security Note: Session Storage is client-side and accessible via browser dev tools.
            // Base64 encoding provides minimal obfuscation, not confidentiality.
            // The `clearDebts` action, triggered on logout/user change, is essential.
        }
    )
);

// ===== Selectors =====

/**
 * Selects the total outstanding principal from all debts.
 */
export const selectTotalDebt = (state: DebtState): number =>
    state.debts.reduce((sum, debt) => sum + (debt.principal || 0), 0); // Ensure principal is treated as number
