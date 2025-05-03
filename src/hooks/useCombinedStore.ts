
// src/hooks/useCombinedStore.ts
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useWeeklyReviewStore } from '@/store/weeklyReviewStore'; // Import the new store
import { useMemo } from 'react';

/**
 * Custom hook to combine state and actions from all Zustand stores.
 * This simplifies access in components that need data from multiple stores.
 */
export const useCombinedStore = () => {
    const transactionsState = useTransactionsStore();
    const debtState = useDebtStore();
    const statementState = useStatementStore();
    const budgetState = useBudgetStore();
    const weeklyReviewState = useWeeklyReviewStore(); // Include weekly review store

    // Memoize the combined state to prevent unnecessary re-renders
    const combinedState = useMemo(() => ({
        // Transactions
        transactions: transactionsState.transactions,
        addTransaction: transactionsState.addTransaction,
        updateTransaction: transactionsState.updateTransaction,
        deleteTransaction: transactionsState.deleteTransaction,
        importTransactionsBatch: transactionsState.importTransactionsBatch,

        // Debt
        debts: debtState.debts,
        addDebt: debtState.addDebt,
        updateDebt: debtState.updateDebt,
        deleteDebt: debtState.deleteDebt,
        importDebtsBatch: debtState.importDebtsBatch,

        // Statement Items
        assetItems: statementState.assetItems,
        otherLiabilityItems: statementState.otherLiabilityItems,
        startDate: statementState.startDate, // Expose dates
        endDate: statementState.endDate,
        setStartDate: statementState.setStartDate,
        setEndDate: statementState.setEndDate,
        setAssetItems: statementState.setAssetItems,
        setOtherLiabilityItems: statementState.setOtherLiabilityItems,
        addAssetItem: statementState.addAssetItem,
        addOtherLiabilityItem: statementState.addOtherLiabilityItem,
        updateAssetItem: statementState.updateAssetItem,
        updateOtherLiabilityItem: statementState.updateOtherLiabilityItem,
        deleteAssetItem: statementState.deleteAssetItem,
        deleteOtherLiabilityItem: statementState.deleteOtherLiabilityItem,

        // Budget Items
        budgetItems: budgetState.budgetItems,
        addBudgetItem: budgetState.addBudgetItem,
        updateBudgetItem: budgetState.updateBudgetItem,
        deleteBudgetItem: budgetState.deleteBudgetItem,

        // Weekly Review
        reviews: weeklyReviewState.reviews,
        setJournalEntry: weeklyReviewState.setJournalEntry,
        getReviewForWeek: weeklyReviewState.getReviewForWeek,

    }), [transactionsState, debtState, statementState, budgetState, weeklyReviewState]); // Add weekly review state dependency

    return combinedState;
};

// You can also export selectors that combine data from multiple stores if needed
// For example: Calculate Net Worth using data from statement and debt stores
export const useNetWorth = () => {
    const totalAssets = useStatementStore(state => state.assetItems.reduce((sum, item) => sum + item.amount, 0));
    const totalDebt = useDebtStore(state => state.debts.reduce((sum, debt) => sum + debt.principal, 0));
    const totalOtherLiabilities = useStatementStore(state => state.otherLiabilityItems.reduce((sum, item) => sum + item.amount, 0));

    return totalAssets - totalDebt - totalOtherLiabilities;
};
