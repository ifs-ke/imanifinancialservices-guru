
// src/contexts/TransactionsContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import type { TransactionWithId, ModeOfPayment } from '@/lib/types';

// Generate unique IDs for mock data - consider moving to a utility file if needed elsewhere
const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Mock initial transactions (values in KES) with IDs and modeOfPayment
// This initial state will be used if no persisted state is found (e.g., from localStorage)
const initialTransactionsData: TransactionWithId[] = [
  { id: generateId(), date: new Date(2024, 5, 15), description: 'Salary Deposit', amount: 300000, modeOfPayment: 'Bank' },
  { id: generateId(), date: new Date(2024, 5, 16), description: 'Groceries - Naivas', amount: -8550, modeOfPayment: 'Mpesa' },
  { id: generateId(), date: new Date(2024, 5, 17), description: 'Rent Payment', amount: -120000, modeOfPayment: 'Bank' },
  { id: generateId(), date: new Date(2024, 5, 18), description: 'Coffee Shop', amount: -525, modeOfPayment: 'Cash' },
  { id: generateId(), date: new Date(2024, 5, 20), description: 'Utility Bill - KPLC', amount: -7500, modeOfPayment: 'Mpesa' },
  { id: generateId(), date: new Date(2024, 5, 22), description: 'Dinner Out - Artcaffe', amount: -6000, modeOfPayment: 'Mpesa' },
  { id: generateId(), date: new Date(2024, 6, 1), description: 'Freelance Payment', amount: 50000, modeOfPayment: 'Mpesa' },
].sort((a, b) => b.date.getTime() - a.date.getTime()); // Ensure initial sort

interface TransactionsContextType {
  transactions: TransactionWithId[];
  addTransaction: (transactionData: Omit<TransactionWithId, 'id'>) => void;
  updateTransaction: (updatedTransaction: TransactionWithId) => void;
  deleteTransaction: (id: string) => void;
  importTransactionsBatch: (newTransactions: TransactionWithId[]) => void; // For bulk import
}

const TransactionsContext = createContext<TransactionsContextType | undefined>(undefined);

export const TransactionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<TransactionWithId[]>(initialTransactionsData);

  // Sort transactions whenever they are updated
  const sortTransactions = useCallback((txs: TransactionWithId[]) => {
    return [...txs].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, []);

  const addTransaction = useCallback((transactionData: Omit<TransactionWithId, 'id'>) => {
    const newTransaction: TransactionWithId = {
      id: generateId(),
      ...transactionData,
    };
    setTransactions(prev => sortTransactions([...prev, newTransaction]));
  }, [sortTransactions]);

  const updateTransaction = useCallback((updatedTransaction: TransactionWithId) => {
    setTransactions(prev => sortTransactions(
      prev.map(tx => tx.id === updatedTransaction.id ? updatedTransaction : tx)
    ));
  }, [sortTransactions]);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions(prev => sortTransactions(prev.filter(tx => tx.id !== id)));
  }, [sortTransactions]);

  const importTransactionsBatch = useCallback((newTransactions: TransactionWithId[]) => {
     setTransactions(prev => sortTransactions([...prev, ...newTransactions]));
  }, [sortTransactions]);

  const contextValue = useMemo(() => ({
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    importTransactionsBatch,
  }), [transactions, addTransaction, updateTransaction, deleteTransaction, importTransactionsBatch]);

  return (
    <TransactionsContext.Provider value={contextValue}>
      {children}
    </TransactionsContext.Provider>
  );
};

export const useTransactions = (): TransactionsContextType => {
  const context = useContext(TransactionsContext);
  if (context === undefined) {
    throw new Error('useTransactions must be used within a TransactionsProvider');
  }
  return context;
};
