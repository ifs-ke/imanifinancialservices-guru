
// src/contexts/TransactionsContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types';

// Generate unique IDs for mock data - consider moving to a utility file if needed elsewhere
const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Mock initial transactions (values in KES) with IDs, modeOfPayment, and categorization
const initialTransactionsData: TransactionWithId[] = [
  { id: generateId(), date: new Date(2024, 5, 15), description: 'Salary Deposit', amount: 300000, modeOfPayment: 'Bank', frequency: 'recurring', variability: 'fixed' },
  { id: generateId(), date: new Date(2024, 5, 16), description: 'Groceries - Naivas', amount: -8550, modeOfPayment: 'Mpesa', frequency: 'recurring', variability: 'variable' },
  { id: generateId(), date: new Date(2024, 5, 17), description: 'Rent Payment', amount: -120000, modeOfPayment: 'Bank', frequency: 'recurring', variability: 'fixed' },
  { id: generateId(), date: new Date(2024, 5, 18), description: 'Coffee Shop', amount: -525, modeOfPayment: 'Cash', frequency: 'one-time', variability: 'variable' },
  { id: generateId(), date: new Date(2024, 5, 20), description: 'Utility Bill - KPLC', amount: -7500, modeOfPayment: 'Mpesa', frequency: 'recurring', variability: 'variable' },
  { id: generateId(), date: new Date(2024, 5, 22), description: 'Dinner Out - Artcaffe', amount: -6000, modeOfPayment: 'Mpesa', frequency: 'one-time', variability: 'variable' },
  { id: generateId(), date: new Date(2024, 6, 1), description: 'Freelance Payment', amount: 50000, modeOfPayment: 'Mpesa', frequency: 'one-time', variability: 'variable' },
].sort((a, b) => b.date.getTime() - a.date.getTime()); // Ensure initial sort

interface TransactionsContextType {
  transactions: TransactionWithId[];
  addTransaction: (transactionData: Omit<TransactionWithId, 'id'>) => TransactionWithId; // Return the added transaction with ID
  updateTransaction: (updatedTransaction: TransactionWithId) => void;
  deleteTransaction: (id: string) => void;
  importTransactionsBatch: (newTransactionsData: Omit<TransactionWithId, 'id'>[]) => TransactionWithId[]; // Return added transactions with IDs
  // TODO: Implement batch delete if rollback is needed
  // deleteTransactionsBatch: (ids: string[]) => void;
}

const TransactionsContext = createContext<TransactionsContextType | undefined>(undefined);

export const TransactionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<TransactionWithId[]>(initialTransactionsData);

  // Sort transactions whenever they are updated
  const sortTransactions = useCallback((txs: TransactionWithId[]) => {
    return [...txs].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, []);

  // Add transaction now includes frequency and variability
  const addTransaction = useCallback((transactionData: Omit<TransactionWithId, 'id'>): TransactionWithId => {
    const newTransaction: TransactionWithId = {
      id: generateId(),
      date: transactionData.date,
      description: transactionData.description,
      amount: transactionData.amount,
      modeOfPayment: transactionData.modeOfPayment,
      frequency: transactionData.frequency, // Include frequency
      variability: transactionData.variability, // Include variability
    };
    setTransactions(prev => sortTransactions([...prev, newTransaction]));
    return newTransaction; // Return the transaction with its new ID
  }, [sortTransactions]);

  // Update transaction now includes frequency and variability
  const updateTransaction = useCallback((updatedTransaction: TransactionWithId) => {
    setTransactions(prev => sortTransactions(
      prev.map(tx => tx.id === updatedTransaction.id ? {
          ...tx, // Keep existing fields like ID
          date: updatedTransaction.date,
          description: updatedTransaction.description,
          amount: updatedTransaction.amount,
          modeOfPayment: updatedTransaction.modeOfPayment,
          frequency: updatedTransaction.frequency, // Update frequency
          variability: updatedTransaction.variability, // Update variability
      } : tx)
    ));
  }, [sortTransactions]);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions(prev => sortTransactions(prev.filter(tx => tx.id !== id)));
  }, [sortTransactions]);

  // Import batch now needs to potentially handle frequency/variability if present in import data
  // For now, it adds them without these fields (they'll be undefined)
  const importTransactionsBatch = useCallback((newTransactionsData: Omit<TransactionWithId, 'id'>[]): TransactionWithId[] => {
     const newTransactionsWithIds = newTransactionsData.map(txData => ({
       id: generateId(),
       date: txData.date,
       description: txData.description,
       amount: txData.amount,
       modeOfPayment: txData.modeOfPayment,
       // Frequency and Variability might be undefined unless handled during parsing/mapping
       frequency: txData.frequency,
       variability: txData.variability,
     }));
     setTransactions(prev => sortTransactions([...prev, ...newTransactionsWithIds]));
     return newTransactionsWithIds; // Return the transactions with their new IDs
  }, [sortTransactions]);

   // Placeholder for batch delete (needed for rollback)
  // const deleteTransactionsBatch = useCallback((ids: string[]) => {
  //   console.log("Attempting to delete transactions with IDs:", ids);
  //   const idsSet = new Set(ids);
  //   setTransactions(prev => sortTransactions(prev.filter(tx => !idsSet.has(tx.id))));
  //   console.log("Transactions after attempted deletion:", transactions); // Log state *after* update attempt
  // }, [sortTransactions, transactions]); // Include transactions in dependency array if logging state


  const contextValue = useMemo(() => ({
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    importTransactionsBatch,
    // deleteTransactionsBatch, // Uncomment when implemented
  }), [transactions, addTransaction, updateTransaction, deleteTransaction, importTransactionsBatch /*, deleteTransactionsBatch*/]);

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
