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

  it('correctly amortizes 0% interest loan (interest-free credit)', () => {
    const interestFreeDebt: DebtItem = {
      id: 'loan_zero',
      description: 'Director Interest-Free Loan',
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
});
