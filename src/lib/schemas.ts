
import { z } from 'zod';

// --- Transaction Schemas ---
export const ModeOfPaymentSchema = z.enum(['Cash', 'Bank', 'Mpesa']);
export type ModeOfPayment = z.infer<typeof ModeOfPaymentSchema>;

export const TransactionFrequencySchema = z.enum(['recurring', 'one-time']).optional().nullable();
export type TransactionFrequency = z.infer<typeof TransactionFrequencySchema>;

export const TransactionVariabilitySchema = z.enum(['fixed', 'variable']).optional().nullable();
export type TransactionVariability = z.infer<typeof TransactionVariabilitySchema>;

export const TransactionFormDataSchema = z.object({
  date: z.string().min(1, "Date is required").refine((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    return !isNaN(new Date(date).getTime());
  }, {
    message: "Invalid date format. Use YYYY-MM-DD.",
  }),
  description: z.string().min(1, { message: "Description is required" }).max(100, { message: "Description too long" }),
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }),
  modeOfPayment: ModeOfPaymentSchema,
  frequency: TransactionFrequencySchema,
  variability: TransactionVariabilitySchema,
  categoryName: z.string().optional().nullable(),
});
export type TransactionFormData = z.infer<typeof TransactionFormDataSchema>;

const LEAVE_UNCHANGED_LITERAL = "__LEAVE_UNCHANGED__";

export const BatchUpdateTransactionFormDataSchema = z.object({
  modeOfPayment: z.union([ModeOfPaymentSchema, z.literal(LEAVE_UNCHANGED_LITERAL)]).optional(),
  frequency: z.union([z.enum(['recurring', 'one-time']), z.literal(LEAVE_UNCHANGED_LITERAL)]).optional().nullable(),
  variability: z.union([z.enum(['fixed', 'variable']), z.literal(LEAVE_UNCHANGED_LITERAL)]).optional().nullable(),
  categoryName: z.string().optional().nullable().or(z.literal(LEAVE_UNCHANGED_LITERAL)),
});
export type BatchUpdateTransactionFormData = z.infer<typeof BatchUpdateTransactionFormDataSchema>;


// --- Budget Schemas ---
export const BudgetItemCategorySchema = z.enum(['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt', 'unplanned-expense']);
export type BudgetItemCategory = z.infer<typeof BudgetItemCategorySchema>;

export const BudgetItemFormDataSchema = z.object({
  description: z.string().min(1, "Description is required").max(100, "Description too long"),
  amount: z.number({
    required_error: "Amount is required",
    invalid_type_error: "Amount must be a number",
  }).positive({ message: "Amount must be positive" }),
  category: BudgetItemCategorySchema.refine(val => val !== 'unplanned-expense', {
    message: "Unplanned Expense is not a valid category for manual budgeting."
  }).or(z.enum(['income', 'recurring-expense', 'one-time-expense', 'goal', 'debt'])),
});
export type BudgetItemFormData = z.infer<typeof BudgetItemFormDataSchema>;


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

// --- Investment Schemas ---
export const InvestmentFormDataSchema = z.object({
  name: z.string().min(1, "Investment name is required").max(100, "Name too long"),
  type: z.string().min(1, "Investment type is required").max(50, "Type too long"),
  purchaseDate: z.string().min(1, "Purchase date is required").refine((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    return !isNaN(new Date(date).getTime());
  }, {
    message: "Invalid purchase date. Use YYYY-MM-DD.",
  }),
  quantity: z.number({
    required_error: "Quantity is required",
    invalid_type_error: "Quantity must be a number",
  }).positive({ message: "Quantity must be positive" }),
  purchasePrice: z.number({
    required_error: "Purchase price is required",
    invalid_type_error: "Purchase price must be a number",
  }).positive({ message: "Purchase price must be positive" }),
  currentValue: z.number({
    required_error: "Current value is required",
    invalid_type_error: "Current value must be a number",
  }).min(0, { message: "Current value cannot be negative" }),
  currency: z.string().min(3, "Currency code required (e.g., KES)").max(3, "Currency code too long").default("KES"),
  notes: z.string().max(500, "Notes too long").optional().nullable(),
});
export type InvestmentFormData = z.infer<typeof InvestmentFormDataSchema>;

