
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
  ownedReviews?: CollectionChanges<WeeklyReviewDataForAPIType & { weekKey: string }>;
  investmentItems?: CollectionChanges<InvestmentItemForAPIType>;
  startDate?: string | null;
  endDate?: string | null;
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
        numToProcess = isNaN(parsedNum) ? 0 : parsedNum;
    }
    return numToProcess.toFixed(digits);
};

// --- Sorter Functions ---
const sortTransactions = (txs: any[]): any[] => [...(txs || [])].sort((a, b) => (new Date(a.date || 0).getTime()) - (new Date(b.date || 0).getTime()) || (a.description || '').localeCompare(b.description || '') || (Number(a.amount) || 0) - (Number(b.amount) || 0));
const sortDebts = (items: any[]): any[] => [...(items || [])].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
const sortStatementItems = (items: any[]): any[] => [...(items || [])].sort((a, b) => (a.description || '').localeCompare(b.description || '') || (a.id || '').localeCompare(b.id || ''));
const sortBudgetItems = (items: any[]): any[] => [...(items || [])].sort((a, b) => (b.period || '').localeCompare(a.period || '') || (a.description || '').localeCompare(b.description || ''));
const sortInvestmentItems = (items: any[]): any[] => [...(items || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '') || (new Date(a.purchaseDate || 0).getTime()) - (new Date(b.purchaseDate || 0).getTime()));
const sortWeeklyReviews = (items: any[]): any[] => [...(items || [])].sort((a, b) => (a.weekKey || '').localeCompare(b.weekKey || ''));

/**
 * Creates a canonical, normalized version of any data item for consistent hashing.
 * - Converts dates to ISO strings.
 * - Converts numbers to fixed-point strings.
 * - Normalizes optional string fields to null.
 * - Sorts nested arrays/objects.
 */
const normalizeItemForHashing = (item: any): any => {
    const normalized: any = { ...item };

    // Normalize dates
    if (item.date !== undefined) normalized.date = toISOStringOptional(item.date);
    if (item.purchaseDate !== undefined) normalized.purchaseDate = toISOStringOptional(item.purchaseDate);

    // Normalize numbers to fixed-point strings for precision consistency
    if (item.amount !== undefined) normalized.amount = toFixedIfNumber(item.amount, 2);
    if (item.principal !== undefined) normalized.principal = toFixedIfNumber(item.principal, 2);
    if (item.interestRate !== undefined) normalized.interestRate = toFixedIfNumber(item.interestRate, 4);
    if (item.minPayment !== undefined) normalized.minPayment = toFixedIfNumber(item.minPayment, 2);
    if (item.quantity !== undefined) normalized.quantity = toFixedIfNumber(item.quantity, 8);
    if (item.purchasePrice !== undefined) normalized.purchasePrice = toFixedIfNumber(item.purchasePrice, 2);
    if (item.currentValue !== undefined) normalized.currentValue = toFixedIfNumber(item.currentValue, 2);

    // Normalize optional string/nullable fields to be explicitly null if falsy
    if ('categoryName' in item) normalized.categoryName = item.categoryName || null;
    if ('notes' in item) normalized.notes = item.notes || null;
    if ('frequency' in item) normalized.frequency = item.frequency || null;
    if ('variability' in item) normalized.variability = item.variability || null;
    
    // Normalize complex object fields
    if (item.transactionComments && typeof item.transactionComments === 'object') {
        const sortedComments: Record<string, string> = {};
        Object.keys(item.transactionComments as Record<string,string>).sort().forEach(key => {
            sortedComments[key] = (item.transactionComments as Record<string,string>)[key];
        });
        normalized.transactionComments = sortedComments;
    }
    if (Array.isArray(item.sharedWith)) {
        normalized.sharedWith = [...item.sharedWith].sort();
    }
    
    return normalized;
};


// Helper to format and sort items within a CollectionChanges object
const prepareCollectionChanges = <T extends {}>(
    changes: CollectionChanges<T> | undefined,
    itemSorter: (items: T[]) => T[]
): CollectionChanges<any> | undefined => {
    if (!changes || (!changes.created && !changes.updated && !changes.deletedIds)) {
        return undefined;
    }

    return {
        created: changes.created ? itemSorter(changes.created).map(normalizeItemForHashing) : undefined,
        updated: changes.updated ? itemSorter(changes.updated).map(normalizeItemForHashing) : undefined,
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
        sortedReviews[key] = normalizeItemForHashing(review);
    }
    return sortedReviews;
};

export function prepareDataForHashing(data: SaveDataPayloadPartial | FullSnapshotData): any {
    const isPartialUpdate = 'transactions' in data && data.transactions && (data.transactions.created || data.transactions.updated || data.transactions.deletedIds);

    if (isPartialUpdate) {
        const partialData = data as SaveDataPayloadPartial;
        return {
            transactions: prepareCollectionChanges(partialData.transactions, sortTransactions),
            debts: prepareCollectionChanges(partialData.debts, sortDebts),
            assetItems: prepareCollectionChanges(partialData.assetItems, sortStatementItems),
            otherLiabilityItems: prepareCollectionChanges(partialData.otherLiabilityItems, sortStatementItems),
            budgetItems: prepareCollectionChanges(partialData.budgetItems, sortBudgetItems),
            ownedReviews: prepareCollectionChanges(partialData.ownedReviews, sortWeeklyReviews),
            investmentItems: prepareCollectionChanges(partialData.investmentItems, sortInvestmentItems),
            startDate: toISOStringOptional(partialData.startDate as string | Date | undefined),
            endDate: toISOStringOptional(partialData.endDate as string | Date | undefined),
        };
    } else {
        const fullData = data as FullSnapshotData;
        return {
            transactions: sortTransactions(fullData.transactions || []).map(normalizeItemForHashing),
            debts: sortDebts(fullData.debts || []).map(normalizeItemForHashing),
            assetItems: sortStatementItems(fullData.assetItems || []).map(normalizeItemForHashing),
            otherLiabilityItems: sortStatementItems(fullData.otherLiabilityItems || []).map(normalizeItemForHashing),
            budgetItems: sortBudgetItems(fullData.budgetItems || []).map(normalizeItemForHashing),
            ownedReviews: formatFullSnapshotReviewData(fullData.ownedReviews || {}),
            investmentItems: sortInvestmentItems(fullData.investmentItems || []).map(normalizeItemForHashing),
            startDate: toISOStringOptional(fullData.startDate),
            endDate: toISOStringOptional(fullData.endDate),
        };
    }
}
