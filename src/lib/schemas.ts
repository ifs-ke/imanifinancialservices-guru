// src/lib/schemas.ts
import { z } from 'zod';

// Enums / Literal types from src/lib/types.ts
export const ModeOfPaymentSchema = z.enum(['Cash', 'Bank', 'Mpesa']);
export type ModeOfPayment = z.infer<typeof ModeOfPaymentSchema>;

export const TransactionFrequencySchema = z.enum(['recurring', 'one-time']);
export type TransactionFrequency = z.infer<typeof TransactionFrequencySchema>;

export const TransactionVariabilitySchema = z.enum(['fixed', 'variable']);
export type TransactionVariability = z.infer<typeof TransactionVariabilitySchema>;

export const BudgetItemCategorySchema = z.enum(['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt']);
export type BudgetItemCategory = z.infer<typeof BudgetItemCategorySchema>;

export const DebtTermSchema = z.enum(['long', 'short']);
export type DebtTerm = z.infer<typeof DebtTermSchema>;

export const NotificationTypeSchema = z.enum(['info', 'warning', 'error', 'success', 'budget', 'collaboration', 'update']);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;


// Core Data Schemas (for internal use, matching store structures where Dates are Date objects)
export const TransactionWithIdSchema = z.object({
  id: z.string().min(1),
  date: z.date(),
  description: z.string().min(1, "Description cannot be empty"),
  amount: z.number(),
  modeOfPayment: ModeOfPaymentSchema,
  frequency: TransactionFrequencySchema.optional(),
  variability: TransactionVariabilitySchema.optional(),
});

export const StatementItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Description cannot be empty"),
  amount: z.number(),
});

export const DebtItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Description cannot be empty"),
  principal: z.number().min(0, "Principal must be non-negative"),
  interestRate: z.number().min(0, "Interest rate must be non-negative"),
  minPayment: z.number().min(0, "Minimum payment must be non-negative"),
  term: DebtTermSchema,
});

export const OtherLiabilityItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Description cannot be empty"),
  amount: z.number(),
});

export const BudgetItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Description cannot be empty"),
  amount: z.number().min(0, "Amount must be non-negative"),
  category: BudgetItemCategorySchema,
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format"),
});

export const WeeklyReviewDataSchema = z.object({
  ownerId: z.string().min(1),
  ownerUsername: z.string().optional(),
  journal: z.string(), // Can be empty
  transactionComments: z.record(z.string()).optional(),
  sharedWith: z.array(z.string()).optional(),
});

export const UserShareInfoSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email("Invalid email format"),
  name: z.string().optional(),
});

export const NotificationItemSchema = z.object({
  id: z.string().min(1),
  type: NotificationTypeSchema,
  title: z.string().min(1, "Title cannot be empty"),
  message: z.string().min(1, "Message cannot be empty"),
  timestamp: z.date(),
  read: z.boolean(),
  link: z.string().url("Invalid URL format for link").optional(),
});


// API Route Payload Schemas
// Schemas for data as it's received from the client (e.g., dates as strings)
export const APITransactionWithIdSchema = TransactionWithIdSchema.extend({
  date: z.string().datetime({ message: "Invalid ISO date string" }),
});

export const SaveDataPayloadSchema = z.object({
  transactions: z.array(APITransactionWithIdSchema),
  debts: z.array(DebtItemSchema),
  assetItems: z.array(StatementItemSchema),
  otherLiabilityItems: z.array(OtherLiabilityItemSchema),
  budgetItems: z.array(BudgetItemSchema),
  ownedReviews: z.record(WeeklyReviewDataSchema),
  startDate: z.string().datetime({ message: "Invalid ISO date string" }).optional(),
  endDate: z.string().datetime({ message: "Invalid ISO date string" }).optional(),
  gettingStartedDismissed: z.boolean().optional(),
  dataHash: z.string().min(1, "Data hash is required"),
});

export const ClientLogPayloadSchema = z.object({
  level: z.enum(['log', 'info', 'warn', 'error', 'debug']),
  message: z.string().min(1, "Log message cannot be empty"),
  context: z.record(z.any()).optional(),
});


// Server Action Input Schemas
export const SearchUserByEmailInputSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

export const ShareReviewInputSchema = z.object({
  weekKey: z.string().min(1, "Week key is required"),
  targetUserId: z.string().min(1, "Target user ID is required"),
});

export const RevokeShareInputSchema = z.object({
  weekKey: z.string().min(1, "Week key is required"),
  targetUserId: z.string().min(1, "Target user ID is required"),
});

export const GetSharedWithUsersInputSchema = z.object({
  weekKey: z.string().min(1, "Week key is required"),
});


// Form Schemas
export const BudgetItemFormValidationSchema = z.object({
    description: z.string().min(1, { message: "Description is required." }).max(100, {message: "Description too long"}),
    amount: z.number({invalid_type_error: "Amount must be a number."}).min(0, { message: "Amount must be non-negative." }),
    category: BudgetItemCategorySchema,
});

export const DebtItemFormValidationSchema = z.object({
    description: z.string().min(1, { message: "Description is required." }).max(100, {message: "Description too long"}),
    principal: z.number({invalid_type_error: "Principal must be a number."}).min(0, { message: "Principal must be non-negative." }),
    interestRate: z.number({invalid_type_error: "Interest rate must be a number."}).min(0, { message: "Interest rate must be non-negative." }).max(100, {message: "Rate seems too high"}),
    minPayment: z.number({invalid_type_error: "Minimum payment must be a number."}).min(0, { message: "Minimum payment must be non-negative." }),
    term: DebtTermSchema,
});

export const TransactionFormValidationSchema = z.object({
    date: z.string().refine((val) => !isNaN(Date.parse(val)) && new Date(val) <= new Date(), { message: "Invalid date or future date" }),
    description: z.string().min(1, { message: "Description is required." }).max(100, {message: "Description too long"}),
    amount: z.preprocess( // Allows string input from form, converts to number for validation
        (val) => (typeof val === 'string' && val.trim() !== '') ? parseFloat(val.replace(/,/g, '')) : val,
        z.number({ invalid_type_error: "Amount must be a number." })
           .refine(val => val !== 0, { message: "Amount cannot be zero." })
    ),
    modeOfPayment: ModeOfPaymentSchema,
    frequency: TransactionFrequencySchema.optional(),
    variability: TransactionVariabilitySchema.optional(),
});
