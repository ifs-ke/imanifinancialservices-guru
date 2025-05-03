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
        // Secondary sort: Income before expenses, then by absolute amount descending
        if (a.amount >= 0 && b.amount < 0) return -1;
        if (a.amount < 0 && b.amount >= 0) return 1;
        return Math.abs(b.amount) - Math.abs(a.amount);
    });
};

// Custom Session Storage with Base64 encoding
const createSessionStorageWithEncoding = (): StateStorage => {
  const storage = sessionStorage; // Use sessionStorage
  return {
    getItem: (name) => {
      const str = storage.getItem(name);
      if (!str) return null;
      try {
        const decodedStr = decode(str); // Decode Base64
        return decodedStr;
      } catch (e) {
        console.error(`Failed to decode item "${name}" from sessionStorage`, e);
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        const encodedValue = encode(value); // Encode using Base64
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
}

const initialState = {
    transactions: [],
    isHydrated: false, // Start as not hydrated
};

export const useTransactionsStore = create<TransactionsState>()(
    persist(
        (set, get) => ({
            ...initialState,
            setTransactions: (transactions) => {
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
                    date: transactionData.date instanceof Date ? transactionData.date : new Date(transactionData.date),
                };
                set((state) => ({ transactions: sortTransactions([...state.transactions, newTransaction]) }));
                return newTransaction;
            },
            updateTransaction: (updatedTransaction) => {
                set((state) => ({
                    transactions: sortTransactions(
                        state.transactions.map(tx => tx.id === updatedTransaction.id ? {
                            ...updatedTransaction,
                             date: updatedTransaction.date instanceof Date ? updatedTransaction.date : new Date(updatedTransaction.date),
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
                     date: txData.date instanceof Date ? txData.date : new Date(txData.date),
                 }));
                 set((state) => ({ transactions: sortTransactions([...state.transactions, ...newTransactionsWithIds]) }));
                 return newTransactionsWithIds;
            },
            // Clear function resets the state but keeps isHydrated=true
            // because clearing is usually followed by fetching new data or starting fresh.
            clearTransactions: () => set({ ...initialState, isHydrated: true }),
        }),
        {
            name: 'ifcGuru_transactions', // Session storage key
            storage: createJSONStorage(() => createSessionStorageWithEncoding()), // Use encoded sessionStorage
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                 }
             },
             serialize: (state) => {
                 const replacer = (key: string, value: any) => {
                   if (value instanceof Date) {
                     return { __type: 'Date', value: value.toISOString() };
                   }
                   return value;
                 };
                 const { isHydrated, ...stateToSave } = state.state;
                 return JSON.stringify({ ...state, state: JSON.parse(JSON.stringify(stateToSave, replacer)) });
             },
             deserialize: (str) => {
                const state = JSON.parse(str);
                const reviver = (key: string, value: any) => {
                  if (value && typeof value === 'object' && value.__type === 'Date') {
                    return new Date(value.value);
                  }
                  return value;
                };
                const parsedState = JSON.parse(JSON.stringify(state.state), reviver);
                parsedState.transactions = sortTransactions(parsedState.transactions || []);
                parsedState.isHydrated = true; // Mark as hydrated after loading
                return { ...state, state: parsedState };
            },
        }
    )
);

// Selectors
export const selectTotalIncome = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

export const selectTotalExpenses = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);