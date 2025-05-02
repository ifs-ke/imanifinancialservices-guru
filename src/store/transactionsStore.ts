
// src/store/transactionsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types';

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

interface TransactionsState {
    transactions: TransactionWithId[];
    addTransaction: (transactionData: Omit<TransactionWithId, 'id'>) => TransactionWithId;
    updateTransaction: (updatedTransaction: TransactionWithId) => void;
    deleteTransaction: (id: string) => void;
    importTransactionsBatch: (newTransactionsData: Omit<TransactionWithId, 'id'>[]) => TransactionWithId[];
    // deleteTransactionsBatch: (ids: string[]) => void; // Optional for rollback
}

export const useTransactionsStore = create<TransactionsState>()(
    persist(
        (set, get) => ({
            transactions: [], // Initialize with empty array
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
            // deleteTransactionsBatch: (ids) => {
            //     const idsSet = new Set(ids);
            //     set((state) => ({ transactions: sortTransactions(state.transactions.filter(d => !idsSet.has(d.id))) }));
            // },
        }),
        {
            name: 'debtConqueror_transactions', // Local storage key
            storage: createJSONStorage(() => localStorage),
            // Need to handle Date serialization/deserialization
             serialize: (state) => JSON.stringify(state),
             deserialize: (str) => {
                const state = JSON.parse(str);
                 // Convert date strings back to Date objects
                state.state.transactions = state.state.transactions.map((tx: any) => ({
                    ...tx,
                     date: tx.date ? new Date(tx.date) : new Date(), // Handle potential null/undefined dates
                 }));
                 // Ensure transactions are sorted after deserialization
                 state.state.transactions = sortTransactions(state.state.transactions);
                return state;
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
