// src/lib/types.ts

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
  id: string; // Using string ID for flexibility
  date: Date;
  description: string;
  amount: number; // Positive for income, negative for expense
  modeOfPayment: ModeOfPayment; // Make mandatory after import/creation
  frequency?: TransactionFrequency; // Optional categorization
  variability?: TransactionVariability; // Optional categorization
}


/**
 * Represents an item in the financial statements (Asset).
 * Note: Income/Expense items are derived from transactions on the Statements page.
 * Liabilities are split into DebtItems and OtherLiabilityItems.
 */
export interface StatementItem {
  id: string;
  description: string;
  amount: number;
}

/**
 * Represents a single debt item, categorized by term.
 */
export interface DebtItem {
    id: string;
    description: string; // e.g., "Car Loan", "Student Loan - Gov", "Credit Card XYZ"
    principal: number; // Current outstanding principal balance
    interestRate: number; // Annual interest rate (e.g., 12.5 for 12.5%)
    minPayment: number; // Minimum monthly payment
    term: 'long' | 'short'; // Categorize debt term
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
 * Added 'debt' category.
 */
export type BudgetItemCategory = 'income' | 'recurring-expense' | 'one-time-expense' | 'goal' | 'debt';


/**
 * Represents a single, itemized budget entry.
 */
export interface BudgetItem {
    id: string;
    description: string;
    amount: number;
    category: BudgetItemCategory;
}

/**
 * Represents the data stored for a specific weekly review.
 * Includes journal entry and comments linked to transaction IDs.
 * Added ownerId and sharedWith for collaboration.
 */
export interface WeeklyReviewData {
  ownerId: string; // ID of the user who owns this review
  journal: string;
  transactionComments?: Record<string, string>; // transactionId -> comment string
  sharedWith?: string[]; // Array of user IDs this review is shared with
}

/**
 * Represents user information needed for sharing display.
 */
export interface UserShareInfo {
    userId: string;
    email: string; // Primary email for identification
    name?: string; // Optional user's name
}
