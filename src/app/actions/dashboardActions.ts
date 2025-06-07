// src/app/actions/dashboardActions.ts
'use server';

import prisma from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';
import { format, startOfMonth as dfnsStartOfMonth, endOfMonth as dfnsEndOfMonth, differenceInDays, parse, getDaysInMonth, isValid as isDateValid, eachMonthOfInterval } from 'date-fns';
import type { TransactionWithId, DebtItem, StatementItem, OtherLiabilityItem, BudgetItem, InvestmentItem } from '@/lib/types';
import { ensureUserInDb } from '@/app/actions/shareActions';

// Helper for financial calculations
const calculateTotal = (items: { amount: number }[]): number => items.reduce((sum, item) => sum + (item.amount || 0), 0);
const calculateDebtTotal = (items: { principal: number }[]): number => items.reduce((sum, item) => sum + (item.principal || 0), 0);

export interface DashboardData {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  totalDebt: number;
  totalOtherLiabilities: number;
  totalInvestmentValue: number;
  cashFlow: number; // Net actual income - net actual expenses (overall)
  totalIncome: number; // Total actual income (overall)
  totalExpenses: number; // Total actual expenses (overall)
  monthlyTrendData: { month: string; income: number; expense: number }[];
  budgetSummary: {
    budgetedIncome: number;
    budgetedExpenses: number;
    actualIncome: number;
    actualExpenses: number;
    variance: number | null; // Positive for favorable, negative for unfavorable
    status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data';
  } | null;
  debtPayoffTimeline: string;
  gettingStartedDismissed: boolean;
  statementPeriod: { startDate?: string, endDate?: string }; // For displaying the period used for actuals in budget variance
  userName: string | null;
}

