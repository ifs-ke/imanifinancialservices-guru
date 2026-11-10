import { describe, it, expect } from 'vitest';
import type { DebtItem } from '@/lib/types';

/**
 * Pure calculation logic matching DebtAmortizationSheet algorithm
 */
function calculateAmortization(debt: DebtItem) {
  const monthlyInterestRate = debt.interestRate / 100 / 12;
  const monthlyPayment = debt.minPayment;
  let balance = debt.principal;
  let paymentNumber = 0;
  const schedule = [];
  const threshold = 0.01;

  if (balance <= 0) return schedule;

  if (monthlyPayment <= 0 && monthlyInterestRate > 0 && balance > 0) {
    schedule.push({ paymentNumber: 1, startingBalance: balance, payment: 0, principal: 0, interest: balance * monthlyInterestRate, endingBalance: balance, error: "Zero minimum payment, balance increases" });
    return schedule;
  }
  if (monthlyPayment <= 0 && monthlyInterestRate <= 0 && balance > 0) {
    schedule.push({ paymentNumber: 1, startingBalance: balance, payment: 0, principal: 0, interest: 0, endingBalance: balance, error: "Zero minimum payment, zero interest" });
    return schedule;
  }

  while (balance > threshold && paymentNumber < 720) {
    paymentNumber++;
    const startingBalance = balance;
    const interestPayment = balance * monthlyInterestRate;
    let principalPayment = monthlyPayment - interestPayment;
    let actualPayment = monthlyPayment;

    if (principalPayment <= 0 && monthlyInterestRate > 0) {
      schedule.push({
        paymentNumber,
        startingBalance,
        payment: actualPayment,
        principal: 0,
        interest: interestPayment,
        endingBalance: startingBalance,
        error: "Payment <= Interest"
      });
      break;
    }

    if (balance - principalPayment <= threshold) {
      actualPayment = balance + interestPayment;
      principalPayment = balance;
      balance = 0;
    } else {
      balance -= principalPayment;
    }

    schedule.push({
      paymentNumber,
      startingBalance,
      payment: actualPayment,
      principal: principalPayment,
      interest: interestPayment,
      endingBalance: balance,
    });
  }

  return schedule;
}

