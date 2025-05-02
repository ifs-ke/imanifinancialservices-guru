
// src/contexts/BudgetContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback, useEffect } from 'react';

// Define the structure for budget items
export interface BudgetItems { // Export the interface
  recurringFixedIncome: number;
  recurringVariableIncome: number;
  oneTimeIncome: number;
  recurringFixedExpenses: number;
  recurringVariableExpenses: number;
  oneTimeFixedExpenses: number;
  oneTimeVariableExpenses: number;
  savingsGoal: number; // Added savings goal
  extraDebtPayment: number; // Added extra debt payment goal
}

// Initial empty state for the budget
const initialBudget: BudgetItems = {
  recurringFixedIncome: 0,
  recurringVariableIncome: 0,
  oneTimeIncome: 0,
  recurringFixedExpenses: 0,
  recurringVariableExpenses: 0,
  oneTimeFixedExpenses: 0,
  oneTimeVariableExpenses: 0,
  savingsGoal: 0,
  extraDebtPayment: 0,
};

const BUDGET_STORAGE_KEY = 'debtConqueror_budget';

interface BudgetContextType {
  budget: BudgetItems;
  setBudget: (newBudget: BudgetItems) => void;
  // Convenience getters for totals
  totalBudgetedIncome: number;
  totalBudgetedExpenses: number;
  totalBudgetedNet: number;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [budget, setBudgetInternal] = useState<BudgetItems>(() => {
        let initialData = initialBudget;
        if (typeof window !== 'undefined') {
            const storedBudget = localStorage.getItem(BUDGET_STORAGE_KEY);
            try {
                initialData = storedBudget ? JSON.parse(storedBudget) : initialBudget;
                // Ensure all keys exist, merging with initialBudget for safety
                initialData = { ...initialBudget, ...initialData };
            } catch (e) {
                console.error("Failed to parse budget from localStorage", e);
                initialData = initialBudget; // Fallback to default on error
            }
        }
        return initialData;
    });

    // Persist budget changes to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budget));
        }
    }, [budget]);

    const setBudget = useCallback((newBudget: BudgetItems) => {
        setBudgetInternal(newBudget);
    }, []);

    // Calculate totals using useMemo
    const totalBudgetedIncome = useMemo(() =>
        budget.recurringFixedIncome + budget.recurringVariableIncome + budget.oneTimeIncome,
        [budget.recurringFixedIncome, budget.recurringVariableIncome, budget.oneTimeIncome]
    );

    const totalBudgetedExpenses = useMemo(() =>
        budget.recurringFixedExpenses + budget.recurringVariableExpenses + budget.oneTimeFixedExpenses + budget.oneTimeVariableExpenses,
        [budget.recurringFixedExpenses, budget.recurringVariableExpenses, budget.oneTimeFixedExpenses, budget.oneTimeVariableExpenses]
    );

     const totalBudgetedNet = useMemo(() =>
        totalBudgetedIncome - totalBudgetedExpenses,
        [totalBudgetedIncome, totalBudgetedExpenses]
    );

    const contextValue = useMemo(() => ({
        budget,
        setBudget,
        totalBudgetedIncome,
        totalBudgetedExpenses,
        totalBudgetedNet,
    }), [budget, setBudget, totalBudgetedIncome, totalBudgetedExpenses, totalBudgetedNet]);

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
