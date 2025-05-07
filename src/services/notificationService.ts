// src/services/notificationService.ts
'use client';

import { useNotificationStore } from "@/store/notificationStore";
import { useBudgetStore } from "@/store/budgetStore";
import { useTransactionsStore } from "@/store/transactionsStore";
import { useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import type { TransactionWithId, BudgetItem, BudgetItemCategory } from "@/lib/types";
import { logInfo, logWarn, logError } from '@/lib/logger'; // Import Logtail helpers
import { useAuth } from "@clerk/nextjs/client"; // Import useAuth for userId

const BUDGET_WARNING_THRESHOLD_PERCENT = 0.9;
const OVERBUDGET_THRESHOLD_PERCENT = 1.0;

export function useBudgetNotifications() {
    const addNotification = useNotificationStore(state => state.addNotification);
    const budgetItems = useBudgetStore(state => state.budgetItems);
    const allTransactions = useTransactionsStore(state => state.transactions);
    const { userId } = useAuth(); // Get current userId for logging context

    const monthlyAnalysis = useMemo(() => {
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        const daysInPeriod = differenceInDays(end, start) + 1;
        const budgetMultiplier = 1; // For notifications, typically check against full monthly budget

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
                const budgetItemMatch = budgetItems.find(bi => bi.description.toLowerCase() === tx.description.toLowerCase() && (bi.category === 'recurring-expense' || bi.category === 'one-time-expense'));
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
                const key = `${item.category}-${item.description}`;
                budgetByCategory[key] = item.amount * budgetMultiplier;
            });

        return { actualSpendingByCategory, budgetByCategory };
    }, [allTransactions, budgetItems]);

    useEffect(() => {
        const { actualSpendingByCategory, budgetByCategory } = monthlyAnalysis;
        const loggedNotificationKeys = new Set<string>(); // To prevent duplicate Logtail logs per session

        for (const budgetKey in budgetByCategory) {
            const budgetedAmount = budgetByCategory[budgetKey];
            const actualAmount = actualSpendingByCategory[budgetKey] || 0;
            const [category, description] = budgetKey.split(/-(.*)/s);

            if (budgetedAmount <= 0) continue;

            const spendingRatio = actualAmount / budgetedAmount;
            const logContext = { userId, budgetCategory: description, budgetedAmount, actualAmount, spendingRatio };

            if (spendingRatio >= OVERBUDGET_THRESHOLD_PERCENT) {
                const notifKey = `overbudget-${budgetKey}`;
                if (!useNotificationStore.getState().notifications.find(n => n.message.includes(`"${description}"`) && n.type === 'budget')) {
                    addNotification({
                        type: 'budget', // Specific type for over budget
                        title: 'Over Budget Alert',
                        message: `You've spent ${formatCurrency(actualAmount)} out of ${formatCurrency(budgetedAmount)} budgeted for "${description}".`,
                        link: '/budget',
                    });
                    if (!loggedNotificationKeys.has(notifKey)) {
                        logError(`Over budget for "${description}"`, undefined, logContext);
                        loggedNotificationKeys.add(notifKey);
                    }
                }
            } else if (spendingRatio >= BUDGET_WARNING_THRESHOLD_PERCENT) {
                const notifKey = `warning-${budgetKey}`;
                 if (!useNotificationStore.getState().notifications.find(n => n.message.includes(`"${description}"`) && n.type === 'warning')) {
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
    }, [monthlyAnalysis, addNotification, userId]);

    return null;
}

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
