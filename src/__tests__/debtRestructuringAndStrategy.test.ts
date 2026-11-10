// src/__tests__/debtRestructuringAndStrategy.test.ts
import { describe, it, expect } from 'vitest';
import type { DebtItem } from '@/lib/types';

describe('Debt Restructuring Calculations & Amortization Mechanics', () => {
  const calculateSuggestedPayment = (p: number, annualRate: number, months: number): number => {
    if (p <= 0 || months <= 0) return 0;
    if (annualRate <= 0) {
      return Math.ceil(p / months);
    }
    const monthlyRate = annualRate / 100 / 12;
    const payment = (p * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    return Math.ceil(payment);
  };

  it('calculates linear zero-interest payment accurately for interest-free loans', () => {
    const principal = 120000;
    const months = 12;
    const rate = 0;
    const payment = calculateSuggestedPayment(principal, rate, months);
    expect(payment).toBe(10000);
  });

  it('calculates standard amortization monthly payment for institutional loans', () => {
    const principal = 300000;
    const months = 24;
    const rate = 12; // 12% APR
    const payment = calculateSuggestedPayment(principal, rate, months);
    // Formula check: ~14,122
    expect(payment).toBeGreaterThan(14000);
    expect(payment).toBeLessThan(14500);
  });

  it('computes cash flow freed after extending loan terms and lowering interest rate', () => {
    const oldMonthlyPayment = 25000;
    const newPrincipal = 200000;
    const newRate = 8; // Refinanced from higher rate
    const newMonths = 24; // Extended duration
    const newPayment = calculateSuggestedPayment(newPrincipal, newRate, newMonths);

    const cashFlowFreed = oldMonthlyPayment - newPayment;
    expect(cashFlowFreed).toBeGreaterThan(0);
    expect(newPayment).toBeLessThan(oldMonthlyPayment);
  });
});

describe('Debt Payoff Strategy Simulations (Avalanche vs Snowball)', () => {
  const sampleDebts: DebtItem[] = [
    {
      id: 'd1',
      description: 'Credit Card Balance',
      principal: 50000,
      interestRate: 24, // High rate, low balance
      minPayment: 3000,
      term: 'short',
      classification: 'institutional',
      date: '2026-01-01',
    },
    {
      id: 'd2',
      description: 'SACCO Development Loan',
      principal: 300000,
      interestRate: 12, // Lower rate, higher balance
      minPayment: 15000,
      term: 'long',
      classification: 'institutional',
      date: '2026-01-01',
    },
    {
      id: 'd3',
      description: 'Family Tuition Loan',
      principal: 20000,
      interestRate: 0, // 0% rate, smallest balance
      minPayment: 2000,
      term: 'short',
      classification: 'personal',
      date: '2026-01-01',
    },
  ];

  it('sorts debts by highest interest rate first under Avalanche Strategy', () => {
    const sorted = [...sampleDebts].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));
    expect(sorted[0].description).toBe('Credit Card Balance'); // 24%
    expect(sorted[1].description).toBe('SACCO Development Loan'); // 12%
    expect(sorted[2].description).toBe('Family Tuition Loan'); // 0%
  });

  it('sorts debts by lowest principal first under Snowball Strategy', () => {
    const sorted = [...sampleDebts].sort((a, b) => a.principal - b.principal);
    expect(sorted[0].description).toBe('Family Tuition Loan'); // 20,000
    expect(sorted[1].description).toBe('Credit Card Balance'); // 50,000
    expect(sorted[2].description).toBe('SACCO Development Loan'); // 300,000
  });

  it('evaluates debt-to-income (DTI) health ratio correctly', () => {
    const totalMinPayments = sampleDebts.reduce((sum, d) => sum + d.minPayment, 0); // 20,000 KES
    const expectedIncome = 100000; // 100,000 KES
    const dtiRatio = (totalMinPayments / expectedIncome) * 100;

    expect(dtiRatio).toBe(20); // 20%
    const isModerate = dtiRatio > 15 && dtiRatio <= 35;
    expect(isModerate).toBe(true);
  });
});
