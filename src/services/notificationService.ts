
// src/services/notificationService.ts
 'use client';

 import { useNotificationStore } from "@/store/notificationStore";
 import { useBudgetStore } from "@/store/budgetStore";
 import { useTransactionsStore } from "@/store/transactionsStore";
 import { useEffect, useMemo } from "react";
 import { formatCurrency } from "@/lib/utils";
 import { startOfMonth, endOfMonth, format as formatDateFns } from 'date-fns'; // Renamed format to avoid conflict
 import type { NotificationType } from '@/lib/types';
 import { logInfo, logWarn, logError } from '@/lib/logger';
 import { useAuth } from "@clerk/nextjs";


 const BUDGET_WARNING_THRESHOLD_PERCENT = 0.9;
 const OVERBUDGET_THRESHOLD_PERCENT = 1.0;

 export function useBudgetNotifications() {
     const addNotification = useNotificationStore(state => state.addNotification);
     const budgetItems = useBudgetStore(state => state.budgetItems);
     const budgetPeriod = useBudgetStore(state => state.budgetPeriod); // Get current budget period
     const allTransactions = useTransactionsStore(state => state.transactions);
     const existingNotifications = useNotificationStore(state => state.notifications);
     const { userId, isSignedIn } = useAuth();


     const monthlyAnalysis = useMemo(() => {
         if (!budgetPeriod) return { actualSpendingByCategory: {}, budgetByCategory: {} }; // Handle undefined budgetPeriod

         const [year, month] = budgetPeriod.split('-').map(Number);
         const start = startOfMonth(new Date(year, month - 1));
         const end = endOfMonth(new Date(year, month - 1));

         const actualSpendingByCategory: Record<string, number> = {};
         const transactionsThisMonth = allTransactions.filter(tx => {
             const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
              if (isNaN(txDate.getTime())) return false;
             return txDate >= start && txDate <= end && tx.amount < 0;
         });

         transactionsThisMonth.forEach(tx => {
            const budgetItemMatch = budgetItems.find(bi =>
                bi.description.toLowerCase() === tx.description.toLowerCase() &&
                bi.period === budgetPeriod && // Match period
                 (bi.category === 'recurring-expense' || bi.category === 'one-time-expense')
            );
            // Key by budget item description if matched, otherwise by transaction description for unplanned
            const key = budgetItemMatch ? budgetItemMatch.description : `unplanned-${tx.description}`;


            if (!actualSpendingByCategory[key]) {
                 actualSpendingByCategory[key] = 0;
            }
            actualSpendingByCategory[key] += Math.abs(tx.amount);
         });

         const budgetByCategory: Record<string, { amount: number; category: string }> = {};
         budgetItems
             .filter(item => item.period === budgetPeriod && (item.category === 'recurring-expense' || item.category === 'one-time-expense'))
             .forEach(item => {
                 budgetByCategory[item.description] = { amount: item.amount, category: item.category };
             });

         return { actualSpendingByCategory, budgetByCategory };
     }, [allTransactions, budgetItems, budgetPeriod]); // Added budgetPeriod dependency

     useEffect(() => {
         if (!isSignedIn || !userId) return;

         const { actualSpendingByCategory, budgetByCategory } = monthlyAnalysis;
         const generatedNotificationKeys = new Set<string>();

         for (const budgetItemDescription in budgetByCategory) {
             const budgetedAmount = budgetByCategory[budgetItemDescription].amount;
             // Try to find actual spending using the budget item description as the key
             const actualAmount = actualSpendingByCategory[budgetItemDescription] || 0;

             if (budgetedAmount <= 0) continue;

             const spendingRatio = actualAmount / budgetedAmount;
             const logContext = { userId, budgetCategory: budgetItemDescription, budgetedAmount, actualAmount, spendingRatio };


             if (spendingRatio >= OVERBUDGET_THRESHOLD_PERCENT) {
                 const notifKey = `overbudget-${budgetPeriod}-${budgetItemDescription}`; // Include period in key
                 const notifTitle = 'Over Budget Alert';

                  const existingUnread = existingNotifications.find(n =>
                       n.message.includes(`"${budgetItemDescription}"`) &&
                       n.title === notifTitle &&
                       n.type === 'budget' &&
                       !n.read
                  );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'budget',
                         title: notifTitle,
                         message: `You've spent ${formatCurrency(actualAmount)} out of ${formatCurrency(budgetedAmount)} budgeted for "${budgetItemDescription}" in ${formatDateFns(startOfMonth(new Date(budgetPeriod.split('-')[0], parseInt(budgetPeriod.split('-')[1])-1)), 'MMMM yyyy')}.`,
                         link: '/budget',
                     });
                      logError(`Over budget for "${budgetItemDescription}"`, undefined, logContext, userId);
                      generatedNotificationKeys.add(notifKey);
                 }
             }

             else if (spendingRatio >= BUDGET_WARNING_THRESHOLD_PERCENT) {
                 const notifKey = `warning-${budgetPeriod}-${budgetItemDescription}`; // Include period in key
                 const notifTitle = 'Budget Warning';

                 const existingUnread = existingNotifications.find(n =>
                     n.message.includes(`"${budgetItemDescription}"`) &&
                     n.title === notifTitle &&
                     n.type === 'warning' &&
                     !n.read
                 );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'warning',
                         title: notifTitle,
                         message: `Approaching budget limit for "${budgetItemDescription}". Spent ${formatCurrency(actualAmount)} of ${formatCurrency(budgetedAmount)} in ${formatDateFns(startOfMonth(new Date(budgetPeriod.split('-')[0], parseInt(budgetPeriod.split('-')[1])-1)), 'MMMM yyyy')}.`,
                         link: '/budget',
                     });
                      logWarn(`Budget warning for "${budgetItemDescription}"`, logContext, userId);
                      generatedNotificationKeys.add(notifKey);
                 }
             }
         }
     }, [monthlyAnalysis, addNotification, userId, isSignedIn, existingNotifications, budgetPeriod]);

     return null;
 }

 export function triggerCollaborationNotification(sharerName: string, weekKey: string, recipientUserId: string, sharerId?: string | null) {
     const addNotification = useNotificationStore.getState().addNotification;
     const currentUserIdForLog = sharerId || 'system_or_unknown_sharer';
     addNotification({
         type: 'collaboration',
         title: 'Review Shared With You',
         message: `${sharerName || 'A user'} shared their weekly review (${weekKey}) with you.`,
         link: '/weekly-review?tab=shared',
     });

      logInfo(`Weekly review ${weekKey} shared by ${sharerName} with user ${recipientUserId}`, {
          sharerName,
          weekKey,
          recipientUserId,
          type: 'collaboration_received'
      }, currentUserIdForLog);
 }

 export function triggerAppUpdateNotification(title: string, message: string, link?: string, triggeredByUserId?: string | null) {
     const addNotification = useNotificationStore.getState().addNotification;
     const currentUserIdForLog = triggeredByUserId || 'system';
     const newNotif = addNotification({
         type: 'update',
         title: title,
         message: message,
         link: link,
     });
      logInfo(`App update notification triggered: ${title}`, { notificationId: newNotif.id, message, link }, currentUserIdForLog);
 }

