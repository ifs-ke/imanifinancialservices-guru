// src/lib/prepareDataForHashing.ts
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';
import stringify from 'fast-json-stable-stringify'; // Ensure stable stringify is imported

interface SyncData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[]; // Includes period field now
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews?: Record<string, WeeklyReviewData>;
  notifications: NotificationItem[];
  startDate?: Date;
  endDate?: Date;
  gettingStartedDismissed?: boolean;
}

/**
 * Prepares the data object for consistent hashing by:
 * - Sorting arrays consistently.
 * - Converting Dates to ISO strings.
 * - Ensuring consistent order of keys (handled by stringify).
 * - Handling potential null/undefined arrays/objects defensively.
 * - EXCLUDING notifications and sharedReviews from the final hashed object.
 * - Including the 'period' field for budget items.
 */
export function prepareDataForHashing(data: SyncData): any {

    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const debts = Array.isArray(data.debts) ? data.debts : [];
    const assetItems = Array.isArray(data.assetItems) ? data.assetItems : [];
    const otherLiabilityItems = Array.isArray(data.otherLiabilityItems) ? data.otherLiabilityItems : [];
    const budgetItems = Array.isArray(data.budgetItems) ? data.budgetItems : [];
    const ownedReviews = typeof data.ownedReviews === 'object' && data.ownedReviews !== null ? data.ownedReviews : {};

    const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
        if (!Array.isArray(txs)) return [];
        return [...txs].sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date || 0);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date || 0);
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
        // Sort by period first (descending), then description
        return [...items].sort((a, b) => {
            const periodDiff = (b.period || '').localeCompare(a.period || '');
            if (periodDiff !== 0) return periodDiff;
            return (a.description || '').localeCompare(b.description || '');
        });
    };

    const formatReviewData = (reviews: Record<string, WeeklyReviewData>): Record<string, WeeklyReviewData> => {
        if (typeof reviews !== 'object' || reviews === null) return {};
        const sortedKeys = Object.keys(reviews).sort();
        const sortedReviews: Record<string, WeeklyReviewData> = {};
        for (const key of sortedKeys) {
            const review = reviews[key];
             if (typeof review !== 'object' || review === null) continue;

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


    // Return only the data relevant for hashing/saving
    return {
        transactions: sortTransactions(transactions).map(tx => ({
            ...tx,
            date: (tx.date instanceof Date && !isNaN(tx.date.getTime()) ? tx.date : new Date(0)).toISOString(),
        })),
        debts: sortDebts(debts),
        assetItems: sortStatementItems(assetItems),
        otherLiabilityItems: sortStatementItems(otherLiabilityItems),
        budgetItems: sortBudgetItems(budgetItems), // Includes period field
        ownedReviews: formatReviewData(ownedReviews),
        startDate: data.startDate instanceof Date && !isNaN(data.startDate.getTime()) ? data.startDate.toISOString() : undefined,
        endDate: data.endDate instanceof Date && !isNaN(data.endDate.getTime()) ? data.endDate.toISOString() : undefined,
        gettingStartedDismissed: data.gettingStartedDismissed ?? false,
    };
}