export async function getDashboardDataServer(): Promise<DashboardData | null> {
  const user = await currentUser();
  if (!user?.id || !user.primaryEmailAddress?.emailAddress) {
    console.warn('[DashboardActions] getDashboardDataServer: User not authenticated or missing primary email.');
    return null;
  }
  const userId = user.id;
  const userName = user.fullName || user.firstName || user.username || user.primaryEmailAddress.emailAddress;

  try {
    await ensureUserInDb(userId, user.primaryEmailAddress.emailAddress, user.fullName);

    const [
      transactions,
      debts,
      assetItems,
      otherLiabilityItems,
      investmentItems,
      budgetItems, // Fetch all for budget calculations
      statementSettings,
    ] = await prisma.$transaction([
      prisma.transaction.findMany({ where: { userId } }),
      prisma.debt.findMany({ where: { userId } }),
      prisma.assetItem.findMany({ where: { userId } }),
      prisma.otherLiabilityItem.findMany({ where: { userId } }),
      prisma.investmentItem.findMany({ where: { userId } }),
      prisma.budgetItem.findMany({ where: { userId } }),
      prisma.statementSettings.findUnique({ where: { userId } }),
    ]);

    // Financial Summary Calculations
    const totalAssetsFromStatement = calculateTotal(assetItems);
    const totalInvestmentValue = investmentItems.reduce((sum, item) => sum + (item.currentValue || 0), 0);
    const netWorthTotalAssets = totalAssetsFromStatement + totalInvestmentValue;

    const totalDebt = calculateDebtTotal(debts);
    const totalOtherLiabilities = calculateTotal(otherLiabilityItems);
    const totalLiabilities = totalDebt + totalOtherLiabilities;
    const netWorth = netWorthTotalAssets - totalLiabilities;

    const totalIncomeOverall = calculateTotal(transactions.filter(tx => (tx.amount || 0) > 0));
    const totalExpensesOverall = Math.abs(calculateTotal(transactions.filter(tx => (tx.amount || 0) < 0)));
    const cashFlowOverall = totalIncomeOverall - totalExpensesOverall;

    // Monthly Trend Data (Last 12 months or available data)
    const monthlyTrendDataMap: { [key: string]: { month: string; income: number; expense: number } } = {};
    const twelveMonthsAgo = dfnsStartOfMonth(new Date(new Date().setMonth(new Date().getMonth() - 11)));

    transactions.forEach(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        if (!isDateValid(txDate) || txDate < twelveMonthsAgo) return; // Only consider last 12 full months + current
        const monthKey = format(txDate, 'yyyy-MM');
        if (!monthlyTrendDataMap[monthKey]) {
            monthlyTrendDataMap[monthKey] = { month: format(txDate, 'MMM yyyy'), income: 0, expense: 0 };
        }
        if ((tx.amount || 0) > 0) monthlyTrendDataMap[monthKey].income += tx.amount || 0;
        else if ((tx.amount || 0) < 0) monthlyTrendDataMap[monthKey].expense += Math.abs(tx.amount || 0);
    });
    const monthlyTrendData = Object.values(monthlyTrendDataMap).sort((a,b) => new Date(a.month.replace(' ', ' 1, ')).getTime() - new Date(b.month.replace(' ', ' 1, ')).getTime());


    // Budget Variance Calculation (Uses statement period for actuals, current month's budget items)
    let budgetSummaryData: DashboardData['budgetSummary'] = null;
    const currentActualBudgetPeriodKey = format(new Date(), 'yyyy-MM'); // Budget context is current month
    
    const actualStartDate = statementSettings?.statementStartDate ? new Date(statementSettings.statementStartDate) : dfnsStartOfMonth(new Date());
    const actualEndDate = statementSettings?.statementEndDate ? new Date(statementSettings.statementEndDate) : dfnsEndOfMonth(new Date());

    const budgetItemsForCurrentActualMonth = budgetItems.filter(item => item.period === currentActualBudgetPeriodKey);
    const proratedBudgetedIncome = budgetItemsForCurrentActualMonth.filter(i => i.category === 'income').reduce((s, i) => s + (i.amount || 0), 0);
    const proratedBudgetedSpending = budgetItemsForCurrentActualMonth.filter(i => i.category !== 'income').reduce((s, i) => s + (i.amount || 0), 0);

    const actualTransactionsForStatementPeriod = transactions.filter(tx => {
        const txDate = tx.date instanceof Date ? tx.date : new Date(tx.date);
        return isDateValid(txDate) && txDate >= actualStartDate && txDate <= actualEndDate;
    });
    const actualIncomeForStatementPeriod = actualTransactionsForStatementPeriod.filter(tx => (tx.amount || 0) > 0).reduce((s, tx) => s + (tx.amount || 0), 0);
    const actualExpensesForStatementPeriod = Math.abs(actualTransactionsForStatementPeriod.filter(tx => (tx.amount || 0) < 0).reduce((s, tx) => s + (tx.amount || 0), 0));

    if (proratedBudgetedIncome > 0 || proratedBudgetedSpending > 0 || actualIncomeForStatementPeriod > 0 || actualExpensesForStatementPeriod > 0) {
        const netBudgeted = proratedBudgetedIncome - proratedBudgetedSpending;
        const netActual = actualIncomeForStatementPeriod - actualExpensesForStatementPeriod;
        const variance = netActual - netBudgeted; // Positive is favorable
        const threshold = Math.max(Math.abs(netBudgeted * 0.10), 100); // 10% or 100 KES threshold
        let status: 'on-track' | 'over-budget' | 'under-budget' | 'no-data' = 'no-data';

        if (proratedBudgetedIncome === 0 && proratedBudgetedSpending === 0 && actualIncomeForStatementPeriod === 0 && actualExpensesForStatementPeriod === 0) status = 'no-data';
        else if (Math.abs(variance) <= threshold) status = 'on-track';
        else if (variance > 0) status = 'under-budget'; // Favorable
        else status = 'over-budget'; // Unfavorable

        budgetSummaryData = {
          budgetedIncome: proratedBudgetedIncome,
          budgetedExpenses: proratedBudgetedSpending,
          actualIncome: actualIncomeForStatementPeriod,
          actualExpenses: actualExpensesForStatementPeriod,
          variance,
          status
        };
    }

    // Debt Payoff Timeline (Simplified - based on current month's budgeted debt payments)
    let debtPayoffTimelineEst = "N/A";
    const budgetedDebtPaymentForCurrentMonth = budgetItemsForCurrentActualMonth.filter(i => i.category === 'debt').reduce((s, i) => s + (i.amount || 0), 0);

    if (totalDebt <= 0) {
        debtPayoffTimelineEst = "Debt Free!";
    } else if (budgetedDebtPaymentForCurrentMonth <= 0) {
        debtPayoffTimelineEst = "Budget N/A for debt.";
    } else {
        const averageInterestRate = debts.length > 0 ? debts.reduce((sum, d) => sum + (d.interestRate || 0), 0) / debts.length / 100 : 0.0; // Default to 0% if no debts
        const monthlyInterestOnTotalDebt = totalDebt * (averageInterestRate / 12);

        if (averageInterestRate > 0 && budgetedDebtPaymentForCurrentMonth <= monthlyInterestOnTotalDebt && totalDebt > 0) {
            debtPayoffTimelineEst = "Warning: Payments low.";
        } else {
            let tempMonths = 0;
            let tempBalance = totalDebt;
            const MAX_MONTHS_SERVER_EST = 480; // Cap at 40 years for server estimate
            while (tempBalance > 0.01 && tempMonths < MAX_MONTHS_SERVER_EST) {
                tempMonths++;
                if (averageInterestRate > 0) { // Only add interest if rate is positive
                    tempBalance += tempBalance * (averageInterestRate / 12);
                }
                tempBalance -= budgetedDebtPaymentForCurrentMonth;
                if (budgetedDebtPaymentForCurrentMonth <=0 && averageInterestRate <=0) break; // Avoid infinite loop if no payment and no interest
            }
            if (tempMonths >= MAX_MONTHS_SERVER_EST && tempBalance > 0.01) {
                debtPayoffTimelineEst = `Over ${Math.floor(MAX_MONTHS_SERVER_EST / 12)} years (est.)`;
            } else if (tempBalance <= 0.01) {
                const years = Math.floor(tempMonths / 12);
                const remMonths = tempMonths % 12;
                debtPayoffTimelineEst = `${years > 0 ? `${years}yr ` : ''}${remMonths > 0 ? `${remMonths}mo ` : ''}(est.)`.trim() || 'Soon (est.)';
            } else {
                 debtPayoffTimelineEst = "Long term (est.)";
            }
        }
    }

    return {
      netWorth,
      totalAssets: netWorthTotalAssets,
      totalLiabilities,
      totalDebt,
      totalOtherLiabilities,
      totalInvestmentValue,
      cashFlow: cashFlowOverall,
      totalIncome: totalIncomeOverall,
      totalExpenses: totalExpensesOverall,
      monthlyTrendData,
      budgetSummary: budgetSummaryData,
      debtPayoffTimeline: debtPayoffTimelineEst,
      gettingStartedDismissed: statementSettings?.gettingStartedDismissed ?? false,
      statementPeriod: {
        startDate: actualStartDate.toISOString(),
        endDate: actualEndDate.toISOString(),
      },
      userName,
    };

  } catch (error) {
    console.error('[DashboardActions] getDashboardDataServer Error:', { message: (error as Error).message, stack: (error as Error).stack, userId });
    return null;
  }
}
