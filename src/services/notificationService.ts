// src/services/notificationService.ts
'use client'; // Mark as client component if using hooks inside

import { useNotificationStore } from "@/store/notificationStore";
import { useBudgetStore, selectTotalBudgetedExpenses, selectNetBudgeted } from "@/store/budgetStore";
import { useTransactionsStore } from "@/store/transactionsStore";
import { useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/utils"; // Import the shared utility function
import { startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import type { TransactionWithId, BudgetItem, BudgetItemCategory } from "@/lib/types";

// Thresholds for budget warnings (adjust as needed)
const BUDGET_WARNING_THRESHOLD_PERCENT = 0.9; // Warn when spending reaches 90% of budget
const OVERBUDGET_THRESHOLD_PERCENT = 1.0; // Notify when over budget

/**
 * React Hook to manage and trigger budget-related notifications.
 * Must be used within a component wrapped by necessary context providers if needed,
 * or preferably uses Zustand stores directly.
 */
export function useBudgetNotifications() {
    const addNotification = useNotificationStore(state => state.addNotification);
    const budgetItems = useBudgetStore(state => state.budgetItems);
    const allTransactions = useTransactionsStore(state => state.transactions);

    // Calculate current month's actual spending and prorated budget
    const monthlyAnalysis = useMemo(() => {
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        const daysInPeriod = differenceInDays(end, start) + 1;
        const daysInAvgMonth = 30.44;
        const budgetMultiplier = daysInPeriod / daysInAvgMonth; // Use 1 for full month budget check

        const actualSpendingByCategory: Record<string, number> = {};
        const transactionsThisMonth = allTransactions.filter(tx => {
            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
            return txDate >= start && txDate <= end && tx.amount < 0; // Only expenses
        });

        transactionsThisMonth.forEach(tx => {
            // Simplified category mapping for notification purposes
            const category: BudgetItemCategory | null =
                tx.frequency === 'recurring' ? 'recurring-expense' :
                tx.frequency === 'one-time' ? 'one-time-expense' : null; // Defaulting for notification simplicity

            if (category) {
                // Group by budget item description if possible, else by general category
                const budgetItemMatch = budgetItems.find(bi => bi.description.toLowerCase() === tx.description.toLowerCase() && (bi.category === 'recurring-expense' || bi.category === 'one-time-expense'));
                const key = budgetItemMatch ? `${budgetItemMatch.category}-${budgetItemMatch.description}` : category; // Use category as fallback key

                if (!actualSpendingByCategory[key]) {
                    actualSpendingByCategory[key] = 0;
                }
                actualSpendingByCategory[key] += Math.abs(tx.amount);
            }
        });

        const budgetByCategory: Record<string, number> = {};
         budgetItems
             .filter(item => item.category === 'recurring-expense' || item.category === 'one-time-expense')
             .forEach(item => {
                 const key = `${item.category}-${item.description}`;
                 budgetByCategory[key] = item.amount; // Use full monthly budget amount for checks
             });

        return { actualSpendingByCategory, budgetByCategory };

    }, [allTransactions, budgetItems]);

    // Effect to check budget status and add notifications
    useEffect(() => {
        const { actualSpendingByCategory, budgetByCategory } = monthlyAnalysis;
        const notificationCandidates: { key: string; type: 'warning' | 'error'; message: string }[] = [];

        // Check each budgeted category
        for (const budgetKey in budgetByCategory) {
             const budgetedAmount = budgetByCategory[budgetKey];
             const actualAmount = actualSpendingByCategory[budgetKey] || 0;
             const [category, description] = budgetKey.split(/-(.*)/s); // Extract category and description

            if (budgetedAmount <= 0) continue; // Skip if no budget set

            const spendingRatio = actualAmount / budgetedAmount;

            if (spendingRatio >= OVERBUDGET_THRESHOLD_PERCENT) {
                notificationCandidates.push({
                    key: `overbudget-${budgetKey}`,
                    type: 'error',
                    message: `You've spent ${formatCurrency(actualAmount)} out of ${formatCurrency(budgetedAmount)} budgeted for "${description}".`,
                });
            } else if (spendingRatio >= BUDGET_WARNING_THRESHOLD_PERCENT) {
                 notificationCandidates.push({
                     key: `warning-${budgetKey}`,
                     type: 'warning',
                     message: `Approaching budget limit for "${description}". Spent ${formatCurrency(actualAmount)} of ${formatCurrency(budgetedAmount)}.`,
                 });
            }
        }

        // TODO: Add logic to prevent adding duplicate notifications within a short timeframe.
        // This could involve checking existing notifications in the store or using local component state.

        // Add notifications (basic implementation, needs duplicate prevention)
        notificationCandidates.forEach(candidate => {
            // Basic check: Don't add if a similar notification already exists (improve this logic)
            const existing = useNotificationStore.getState().notifications.find(n => n.message.includes(`for "${candidate.key.split(/-(.*)/s)[1]}"`));
            if (!existing || existing.type !== candidate.type) { // Add if no similar exists or if type changed (e.g., warning -> error)
                addNotification({
                    type: candidate.type === 'error' ? 'budget' : 'warning', // Use specific 'budget' type for errors
                    title: candidate.type === 'error' ? 'Over Budget Alert' : 'Budget Warning',
                    message: candidate.message,
                    link: '/budget', // Link to budget page
                });
            }
        });

    }, [monthlyAnalysis, addNotification]); // Rerun when analysis changes

    // This hook doesn't render anything itself
    return null;
}

// Add other notification generation functions here if needed
// e.g., collaboration notifications

/**
 * Triggers a notification when a review is shared.
 * @param sharerName Name of the user who shared the review.
 * @param weekKey The key of the shared week.
 */
export function triggerCollaborationNotification(sharerName: string, weekKey: string) {
    const addNotification = useNotificationStore.getState().addNotification;
    addNotification({
        type: 'collaboration',
        title: 'Review Shared',
        message: `${sharerName || 'A user'} shared their weekly review (${weekKey}) with you.`,
        link: '/weekly-review?tab=shared', // Link to the shared tab
    });
}