describe('Debt Amortization & Financial Mechanics', () => {
  it('calculates accurate payoff schedule for standard loan', () => {
    const loan: DebtItem = {
      id: 'loan_1',
      date: '2026-09-01',
      classification: 'institutional',
      description: 'SME Commercial Equipment Loan',
      principal: 100000,
      interestRate: 12.0, // 1% per month
      minPayment: 10000,
      term: 'short',
    };

    const schedule = calculateAmortization(loan);
    expect(schedule.length).toBeGreaterThan(0);
    expect(schedule.length).toBeLessThan(15); // should pay off in ~11 months

    // Last row ending balance must be zero
    const finalRow = schedule[schedule.length - 1];
    expect(finalRow.endingBalance).toBe(0);
    expect(finalRow.error).toBeUndefined();

    // First month interest should be 1% of 100,000 = 1,000
    expect(schedule[0].interest).toBeCloseTo(1000, 2);
    expect(schedule[0].principal).toBeCloseTo(9000, 2);
  });

  it('correctly amortizes 0% interest loan (interest-free personal credit)', () => {
    const interestFreeDebt: DebtItem = {
      id: 'loan_zero',
      date: '2026-08-15',
      classification: 'personal',
      description: 'Friends & Family Interest-Free Loan',
      principal: 60000,
      interestRate: 0,
      minPayment: 20000,
      term: 'short',
    };

    const schedule = calculateAmortization(interestFreeDebt);
    expect(schedule).toHaveLength(3); // Exactly 3 months of 20,000
    expect(schedule[0].interest).toBe(0);
    expect(schedule[0].principal).toBe(20000);
    expect(schedule[2].endingBalance).toBe(0);
  });

  it('detects negative amortization / unserviceable debt where payment <= interest', () => {
    const distressedDebt: DebtItem = {
      id: 'loan_bad',
      date: '2026-07-01',
      classification: 'institutional',
      description: 'High APR Emergency Loan',
      principal: 100000,
      interestRate: 24.0, // 2% per month = 2000 interest
      minPayment: 1500, // lower than interest
      term: 'short',
    };

    const schedule = calculateAmortization(distressedDebt);
    expect(schedule[0].error).toBe('Payment <= Interest');
    expect(schedule[0].endingBalance).toBe(100000);
  });

  it('calculates monthly interest accurately with calculateMonthlyInterest', async () => {
    const { calculateMonthlyInterest } = await import('@/lib/debtUtils');
    // 120,000 principal at 12% APR -> 1% per month = 1,200
    expect(calculateMonthlyInterest(120000, 12)).toBe(1200);

    // 50,000 principal at 18% APR -> 1.5% per month = 750
    expect(calculateMonthlyInterest(50000, 18)).toBe(750);

    // 0% interest or 0 principal returns 0
    expect(calculateMonthlyInterest(50000, 0)).toBe(0);
    expect(calculateMonthlyInterest(0, 15)).toBe(0);
    expect(calculateMonthlyInterest(-1000, 10)).toBe(0);
  });

  it('filters out paid-off debts from active liabilities on statements and dashboards', async () => {
    const { isDebtPaidOff, isDebtActive, getActiveDebts, getPaidOffDebts, getTotalActiveDebtPrincipal } = await import('@/lib/debtUtils');

    const testDebts: DebtItem[] = [
      {
        id: 'd1',
        description: 'Active Credit Card',
        principal: 45000,
        interestRate: 18,
        minPayment: 3000,
        term: 'short',
        status: 'active',
        classification: 'institutional',
      },
      {
        id: 'd2',
        description: 'Settled Personal Loan',
        principal: 0,
        interestRate: 10,
        minPayment: 0,
        term: 'short',
        status: 'paid_off',
        classification: 'personal',
      },
      {
        id: 'd3',
        description: 'Old Car Loan with 0 balance but status active',
        principal: 0,
        interestRate: 12,
        minPayment: 0,
        term: 'long',
        status: 'active',
        classification: 'institutional',
      },
      {
        id: 'd4',
        description: 'Active Mortgage',
        principal: 2500000,
        interestRate: 11,
        minPayment: 35000,
        term: 'long',
        status: 'active',
        classification: 'institutional',
      },
    ];

    expect(isDebtPaidOff(testDebts[1])).toBe(true);
    expect(isDebtPaidOff(testDebts[2])).toBe(true); // zero principal is paid off
    expect(isDebtActive(testDebts[0])).toBe(true);
    expect(isDebtActive(testDebts[3])).toBe(true);

    const activeList = getActiveDebts(testDebts);
    expect(activeList).toHaveLength(2);
    expect(activeList.map(d => d.id)).toEqual(['d1', 'd4']);

    const paidOffList = getPaidOffDebts(testDebts);
    expect(paidOffList).toHaveLength(2);
    expect(paidOffList.map(d => d.id)).toEqual(['d2', 'd3']);

    expect(getTotalActiveDebtPrincipal(testDebts)).toBe(45000 + 2500000);
  });

  it('calculates monthly interest accurately with calculateMonthlyInterest', async () => {
    const { calculateMonthlyInterest } = await import('@/lib/debtUtils');

    // 100,000 principal at 12% APR -> (100000 * 0.12) / 12 = 1,000
    expect(calculateMonthlyInterest(100000, 12)).toBe(1000);

    // 50,000 principal at 15.5% APR -> (50000 * 0.155) / 12 = 645.83
    expect(calculateMonthlyInterest(50000, 15.5)).toBe(645.83);

    // 0% interest loan
    expect(calculateMonthlyInterest(80000, 0)).toBe(0);

    // 0 or negative principal
    expect(calculateMonthlyInterest(0, 14)).toBe(0);
    expect(calculateMonthlyInterest(-1000, 14)).toBe(0);
  });

  it('validates secured and unsecured debt structure in schema', async () => {
    const { DebtItemFormDataSchema } = await import('@/lib/schemas');

    // Default to unsecured when not provided
    const unsecuredPayload = {
      date: '2026-09-25',
      description: 'Personal Loan',
      classification: 'personal',
      principal: 20000,
      interestRate: 0,
      minPayment: 2000,
      term: 'short',
      status: 'active',
    };
    const parsedUnsecured = DebtItemFormDataSchema.parse(unsecuredPayload);
    expect(parsedUnsecured.securityType).toBe('unsecured');
    expect(parsedUnsecured.securityDescription).toBeUndefined();

    // Secured debt with optional collateral description
    const securedPayload = {
      date: '2026-09-25',
      description: 'Secured Asset Financing',
      classification: 'institutional',
      principal: 450000,
      interestRate: 14,
      minPayment: 15000,
      term: 'long',
      status: 'active',
      securityType: 'secured',
      securityDescription: 'Vehicle Logbook KCA 999X',
    };
    const parsedSecured = DebtItemFormDataSchema.parse(securedPayload);
    expect(parsedSecured.securityType).toBe('secured');
    expect(parsedSecured.securityDescription).toBe('Vehicle Logbook KCA 999X');
  });
});

