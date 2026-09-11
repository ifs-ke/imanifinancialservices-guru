// src/lib/types.ts

import type {
    ModeOfPayment as ModeOfPaymentZod,
    TransactionFrequency as TransactionFrequencyZod,
    TransactionVariability as TransactionVariabilityZod,
    DebtTerm as DebtTermZod,
    BudgetItemCategory as BudgetItemCategoryZodInternal,
    ClientLogPayload as ClientLogPayloadZod,
    SaveDataPayload as SaveDataPayloadZod,
    InvestmentFormData as InvestmentFormDataZod,
    IncomeCategory as IncomeCategoryZod,
} from './schemas';


export type ModeOfPayment = ModeOfPaymentZod;
export type TransactionFrequency = TransactionFrequencyZod;
export type TransactionVariability = TransactionVariabilityZod;
export type IncomeCategory = IncomeCategoryZod;


export interface TransactionWithId {
  id: string;
  date: Date;
  description: string;
  amount: number;
  modeOfPayment: ModeOfPayment;
  frequency?: TransactionFrequency | null;
  variability?: TransactionVariability | null;
  categoryName?: string | null;
  incomeCategory?: IncomeCategory | null;
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

export type BudgetItemCategory = BudgetItemCategoryZodInternal | 'unplanned-expense' | 'unbudgeted-income';


export interface BudgetItem {
    id: string;
    description: string;
    amount: number;
    category: BudgetItemCategoryZodInternal;
    period: string;
}

export interface PublishedBudget {
    id: string;
    period: string;
    items: BudgetItem[];
    publishedAt: Date;
    totalIncome: number;
    totalSpending: number;
    net: number;
}

export interface InvestmentItem {
    id: string;
    name: string;
    type: string;
    purchaseDate: Date;
    quantity: number;
    purchasePrice: number;
    currentValue: number;
    currency: string;
    notes?: string | null;
}
export type InvestmentFormData = InvestmentFormDataZod;


export type ShareScopeType = 'week' | 'month' | 'period';

export interface CollaboratorComment {
  id: string;
  transactionId: string;
  authorId: string;
  authorName: string;
  authorEmail?: string;
  role: 'owner' | 'reviewer';
  comment: string;
  createdAt: string;
}

export interface SharedReviewRecord {
  id: string;
  scope: ShareScopeType;
  periodKey: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  ownerUserId: string;
  ownerName?: string;
  ownerEmail?: string;
  sharedWithUserId: string;
  sharedWithName?: string;
  sharedWithEmail?: string;
  permissions: 'comment_only';
  status: 'active' | 'revoked';
  transactionsSnapshot?: TransactionWithId[];
  comments: Record<string, CollaboratorComment[]>;
  journal?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface WeeklyReviewData {
  ownerId: string;
  ownerUsername?: string;
  journal: string;
  transactionComments?: Record<string, string>;
  collaboratorComments?: Record<string, CollaboratorComment[]>;
  sharedWith?: string[];
  weekKey?: string;
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

export type ClientLogPayloadType = ClientLogPayloadZod;

export type SaveDataPayloadType = SaveDataPayloadZod;
