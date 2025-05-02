// src/contexts/BudgetContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback, useEffect } from 'react';
import type { BudgetItem, BudgetItemCategory } from '@/lib/types'; // Import new types

// Generate unique IDs
const generateId = (): string => `budget_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const BUDGET_ITEMS_STORAGE_KEY = 'debtConqueror_budgetItems';

interface BudgetContextType {
  budgetItems: BudgetItem[];
  addBudgetItem: (itemData: Omit<BudgetItem, 'id'>) => BudgetItem;
  updateBudgetItem: (updatedItem: BudgetItem) => void;
  deleteBudgetItem: (id: string) => void;
  // Calculated summary values
  totalIncome: number;
  totalRecurringExpenses: number;
  totalOneTimeExpenses: number;
  totalGoals: number;
  totalExpenses: number;
  netBudgeted: number; // Income - Expenses - Goals
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

// Helper to filter and sum items by category
const sumByCategory = (items: BudgetItem[], category: BudgetItemCategory): number => {
    return items.filter(item => item.category === category).reduce((sum, item) => sum + item.amount, 0);
};

// Helper to sort budget items: Income first, then expenses, then goals. Alphabetical within category.
const sortBudgetItems = (items: BudgetItem[]): BudgetItem[] => {
    const categoryOrder: Record<BudgetItemCategory, number> = {
        'income': 1,
        'recurring-expense': 2,
        'one-time-expense': 3,
        'goal': 4,
    };
    return [...items].sort((a, b) => {
        const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
        if (categoryDiff !== 0) return categoryDiff;
        return a.description.localeCompare(b.description);
    });
}

export const BudgetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [budgetItems, setBudgetItemsInternal] = useState<BudgetItem[]>(() => {
        let initialData: BudgetItem[] = [];
        if (typeof window !== 'undefined') {
            const storedBudgetItems = localStorage.getItem(BUDGET_ITEMS_STORAGE_KEY);
            try {
                initialData = storedBudgetItems ? JSON.parse(storedBudgetItems) : [];
            } catch (e) {
                console.error("Failed to parse budget items from localStorage", e);
                initialData = []; // Fallback to empty array on error
            }
        }
        return sortBudgetItems(initialData); // Sort initial load
    });

    // Persist budget changes to localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(BUDGET_ITEMS_STORAGE_KEY, JSON.stringify(budgetItems));
        }
    }, [budgetItems]);

    // --- CRUD Operations ---
    const addBudgetItem = useCallback((itemData: Omit<BudgetItem, 'id'>): BudgetItem => {
        const newItem: BudgetItem = {
            id: generateId(),
            ...itemData,
        };
        setBudgetItemsInternal(prev => sortBudgetItems([...prev, newItem]));
        return newItem;
    }, []);

    const updateBudgetItem = useCallback((updatedItem: BudgetItem) => {
        setBudgetItemsInternal(prev => sortBudgetItems(
            prev.map(item => (item.id === updatedItem.id ? updatedItem : item))
        ));
    }, []);

    const deleteBudgetItem = useCallback((id: string) => {
        setBudgetItemsInternal(prev => sortBudgetItems(
            prev.filter(item => item.id !== id)
        ));
    }, []);

    // --- Calculate Summary Totals using useMemo ---
    const totalIncome = useMemo(() => sumByCategory(budgetItems, 'income'), [budgetItems]);
    const totalRecurringExpenses = useMemo(() => sumByCategory(budgetItems, 'recurring-expense'), [budgetItems]);
    const totalOneTimeExpenses = useMemo(() => sumByCategory(budgetItems, 'one-time-expense'), [budgetItems]);
    const totalGoals = useMemo(() => sumByCategory(budgetItems, 'goal'), [budgetItems]);

    const totalExpenses = useMemo(() => totalRecurringExpenses + totalOneTimeExpenses, [totalRecurringExpenses, totalOneTimeExpenses]);

    const netBudgeted = useMemo(() => totalIncome - totalExpenses - totalGoals, [totalIncome, totalExpenses, totalGoals]);


    const contextValue = useMemo(() => ({
        budgetItems,
        addBudgetItem,
        updateBudgetItem,
        deleteBudgetItem,
        totalIncome,
        totalRecurringExpenses,
        totalOneTimeExpenses,
        totalGoals,
        totalExpenses,
        netBudgeted,
    }), [
        budgetItems, addBudgetItem, updateBudgetItem, deleteBudgetItem,
        totalIncome, totalRecurringExpenses, totalOneTimeExpenses, totalGoals, totalExpenses, netBudgeted
    ]);

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