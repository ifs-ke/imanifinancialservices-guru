// src/lib/prepareDataForHashing.ts
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData } from '@/lib/types';

interface SyncData {
  transactions: TransactionWithId[];
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  sharedReviews?: Record<string, WeeklyReviewData>; // Optional for client-side preparation
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed?: boolean; // Keep track if user dismissed guide
}

/**
 * Prepares the data object for consistent hashing by:
 * - Sorting arrays consistently.
 * - Converting Dates to ISO strings.
 * - Ensuring consistent order of keys (handled by stringify).
 */
export function prepareDataForHashing(data: SyncData): any {
    const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
        return [...txs].sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            const dateDiff = dateA.getTime() - dateB.getTime(); // Sort by date ascending for consistency
            if (dateDiff !== 0) return dateDiff;
            // Secondary sort by description then amount for tie-breaking
            const descDiff = a.description.localeCompare(b.description);
            if (descDiff !== 0) return descDiff;
            return a.amount - b.amount;
        });
    };

    const sortDebts = (debtList: DebtItem[]): DebtItem[] => {
        return [...debtList].sort((a, b) => a.description.localeCompare(b.description));
    };

    const sortStatementItems = <T extends { description: string }>(items: T[]): T[] => {
        return [...items].sort((a, b) => a.description.localeCompare(b.description));
    };

    const sortBudgetItems = (items: BudgetItem[]): BudgetItem[] => {
        return [...items].sort((a, b) => a.description.localeCompare(b.description));
    };

    const formatReviewData = (reviews: Record<string, WeeklyReviewData>): Record<string, WeeklyReviewData> => {
        const sortedKeys = Object.keys(reviews).sort();
        const sortedReviews: Record<string, WeeklyReviewData> = {};
        for (const key of sortedKeys) {
            const review = reviews[key];
            sortedReviews[key] = {
                ...review,
                // Sort transaction comments by transaction ID for consistency
                transactionComments: review.transactionComments
                    ? Object.keys(review.transactionComments)
                          .sort()
                          .reduce((acc, txId) => {
                              acc[txId] = review.transactionComments![txId];
                              return acc;
                          }, {} as Record<string, string>)
                    : undefined,
                 // Sort sharedWith array for consistency
                sharedWith: review.sharedWith ? [...review.sharedWith].sort() : undefined,
            };
        }
        return sortedReviews;
    };


    return {
        transactions: sortTransactions(data.transactions).map(tx => ({
            ...tx,
            date: (tx.date instanceof Date ? tx.date : new Date(tx.date)).toISOString(), // Always convert to ISO string
        })),
        debts: sortDebts(data.debts),
        assetItems: sortStatementItems(data.assetItems),
        otherLiabilityItems: sortStatementItems(data.otherLiabilityItems),
        budgetItems: sortBudgetItems(data.budgetItems),
        ownedReviews: formatReviewData(data.ownedReviews),
        // Include sharedReviews only if they exist (for server-side hashing)
        ...(data.sharedReviews && { sharedReviews: formatReviewData(data.sharedReviews) }),
        startDate: data.startDate, // Already string or undefined
        endDate: data.endDate, // Already string or undefined
        gettingStartedDismissed: data.gettingStartedDismissed,
    };
}
