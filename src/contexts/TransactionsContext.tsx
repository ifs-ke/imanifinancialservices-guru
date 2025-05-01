
// src/contexts/TransactionsContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types';

// Generate unique IDs for mock data - consider moving to a utility file if needed elsewhere
const generateId = (): string => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Removed sample data, start with an empty array
const initialTransactionsData: TransactionWithId[] = [];

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
    return [...txs].sort((a, b) => {
       // Primary sort by date descending
      const dateDiff = b.date.getTime() - a.date.getTime();
      if (dateDiff !== 0) return dateDiff;
       // Secondary sort: Income before expenses on the same day
       // Assuming positive amount = income, negative = expense
       if (a.amount > 0 && b.amount < 0) return -1;
       if (a.amount < 0 && b.amount > 0) return 1;
       // Tertiary sort: Larger magnitude transactions first (absolute value)
       return Math.abs(b.amount) - Math.abs(a.amount);
    });
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
