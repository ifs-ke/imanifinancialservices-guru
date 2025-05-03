// src/store/transactionsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TransactionWithId } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; // Import encoding/decoding utils

// Generate unique IDs
const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Helper to sort transactions - IMPORTANT for consistent hashing
const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
    return [...txs].sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
        // Primary sort: Date ascending
        const dateDiff = dateA.getTime() - dateB.getTime();
        if (dateDiff !== 0) return dateDiff;
        // Secondary sort: Description ascending
        const descDiff = a.description.localeCompare(b.description);
        if (descDiff !== 0) return descDiff;
        // Tertiary sort: Amount ascending
        return a.amount - b.amount;
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
        const decodedStr = decode(str);
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null;
      }
    },
    setItem: (name, value) => {
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
    isHydrated: boolean;
    setTransactions: (transactions: TransactionWithId[]) => void;
    addTransaction: (transactionData: Omit<TransactionWithId, 'id'>) => TransactionWithId;
    updateTransaction: (updatedTransaction: TransactionWithId) => void;
    deleteTransaction: (id: string) => void;
    importTransactionsBatch: (newTransactionsData: Omit<TransactionWithId, 'id'>[]) => TransactionWithId[];
    clearTransactions: () => void;
}

const initialState = {
    transactions: [],
    isHydrated: false,
};

export const useTransactionsStore = create<TransactionsState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setTransactions: (transactions) => {
                 // Ensure dates are Date objects when setting state internally
                 const validatedTransactions = (transactions || []).map(tx => ({
                     ...tx,
                     date: tx.date instanceof Date ? tx.date : new Date(tx.date),
                 }));
                 set({ transactions: sortTransactions(validatedTransactions), isHydrated: true });
            },
            addTransaction: (transactionData) => {
                const newTransaction: TransactionWithId = {
                    id: generateId(),
                    ...transactionData,
                    date: transactionData.date instanceof Date ? transactionData.date : new Date(transactionData.date), // Ensure Date object
                };
                set((state) => ({ transactions: sortTransactions([...state.transactions, newTransaction]) }));
                return newTransaction;
            },
            updateTransaction: (updatedTransaction) => {
                set((state) => ({
                    transactions: sortTransactions(
                        state.transactions.map(tx => tx.id === updatedTransaction.id ? {
                            ...updatedTransaction,
                             date: updatedTransaction.date instanceof Date ? updatedTransaction.date : new Date(updatedTransaction.date), // Ensure Date object
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
                     date: txData.date instanceof Date ? txData.date : new Date(txData.date), // Ensure Date object
                 }));
                 set((state) => ({ transactions: sortTransactions([...state.transactions, ...newTransactionsWithIds]) }));
                 return newTransactionsWithIds;
            },
            clearTransactions: () => set({ ...initialState, isHydrated: true }), // Reset state but keep hydrated flag
        }),
        {
            name: 'ifcGuru_transactions',
            storage: createJSONStorage(() => createSessionStorageWithEncoding()),
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                 }
             },
             // Use a reviver to ensure dates are Date objects on hydration
             // Use a replacer to store dates as ISO strings for consistency
             serialize: (state) => {
                 const replacer = (key: string, value: any) => {
                   if (value instanceof Date) {
                     // Store dates as ISO strings for consistent serialization
                     return { __type: 'Date', value: value.toISOString() };
                   }
                   return value;
                 };
                 // Exclude isHydrated from persisted state
                 const { isHydrated, ...stateToSave } = state.state;
                 return JSON.stringify({ ...state, state: JSON.parse(JSON.stringify(stateToSave, replacer)) });
             },
             deserialize: (str) => {
                const state = JSON.parse(str);
                const reviver = (key: string, value: any) => {
                  if (value && typeof value === 'object' && value.__type === 'Date') {
                    // Convert ISO string back to Date object on hydration
                    return new Date(value.value);
                  }
                  return value;
                };
                const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
                // Sort after reviving dates
                parsedState.transactions = sortTransactions(parsedState.transactions || []);
                parsedState.isHydrated = true; // Mark as hydrated
                return { ...state, state: parsedState };
            },
        }
    )
);

// Selectors remain the same
export const selectTotalIncome = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

export const selectTotalExpenses = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
