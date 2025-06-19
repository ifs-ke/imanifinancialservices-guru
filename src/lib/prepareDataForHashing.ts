
// src/lib/prepareDataForHashing.ts
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, WeeklyReviewData, InvestmentItem } from '@/lib/types';
import type { TransactionItemForAPIType, DebtItemForAPIType, BaseItemForAPIType, BudgetItemForAPIType, InvestmentItemForAPIType, WeeklyReviewDataForAPIType } from '@/lib/schemas';


// Interface for the new payload structure that /api/save will receive
interface CollectionChanges<T> {
  created?: T[];
  updated?: T[];
  deletedIds?: string[];
}

interface SaveDataPayloadPartial {
  transactions?: CollectionChanges<TransactionItemForAPIType>;
  debts?: CollectionChanges<DebtItemForAPIType>;
  assetItems?: CollectionChanges<BaseItemForAPIType>;
  otherLiabilityItems?: CollectionChanges<BaseItemForAPIType>;
  budgetItems?: CollectionChanges<BudgetItemForAPIType>;
  ownedReviews?: CollectionChanges<WeeklyReviewDataForAPIType & { weekKey: string }>; // weekKey needed for identification
  investmentItems?: CollectionChanges<InvestmentItemForAPIType>;
  startDate?: string | null; // Already string | null in SaveDataPayloadSchema
  endDate?: string | null;   // Already string | null in SaveDataPayloadSchema
  gettingStartedDismissed?: boolean;
}


// Interface for the old full snapshot structure (still used by /api/sync and initially by useSyncManager for hashing)
interface FullSnapshotData {
  transactions?: TransactionWithId[];
  debts?: DebtItem[];
  assetItems?: StatementItem[];
  otherLiabilityItems?: OtherLiabilityItem[];
  budgetItems?: BudgetItem[];
  ownedReviews?: Record<string, WeeklyReviewData>;
  investmentItems?: InvestmentItem[];
  startDate?: Date | string;
  endDate?: Date | string;
  gettingStartedDismissed?: boolean;
}


const toISOStringOptional = (date?: Date | string): string | undefined => {
  if (date instanceof Date && !isNaN(date.getTime())) return date.toISOString();
  if (typeof date === 'string') {
    const d = new Date(date);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
};

const toFixedIfNumber = (value: number | string | undefined | null, digits: number): string => {
    let numToProcess: number;
    if (value === undefined || value === null || value === '') {
        numToProcess = 0;
    } else {
        const parsedNum = Number(value);
        if (isNaN(parsedNum)) {
            numToProcess = 0;
        } else {
            numToProcess = parsedNum;
        }
    }
    return numToProcess.toFixed(digits);
};

const sortTransactions = (txs: any[]): any[] => {
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
        return (Number(a.amount) || 0) - (Number(b.amount) || 0); // Ensure amount is treated as number
    });
};

const sortDebts = (debtList: any[]): any[] => {
     if (!Array.isArray(debtList)) return [];
    return [...debtList].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
};

const sortStatementItems = <T extends { id: string, description: string }>(items: T[]): T[] => {
    if (!Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
        const descDiff = (a.description || '').localeCompare(b.description || '');
        if (descDiff !== 0) return descDiff;
        return (a.id || '').localeCompare(b.id || '');
    });
};

const sortBudgetItems = (items: any[]): any[] => {
    if (!Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
        const periodDiff = (b.period || '').localeCompare(a.period || '');
        if (periodDiff !== 0) return periodDiff;
        return (a.description || '').localeCompare(b.description || '');
    });
};

