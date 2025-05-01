
// src/lib/types.ts

/**
 * Represents the allowed modes of payment.
 */
export type ModeOfPayment = 'Cash' | 'Bank' | 'Mpesa';

/**
 * Represents a financial transaction with a unique identifier and payment mode.
 */
export interface TransactionWithId {
  id: string; // Using string ID for flexibility
  date: Date;
  description: string;
  amount: number; // Positive for income, negative for expense
  modeOfPayment: ModeOfPayment;
}

/**
 * Represents an item in the financial statements (Asset, Liability, Income, Expense).
 */
export interface StatementItem {
  id: string;
  description: string;
  amount: number;
}
