// src/contexts/BudgetContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback, useEffect } from 'react';
import type { TransactionWithId, ModeOfPayment, TransactionFrequency, TransactionVariability } from '@/lib/types';

interface BudgetContextType {
  incomeBudget: number;
  expensesBudget: number;
  setIncomeBudget: (budget: number) => void;
  setExpensesBudget: (budget: number) => void;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [incomeBudget, setIncomeBudgetState] = useState<number>(0);
    const [expensesBudget, setExpensesBudgetState] = useState<number>(0);

    const setIncomeBudget = useCallback((budget: number) => {
        setIncomeBudgetState(budget);
    }, []);

    const setExpensesBudget = useCallback((budget: number) => {
        setExpensesBudgetState(budget);
    }, []);

    const contextValue = useMemo(() => ({
        incomeBudget,
        expensesBudget,
        setIncomeBudget,
        setExpensesBudget,
    }), [incomeBudget, expensesBudget, setIncomeBudget, setExpensesBudget]);

    return (
        <BudgetContext.Provider value={contextValue}>
            {children}
        </BudgetContext.Provider>
    );
};

export const useBudget = (): BudgetContextType => {
    const context = useContext(BudgetContext);
    if (context === undefined) {
        throw new Error('useBudget must be used within a BudgetProvider');
    }
    return context;
};
