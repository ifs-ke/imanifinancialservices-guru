
// src/contexts/DebtContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import type { DebtItem } from '@/lib/types';

// Generate unique IDs
const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Mock initial debt data (values in KES)
const initialDebtsData: DebtItem[] = [
  { id: generateId(), description: 'Credit Card Debt', principal: 300000, interestRate: 18.5, minPayment: 15000 },
  { id: generateId(), description: 'Student Loan', principal: 1500000, interestRate: 5.0, minPayment: 25000 },
  { id: generateId(), description: 'Car Loan', principal: 700000, interestRate: 14.0, minPayment: 30000 },
];

interface DebtContextType {
  debts: DebtItem[];
  addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
  updateDebt: (updatedDebt: DebtItem) => void;
  deleteDebt: (id: string) => void;
}

const DebtContext = createContext<DebtContextType | undefined>(undefined);

export const DebtProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [debts, setDebts] = useState<DebtItem[]>(initialDebtsData);

  // Sort debts whenever they are updated (e.g., alphabetically by description)
  const sortDebts = useCallback((debtList: DebtItem[]) => {
    return [...debtList].sort((a, b) => a.description.localeCompare(b.description));
  }, []);

  const addDebt = useCallback((debtData: Omit<DebtItem, 'id'>): DebtItem => {
    const newDebt: DebtItem = {
      id: generateId(),
      ...debtData,
    };
    setDebts(prev => sortDebts([...prev, newDebt]));
    return newDebt; // Return the debt with its new ID
  }, [sortDebts]);

  const updateDebt = useCallback((updatedDebt: DebtItem) => {
    setDebts(prev => sortDebts(
      prev.map(d => d.id === updatedDebt.id ? updatedDebt : d)
    ));
  }, [sortDebts]);

  const deleteDebt = useCallback((id: string) => {
    setDebts(prev => sortDebts(prev.filter(d => d.id !== id)));
  }, [sortDebts]);

  const contextValue = useMemo(() => ({
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
  }), [debts, addDebt, updateDebt, deleteDebt]);

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
