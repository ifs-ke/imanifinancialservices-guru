// src/lib/prepareDataForHashing.ts
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, NotificationItem } from '@/lib/types';

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
 */
export function prepareDataForHashing(data: SyncData): any {
    const sortTransactions = (txs: TransactionWithId[]): TransactionWithId[] => {
        return [...txs].sort((a, b) => {
            const dateA = a.date instanceof Date ? a.date : new Date(a.date);
            const dateB = b.date instanceof Date ? b.date : new Date(b.date);
            const dateDiff = dateA.getTime() - dateB.getTime();
            if (dateDiff !== 0) return dateDiff;
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

    const sortNotifications = (items: NotificationItem[]): NotificationItem[] => {
        return [...items].sort((a, b) => {
             const timeA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
             const timeB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
             return timeA.getTime() - timeB.getTime(); // Sort by timestamp ascending
         });
     };


    const formatReviewData = (reviews: Record<string, WeeklyReviewData>): Record<string, WeeklyReviewData> => {
        const sortedKeys = Object.keys(reviews).sort();
        const sortedReviews: Record<string, WeeklyReviewData> = {};
        for (const key of sortedKeys) {
            const review = reviews[key];
            sortedReviews[key] = {
                ...review,
                transactionComments: review.transactionComments
                    ? Object.keys(review.transactionComments)
                          .sort()
                          .reduce((acc, txId) => {
                              acc[txId] = review.transactionComments![txId];
                              return acc;
                          }, {} as Record<string, string>)
                    : undefined,
                sharedWith: review.sharedWith ? [...review.sharedWith].sort() : undefined,
            };
        }
        return sortedReviews;
    };


    return {
        transactions: sortTransactions(data.transactions).map(tx => ({
            ...tx,
            date: (tx.date instanceof Date ? tx.date : new Date(tx.date)).toISOString(),
        })),
        debts: sortDebts(data.debts),
        assetItems: sortStatementItems(data.assetItems),
        otherLiabilityItems: sortStatementItems(data.otherLiabilityItems),
        budgetItems: sortBudgetItems(data.budgetItems),
        ownedReviews: formatReviewData(data.ownedReviews),
        // Sort and format notifications
        notifications: sortNotifications(data.notifications).map(n => ({
             ...n,
             timestamp: (n.timestamp instanceof Date ? n.timestamp : new Date(n.timestamp)).toISOString(), // Convert to ISO string
         })),
        ...(data.sharedReviews && { sharedReviews: formatReviewData(data.sharedReviews) }),
        startDate: data.startDate,
        endDate: data.endDate,
        gettingStartedDismissed: data.gettingStartedDismissed,
    };
}
