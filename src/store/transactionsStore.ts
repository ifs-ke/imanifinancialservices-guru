// src/store/transactionsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TransactionWithId } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; 
import { logInfo, logDebug } from '@/lib/logger'; 

const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
    if (!Array.isArray(txs)) return [];
    return [...txs].sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date || 0);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date || 0);
        const timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
        const timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
        const dateDiff = timeB - timeA;
        if (dateDiff !== 0) return dateDiff;
        const amountDiff = (b.amount || 0) - (a.amount || 0);
        if (amountDiff !== 0) return amountDiff;
        return (a.description || '').localeCompare(b.description || '');
    });
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
        // Deserialize Date objects
        return JSON.parse(decodedStr, (key, value) => {
            if (key === 'date' && typeof value === 'string') {
                const parsedDate = new Date(value);
                return !isNaN(parsedDate.getTime()) ? parsedDate : new Date(0);
            }
            return value;
        });
      } catch (e) {
        logDebug(`Failed to decode/parse item "${name}" from sessionStorage.`, { error: e }); 
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storage) return;
      try {
        // Serialize Date objects to ISO strings
        const stringifiedValue = JSON.stringify(value, (key, val) => {
            if (key === 'date' && val instanceof Date) {
                return val.toISOString();
            }
            return val;
        });
        const encodedValue = encode(stringifiedValue);
        storage.setItem(name, encodedValue);
      } catch (e) {
        logDebug(`Failed to encode/stringify and set item "${name}" for sessionStorage`, { error: e }); 
      }
    },
    removeItem: (name) => storage?.removeItem(name),
  };
};

export interface TransactionsState {
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
                 const validatedTransactions = (transactions || []).map(tx => ({
                     ...tx,
                     date: tx.date instanceof Date && !isNaN(tx.date.getTime()) ? tx.date : new Date(0),
                 }));
                 set({ transactions: sortTransactions(validatedTransactions), isHydrated: true });
             },
            addTransaction: (transactionData) => {
                const newTransaction: TransactionWithId = {
                    id: generateId(),
                    ...transactionData,
                    date: transactionData.date instanceof Date && !isNaN(transactionData.date.getTime()) ? transactionData.date : new Date(0),
                };
                set((state) => ({ transactions: sortTransactions([...state.transactions, newTransaction]) }));
                return newTransaction; 
            },
            updateTransaction: (updatedTransaction) => {
                 const validatedDate = updatedTransaction.date instanceof Date && !isNaN(updatedTransaction.date.getTime())
                     ? updatedTransaction.date
                     : new Date(0); 
                set((state) => ({
                    transactions: sortTransactions(
                        state.transactions.map(tx => tx.id === updatedTransaction.id ? { ...updatedTransaction, date: validatedDate } : tx)
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
                     date: txData.date instanceof Date && !isNaN(txData.date.getTime()) ? txData.date : new Date(0),
                 }));
                 set((state) => ({ transactions: sortTransactions([...state.transactions, ...newTransactionsWithIds]) }));
                 return newTransactionsWithIds; 
            },
             clearTransactions: () => {
                 logInfo("TransactionsStore: Clearing transactions state.");
                 set({ ...initialState, isHydrated: true }); 
             },
        }),
        {
            name: 'ifcGuru_transactions', 
            storage: createJSONStorage(createSessionStorageWithEncoding), 
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   logInfo("TransactionsStore: Rehydrated successfully.");
                 }
             },
        }
    )
);

export const selectTotalIncome = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0);

export const selectTotalExpenses = (state: TransactionsState): number =>
    state.transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
