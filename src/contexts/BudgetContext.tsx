'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import type { TransactionFrequency, TransactionVariability } from '@/lib/types';

// Mock Budget Item Interface
interface BudgetItem {
    id: string;
    category: string; // e.g., "Rent", "Groceries", "Salary"
    amount: number;  // Budgeted amount
    month: number;    // Month (0-11)
    year: number;     // Year
    frequency?: TransactionFrequency;
    variability?: TransactionVariability;
}

const BudgetContext = createContext<{
    budgets: BudgetItem[];
    addBudget: (item: Omit<BudgetItem, 'id'>) => void;
    updateBudget: (item: BudgetItem) => void;
    deleteBudget: (id: string) => void;
} | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [budgets, setBudgets] = useState<BudgetItem[]>([]);

    const addBudget = (item: Omit<BudgetItem, 'id'>) => {
        setBudgets(prev => [...prev, { ...item, id: `budget_${Date.now()}` }]);
    };

    const updateBudget = (item: BudgetItem) => {
        setBudgets(prev => prev.map(budget => budget.id === item.id ? item : budget));
    };

    const deleteBudget = (id: string) => {
        setBudgets(prev => prev.filter(budget => budget.id !== id));
    };

    const value = useMemo(() => ({
        budgets,
        addBudget,
        updateBudget,
        deleteBudget,
    }), [budgets, addBudget, updateBudget, deleteBudget]);

    return (
        <BudgetContext.Provider value={value}>
            {children}
        </BudgetContext.Provider>
    );
};

export const useBudget = () => {
    const context = useContext(BudgetContext);
    if (!context) {
        throw new Error('useBudget must be used within a BudgetProvider');
    }
    return context;
};
