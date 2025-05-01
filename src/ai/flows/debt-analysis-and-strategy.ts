'use server';

/**
 * @fileOverview Analyzes user's debts and recommends a repayment strategy based on Dave Ramsey's principles.
 *
 * - analyzeDebtAndRecommendStrategy - A function that analyzes debt and recommends a strategy.
 * - AnalyzeDebtInput - The input type for the analyzeDebtAndRecommendStrategy function.
 * - AnalyzeDebtOutput - The return type for the analyzeDebtAndRecommendStrategy function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {Transaction} from '@/services/transaction-importer';

const AnalyzeDebtInputSchema = z.object({
  transactions: z
    .array(
      z.object({
        date: z.string().describe('The date of the transaction.'),
        description: z.string().describe('A description of the transaction.'),
        amount: z
          .number()
          .describe(
            'The amount of the transaction. Positive numbers indicate income, negative indicate expenses.'
          ),
      })
    )
    .describe('An array of financial transactions.'),
  totalDebt: z.number().describe('The user\'s total debt amount.'),
});

export type AnalyzeDebtInput = z.infer<typeof AnalyzeDebtInputSchema>;

const AnalyzeDebtOutputSchema = z.object({
  summary: z.string().describe('A summary of the debt analysis.'),
  recommendation: z
    .string()
    .describe(
      'A debt repayment strategy recommendation based on Dave Ramsey\'s principles.'
    ),
});

export type AnalyzeDebtOutput = z.infer<typeof AnalyzeDebtOutputSchema>;

export async function analyzeDebtAndRecommendStrategy(
  input: AnalyzeDebtInput
): Promise<AnalyzeDebtOutput> {
  return analyzeDebtAndRecommendStrategyFlow(input);
}

const prompt = ai.definePrompt({
  name: 'debtAnalysisAndStrategyPrompt',
  input: {
    schema: z.object({
      transactions: z
        .array(
          z.object({
            date: z.string().describe('The date of the transaction.'),
            description: z.string().describe('A description of the transaction.'),
            amount: z
              .number()
              .describe(
                'The amount of the transaction. Positive numbers indicate income, negative indicate expenses.'
              ),
          })
        )
        .describe('An array of financial transactions.'),
      totalDebt: z.number().describe('The user\'s total debt amount.'),
    }),
  },
  output: {
    schema: z.object({
      summary: z.string().describe('A summary of the debt analysis.'),
      recommendation: z
        .string()
        .describe(
          'A debt repayment strategy recommendation based on Dave Ramsey\'s principles.'
        ),
    }),
  },
  prompt: `You are a financial advisor specializing in debt repayment strategies based on Dave Ramsey\'s Financial Peace University principles.

  Analyze the following financial transactions and total debt to recommend a debt repayment strategy. Provide a summary of the debt analysis and a detailed recommendation following Dave Ramsey\'s approach, such as the debt snowball method.

  Transactions:
  {{#each transactions}}
  - Date: {{date}}, Description: {{description}}, Amount: {{amount}}
  {{/each}}

  Total Debt: {{totalDebt}}
  `,
});

const analyzeDebtAndRecommendStrategyFlow = ai.defineFlow<
  typeof AnalyzeDebtInputSchema,
  typeof AnalyzeDebtOutputSchema
>(
  {
    name: 'analyzeDebtAndRecommendStrategyFlow',
    inputSchema: AnalyzeDebtInputSchema,
    outputSchema: AnalyzeDebtOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
