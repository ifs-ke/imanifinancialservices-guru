import { z } from 'zod';

// --- Transaction Schemas ---
export const ModeOfPaymentSchema = z.enum(['Cash', 'Bank', 'Mpesa']);
export type ModeOfPayment = z.infer<typeof ModeOfPaymentSchema>;

export const TransactionFrequencySchema = z.enum(['recurring', 'one-time']).optional().nullable();
export type TransactionFrequency = z.infer<typeof TransactionFrequencySchema>;

export const TransactionVariabilitySchema = z.enum(['fixed', 'variable']).optional().nullable();
export type TransactionVariability = z.infer<typeof TransactionVariabilitySchema>;

export const TransactionFormDataSchema = z.object({
  date: z.string().refine((date) => !isNaN(new Date(date).getTime()), {
    message: "Invalid date format",
  }),
  description: z.string().min(1, { message: "Description is required" }).max(100, { message: "Description too long" }),
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }),
  modeOfPayment: ModeOfPaymentSchema,
  frequency: TransactionFrequencySchema,
  variability: TransactionVariabilitySchema,
});
export type TransactionFormData = z.infer<typeof TransactionFormDataSchema>;
export const TransactionFormValidationSchema = TransactionFormDataSchema;


// --- Budget Schemas ---
// Added 'unplanned-expense' to allow for this category in budget variance reporting.
// It's not meant for user selection during budget creation, but for categorizing actuals.
export const BudgetItemCategorySchema = z.enum(['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt', 'unplanned-expense']);
export type BudgetItemCategory = z.infer<typeof BudgetItemCategorySchema>;

export const BudgetItemFormDataSchema = z.object({
  description: z.string().min(1, "Description is required").max(100, "Description too long"),
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }).positive({ message: "Amount must be positive" }),
  // Ensure 'unplanned-expense' is not a selectable option for user input form if this schema is reused.
  // For forms, you might use a more restrictive schema: z.enum(['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt'])
  category: BudgetItemCategorySchema.refine(val => val !== 'unplanned-expense', {
    message: "Unplanned Expense is not a valid category for manual budgeting."
  }).or(z.enum(['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt'])), // Fallback to ensure it's one of the valid ones for form
});
export type BudgetItemFormData = z.infer<typeof BudgetItemFormDataSchema>;
export const BudgetItemFormValidationSchema = BudgetItemFormDataSchema;


// --- Debt Schemas ---
export const DebtTermSchema = z.enum(['short', 'long']);
export type DebtTerm = z.infer<typeof DebtTermSchema>;

export const DebtItemFormDataSchema = z.object({
  description: z.string().min(1, "Description is required").max(100, "Description too long"),
  principal: z.number({
    required_error: "Principal is required",
    invalid_type_error: "Principal must be a number",
  }).positive({ message: "Principal must be positive" }),
  interestRate: z.number({
    required_error: "Interest rate is required",
    invalid_type_error: "Interest rate must be a number",
  }).min(0, "Interest rate cannot be negative").max(100, "Interest rate seems too high"),
  minPayment: z.number({
    required_error: "Minimum payment is required",
    invalid_type_error: "Minimum payment must be a number",
  }).min(0, "Minimum payment cannot be negative"),
  term: DebtTermSchema,
});
export type DebtItemFormData = z.infer<typeof DebtItemFormDataSchema>;
export const DebtItemFormValidationSchema = DebtItemFormDataSchema;


// --- API Payload Schemas ---
export const ClientLogPayloadSchema = z.object({
  level: z.enum(['log', 'info', 'warn', 'error', 'debug']),
  message: z.string(),
  context: z.record(z.any()).optional(),
});
export type ClientLogPayload = z.infer<typeof ClientLogPayloadSchema>;


const BaseItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
});

const TransactionItemSchema = BaseItemSchema.extend({
  date: z.string(), // ISO string
  modeOfPayment: ModeOfPaymentSchema,
  frequency: TransactionFrequencySchema.nullable(),
  variability: TransactionVariabilitySchema.nullable(),
});

const DebtItemAPISchema = z.object({
  id: z.string(),
  description: z.string(),
  principal: z.number(),
  interestRate: z.number(),
  minPayment: z.number(),
  term: DebtTermSchema,
});

const BudgetItemAPISchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
  category: BudgetItemCategorySchema, // Allows 'unplanned-expense' if data comes this way
  period: z.string(),
});

const WeeklyReviewDataAPISchema = z.object({
  ownerId: z.string(),
  ownerUsername: z.string().optional(),
  journal: z.string(),
  transactionComments: z.record(z.string()).optional(),
  sharedWith: z.array(z.string()).optional(),
});


export const SaveDataPayloadSchema = z.object({
  transactions: z.array(TransactionItemSchema).optional().default([]),
  debts: z.array(DebtItemAPISchema).optional().default([]),
  assetItems: z.array(BaseItemSchema).optional().default([]),
  otherLiabilityItems: z.array(BaseItemSchema).optional().default([]),
  budgetItems: z.array(BudgetItemAPISchema).optional().default([]),
  ownedReviews: z.record(WeeklyReviewDataAPISchema).optional().default({}),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  gettingStartedDismissed: z.boolean().optional(),
  dataHash: z.string({ required_error: "Data hash is required" }),
});
export type SaveDataPayload = z.infer<typeof SaveDataPayloadSchema>;

// --- Share Actions Schemas ---
export const SearchUserByEmailInputSchema = z.object({
  email: z.string().email("Invalid email address."),
});

export const ShareReviewInputSchema = z.object({
  weekKey: z.string().regex(/^\d{4}-\d{2}$/, "Invalid weekKey format (YYYY-WW)."),
  targetUserId: z.string().min(1, "Target user ID is required."),
});

export const RevokeShareInputSchema = z.object({
  weekKey: z.string().regex(/^\d{4}-\d{2}$/, "Invalid weekKey format (YYYY-WW)."),
  targetUserId: z.string().min(1, "Target user ID is required."),
});

export const GetSharedWithUsersInputSchema = z.object({
  weekKey: z.string().regex(/^\d{4}-\d{2}$/, "Invalid weekKey format (YYYY-WW)."),
});
