/**
 * @file budgetThresholdWarning.test.ts
 * @description Automated unit test suite verifying monthly budget threshold warning calculations
 * when actual or projected spending is trending to exceed envelope budgets by > 10%.
 */

import { describe, it, expect } from 'vitest';
import { calculateBudgetThresholdWarnings } from '@/lib/budgetThresholdUtils';
import type { BudgetItem, TransactionWithId } from '@/lib/types';

describe('calculateBudgetThresholdWarnings Engine', () => {
  const samplePeriod = '2026-09';
  const midMonthRefDate = new Date(2026, 8, 15); // Day 15 of 30 (50% month elapsed)

  const sampleBudgetItems: BudgetItem[] = [
    {
      id: 'b_1',
      description: 'Groceries & Household',
      amount: 20000,
      category: 'recurring-expense',
      period: '2026-09',
    },
    {
      id: 'b_2',
      description: 'Utilities & Bills',
      amount: 10000,
      category: 'recurring-expense',
      period: '2026-09',
    },
    {
      id: 'b_3',
      description: 'Dining Out',
      amount: 15000,
      category: 'one-time-expense',
      period: '2026-09',
    },
  ];

  it('identifies category where projected spending pace exceeds budget by >10%', () => {
    // Spent 12,000 out of 20,000 budget on day 15 (50% elapsed) -> Pace = 24,000 (120% of budget > 110%)
    const transactions: TransactionWithId[] = [
      {
        id: 'tx_1',
        description: 'Supermarket shopping',
        amount: -12000,
        date: new Date(2026, 8, 10),
        modeOfPayment: 'M-Pesa',
        categoryName: 'Groceries & Household',
      },
      {
        id: 'tx_2',
        description: 'Water & Electricity',
        amount: -4000,
        date: new Date(2026, 8, 12),
        modeOfPayment: 'Bank Transfer',
        categoryName: 'Utilities & Bills',
      },
    ];

    const warnings = calculateBudgetThresholdWarnings(
      sampleBudgetItems,
      transactions,
      samplePeriod,
      midMonthRefDate
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].categoryName).toBe('Groceries & Household');
    expect(warnings[0].budgetedAmount).toBe(20000);
    expect(warnings[0].actualSpent).toBe(12000);
    expect(warnings[0].projectedSpent).toBe(24000);
    expect(warnings[0].projectedPercentage).toBe(120);
    expect(warnings[0].isExceedingTrending).toBe(true);
  });

  it('identifies category where actual spent has already exceeded budget by >10%', () => {
    // Spent 11,500 out of 10,000 budget (115% > 110%)
    const transactions: TransactionWithId[] = [
      {
        id: 'tx_3',
        description: 'Electric bill payment',
        amount: -11500,
        date: new Date(2026, 8, 14),
        modeOfPayment: 'M-Pesa',
        categoryName: 'Utilities & Bills',
      },
    ];

    const warnings = calculateBudgetThresholdWarnings(
      sampleBudgetItems,
      transactions,
      samplePeriod,
      midMonthRefDate
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].categoryName).toBe('Utilities & Bills');
    expect(warnings[0].isExceedingActual).toBe(true);
    expect(warnings[0].severity).toBe('critical');
  });

  it('returns empty array when all categories remain strictly under the 10% threshold', () => {
    // Spent 3,000 on Groceries (projected 6,000 out of 20,000 = 30%)
    const transactions: TransactionWithId[] = [
      {
        id: 'tx_4',
        description: 'Small grocery purchase',
        amount: -3000,
        date: new Date(2026, 8, 5),
        modeOfPayment: 'Cash',
        categoryName: 'Groceries & Household',
      },
    ];

    const warnings = calculateBudgetThresholdWarnings(
      sampleBudgetItems,
      transactions,
      samplePeriod,
      midMonthRefDate
    );

    expect(warnings).toHaveLength(0);
  });

  it('handles invalid period or empty input arrays gracefully', () => {
    expect(calculateBudgetThresholdWarnings([], [], 'invalid-period')).toEqual([]);
    expect(calculateBudgetThresholdWarnings([], [], '2026-09')).toEqual([]);
  });
});
