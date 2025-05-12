import { z } from 'zod';

export const SaveDataPayloadSchema = z.object({
    transactions: z.array(z.object({}).passthrough()).optional(),
    debts: z.array(z.object({}).passthrough()).optional(),
    assetItems: z.array(z.object({}).passthrough()).optional(),
    otherLiabilityItems: z.array(z.object({}).passthrough()).optional(),
    budgetItems: z.array(z.object({}).passthrough()).optional(),
    ownedReviews: z.record(z.object({}).passthrough()).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    gettingStartedDismissed: z.boolean().optional(),
    dataHash: z.string()
});
