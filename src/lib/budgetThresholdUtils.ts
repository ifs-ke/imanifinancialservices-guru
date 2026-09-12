/**
 * @file budgetThresholdUtils.ts
 * @description Utility functions for calculating monthly budget threshold warnings
 * when actual or projected spending is trending to exceed monthly envelopes by >10%.
 */

import { startOfMonth, endOfMonth, getDate, getDaysInMonth, isValid, isSameMonth } from 'date-fns';
import type { BudgetItem, TransactionWithId } from '@/lib/types';

export interface CategoryThresholdWarning {
  categoryName: string;
  categoryType?: string;
  budgetedAmount: number;
  actualSpent: number;
  projectedSpent: number;
  spentPercentage: number;
  projectedPercentage: number;
  overagePercentage: number;
  isExceedingActual: boolean;
  isExceedingTrending: boolean;
  severity: 'warning' | 'critical';
  daysElapsed: number;
  totalDaysInMonth: number;
}

/**
 * Calculates budget categories where actual spending is trending to exceed monthly budget by >10%.
 */
export function calculateBudgetThresholdWarnings(
  budgetItems: BudgetItem[],
  transactions: TransactionWithId[],
  period: string,
  referenceDate: Date = new Date()
): CategoryThresholdWarning[] {
  if (!period || typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) {
    return [];
  }

  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return [];
  }

  const periodStartDate = startOfMonth(new Date(year, month - 1));
  const periodEndDate = endOfMonth(periodStartDate);
  const totalDaysInMonth = getDaysInMonth(periodStartDate);

  // Determine elapsed days in period
  let daysElapsed = totalDaysInMonth;
  if (isSameMonth(referenceDate, periodStartDate) && referenceDate.getFullYear() === year) {
    daysElapsed = Math.min(Math.max(1, getDate(referenceDate)), totalDaysInMonth);
  } else if (referenceDate < periodStartDate) {
    daysElapsed = 1;
  }

  const paceFraction = daysElapsed / totalDaysInMonth;

  // Filter relevant expense budget items for period
  const periodBudgetItems = (budgetItems || []).filter(
    item => item.period === period && 
    (item.category === 'recurring-expense' || 
     item.category === 'one-time-expense' || 
     item.category === 'debt' || 
     item.category === 'unplanned-expense' ||
     item.category === 'goal') &&
    item.amount > 0
  );

  // Filter transactions for period where amount < 0 (expenses)
  const periodTransactions = (transactions || []).filter(tx => {
    const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
    if (!isValid(txDate)) return false;
    return tx.amount < 0 && txDate >= periodStartDate && txDate <= periodEndDate;
  });

  // Aggregate spending by category/envelope description
  const spendingMap: Record<string, { actualSpent: number; categoryType?: string; budgetedAmount: number }> = {};

  // First seed map with budgeted items
  periodBudgetItems.forEach(item => {
    spendingMap[item.description] = {
      actualSpent: 0,
      categoryType: item.category,
      budgetedAmount: item.amount,
    };
  });

  // Map transactions to categories
  periodTransactions.forEach(tx => {
    const expenseAmount = Math.abs(tx.amount);
    // Find matching budget item description
    const match = periodBudgetItems.find(bi => 
      bi.description.toLowerCase() === (tx.categoryName || '').toLowerCase() ||
      bi.description.toLowerCase() === tx.description.toLowerCase()
    );

    const key = match ? match.description : (tx.categoryName || tx.description || 'Uncategorized');

    if (!spendingMap[key]) {
      spendingMap[key] = {
        actualSpent: 0,
        categoryType: 'unplanned-expense',
        budgetedAmount: 0,
      };
    }

    spendingMap[key].actualSpent += expenseAmount;
  });

  const warnings: CategoryThresholdWarning[] = [];

  Object.entries(spendingMap).forEach(([categoryName, data]) => {
    const { budgetedAmount, actualSpent, categoryType } = data;
    if (budgetedAmount <= 0) return;

    const projectedSpent = actualSpent / paceFraction;
    const spentPercentage = (actualSpent / budgetedAmount) * 100;
    const projectedPercentage = (projectedSpent / budgetedAmount) * 100;
    const thresholdPercentage = 110; // >10% over budget threshold

    const isExceedingActual = spentPercentage > thresholdPercentage;
    const isExceedingTrending = projectedPercentage > thresholdPercentage;

    if (isExceedingActual || isExceedingTrending) {
      const overagePercentage = Math.max(0, projectedPercentage - 100);
      const severity: 'warning' | 'critical' = (spentPercentage > 110 || projectedPercentage > 125) ? 'critical' : 'warning';

      warnings.push({
        categoryName,
        categoryType,
        budgetedAmount,
        actualSpent,
        projectedSpent,
        spentPercentage,
        projectedPercentage,
        overagePercentage,
        isExceedingActual,
        isExceedingTrending,
        severity,
        daysElapsed,
        totalDaysInMonth,
      });
    }
  });

  return warnings.sort((a, b) => b.projectedPercentage - a.projectedPercentage);
}
