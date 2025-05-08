// src/services/notificationService.ts
 'use client';

 import { useNotificationStore } from "@/store/notificationStore";
 import { useBudgetStore } from "@/store/budgetStore";
 import { useTransactionsStore } from "@/store/transactionsStore";
 import { useEffect, useMemo } from "react";
 import { formatCurrency } from "@/lib/utils"; // Assuming formatCurrency is moved/available here
 import { startOfMonth, endOfMonth } from 'date-fns';
 import type { NotificationType } from "@/lib/types"; // Import NotificationType
 // Logger removed
 // import { useAuth } from "@clerk/nextjs"; // Clerk disabled

 // Consistent placeholder ID
 const CLERK_DISABLED_PLACEHOLDER_USER_ID = 'user_2wXc4D8KBDKGhxagoRStZOXnP2Y';

 const BUDGET_WARNING_THRESHOLD_PERCENT = 0.9;
 const OVERBUDGET_THRESHOLD_PERCENT = 1.0;

 export function useBudgetNotifications() {
     const addNotification = useNotificationStore(state => state.addNotification);
     const budgetItems = useBudgetStore(state => state.budgetItems);
     const allTransactions = useTransactionsStore(state => state.transactions);
     const existingNotifications = useNotificationStore(state => state.notifications); // Get current notifications for duplicate check
     // const { userId } = useAuth(); // Clerk disabled
     const userId = CLERK_DISABLED_PLACEHOLDER_USER_ID; // Use placeholder

     const monthlyAnalysis = useMemo(() => {
         const now = new Date();
         const start = startOfMonth(now);
         const end = endOfMonth(now);
         // Note: Budget variance report uses selected date range, but notifications check current month's full budget
         // const daysInPeriod = differenceInDays(end, start) + 1;
         // const budgetMultiplier = 1; // Using full month budget for checks

         const actualSpendingByCategory: Record<string, number> = {};
         const transactionsThisMonth = allTransactions.filter(tx => {
             const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
              if (isNaN(txDate.getTime())) return false; // Skip invalid dates
             return txDate >= start && txDate <= end && tx.amount < 0; // Only expenses this month
         });

         transactionsThisMonth.forEach(tx => {
            // Use a more specific key for actual spending based on budgeted item description match
            const budgetItemMatch = budgetItems.find(bi =>
                bi.description.toLowerCase() === tx.description.toLowerCase() &&
                 (bi.category === 'recurring-expense' || bi.category === 'one-time-expense')
            );
             // Key format: "category-description" if matched, otherwise just "category" (less precise)
             const key = budgetItemMatch ? `${budgetItemMatch.category}-${budgetItemMatch.description}` : tx.frequency || 'uncategorized'; // Fallback key


            if (!actualSpendingByCategory[key]) {
                 actualSpendingByCategory[key] = 0;
            }
            actualSpendingByCategory[key] += Math.abs(tx.amount);
         });

         const budgetByCategory: Record<string, number> = {};
         budgetItems
             .filter(item => item.category === 'recurring-expense' || item.category === 'one-time-expense')
             .forEach(item => {
                 const key = `${item.category}-${item.description}`; // Key by category and description
                 budgetByCategory[key] = item.amount; // Use full monthly budget amount
             });

         return { actualSpendingByCategory, budgetByCategory };
     }, [allTransactions, budgetItems]);

     useEffect(() => {
         const { actualSpendingByCategory, budgetByCategory } = monthlyAnalysis;
         const generatedNotificationKeys = new Set<string>(); // Track keys for which notifications were generated in this run

         for (const budgetKey in budgetByCategory) {
             const budgetedAmount = budgetByCategory[budgetKey];
             const actualAmount = actualSpendingByCategory[budgetKey] || 0;
              // Extract description from the key
              const description = budgetKey.substring(budgetKey.indexOf('-') + 1);

             if (budgetedAmount <= 0) continue; // Skip checks for zero or negative budgets

             const spendingRatio = actualAmount / budgetedAmount;
             const logContext = { userId, budgetCategory: description, budgetedAmount, actualAmount, spendingRatio };

             // Over Budget Check
             if (spendingRatio >= OVERBUDGET_THRESHOLD_PERCENT) {
                 const notifKey = `overbudget-${budgetKey}`;
                 const notifTitle = 'Over Budget Alert';
                  // Check if a similar *unread* notification already exists
                  const existingUnread = existingNotifications.find(n =>
                       n.message.includes(`"${description}"`) &&
                       n.title === notifTitle && // Match title
                       n.type === 'budget' &&
                       !n.read
                  );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'budget',
                         title: notifTitle,
                         message: `You've spent ${formatCurrency(actualAmount)} out of ${formatCurrency(budgetedAmount)} budgeted for "${description}".`,
                         link: '/budget', // Link to budget page
                     });
                      // console.error(`Over budget for "${description}"`, logContext); // Console log commented out
                      generatedNotificationKeys.add(notifKey);
                 }
             }
             // Budget Warning Check (only if not already over budget in *this* check cycle)
             else if (spendingRatio >= BUDGET_WARNING_THRESHOLD_PERCENT) {
                 const notifKey = `warning-${budgetKey}`;
                 const notifTitle = 'Budget Warning';
                 // Check if a similar *unread* notification already exists
                 const existingUnread = existingNotifications.find(n =>
                     n.message.includes(`"${description}"`) &&
                     n.title === notifTitle && // Match title
                     n.type === 'warning' &&
                     !n.read
                 );

                 if (!existingUnread && !generatedNotificationKeys.has(notifKey)) {
                     addNotification({
                         type: 'warning', // Use 'warning' type
                         title: notifTitle,
                         message: `Approaching budget limit for "${description}". Spent ${formatCurrency(actualAmount)} of ${formatCurrency(budgetedAmount)}.`,
                         link: '/budget', // Link to budget page
                     });
                      // console.warn(`Budget warning for "${description}"`, logContext); // Console log commented out
                      generatedNotificationKeys.add(notifKey);
                 }
             }
         }
     }, [monthlyAnalysis, addNotification, userId, existingNotifications]); // Add existingNotifications as dependency

     return null; // This hook doesn't render anything
 }

 // Function to trigger collaboration notifications (called from server action ideally, or client action)
 export function triggerCollaborationNotification(sharerName: string, weekKey: string, recipientUserId: string) {
     const addNotification = useNotificationStore.getState().addNotification;
     addNotification({
         type: 'collaboration',
         title: 'Review Shared With You',
         message: `${sharerName || 'A user'} shared their weekly review (${weekKey}) with you.`,
         link: '/weekly-review?tab=shared', // Link to the shared tab
     });
      // console.log(`Weekly review ${weekKey} shared by ${sharerName} with user ${recipientUserId}`, { // Console log commented out
      //     sharerName,
      //     weekKey,
      //     recipientUserId,
      //     type: 'collaboration_received'
      // });
 }

 // Function to trigger app update notifications (can be called from a central place, e.g., layout)
 export function triggerAppUpdateNotification(title: string, message: string, link?: string) {
     const addNotification = useNotificationStore.getState().addNotification;
     const newNotif = addNotification({
         type: 'update',
         title: title,
         message: message,
         link: link,
     });
      // console.log(`App update notification triggered: ${title}`, { notificationId: newNotif.id, message, link }); // Console log commented out
 }