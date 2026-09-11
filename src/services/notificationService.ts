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
 import { useAuth } from "@/context/AuthContext";


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
                      logWarn(`Over budget for "${budgetItemDescription}"`, logContext, userId);
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

 /**
  * Notifies both User 1 (Owner) and User 2 (Recipient) when a review share is initiated.
  */
 export function triggerShareInitiatedNotifications(
   ownerName: string,
   recipientName: string,
   periodLabel: string,
   scope: string = 'week'
 ) {
   const addNotification = useNotificationStore.getState().addNotification;

   // 1. Notify User 1 (Sharer / Owner)
   addNotification({
     type: 'collaboration',
     title: 'Share Active: Access Granted',
     message: `You shared your ${periodLabel} transactions with ${recipientName}. They have comment rights but cannot alter your financial data.`,
     link: '/weekly-review?tab=owned',
   });

   // 2. Notify User 2 (Recipient)
   addNotification({
     type: 'collaboration',
     title: 'New Review Shared With You',
     message: `${ownerName} shared their ${periodLabel} transactions with you. You have comment rights to review and provide feedback.`,
     link: '/weekly-review?tab=shared',
   });

   logInfo(`Collaboration share notifications emitted for both parties`, {
     ownerName,
     recipientName,
     periodLabel,
     scope,
   });
 }

 /**
  * Notifies the counterpart when a collaborator leaves a comment on a shared transaction.
  */
 export function triggerCommentAddedNotification(
   commenterName: string,
   txDescription: string,
   periodLabel: string,
   isOwner: boolean
 ) {
   const addNotification = useNotificationStore.getState().addNotification;

   addNotification({
     type: 'collaboration',
     title: isOwner ? 'Owner Comment Added' : 'Reviewer Feedback Received',
     message: `${commenterName} commented on transaction "${txDescription}" in ${periodLabel}.`,
     link: isOwner ? '/weekly-review?tab=shared' : '/weekly-review?tab=owned',
   });

   logInfo(`Collaboration comment notification emitted`, {
     commenterName,
     txDescription,
     periodLabel,
   });
 }

 /**
  * Notifies both users when the owner revokes share access, highlighting that comments are preserved.
  */
 export function triggerShareRevokedNotifications(
   ownerName: string,
   recipientName: string,
   periodLabel: string
 ) {
   const addNotification = useNotificationStore.getState().addNotification;

   // 1. Notify Owner confirming comments are retained
   addNotification({
     type: 'collaboration',
     title: 'Share Revoked — Comments Preserved',
     message: `You revoked access for ${recipientName} on ${periodLabel}. All feedback and comments set by ${recipientName} have been permanently retained in your review.`,
     link: '/weekly-review?tab=owned',
   });

   // 2. Notify Recipient that access was revoked
   addNotification({
     type: 'collaboration',
     title: 'Review Access Revoked',
     message: `Your view access to ${ownerName}'s ${periodLabel} transactions has been revoked by the owner.`,
     link: '/weekly-review?tab=shared',
   });

   logInfo(`Share revocation notifications emitted`, {
     ownerName,
     recipientName,
     periodLabel,
   });
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
