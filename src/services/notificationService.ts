// src/services/notificationService.ts
 'use client';

 import { useNotificationStore } from "@/store/notificationStore";
 import { useBudgetStore } from "@/store/budgetStore";
 import { useTransactionsStore } from "@/store/transactionsStore";
 import { useEffect, useMemo } from "react";
 import { formatCurrency } from "@/lib/utils";
 import { startOfMonth, endOfMonth } from 'date-fns';
 import type { NotificationType } from '@/lib/types';
 import { logInfo, logWarn, logError } from '@/lib/logger';
 import { useAuth } from "@clerk/nextjs";

 // Removed CLERK_DISABLED_PLACEHOLDER_USER_ID

 const BUDGET_WARNING_THRESHOLD_PERCENT = 0.9;
 const OVERBUDGET_THRESHOLD_PERCENT = 1.0;

 export function useBudgetNotifications() {
     const addNotification = useNotificationStore(state => state.addNotification);
     const budgetItems = useBudgetStore(state => state.budgetItems);
     const allTransactions = useTransactionsStore(state => state.transactions);
     const existingNotifications = useNotificationStore(state => state.notifications);
     const { userId, isSignedIn } = useAuth(); // Use actual userId from Clerk

     const monthlyAnalysis = useMemo(() => {
         const now = new Date();
         const start = startOfMonth(now);
         const end = endOfMonth(now);

         const actualSpendingByCategory: Record<string, number> = {};
         const transactionsThisMonth = allTransactions.filter(tx => {
             const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
              if (isNaN(txDate.getTime())) return false;
             return txDate >= start && txDate <= end && tx.amount < 0;
         });

         transactionsThisMonth.forEach(tx => {
            const budgetItemMatch = budgetItems.find(bi =>
                bi.description.toLowerCase() === tx.description.toLowerCase() &&
                 (bi.category === 'recurring-expense' || bi.category === 'one-time-expense')
            );
             const key = budgetItemMatch ? `${budgetItemMatch.category}-${budgetItemMatch.description}` : tx.frequency || 'uncategorized';


            if (!actualSpendingByCategory[key]) {
                 actualSpendingByCategory[key] = 0;
            }
            actualSpendingByCategory[key] += Math.abs(tx.amount);
         });

         const budgetByCategory: Record<string, number> = {};
         budgetItems
             .filter(item => item.category === 'recurring-expense' || item.category === 'one-time-expense')
             .forEach(item => {
                 const key = `${item.category}-${item.description}`;
                 budgetByCategory[key] = item.amount;
             });

         return { actualSpendingByCategory, budgetByCategory };
     }, [allTransactions, budgetItems]);

     useEffect(() => {
         if (!isSignedIn || !userId) return; // Don't run if user is not signed in

         const { actualSpendingByCategory, budgetByCategory } = monthlyAnalysis;
         const generatedNotificationKeys = new Set<string>();

         for (const budgetKey in budgetByCategory) {
             const budgetedAmount = budgetByCategory[budgetKey];
             const actualAmount = actualSpendingByCategory[budgetKey] || 0;
              const description = budgetKey.substring(budgetKey.indexOf('-') + 1);

             if (budgetedAmount <= 0) continue;

             const spendingRatio = actualAmount / budgetedAmount;
             const logContext = { userId, budgetCategory: description, budgetedAmount, actualAmount, spendingRatio };

             if (spendingRatio >= OVERBUDGET_THRESHOLD_PERCENT) {
                 const notifKey = `overbudget-${budgetKey}`;
                 const notifTitle = 'Over Budget Alert';
                  const existingUnread = existingNotifications.find(n =>
                       n.message.includes(`"${description}"`) &&
                       n.title === notifTitle &&
                       n.type === 'budget' &&
                       !n.read
                  );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'budget',
                         title: notifTitle,
                         message: `You've spent ${formatCurrency(actualAmount)} out of ${formatCurrency(budgetedAmount)} budgeted for "${description}".`,
                         link: '/budget',
                     });
                      logError(`Over budget for "${description}"`, undefined, logContext);
                      generatedNotificationKeys.add(notifKey);
                 }
             }
             else if (spendingRatio >= BUDGET_WARNING_THRESHOLD_PERCENT) {
                 const notifKey = `warning-${budgetKey}`;
                 const notifTitle = 'Budget Warning';
                 const existingUnread = existingNotifications.find(n =>
                     n.message.includes(`"${description}"`) &&
                     n.title === notifTitle &&
                     n.type === 'warning' &&
                     !n.read
                 );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'warning',
                         title: notifTitle,
                         message: `Approaching budget limit for "${description}". Spent ${formatCurrency(actualAmount)} of ${formatCurrency(budgetedAmount)}.`,
                         link: '/budget',
                     });
                      logWarn(`Budget warning for "${description}"`, logContext);
                      generatedNotificationKeys.add(notifKey);
                 }
             }
         }
     }, [monthlyAnalysis, addNotification, userId, isSignedIn, existingNotifications]); // Added isSignedIn

     return null;
 }

 export function triggerCollaborationNotification(sharerName: string, weekKey: string, recipientUserId: string) {
     const addNotification = useNotificationStore.getState().addNotification;
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
