
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
 * Represents an item in the financial statements (Asset, Liability, Income, Expense).
 */
export interface StatementItem {
  id: string;
  description: string;
  amount: number;
}
