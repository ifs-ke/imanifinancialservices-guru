// src/lib/prepareDataForHashing.ts
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import stringify from 'fast-json-stable-stringify'; // Ensure stable stringify is imported

interface SyncData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews?: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[]; // Add notifications
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed?: boolean;
}

/**
 * Prepares the data object for consistent hashing by:
 * - Sorting arrays consistently.
 * - Converting Dates to ISO strings.
 * - Ensuring consistent order of keys (handled by stringify).
 * - Handling potential null/undefined arrays defensively.
 */
export function prepareDataForHashing(data: SyncData): any {

    // Ensure arrays exist before sorting/mapping
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const debts = Array.isArray(data.debts) ? data.debts : [];
    const assetItems = Array.isArray(data.assetItems) ? data.assetItems : [];
    const otherLiabilityItems = Array.isArray(data.otherLiabilityItems) ? data.otherLiabilityItems : [];
    const budgetItems = Array.isArray(data.budgetItems) ? data.budgetItems : [];
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    const ownedReviews = typeof data.ownedReviews === 'object' && data.ownedReviews !== null ? data.ownedReviews : {};
    const sharedReviews = typeof data.sharedReviews === 'object' && data.sharedReviews !== null ? data.sharedReviews : {}; // Handle optional sharedReviews

    const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
        // Defensive check inside sort as well
        if (!Array.isArray(txs)) return [];
        return [...txs].sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            const timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
            const timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
            const dateDiff = timeA - timeB;
            if (dateDiff !== 0) return dateDiff;
            const descDiff = (a.description || '').localeCompare(b.description || '');
            if (descDiff !== 0) return descDiff;
            return (a.amount || 0) - (b.amount || 0);
        });
    };

    const sortDebts = (debtList: DebtItem[]): DebtItem[] => {
         if (!Array.isArray(debtList)) return [];
        return [...debtList].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
    };

    const sortStatementItems = <T extends { description: string }>(items: T[]): T[] => {
        if (!Array.isArray(items)) return [];
        return [...items].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
    };

    const sortBudgetItems = (items: BudgetItem[]): BudgetItem[] => {
        if (!Array.isArray(items)) return [];
        return [...items].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
    };

    const sortNotifications = (items: NotificationItem[]): NotificationItem[] => {
         if (!Array.isArray(items)) return [];
        return [...items].sort((a, b) => {
             const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
             const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
             const tsA = !isNaN(timeA.getTime()) ? timeA.getTime() : 0;
             const tsB = !isNaN(timeB.getTime()) ? timeB.getTime() : 0;
             return tsA - tsB; // Sort by timestamp ascending
         });
     };


    const formatReviewData = (reviews: Record<string, WeeklyReviewData>): Record<string, WeeklyReviewData> => {
        if (typeof reviews !== 'object' || reviews === null) return {};
        const sortedKeys = Object.keys(reviews).sort();
        const sortedReviews: Record<string, WeeklyReviewData> = {};
        for (const key of sortedKeys) {
            const review = reviews[key];
             if (typeof review !== 'object' || review === null) continue; // Skip malformed reviews

            const sortedComments = review.transactionComments && typeof review.transactionComments === 'object'
                ? Object.keys(review.transactionComments)
                      .sort()
                      .reduce((acc, txId) => {
                          acc[txId] = review.transactionComments![txId];
                          return acc;
                      }, {} as Record<string, string>)
                : undefined;

            const sortedSharedWith = Array.isArray(review.sharedWith)
                ? [...review.sharedWith].sort()
                : undefined;

            sortedReviews[key] = {
                ...review,
                transactionComments: sortedComments,
                sharedWith: sortedSharedWith,
            };
        }
        return sortedReviews;
    };


    return {
        transactions: sortTransactions(transactions).map(tx => ({
            ...tx,
            // Ensure date is valid before calling toISOString
            date: (tx.date instanceof Date && !isNaN(tx.date.getTime()) ? tx.date : new Date(0)).toISOString(),
        })),
        debts: sortDebts(debts),
        assetItems: sortStatementItems(assetItems),
        otherLiabilityItems: sortStatementItems(otherLiabilityItems),
        budgetItems: sortBudgetItems(budgetItems),
        ownedReviews: formatReviewData(ownedReviews),
        // Sort and format notifications
        notifications: sortNotifications(notifications).map(n => ({
             ...n,
             // Ensure timestamp is valid before calling toISOString
             timestamp: (n.timestamp instanceof Date && !isNaN(n.timestamp.getTime()) ? n.timestamp : new Date(0)).toISOString(),
         })),
        ...(Object.keys(sharedReviews).length > 0 && { sharedReviews: formatReviewData(sharedReviews) }), // Conditionally include sharedReviews only if present
        startDate: data.startDate,
        endDate: data.endDate,
        gettingStartedDismissed: data.gettingStartedDismissed ?? false, // Default to false if undefined
    };
}
