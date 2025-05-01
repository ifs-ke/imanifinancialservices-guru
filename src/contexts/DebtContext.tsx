
// src/contexts/DebtContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import type { DebtItem } from '@/lib/types';

// Generate unique IDs
const generateId = (): string => `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Enhanced Mock initial debt data (values in KES) with term
const initialDebtsData: DebtItem[] = [
  { id: generateId(), description: 'Credit Card - Visa', principal: 150000, interestRate: 24.0, minPayment: 7500, term: 'short' }, // Higher interest CC
  { id: generateId(), description: 'Personal Loan - Bank ABC', principal: 450000, interestRate: 16.5, minPayment: 20000, term: 'long' },
  { id: generateId(), description: 'Student Loan - HELB', principal: 1500000, interestRate: 4.0, minPayment: 10000, term: 'long' }, // Lower rate govt loan
  { id: generateId(), description: 'Car Loan - XYZ Finance', principal: 700000, interestRate: 14.0, minPayment: 30000, term: 'long' },
  { id: generateId(), description: 'Appliance Purchase - Store Credit', principal: 45000, interestRate: 0.0, minPayment: 5000, term: 'short' }, // 0% short term
  { id: generateId(), description: 'Overdraft Facility', principal: 25000, interestRate: 19.0, minPayment: 1000, term: 'short' },
];

interface DebtContextType {
  debts: DebtItem[];
  addDebt: (debtData: Omit<DebtItem, 'id'>) => DebtItem;
  updateDebt: (updatedDebt: DebtItem) => void;
  deleteDebt: (id: string) => void;
}

const DebtContext = createContext<DebtContextType | undefined>(undefined);

export const DebtProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Sort initial data before setting state
  const sortedInitialDebts = useMemo(() => {
      return [...initialDebtsData].sort((a, b) => {
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        // Secondary sort by principal descending within term
        return b.principal - a.principal;
    });
  }, []);

  const [debts, setDebts] = useState<DebtItem[]>(sortedInitialDebts);


  // Sort debts whenever they are updated
  const sortDebts = useCallback((debtList: DebtItem[]) => {
    return [...debtList].sort((a, b) => {
        if (a.term === 'short' && b.term === 'long') return -1;
        if (a.term === 'long' && b.term === 'short') return 1;
        // Secondary sort by principal descending within term
        return b.principal - a.principal;
    });
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
