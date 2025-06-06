
// src/store/transactionsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { TransactionWithId, TransactionFrequency, TransactionVariability, ModeOfPayment, TransactionFormData as SharedTransactionFormData } from '@/lib/types';
import { encode, decode } from '@/lib/storage-utils'; 
import { logInfo, logDebug, logWarn } from '@/lib/logger'; 
import { isValid } from 'date-fns'; // Import isValid from date-fns

const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
    if (!Array.isArray(txs)) return [];
    return [...txs].sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date || 0);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date || 0);
        const timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
        const timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
        const dateDiff = timeB - timeA; // Sort by date descending (most recent first)
        if (dateDiff !== 0) return dateDiff;
        const amountDiff = (b.amount || 0) - (a.amount || 0);
        if (amountDiff !== 0) return amountDiff;
        return (a.description || '').localeCompare(b.description || '');
    });
};

// Helper to ensure date is valid, defaulting to now if not.
const ensureValidDate = (dateInput: Date | string | undefined | null): Date => {
    if (dateInput instanceof Date && isValid(dateInput)) {
        return dateInput;
    }
    if (typeof dateInput === 'string') {
        const parsed = new Date(dateInput);
        if (isValid(parsed)) {
            return parsed;
        }
    }
    logWarn("Invalid date encountered in transaction store, defaulting to current date:", { originalDate: dateInput });
    return new Date();
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
        return JSON.parse(decodedStr, (key, value) => {
            if (key === 'date' && typeof value === 'string') {
                const parsedDate = new Date(value);
                // Ensure rehydrated dates are valid Date objects
                return isValid(parsedDate) ? parsedDate : ensureValidDate(null); 
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
    deleteSelectedTransactions: (idsToDelete: string[]) => void;
    batchUpdateTransactions: (updates: Array<{ id: string; data: Partial<SharedTransactionFormData> }>) => void;
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
                     date: ensureValidDate(tx.date),
                     categoryName: tx.categoryName || null,
                 }));
                 set({ transactions: sortTransactions(validatedTransactions), isHydrated: true });
             },
            addTransaction: (transactionData) => {
                const newTransaction: TransactionWithId = {
                    id: generateId(),
                    ...transactionData,
                    date: ensureValidDate(transactionData.date),
                    categoryName: transactionData.categoryName || null,
                };
                set((state) => ({ transactions: sortTransactions([...state.transactions, newTransaction]) }));
                return newTransaction; 
            },
            updateTransaction: (updatedTransaction) => {
                 const validatedDate = ensureValidDate(updatedTransaction.date);
                set((state) => ({
                    transactions: sortTransactions(
                        state.transactions.map(tx => tx.id === updatedTransaction.id ? { ...updatedTransaction, date: validatedDate, categoryName: updatedTransaction.categoryName || null } : tx)
                    )
                }));
            },
            deleteTransaction: (id) => {
                set((state) => ({ 
                    transactions: sortTransactions(state.transactions.filter(tx => tx.id !== id)),
                }));
            },
            importTransactionsBatch: (newTransactionsData) => {
                 const newTransactionsWithIds = newTransactionsData.map(txData => ({
                     id: generateId(),
                     ...txData,
                     date: ensureValidDate(txData.date),
                     categoryName: txData.categoryName || null,
                 }));
                 set((state) => ({ transactions: sortTransactions([...state.transactions, ...newTransactionsWithIds]) }));
                 return newTransactionsWithIds; 
            },
             clearTransactions: () => {
                 logInfo("TransactionsStore: Clearing transactions state.");
                 set({ ...initialState, isHydrated: true }); 
             },
             deleteSelectedTransactions: (idsToDelete) => {
                set((state) => ({
                    transactions: sortTransactions(
                        state.transactions.filter(tx => !idsToDelete.includes(tx.id))
                    ),
                }));
             },
             batchUpdateTransactions: (updates) => {
                set((state) => {
                    const updatedTransactions = state.transactions.map(tx => {
                        const updateDataForTx = updates.find(u => u.id === tx.id);
                        if (updateDataForTx) {
                             const newTxData: Partial<TransactionWithId> = {};
                            if (updateDataForTx.data.modeOfPayment !== undefined) newTxData.modeOfPayment = updateDataForTx.data.modeOfPayment;
                            if (updateDataForTx.data.frequency !== undefined) newTxData.frequency = updateDataForTx.data.frequency;
                            if (updateDataForTx.data.variability !== undefined) newTxData.variability = updateDataForTx.data.variability;
                            
                            // Validate date only if it's part of the update
                            if (updateDataForTx.data.date !== undefined) {
                                newTxData.date = ensureValidDate(updateDataForTx.data.date);
                            }
                            
                            if (Object.prototype.hasOwnProperty.call(updateDataForTx.data, 'categoryName')) {
                                newTxData.categoryName = updateDataForTx.data.categoryName === "" ? null : updateDataForTx.data.categoryName;
                            }

                            return { ...tx, ...newTxData };
                        }
                        return tx;
                    });
                    return { 
                        transactions: sortTransactions(updatedTransactions),
                    };
                });
             }
        }),
        {
            name: 'ifcGuru_transactions', 
            storage: createJSONStorage(createSessionStorageWithEncoding), 
            onRehydrateStorage: () => (state) => {
                 if (state) {
                   state.isHydrated = true;
                   // Ensure dates are valid upon rehydration
                   if (Array.isArray(state.transactions)) {
                       state.transactions = state.transactions.map(tx => ({
                           ...tx,
                           date: ensureValidDate(tx.date)
                       }));
                   }
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

