
// src/lib/prepareDataForHashing.ts
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, InvestmentItem } from '@/lib/types';
// stringify is still used by API sync route for empty data hash

interface SyncDataInput {
  transactions?: TransactionWithId[];
  debts?: DebtItem[];
  assetItems?: StatementItem[];
  otherLiabilityItems?: OtherLiabilityItem[];
  budgetItems?: BudgetItem[];
  ownedReviews?: Record<string, WeeklyReviewData>;
  investmentItems?: InvestmentItem[]; // Added
  startDate?: Date | string; // Can be Date or ISO string
  endDate?: Date | string;   // Can be Date or ISO string
  gettingStartedDismissed?: boolean;
}

/**
 * Prepares the data object for consistent stringification, typically before hashing.
 * - Sorts arrays consistently.
 * - Converts Dates to ISO strings.
 * - Ensures consistent order of keys (handled by stringify).
 * - Handles potential null/undefined arrays/objects defensively.
 * - EXCLUDES notifications and sharedReviews from the final object.
 * - Includes the 'period' field for budget items.
 * - Includes the 'categoryName' field for transactions.
 * - Includes investment items.
 * - Converts numeric monetary values to fixed-point strings for stable hashing.
 */
export function prepareDataForHashing(data: SyncDataInput): any {

    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const debts = Array.isArray(data.debts) ? data.debts : [];
    const assetItems = Array.isArray(data.assetItems) ? data.assetItems : [];
    const otherLiabilityItems = Array.isArray(data.otherLiabilityItems) ? data.otherLiabilityItems : [];
    const budgetItems = Array.isArray(data.budgetItems) ? data.budgetItems : [];
    const ownedReviews = typeof data.ownedReviews === 'object' && data.ownedReviews !== null ? data.ownedReviews : {};
    const investmentItems = Array.isArray(data.investmentItems) ? data.investmentItems : [];

    const toISOStringOptional = (date?: Date | string): string | undefined => {
      if (date instanceof Date && !isNaN(date.getTime())) return date.toISOString();
      if (typeof date === 'string') {
        const d = new Date(date);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
      return undefined;
    };

    const toFixedIfNumber = (value: number | string | undefined | null, digits: number): string | null => {
        let numToProcess: number;
        if (value == null) { // Handles undefined and null
            numToProcess = 0; // Treat null/undefined as 0 for hashing consistency with Zod's server-side coercion of null to 0
        } else {
            const parsedNum = Number(value); // Coerces string numbers to actual numbers
            if (isNaN(parsedNum)) {
                // If 'value' was a non-numeric string or already NaN, Number(value) is NaN.
                // Return null for these cases to distinguish from valid zero.
                return null;
            }
            numToProcess = parsedNum;
        }
        return numToProcess.toFixed(digits);
    };


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
        return [...items].sort((a, b) => {
            const periodDiff = (b.period || '').localeCompare(a.period || '');
            if (periodDiff !== 0) return periodDiff;
            return (a.description || '').localeCompare(b.description || '');
        });
    };

    const sortInvestmentItems = (items: InvestmentItem[]): InvestmentItem[] => {
        if (!Array.isArray(items)) return [];
        return [...items].sort((a, b) => {
            const nameDiff = (a.name || '').localeCompare(b.name || '');
            if (nameDiff !== 0) return nameDiff;
            const dateA = a.purchaseDate instanceof Date ? a.purchaseDate : new Date(a.purchaseDate || 0);
            const dateB = b.purchaseDate instanceof Date ? b.purchaseDate : new Date(b.purchaseDate || 0);
            const timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
            const timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
            return timeA - timeB;
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

    return {
        transactions: sortTransactions(transactions).map(tx => ({
            ...tx,
            date: toISOStringOptional(tx.date),
            amount: toFixedIfNumber(tx.amount, 2), // Consistently stringify amount
            categoryName: tx.categoryName || null,
        })),
        debts: sortDebts(debts).map(d => ({
            ...d,
            principal: toFixedIfNumber(d.principal, 2),
            interestRate: toFixedIfNumber(d.interestRate, 4),
            minPayment: toFixedIfNumber(d.minPayment, 2),
        })),
        assetItems: sortStatementItems(assetItems).map(a => ({ ...a, amount: toFixedIfNumber(a.amount, 2) })),
        otherLiabilityItems: sortStatementItems(otherLiabilityItems).map(l => ({ ...l, amount: toFixedIfNumber(l.amount, 2) })),
        budgetItems: sortBudgetItems(budgetItems).map(b => ({ ...b, amount: toFixedIfNumber(b.amount, 2) })),
        ownedReviews: formatReviewData(ownedReviews),
        investmentItems: sortInvestmentItems(investmentItems).map(i => ({
            ...i,
            purchaseDate: toISOStringOptional(i.purchaseDate),
            quantity: toFixedIfNumber(i.quantity, 8),
            purchasePrice: toFixedIfNumber(i.purchasePrice, 2),
            currentValue: toFixedIfNumber(i.currentValue, 2),
        })),
        startDate: toISOStringOptional(data.startDate),
        endDate: toISOStringOptional(data.endDate),
        gettingStartedDismissed: data.gettingStartedDismissed ?? false,
    };
}

