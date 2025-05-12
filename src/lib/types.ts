// src/lib/types.ts

// These types are largely derived from Zod schemas in schemas.ts.
// Importing them directly or using z.infer is preferred for consistency.
// For clarity during development, some key types are reiterated here.

import type { 
    ModeOfPayment as ModeOfPaymentZod,
    TransactionFrequency as TransactionFrequencyZod,
    TransactionVariability as TransactionVariabilityZod,
    DebtTerm as DebtTermZod,
    BudgetItemCategory as BudgetItemCategoryZod,
    ClientLogPayload as ClientLogPayloadZod,
    SaveDataPayload as SaveDataPayloadZod
} from './schemas';


export type ModeOfPayment = ModeOfPaymentZod;
export type TransactionFrequency = TransactionFrequencyZod;
export type TransactionVariability = TransactionVariabilityZod;


export interface TransactionWithId {
  id: string;
  date: Date; // Stored as Date object in Zustand
  description: string;
  amount: number;
  modeOfPayment: ModeOfPayment;
  frequency?: TransactionFrequency | null; 
  variability?: TransactionVariability | null; 
  categoryName?: string | null; // New field to link to budget item description
}


export interface StatementItem {
  id: string;
  description: string;
  amount: number;
}


export type DebtTerm = DebtTermZod;

export interface DebtItem {
    id: string;
    description: string;
    principal: number;
    interestRate: number;
    minPayment: number;
    term: DebtTerm;
}


export interface OtherLiabilityItem {
    id: string;
    description: string;
    amount: number;
}


export type BudgetItemCategory = BudgetItemCategoryZod;


export interface BudgetItem {
    id: string;
    description: string;
    amount: number;
    category: BudgetItemCategory;
    period: string; 
}


export interface WeeklyReviewData {
  ownerId: string;
  ownerUsername?: string;
  journal: string;
  transactionComments?: Record<string, string>;
  sharedWith?: string[];
}


export interface UserShareInfo {
    userId: string;
    email: string;
    name?: string;
}


export type NotificationType = 'info' | 'warning' | 'error' | 'success' | 'budget' | 'collaboration' | 'update';


export interface NotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    timestamp: Date; 
    read: boolean;
    link?: string;
}

// Client Log Payload type (matches Zod schema)
export type ClientLogPayloadType = ClientLogPayloadZod;

// Save Data Payload type (matches Zod schema, dates are strings)
export type SaveDataPayloadType = SaveDataPayloadZod;

