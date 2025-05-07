
// src/services/notificationService.ts
'use client';

import { useNotificationStore } from "@/store/notificationStore";
import { useBudgetStore } from "@/store/budgetStore";
import { useTransactionsStore } from "@/store/transactionsStore";
import { useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import type { TransactionWithId, BudgetItem, BudgetItemCategory } from "@/lib/types";
import { logInfo, logWarn, logError } from '@/lib/logger';
// import { useAuth } from "@clerk/nextjs/client"; // Clerk disabled

const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'local-user-wo-clerk';

const BUDGET_WARNING_THRESHOLD_PERCENT = 0.9;
const OVERBUDGET_THRESHOLD_PERCENT = 1.0;

export function useBudgetNotifications() {
    const addNotification = useNotificationStore(state => state.addNotification);
    const budgetItems = useBudgetStore(state => state.budgetItems);
    const allTransactions = useTransactionsStore(state => state.transactions);
    // const { userId } = useAuth(); // Clerk disabled
    const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

    const monthlyAnalysis = useMemo(() => {
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        const daysInPeriod = differenceInDays(end, start) + 1;
        const budgetMultiplier = 1;

        const actualSpendingByCategory: Record<string, number> = {};
        const transactionsThisMonth = allTransactions.filter(tx => {
            const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
            return txDate >= start && txDate <= end && tx.amount < 0;
        });

        transactionsThisMonth.forEach(tx => {
            const category: BudgetItemCategory | null =
                tx.frequency === 'recurring' ? 'recurring-expense' :
                tx.frequency === 'one-time' ? 'one-time-expense' : null;

            if (category) {
                // Try to find a matching budget item description for more specific keying
                const budgetItemMatch = budgetItems.find(bi =>
                    bi.description.toLowerCase() === tx.description.toLowerCase() &&
                    (bi.category === 'recurring-expense' || bi.category === 'one-time-expense')
                );
                // Use specific key if match found, otherwise fallback to general category key (less precise)
                 const key = budgetItemMatch ? `${budgetItemMatch.category}-${budgetItemMatch.description}` : category;

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
                const key = `${item.category}-${item.description}`; // Key by category and description
                budgetByCategory[key] = item.amount * budgetMultiplier; // Use full monthly budget
            });

        return { actualSpendingByCategory, budgetByCategory };
    }, [allTransactions, budgetItems]);

    useEffect(() => {
        const { actualSpendingByCategory, budgetByCategory } = monthlyAnalysis;
        const loggedNotificationKeys = new Set<string>();
        const existingNotifications = useNotificationStore.getState().notifications; // Get current notifications

        for (const budgetKey in budgetByCategory) {
            const budgetedAmount = budgetByCategory[budgetKey];
            const actualAmount = actualSpendingByCategory[budgetKey] || 0;
            const [category, description] = budgetKey.split(/-(.*)/s); // Split only on first hyphen

            if (budgetedAmount <= 0) continue; // Skip checks for zero or negative budgets

            const spendingRatio = actualAmount / budgetedAmount;
            const logContext = { userId, budgetCategory: description, budgetedAmount, actualAmount, spendingRatio };

            // Over Budget Check
            if (spendingRatio >= OVERBUDGET_THRESHOLD_PERCENT) {
                const notifKey = `overbudget-${budgetKey}`;
                // Check if a similar notification already exists and is not read
                const existingUnread = existingNotifications.find(n => n.message.includes(`"${description}"`) && n.type === 'budget' && !n.read);
                if (!existingUnread) { // Only add if no existing unread notification for this item
                    addNotification({
                        type: 'budget',
                        title: 'Over Budget Alert',
                        message: `You've spent ${formatCurrency(actualAmount)} out of ${formatCurrency(budgetedAmount)} budgeted for "${description}".`,
                        link: '/budget',
                    });
                    if (!loggedNotificationKeys.has(notifKey)) {
                        logError(`Over budget for "${description}"`, undefined, logContext);
                        loggedNotificationKeys.add(notifKey);
                    }
                }
            }
            // Budget Warning Check (only if not already over budget)
            else if (spendingRatio >= BUDGET_WARNING_THRESHOLD_PERCENT) {
                const notifKey = `warning-${budgetKey}`;
                 // Check if a similar notification already exists and is not read
                 const existingUnread = existingNotifications.find(n => n.message.includes(`"${description}"`) && n.type === 'warning' && !n.read);
                 if (!existingUnread) { // Only add if no existing unread warning
                    addNotification({
                        type: 'warning',
                        title: 'Budget Warning',
                        message: `Approaching budget limit for "${description}". Spent ${formatCurrency(actualAmount)} of ${formatCurrency(budgetedAmount)}.`,
                        link: '/budget',
                    });
                    if (!loggedNotificationKeys.has(notifKey)) {
                        logWarn(`Budget warning for "${description}"`, logContext);
                        loggedNotificationKeys.add(notifKey);
                    }
                }
            }
        }
    }, [monthlyAnalysis, addNotification, userId]); // userId included for logging context

    return null; // This hook doesn't render anything
}

// Function to trigger collaboration notifications (remains mostly the same)
export function triggerCollaborationNotification(sharerName: string, weekKey: string, recipientUserId: string) {
    const addNotification = useNotificationStore.getState().addNotification;
    addNotification({
        type: 'collaboration',
        title: 'Review Shared With You',
        message: `${sharerName || 'A user'} shared their weekly review (${weekKey}) with you.`,
        link: '/weekly-review?tab=shared', // Link to the shared tab
    });
    // Log this event to Logtail
    logInfo(`Weekly review ${weekKey} shared by ${sharerName} with user ${recipientUserId}`, {
        sharerName,
        weekKey,
        recipientUserId,
        type: 'collaboration_received'
    });
}

// Function to trigger app update notifications (remains the same)
export function triggerAppUpdateNotification(title: string, message: string, link?: string) {
    const addNotification = useNotificationStore.getState().addNotification;
    const newNotif = addNotification({
        type: 'update',
        title: title,
        message: message,
        link: link,
    });
    logInfo(`App update notification triggered: ${title}`, { notificationId: newNotif.id, message, link });
}
