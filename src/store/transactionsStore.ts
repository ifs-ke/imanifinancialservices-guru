// src/store/transactionsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TransactionWithId } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort transactions - IMPORTANT for consistent hashing and predictable display order
const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
    // Ensure input is an array
    if (!Array.isArray(txs)) return [];
    return [...txs].sort((a, b) => {
        // Handle potential invalid dates gracefully
        const dateA = a.date instanceof Date ? a.date : new Date(a.date || 0);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date || 0);
        const timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
        const timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;

        // Primary sort: Date descending (most recent first)
        const dateDiff = timeB - timeA;
        if (dateDiff !== 0) return dateDiff;
        // Secondary sort: Amount descending (larger amounts first, helps group related debits/credits sometimes)
        const amountDiff = (b.amount || 0) - (a.amount || 0);
        if (amountDiff !== 0) return amountDiff;
        // Tertiary sort: Description ascending
        return (a.description || '').localeCompare(b.description || '');
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
        // Return null or handle error as appropriate for your app's logic
        // Returning the raw string might cause JSON.parse errors later if it wasn't originally JSON.
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


interface TransactionsState {
    transactions: TransactionWithId[];
    isHydrated: boolean; // Flag to indicate if state has been rehydrated from storage
    setTransactions: (transactions: TransactionWithId[]) => void;
    addTransaction: (transactionData: Omit<TransactionWithId, 'id'>) => TransactionWithId;
    updateTransaction: (updatedTransaction: TransactionWithId) => void;
    deleteTransaction: (id: string) => void;
    importTransactionsBatch: (newTransactionsData: Omit<TransactionWithId, 'id'>[]) => TransactionWithId[];
    clearTransactions: () => void; // Action to clear the local state
}

// Define the initial state
const initialState = {
    transactions: [],
    isHydrated: false,
};

export const useTransactionsStore = create<TransactionsState>()(
    persist(
        (set, get) => ({
            ...initialState,
            // Setter function for initializing/overwriting transactions (e.g., from sync)
             setTransactions: (transactions) => {
                 // Validate and sort before setting
                 const validatedTransactions = (transactions || []).map(tx => ({
                     ...tx,
                     // Ensure date is a valid Date object, default to epoch if invalid
                     date: tx.date instanceof Date && !isNaN(tx.date.getTime()) ? tx.date : new Date(0),
                 }));
                 set({ transactions: sortTransactions(validatedTransactions), isHydrated: true });
             },
            // Add a single transaction
            addTransaction: (transactionData) => {
                const newTransaction: TransactionWithId = {
                    id: generateId(),
                    ...transactionData,
                     // Ensure date is a Date object, default to epoch if invalid
                    date: transactionData.date instanceof Date && !isNaN(transactionData.date.getTime()) ? transactionData.date : new Date(0),
                };
                set((state) => ({ transactions: sortTransactions([...state.transactions, newTransaction]) }));
                return newTransaction; // Return the newly created transaction with ID
            },
            // Update an existing transaction
            updateTransaction: (updatedTransaction) => {
                 // Ensure date is valid before updating
                 const validatedDate = updatedTransaction.date instanceof Date && !isNaN(updatedTransaction.date.getTime())
                     ? updatedTransaction.date
                     : new Date(0); // Default if invalid

                set((state) => ({
                    transactions: sortTransactions(
                        state.transactions.map(tx => tx.id === updatedTransaction.id ? { ...updatedTransaction, date: validatedDate } : tx)
                    )
                }));
            },
            // Delete a transaction by ID
            deleteTransaction: (id) => {
                set((state) => ({ transactions: sortTransactions(state.transactions.filter(tx => tx.id !== id)) }));
            },
            // Import multiple transactions (e.g., from CSV)
            importTransactionsBatch: (newTransactionsData) => {
                 const newTransactionsWithIds = newTransactionsData.map(txData => ({
                     id: generateId(),
                     ...txData,
                      // Ensure date is a Date object, default to epoch if invalid
                     date: txData.date instanceof Date && !isNaN(txData.date.getTime()) ? txData.date : new Date(0),
                 }));
                 set((state) => ({ transactions: sortTransactions([...state.transactions, ...newTransactionsWithIds]) }));
                 return newTransactionsWithIds; // Return the added transactions with their new IDs
            },
             // Clear all transactions from the store (used on logout/user change)
             clearTransactions: () => {
                 console.log("Clearing transactions store state.");
                 set({ ...initialState, isHydrated: true }); // Reset state but keep hydrated flag true
             },
        }),
        {
            name: 'ifcGuru_transactions', // Name for the persisted data in storage
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use session storage with Base64 encoding
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   // Set hydration flag once state is loaded from storage
                   state.isHydrated = true;
                   console.log("Transaction store rehydrated.");
                 }
             },
             // Custom serialization to handle Date objects
             serialize: (state) => {
                 // Use a replacer function to convert Dates to a specific format for JSON stringification
                 const replacer = (key: string, value: any) => {
                   if (value instanceof Date) {
                     return { __type: 'Date', value: value.toISOString() }; // Store as ISO string with type hint
                   }
                   return value;
                 };
                 // Exclude the isHydrated flag from being persisted
                 const { isHydrated, ...stateToSave } = state.state;
                 // Deep clone and apply replacer to ensure nested dates are handled
                 const dataToSave = JSON.parse(JSON.stringify(stateToSave, replacer));
                 return JSON.stringify({ ...state, state: dataToSave });
             },
             // Custom deserialization to revive Date objects
             deserialize: (str) => {
                const state = JSON.parse(str);
                // Use a reviver function to convert stored date formats back into Date objects
                const reviver = (key: string, value: any) => {
                  if (value && typeof value === 'object' && value.__type === 'Date') {
                    const parsedDate = new Date(value.value);
                    // Return the Date object only if it's valid
                    return !isNaN(parsedDate.getTime()) ? parsedDate : new Date(0); // Default to epoch if invalid
                  }
                  return value;
                };
                // Apply reviver during parsing
                const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
                // Ensure transactions array exists and sort after reviving dates
                parsedState.transactions = sortTransactions(parsedState.transactions || []);
                parsedState.isHydrated = true; // Mark as hydrated after parsing
                return { ...state, state: parsedState };
            },
            // GDPR/Security Note: Session Storage is client-side and accessible via browser dev tools.
            // While Base64 encoding obfuscates slightly, it's NOT encryption.
            // This setup caches data for the session but does not provide strong confidentiality for the cached data itself.
            // The `clearTransactions` action, triggered on logout/user change by `useSyncManager`, is crucial
            // for preventing data exposure between different user sessions on the same browser.
            // Sensitive financial data should ideally minimize client-side persistence or use robust encryption if required.
        }
    )
);

// ===== Selectors =====
// These selectors derive data from the store state.

/**
 * Selects the total income from all transactions.
 */
export const selectTotalIncome = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

/**
 * Selects the total expenses from all transactions (as a positive value).
 */
export const selectTotalExpenses = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