export const GovBondForecastingFormSchema = z.object({
  faceValue: z.coerce.number().positive({ message: 'Face value must be positive.' }),
  couponRate: z.coerce.number().min(0, { message: 'Coupon rate cannot be negative.' }).max(50, { message: 'Coupon rate seems too high (0-50).' }),
  yearsToMaturity: z.coerce.number().int().min(1, { message: 'Duration must be at least 1 year.' }).max(50, { message: 'Max 50 years.' }),
  couponPaymentFrequency: z.enum(['annually', 'semi-annually']),
});
export type GovBondForecastingFormData = z.infer<typeof GovBondForecastingFormSchema>;


// --- API Payload Schemas ---
export const ClientLogPayloadSchema = z.object({
  level: z.enum(['log', 'info', 'warn', 'error', 'debug']),
  message: z.string(),
  context: z.record(z.any()).optional(),
});
export type ClientLogPayload = z.infer<typeof ClientLogPayloadSchema>;


// Base schema for items that might have their amounts stringified by prepareDataForHashing
const BaseItemSchemaForAPI = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.coerce.number(), // Use coerce for server-side parsing from stringified fixed-point
});
export type BaseItemForAPIType = z.infer<typeof BaseItemSchemaForAPI>;

const TransactionItemSchemaForAPI = BaseItemSchemaForAPI.extend({
  date: z.string(), // ISO string
  modeOfPayment: ModeOfPaymentSchema,
  frequency: TransactionFrequencySchema.nullable(),
  variability: TransactionVariabilitySchema.nullable(),
  categoryName: z.string().optional().nullable(),
});
export type TransactionItemForAPIType = z.infer<typeof TransactionItemSchemaForAPI>;

const DebtItemAPISchema = z.object({
  id: z.string(),
  description: z.string(),
  principal: z.coerce.number(),
  interestRate: z.coerce.number(),
  minPayment: z.coerce.number(),
  term: DebtTermSchema,
});
export type DebtItemForAPIType = z.infer<typeof DebtItemAPISchema>;


const BudgetItemAPISchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.coerce.number(),
  category: BudgetItemCategorySchema,
  period: z.string(),
});
export type BudgetItemForAPIType = z.infer<typeof BudgetItemAPISchema>;

const InvestmentItemAPISchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  purchaseDate: z.string(), // ISO string
  quantity: z.coerce.number(),
  purchasePrice: z.coerce.number(),
  currentValue: z.coerce.number(),
  currency: z.string(),
  notes: z.string().optional().nullable(),
});
export type InvestmentItemForAPIType = z.infer<typeof InvestmentItemAPISchema>;

const WeeklyReviewDataAPISchema = z.object({
  ownerId: z.string(),
  ownerUsername: z.string().optional(),
  journal: z.string(),
  transactionComments: z.record(z.string()).optional(),
  sharedWith: z.array(z.string()).optional(),
  // weekKey is usually the key in the record, not a field within
});
export type WeeklyReviewDataForAPIType = z.infer<typeof WeeklyReviewDataAPISchema>;

// Schema for collection changes (created, updated, deletedIds)
const createCollectionChangesSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  created: z.array(itemSchema).optional(),
  updated: z.array(itemSchema.extend({ id: z.string() })).optional(), // Ensure updated items have an ID
  deletedIds: z.array(z.string()).optional(),
}).optional();

export const SaveDataPayloadSchema = z.object({
  transactions: createCollectionChangesSchema(TransactionItemSchemaForAPI),
  debts: createCollectionChangesSchema(DebtItemAPISchema),
  assetItems: createCollectionChangesSchema(BaseItemSchemaForAPI),
  otherLiabilityItems: createCollectionChangesSchema(BaseItemSchemaForAPI),
  budgetItems: createCollectionChangesSchema(BudgetItemAPISchema),
  ownedReviews: createCollectionChangesSchema(WeeklyReviewDataAPISchema.extend({ weekKey: z.string() })), // ownedReviews need weekKey in items
  investmentItems: createCollectionChangesSchema(InvestmentItemAPISchema),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  gettingStartedDismissed: z.boolean().optional(),
  payloadDataHash: z.string({ required_error: "Payload data hash is required" }),
  lastKnownServerHash: z.string().nullable().optional(),
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
