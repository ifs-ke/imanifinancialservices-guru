
// src/lib/types.ts

/**
 * Represents the allowed modes of payment.
 */
export type ModeOfPayment = 'Cash' | 'Bank' | 'Mpesa';

/**
 * Represents a financial transaction with a unique identifier and payment mode.
 * ModeOfPayment can be optional initially during import/parsing.
 */
export interface TransactionWithId {
  id: string; // Using string ID for flexibility
  date: Date;
  description: string;
  amount: number; // Positive for income, negative for expense
  modeOfPayment: ModeOfPayment; // Make mandatory after import/creation
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

