// src/store/transactionsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TransactionWithId } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort transactions
const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
    return [...txs].sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0; // Handle invalid dates during sort
        const dateDiff = dateB.getTime() - dateA.getTime();
        if (dateDiff !== 0) return dateDiff;
        if (a.amount > 0 && b.amount < 0) return -1;
        if (a.amount < 0 && b.amount > 0) return 1;
        return Math.abs(b.amount) - Math.abs(a.amount);
    });
};

// Custom Session Storage with Base64 encoding (Placeholder for encryption)
const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage;
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      // IMPORTANT: This is Base64 encoding, NOT real encryption.
      try {
        const decodedStr = decode(str);
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      // IMPORTANT: This is Base64 encoding, NOT real encryption.
      try {
        const encodedValue = encode(value);
        storage.setItem(name, encodedValue);
      } catch (e) {
         console.error(`Failed to encode item "${name}" for sessionStorage`, e);
      }
    },
    removeItem: (name) => storage.removeItem(name),
  };
};


interface TransactionsState {
    transactions: TransactionWithId[];
    isHydrated: boolean; // Track hydration status
    setTransactions: (transactions: TransactionWithId[]) => void; // Action to overwrite state
    addTransaction: (transactionData: Omit<TransactionWithId, 'id'>) => TransactionWithId;
    updateTransaction: (updatedTransaction: TransactionWithId) => void;
    deleteTransaction: (id: string) => void;
    importTransactionsBatch: (newTransactionsData: Omit<TransactionWithId, 'id'>[]) => TransactionWithId[];
    clearTransactions: () => void; // Action to clear state
    // deleteTransactionsBatch: (ids: string[]) => void; // Optional for rollback
}

const initialState = {
    transactions: [],
    isHydrated: false, // Start as not hydrated
};

export const useTransactionsStore = create<TransactionsState>()(
    persist(
        (set, get) => ({
            ...initialState,
            // Action to replace the entire transactions array
            setTransactions: (transactions) => {
                 // Ensure dates are Date objects before setting
                 const validatedTransactions = (transactions || []).map(tx => ({ // Handle potential null/undefined input
                     ...tx,
                     date: tx.date instanceof Date ? tx.date : new Date(tx.date),
                 }));
                 set({ transactions: sortTransactions(validatedTransactions), isHydrated: true }); // Mark as hydrated
            },
            addTransaction: (transactionData) => {
                const newTransaction: TransactionWithId = {
                    id: generateId(),
                    ...transactionData,
                    date: transactionData.date instanceof Date ? transactionData.date : new Date(transactionData.date), // Ensure date is Date object
                };
                set((state) => ({ transactions: sortTransactions([...state.transactions, newTransaction]) }));
                return newTransaction;
            },
            updateTransaction: (updatedTransaction) => {
                set((state) => ({
                    transactions: sortTransactions(
                        state.transactions.map(tx => tx.id === updatedTransaction.id ? {
                            ...updatedTransaction,
                             date: updatedTransaction.date instanceof Date ? updatedTransaction.date : new Date(updatedTransaction.date), // Ensure date is Date object
                        } : tx)
                    )
                }));
            },
            deleteTransaction: (id) => {
                set((state) => ({ transactions: sortTransactions(state.transactions.filter(tx => tx.id !== id)) }));
            },
            importTransactionsBatch: (newTransactionsData) => {
                 const newTransactionsWithIds = newTransactionsData.map(txData => ({
                     id: generateId(),
                     ...txData,
                     date: txData.date instanceof Date ? txData.date : new Date(txData.date), // Ensure date is Date object
                 }));
                 set((state) => ({ transactions: sortTransactions([...state.transactions, ...newTransactionsWithIds]) }));
                 return newTransactionsWithIds;
            },
            clearTransactions: () => set({ ...initialState, isHydrated: true }), // Reset to initial state, but keep hydrated flag
            // deleteTransactionsBatch: (ids) => {
            //     const idsSet = new Set(ids);
            //     set((state) => ({ transactions: sortTransactions(state.transactions.filter(d => !idsSet.has(d.id))) }));
            // },
        }),
        {
            name: 'ifcGuru_transactions', // Local storage key updated
            // Use custom sessionStorage with encoding
            storage: createJSONStorage(() => createSessionStorageWithEncoding()),
            // Custom hydration logic
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                 }
             },
            // Need to handle Date serialization/deserialization
             serialize: (state) => {
                 // Custom serialization to handle Dates
                 const replacer = (key: string, value: any) => {
                   if (value instanceof Date) {
                     return { __type: 'Date', value: value.toISOString() };
                   }
                   return value;
                 };
                 return JSON.stringify({ ...state, state: JSON.parse(JSON.stringify(state.state, replacer)) });
             },
             deserialize: (str) => {
                const state = JSON.parse(str);
                // Custom deserialization to handle Dates
                const reviver = (key: string, value: any) => {
                  if (value && typeof value === 'object' && value.__type === 'Date') {
                    return new Date(value.value);
                  }
                  return value;
                };

                const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
                parsedState.transactions = sortTransactions(parsedState.transactions || []); // Sort after loading
                parsedState.isHydrated = true; // Mark as hydrated after loading
                return { ...state, state: parsedState };
            },
        }
    )
);

// Selectors for derived data can be added here or used directly in components
// Example: Calculate total income
export const selectTotalIncome = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

// Example: Calculate total expenses
export const selectTotalExpenses = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);