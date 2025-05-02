
'use server';
/**
 * @fileOverview Provides AI-driven debt analysis and strategy suggestions.
 *
 * - analyzeDebtStrategy - A function that analyzes debt data and suggests payoff strategies.
 * - DebtAnalysisInput - The input type for the analyzeDebtStrategy function.
 * - DebtAnalysisOutput - The return type for the analyzeDebtStrategy function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import type { DebtItem } from '@/lib/types'; // Import DebtItem type for structure reference

// Define Zod schema for individual debt items within the input
const DebtItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  principal: z.number(),
  interestRate: z.number(),
  minPayment: z.number(),
  term: z.enum(['short', 'long']),
});

// Define Zod schema for the input of the flow
const DebtAnalysisInputSchema = z.object({
  debts: z.array(DebtItemSchema).describe('List of current outstanding debts.'),
  totalBudgetedIncome: z.number().describe('Total monthly budgeted income in KES.'),
  totalBudgetedExpenses: z.number().describe('Total monthly budgeted expenses in KES (excluding debt payments listed).'),
  desiredPayoffTimeline: z.string().optional().describe('Optional user-provided desired payoff timeline (e.g., "within 3 years", "as fast as possible").'),
});
export type DebtAnalysisInput = z.infer<typeof DebtAnalysisInputSchema>;

// Define Zod schema for the output of the flow
const SuggestedPaymentSchema = z.object({
  debtId: z.string().describe('The ID of the debt this suggestion applies to.'),
  debtDescription: z.string().describe('The description of the debt.'),
  suggestedMonthlyPayment: z.number().describe('The suggested monthly payment amount in KES.'),
  rationale: z.string().describe('A brief explanation for the suggested payment amount and its priority.'),
});

const DebtAnalysisOutputSchema = z.object({
  debtClearanceStrategy: z.string().describe('Recommended debt payoff strategy (e.g., Snowball, Avalanche) with justification based on the provided debts and financial situation.'),
  suggestedPayments: z.array(SuggestedPaymentSchema).describe('An array of suggested monthly payments for each debt, prioritized according to the chosen strategy.'),
  projectedPayoffTimeline: z.string().describe('An estimated overall timeline to become debt-free based on the suggested payment plan and available funds.'),
  additionalTips: z.string().optional().describe('Optional extra tips for managing or reducing debt faster.'),
});
export type DebtAnalysisOutput = z.infer<typeof DebtAnalysisOutputSchema>;

// Exported async function wrapper to call the flow
export async function analyzeDebtStrategy(input: DebtAnalysisInput): Promise<DebtAnalysisOutput> {
  console.log("Calling debt analysis flow with input:", input); // Add logging
  try {
    const result = await debtAnalysisFlow(input);
    console.log("Debt analysis flow result:", result); // Add logging
    return result;
  } catch (error) {
    console.error("Error in debt analysis flow:", error); // Add logging
    throw error; // Re-throw the error after logging
  }
}


// Define the Genkit prompt
const debtAnalysisPrompt = ai.definePrompt({
  name: 'debtAnalysisPrompt',
  input: { schema: DebtAnalysisInputSchema },
  output: { schema: DebtAnalysisOutputSchema },
  prompt: `You are an expert financial advisor specializing in debt management strategies for individuals in Kenya (currency is KES). Analyze the provided list of debts and the user's financial situation (budgeted income and expenses).

Consider the following debts:
{{#each debts}}
- {{description}}: Principal KES {{principal}}, Rate {{interestRate}}%, Min. Payment KES {{minPayment}}, Term: {{term}}
{{/each}}

User's Financial Summary:
- Total Monthly Budgeted Income: KES {{totalBudgetedIncome}}
- Total Monthly Budgeted Expenses (excluding these debts): KES {{totalBudgetedExpenses}}
- Available funds for debt payment (Income - Expenses): KES {{math totalBudgetedIncome '-' totalBudgetedExpenses}}
{{#if desiredPayoffTimeline}}
- Desired Payoff Timeline: {{desiredPayoffTimeline}}
{{else}}
- Desired Payoff Timeline: As fast as possible within reasonable means.
{{/if}}

Based on this information:
1.  Recommend the most suitable debt payoff strategy (Debt Snowball or Debt Avalanche). Explain WHY this strategy is recommended for this specific situation. Describe the chosen strategy clearly.
2.  Provide a prioritized list of suggested monthly payments (in KES) for EACH debt. The total suggested payments should ideally utilize the available funds (Income - Expenses) effectively towards debt clearance, potentially exceeding minimum payments significantly based on the strategy and desired timeline. If available funds are insufficient even for minimums, state this clearly and suggest minimums as the target. For each suggested payment, provide a brief rationale (e.g., "Focus extra funds here", "Pay minimum while tackling higher priority"). Ensure the 'debtId' and 'debtDescription' fields match the input debts.
3.  Estimate the overall projected time it will take to become debt-free following this suggested plan. Be realistic (e.g., "approximately 3 years and 4 months").
4.  (Optional) Provide one or two brief, actionable additional tips relevant to the user's situation (e.g., negotiation, consolidation options if applicable, importance of sticking to budget).

Return the analysis in the specified JSON format. Ensure all amounts are in KES.
`,
});


// Define the Genkit flow
const debtAnalysisFlow = ai.defineFlow<
  typeof DebtAnalysisInputSchema,
  typeof DebtAnalysisOutputSchema
>(
  {
    name: 'debtAnalysisFlow',
    inputSchema: DebtAnalysisInputSchema,
    outputSchema: DebtAnalysisOutputSchema,
  },
  async (input) => {
    console.log("Executing debtAnalysisFlow with input:", input); // Add logging
    const llmResponse = await debtAnalysisPrompt(input);
    const output = llmResponse.output;

    if (!output) {
       console.error("LLM response output is undefined or null", llmResponse); // Log error details
      throw new Error('AI analysis failed to generate a valid response.');
    }
    console.log("Received LLM output:", output); // Add logging

    // Basic validation (optional, as Zod handles schema validation)
    if (!output.debtClearanceStrategy || !output.suggestedPayments || !output.projectedPayoffTimeline) {
       console.error("LLM output missing required fields:", output); // Log error details
       throw new Error('AI response is incomplete.');
    }


    return output;
  }
);
 
      