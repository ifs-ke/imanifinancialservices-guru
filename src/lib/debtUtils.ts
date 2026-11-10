// src/lib/debtUtils.ts
/**
 * @file debtUtils.ts
 * @description Domain utility functions for debt status computation, overdue detection,
 * interest estimations, and repayment expectation algorithms.
 */

import type { DebtItem, DebtStatus, DebtTerm } from '@/lib/types';

/**
 * Computes the real-time status of a debt item based on its recorded status,
 * balance, due/maturity date, and origination timeline.
 * 
 * Rules:
 * 1. If principal <= 0 or status is explicitly 'paid_off', status is 'paid_off'.
 * 2. If debt has an explicit dueDate in the past (before current date), status automatically evaluates to 'overdue'.
 * 3. If short-term loan (> 365 days from date) without explicit dueDate and still unpaid, evaluates to 'overdue'.
 * 4. If status is explicitly 'in_grace' and due date is not severely overdue (> 30 days), stays 'in_grace'.
 * 5. Otherwise returns debt.status || 'active'.
 */
export function computeDebtStatus(
  debt: {
    status?: DebtStatus;
    dueDate?: string | null;
    date?: string;
    term?: DebtTerm;
    principal?: number;
  },
  asOfDate: Date = new Date()
): DebtStatus {
  // If loan has no balance or is explicitly cleared
  if ((debt.principal !== undefined && debt.principal <= 0) || debt.status === 'paid_off') {
    return 'paid_off';
  }

  const todayStr = asOfDate.toISOString().split('T')[0];
  const todayTime = new Date(todayStr).getTime();

  // If explicit dueDate is specified
  if (debt.dueDate && debt.dueDate.trim() !== '') {
    const dueTime = new Date(debt.dueDate).getTime();
    if (!isNaN(dueTime)) {
      if (dueTime < todayTime) {
        // Passed the expected due date
        return 'overdue';
      }
      if (debt.status === 'in_grace') {
        return 'in_grace';
      }
      return debt.status || 'active';
    }
  }

  // If short term debt (< 1 year) has been active for more than 365 days without being marked paid off
  if (debt.term === 'short' && debt.date) {
    const originationTime = new Date(debt.date).getTime();
    if (!isNaN(originationTime)) {
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      if (todayTime - originationTime > oneYearMs) {
        return 'overdue';
      }
    }
  }

  // Preserve in_grace if active
  if (debt.status === 'in_grace') {
    return 'in_grace';
  }

  // Preserve overdue if manually marked or return active
  if (debt.status === 'overdue') {
    return 'overdue';
  }

  return debt.status || 'active';
}

/**
 * Calculates number of days a debt is overdue based on dueDate or 1-year short-term mark.
 * Returns 0 if not overdue.
 */
export function getDaysOverdue(
  debt: {
    dueDate?: string | null;
    date?: string;
    term?: DebtTerm;
    status?: DebtStatus;
    principal?: number;
  },
  asOfDate: Date = new Date()
): number {
  if ((debt.principal !== undefined && debt.principal <= 0) || debt.status === 'paid_off') {
    return 0;
  }

  const todayStr = asOfDate.toISOString().split('T')[0];
  const todayTime = new Date(todayStr).getTime();

  if (debt.dueDate && debt.dueDate.trim() !== '') {
    const dueTime = new Date(debt.dueDate).getTime();
    if (!isNaN(dueTime) && dueTime < todayTime) {
      const diffMs = todayTime - dueTime;
      return Math.floor(diffMs / (24 * 60 * 60 * 1000));
    }
  }

  if (debt.term === 'short' && debt.date) {
    const originationTime = new Date(debt.date).getTime();
    if (!isNaN(originationTime)) {
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const expectedDueTime = originationTime + oneYearMs;
      if (todayTime > expectedDueTime) {
        return Math.floor((todayTime - expectedDueTime) / (24 * 60 * 60 * 1000));
      }
    }
  }

  return 0;
}

/**
 * Checks whether a debt is considered paid off and should be excluded from active liabilities.
 */
export function isDebtPaidOff(
  debt: {
    status?: DebtStatus;
    principal?: number;
    dueDate?: string | null;
    date?: string;
    term?: DebtTerm;
  }
): boolean {
  if (!debt) return false;
  if (debt.principal !== undefined && Number(debt.principal) <= 0) return true;
  if (debt.status === 'paid_off') return true;
  return computeDebtStatus(debt) === 'paid_off';
}

/**
 * Checks whether a debt is currently active (outstanding obligation with positive balance).
 */
export function isDebtActive(
  debt: {
    status?: DebtStatus;
    principal?: number;
    dueDate?: string | null;
    date?: string;
    term?: DebtTerm;
  }
): boolean {
  return !isDebtPaidOff(debt);
}

/**
 * Filters a collection of debts to only return active, outstanding liabilities.
 * Paid off debts are safely excluded.
 */
export function getActiveDebts<T extends { status?: DebtStatus; principal?: number; dueDate?: string | null; date?: string; term?: DebtTerm }>(
  debts: T[]
): T[] {
  if (!Array.isArray(debts)) return [];
  return debts.filter(isDebtActive);
}

/**
 * Filters a collection of debts to return only paid off / settled obligations.
 */
export function getPaidOffDebts<T extends { status?: DebtStatus; principal?: number; dueDate?: string | null; date?: string; term?: DebtTerm }>(
  debts: T[]
): T[] {
  if (!Array.isArray(debts)) return [];
  return debts.filter(isDebtPaidOff);
}

/**
 * Calculates aggregate outstanding principal across all active (non-paid-off) debts.
 */
export function getTotalActiveDebtPrincipal(
  debts: { status?: DebtStatus; principal?: number; dueDate?: string | null; date?: string; term?: DebtTerm }[]
): number {
  return getActiveDebts(debts).reduce((sum, d) => sum + (Number(d.principal) || 0), 0);
}

/**
 * Calculates the monthly estimated simple interest for a given principal and annual interest rate percentage.
 * Formula: (principal * (annualRatePercentage / 100)) / 12
 * @param principal The loan balance or principal amount
 * @param annualRatePercentage Annual interest rate in percent (e.g., 12 for 12%)
 * @returns Estimated monthly interest amount, rounded to 2 decimal places
 */
export function calculateMonthlyInterest(principal: number, annualRatePercentage: number): number {
  const p = Number(principal) || 0;
  const r = Number(annualRatePercentage) || 0;
  if (p <= 0 || r <= 0) return 0;
  const monthly = (p * (r / 100)) / 12;
  return Math.round(monthly * 100) / 100;
}

/**
 * Calculates suggested monthly amortization payment for loan restructuring.
 * @param principal Principal balance to refinance/restructure
 * @param annualRate Annual interest rate in percent
 * @param months Term duration in months
 */
export function calculateSuggestedPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate <= 0) {
    return Math.ceil(principal / months);
  }
  const monthlyRate = annualRate / 100 / 12;
  const payment = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return Math.ceil(payment);
}


