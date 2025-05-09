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
     const { userId, isSignedIn } = useAuth(); // Use actual userId and isSignedIn from Clerk

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
         if (!isSignedIn || !userId) return; // Don't run if user is not signed in or userId is not available

         const { actualSpendingByCategory, budgetByCategory } = monthlyAnalysis;
         const generatedNotificationKeys = new Set<string>(); // To avoid duplicate notifications in one cycle

         for (const budgetKey in budgetByCategory) {
             const budgetedAmount = budgetByCategory[budgetKey];
             const actualAmount = actualSpendingByCategory[budgetKey] || 0;
              const description = budgetKey.substring(budgetKey.indexOf('-') + 1);

             if (budgetedAmount <= 0) continue; // Skip if no budget allocated

             const spendingRatio = actualAmount / budgetedAmount;
             const logContext = { userId, budgetCategory: description, budgetedAmount, actualAmount, spendingRatio };

             // Check for Over Budget
             if (spendingRatio >= OVERBUDGET_THRESHOLD_PERCENT) {
                 const notifKey = `overbudget-${budgetKey}`;
                 const notifTitle = 'Over Budget Alert';
                  // Check if an unread "over budget" notification for this specific item already exists
                  const existingUnread = existingNotifications.find(n =>
                       n.message.includes(`"${description}"`) && // More specific message check
                       n.title === notifTitle &&
                       n.type === 'budget' && // Ensure it's a budget alert type
                       !n.read
                  );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'budget', // Specific type for over-budget
                         title: notifTitle,
                         message: `You've spent ${formatCurrency(actualAmount)} out of ${formatCurrency(budgetedAmount)} budgeted for "${description}".`,
                         link: '/budget', // Link to budget page
                     });
                      logError(`Over budget for "${description}"`, undefined, logContext);
                      generatedNotificationKeys.add(notifKey);
                 }
             }
             // Check for Budget Warning (only if not already over budget)
             else if (spendingRatio >= BUDGET_WARNING_THRESHOLD_PERCENT) {
                 const notifKey = `warning-${budgetKey}`;
                 const notifTitle = 'Budget Warning';
                 // Check if an unread "warning" notification for this specific item already exists
                 const existingUnread = existingNotifications.find(n =>
                     n.message.includes(`"${description}"`) && // More specific message check
                     n.title === notifTitle &&
                     n.type === 'warning' && // Ensure it's a warning type
                     !n.read
                 );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'warning', // Specific type for warning
                         title: notifTitle,
                         message: `Approaching budget limit for "${description}". Spent ${formatCurrency(actualAmount)} of ${formatCurrency(budgetedAmount)}.`,
                         link: '/budget', // Link to budget page
                     });
                      logWarn(`Budget warning for "${description}"`, logContext);
                      generatedNotificationKeys.add(notifKey);
                 }
             }
         }
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [monthlyAnalysis, addNotification, userId, isSignedIn, existingNotifications]); // Added isSignedIn and existingNotifications

     return null; // This hook doesn't render anything
 }

 // Function to trigger a collaboration notification
 export function triggerCollaborationNotification(sharerName: string, weekKey: string, recipientUserId: string) {
     const addNotification = useNotificationStore.getState().addNotification;
     addNotification({
         type: 'collaboration',
         title: 'Review Shared With You',
         message: `${sharerName || 'A user'} shared their weekly review (${weekKey}) with you.`,
         link: '/weekly-review?tab=shared', // Link to the shared tab of weekly review
     });
      // Log this action, including the recipient
      logInfo(`Weekly review ${weekKey} shared by ${sharerName} with user ${recipientUserId}`, {
          sharerName,
          weekKey,
          recipientUserId, // Important for tracking who received the notification
          type: 'collaboration_received' // Differentiate from a general collaboration event if needed
      });
 }

 // Function to trigger a general application update notification
 export function triggerAppUpdateNotification(title: string, message: string, link?: string) {
     const addNotification = useNotificationStore.getState().addNotification;
     const newNotif = addNotification({
         type: 'update', // 'update' type for app changes
         title: title,
         message: message,
         link: link,
     });
      logInfo(`App update notification triggered: ${title}`, { notificationId: newNotif.id, message, link });
 }