const sortInvestmentItems = (items: any[]): any[] => {
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

// Helper to format and sort items within a CollectionChanges object
const prepareCollectionChanges = <T extends { id?: string, weekKey?: string, description?: string, name?: string, date?: string | Date, purchaseDate?: string | Date, period?: string, amount?: number | string, principal?: number | string, interestRate?: number | string, minPayment?: number | string, quantity?: number | string, purchasePrice?: number | string, currentValue?: number | string }>(
    changes: CollectionChanges<T> | undefined,
    itemSorter: (items: T[]) => T[],
    isReview?: boolean
): CollectionChanges<any> | undefined => {
    if (!changes) return undefined;

    const formatItem = (item: T) => {
        const formatted: any = { ...item };
        if (item.date !== undefined) formatted.date = toISOStringOptional(item.date);
        if (item.purchaseDate !== undefined) formatted.purchaseDate = toISOStringOptional(item.purchaseDate);
        if (item.amount !== undefined) formatted.amount = toFixedIfNumber(item.amount, 2);
        if (item.principal !== undefined) formatted.principal = toFixedIfNumber(item.principal, 2);
        if (item.interestRate !== undefined) formatted.interestRate = toFixedIfNumber(item.interestRate, 4);
        if (item.minPayment !== undefined) formatted.minPayment = toFixedIfNumber(item.minPayment, 2);
        if (item.quantity !== undefined) formatted.quantity = toFixedIfNumber(item.quantity, 8);
        if (item.purchasePrice !== undefined) formatted.purchasePrice = toFixedIfNumber(item.purchasePrice, 2);
        if (item.currentValue !== undefined) formatted.currentValue = toFixedIfNumber(item.currentValue, 2);
        if (isReview && item.transactionComments && typeof item.transactionComments === 'object') {
            const sortedComments: Record<string, string> = {};
            Object.keys(item.transactionComments as Record<string,string>).sort().forEach(key => {
                sortedComments[key] = (item.transactionComments as Record<string,string>)[key];
            });
            formatted.transactionComments = sortedComments;
        }
        if (isReview && Array.isArray(item.sharedWith)) {
            formatted.sharedWith = [...item.sharedWith].sort();
        }
        return formatted;
    };

    return {
        created: changes.created ? itemSorter(changes.created).map(formatItem) : undefined,
        updated: changes.updated ? itemSorter(changes.updated).map(formatItem) : undefined,
        deletedIds: changes.deletedIds ? [...changes.deletedIds].sort() : undefined,
    };
};


const formatFullSnapshotReviewData = (reviews: Record<string, WeeklyReviewData>): Record<string, WeeklyReviewData> => {
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
            : undefined; // Keep as undefined if not present

        const sortedSharedWith = Array.isArray(review.sharedWith)
            ? [...review.sharedWith].sort()
            : undefined; // Keep as undefined if not present

        sortedReviews[key] = {
            ...review, // Spread original review to keep all fields
            transactionComments: sortedComments,
            sharedWith: sortedSharedWith,
        };
    }
    return sortedReviews;
};


export function prepareDataForHashing(data: SaveDataPayloadPartial | FullSnapshotData): any {
    // Check if data is for partial update (has created/updated/deletedIds) or full snapshot
    const isPartialUpdate = 'transactions' in data && data.transactions && (data.transactions.created || data.transactions.updated || data.transactions.deletedIds);

    if (isPartialUpdate) {
        const partialData = data as SaveDataPayloadPartial;
        return {
            transactions: prepareCollectionChanges(partialData.transactions, sortTransactions),
            debts: prepareCollectionChanges(partialData.debts, sortDebts),
            assetItems: prepareCollectionChanges(partialData.assetItems, sortStatementItems),
            otherLiabilityItems: prepareCollectionChanges(partialData.otherLiabilityItems, sortStatementItems),
            budgetItems: prepareCollectionChanges(partialData.budgetItems, sortBudgetItems),
            ownedReviews: prepareCollectionChanges(
                partialData.ownedReviews,
                (items: any[]) => items.sort((a, b) => (a.weekKey || '').localeCompare(b.weekKey || '')),
                true // isReview flag
            ),
            investmentItems: prepareCollectionChanges(partialData.investmentItems, sortInvestmentItems),
            startDate: toISOStringOptional(partialData.startDate as string | Date | undefined), // Cast needed if original type was Date
            endDate: toISOStringOptional(partialData.endDate as string | Date | undefined),     // Cast needed
            gettingStartedDismissed: partialData.gettingStartedDismissed ?? false,
        };
    } else {
        // Logic for full snapshot (used by /api/sync and client-side before granular save is implemented)
        const fullData = data as FullSnapshotData;
        return {
            transactions: sortTransactions(fullData.transactions || []).map(tx => ({
                ...tx,
                date: toISOStringOptional(tx.date),
                amount: toFixedIfNumber(tx.amount, 2),
                categoryName: tx.categoryName || null,
            })),
            debts: sortDebts(fullData.debts || []).map(d => ({
                ...d,
                principal: toFixedIfNumber(d.principal, 2),
                interestRate: toFixedIfNumber(d.interestRate, 4),
                minPayment: toFixedIfNumber(d.minPayment, 2),
            })),
            assetItems: sortStatementItems(fullData.assetItems || []).map(a => ({ ...a, amount: toFixedIfNumber(a.amount, 2) })),
            otherLiabilityItems: sortStatementItems(fullData.otherLiabilityItems || []).map(l => ({ ...l, amount: toFixedIfNumber(l.amount, 2) })),
            budgetItems: sortBudgetItems(fullData.budgetItems || []).map(b => ({ ...b, amount: toFixedIfNumber(b.amount, 2) })),
            ownedReviews: formatFullSnapshotReviewData(fullData.ownedReviews || {}),
            investmentItems: sortInvestmentItems(fullData.investmentItems || []).map(i => ({
                ...i,
                purchaseDate: toISOStringOptional(i.purchaseDate),
                quantity: toFixedIfNumber(i.quantity, 8),
                purchasePrice: toFixedIfNumber(i.purchasePrice, 2),
                currentValue: toFixedIfNumber(i.currentValue, 2),
            })),
            startDate: toISOStringOptional(fullData.startDate),
            endDate: toISOStringOptional(fullData.endDate),
            gettingStartedDismissed: fullData.gettingStartedDismissed ?? false,
        };
    }
}
