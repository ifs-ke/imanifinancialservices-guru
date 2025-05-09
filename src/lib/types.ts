// src/lib/types.ts

// These types can now be inferred from Zod schemas if preferred,
// or kept separate for clarity. For this example, they are kept separate
// but should mirror the structure validated by Zod.

/**
 * Represents the allowed modes of payment.
 */
export type ModeOfPayment = 'Cash' | 'Bank' | 'Mpesa';

/**
 * Represents the frequency of a transaction (for recurring vs one-off).
 */
export type TransactionFrequency = 'recurring' | 'one-time';

/**
 * Represents the variability of a transaction's amount (fixed or variable).
 */
export type TransactionVariability = 'fixed' | 'variable';


/**
 * Represents a financial transaction with a unique identifier and payment mode.
 * Includes optional categorization fields.
 */
export interface TransactionWithId {
  id: string;
  date: Date; // Stored as Date object in Zustand
  description: string;
  amount: number;
  modeOfPayment: ModeOfPayment;
  frequency?: TransactionFrequency;
  variability?: TransactionVariability;
}


/**
 * Represents an item in the financial statements (Asset).
 */
export interface StatementItem {
  id: string;
  description: string;
  amount: number;
}

/**
 * Represents a single debt item, categorized by term.
 */
export type DebtTerm = 'long' | 'short'; // Moved from schemas for direct type use

export interface DebtItem {
    id: string;
    description: string;
    principal: number;
    interestRate: number;
    minPayment: number;
    term: DebtTerm;
}

/**
 * Represents other liability items not captured in the structured Debt module.
 */
export interface OtherLiabilityItem {
    id: string;
    description: string;
    amount: number;
}

/**
 * Represents the categories for individual budget items.
 */
export type BudgetItemCategory = 'income' | 'recurring-expense' | 'one-time-expense' | 'goal' | 'debt';


/**
 * Represents a single, itemized budget entry, associated with a specific period.
 */
export interface BudgetItem {
    id: string;
    description: string;
    amount: number;
    category: BudgetItemCategory;
    period: string; // e.g., "YYYY-MM"
}

/**
 * Represents the data stored for a specific weekly review.
 */
export interface WeeklyReviewData {
  ownerId: string;
  ownerUsername?: string;
  journal: string;
  transactionComments?: Record<string, string>;
  sharedWith?: string[];
}

/**
 * Represents user information needed for sharing display.
 */
export interface UserShareInfo {
    userId: string;
    email: string;
    name?: string;
}

/**
 * Represents the type of notification.
 */
export type NotificationType = 'info' | 'warning' | 'error' | 'success' | 'budget' | 'collaboration' | 'update';


/**
 * Represents a single notification item.
 */
export interface NotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: Date; // Stored as Date object in Zustand
    read: boolean;
    link?: string;
}

// Client Log Payload type (matches Zod schema)
export interface ClientLogPayloadType {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, any>;
}

// Save Data Payload type (matches Zod schema, dates are strings)
export interface SaveDataPayloadType {
  transactions: Array<Omit<TransactionWithId, 'date'> & { date: string }>;
  debts: DebtItem[];
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  budgetItems: BudgetItem[];
  ownedReviews: Record<string, WeeklyReviewData>;
  startDate?: string;
  endDate?: string;
  gettingStartedDismissed?: boolean;
  dataHash: string;
}
