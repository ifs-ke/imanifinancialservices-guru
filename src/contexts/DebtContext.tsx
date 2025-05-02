// src/contexts/DebtContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import type { DebtItem } from '@/lib/types';

// Generate unique IDs
const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const initialDebtsData: DebtItem[] = [];

interface DebtContextType {
  debts: DebtItem[];
  addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
  updateDebt: (updatedDebt: DebtItem) => void;
  deleteDebt: (id: string) => void;
  importDebtsBatch: (newDebtsData: Omit<DebtItem, 'id'>[]) => DebtItem[]; // Add batch import signature
  // deleteDebtsBatch: (ids: string[]) => void; // Add batch delete signature if needed for rollback
}

const DebtContext = createContext<DebtContextType | undefined>(undefined);

export const DebtProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Sort initial data before setting state
  const sortedInitialDebts = useMemo(() => {
      return [...initialDebtsData].sort((a, b) => {
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        return b.principal - a.principal;
    });
  }, []);

  const [debts, setDebts] = useState<DebtItem[]>(sortedInitialDebts);


  // Sort debts whenever they are updated
  const sortDebts = useCallback((debtList: DebtItem[]) => {
    return [...debtList].sort((a, b) => {
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        return b.principal - a.principal;
    });
  }, []);

  const addDebt = useCallback((debtData: Omit<DebtItem, 'id'>): DebtItem => {
    const newDebt: DebtItem = {
      id: generateId(),
      ...debtData,
    };
    setDebts(prev => sortDebts([...prev, newDebt]));
    return newDebt;
  }, [sortDebts]);

  const updateDebt = useCallback((updatedDebt: DebtItem) => {
    setDebts(prev => sortDebts(
      prev.map(d => d.id === updatedDebt.id ? updatedDebt : d)
    ));
  }, [sortDebts]);

  const deleteDebt = useCallback((id: string) => {
    setDebts(prev => sortDebts(prev.filter(d => d.id !== id)));
  }, [sortDebts]);

  // Implement batch import for debts
  const importDebtsBatch = useCallback((newDebtsData: Omit<DebtItem, 'id'>[]): DebtItem[] => {
    const newDebtsWithIds = newDebtsData.map(debtData => ({
        id: generateId(),
        ...debtData,
    }));
    setDebts(prev => sortDebts([...prev, ...newDebtsWithIds]));
    return newDebtsWithIds; // Return the newly added debts with IDs
  }, [sortDebts]);

   // Placeholder for batch delete (needed for rollback)
   // const deleteDebtsBatch = useCallback((ids: string[]) => {
   //   const idsSet = new Set(ids);
   //   setDebts(prev => sortDebts(prev.filter(d => !idsSet.has(d.id))));
   // }, [sortDebts]);

  const contextValue = useMemo(() => ({
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    importDebtsBatch, // Include batch import function
    // deleteDebtsBatch, // Include batch delete if implemented
  }), [debts, addDebt, updateDebt, deleteDebt, importDebtsBatch /*, deleteDebtsBatch*/]);

  return (
    <DebtContext.Provider value={contextValue}>
      {children}
    </DebtContext.Provider>
  );
};

export const useDebt = (): DebtContextType => {
  const context = useContext(DebtContext);
  if (context === undefined) {
    throw new Error('useDebt must be used within a DebtProvider');
  }
  return context;
};

  