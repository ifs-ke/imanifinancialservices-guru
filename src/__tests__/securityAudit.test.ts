import { describe, it, expect, beforeEach } from 'vitest';
import { runComprehensiveSecurityAudit } from '@/lib/securityAudit';
import { useTransactionsStore } from '@/store/transactionsStore';
import { useDebtStore } from '@/store/debtStore';
import { useBudgetStore } from '@/store/budgetStore';
import { useStatementStore } from '@/store/statementStore';
import { useInvestmentStore } from '@/store/investmentStore';

describe('Security Audit & Multi-Tenant Engine', () => {
  beforeEach(() => {
    // Reset stores
    useTransactionsStore.getState().clearTransactions();
    useDebtStore.getState().clearDebts();
    useBudgetStore.getState().clearBudgetItems();
    useStatementStore.getState().clearStatementItems();
    useInvestmentStore.getState().clearInvestmentItems();
  });

  it('passes 100% security audit for clean single-tenant dataset', () => {
    const userId = 'usr_tenant_alpha';

    useTransactionsStore.getState().setTransactions([
      {
        id: 'tx_1',
        userId,
        date: new Date('2026-03-01'),
        description: 'Monthly Salary',
        amount: 250000,
        modeOfPayment: 'Bank',
        frequency: 'monthly',
        variability: 'fixed',
      },
    ]);

    useDebtStore.getState().setDebts([
      {
        id: 'debt_1',
        userId,
        date: '2026-01-01',
        dueDate: '2027-01-01',
        description: 'Sacco Development Loan',
        classification: 'personal',
        principal: 500000,
        interestRate: 12,
        minPayment: 25000,
        term: 'long',
        status: 'active',
      },
    ]);

    const report = runComprehensiveSecurityAudit({
      currentUserId: userId,
      isGuest: false,
      userRole: 'client',
      autoRemediate: true,
    });

    expect(report.overallStatus).toBe('passed');
    expect(report.healthScore).toBe(100);
    expect(report.passedChecks).toBe(report.totalChecks);
    expect(report.quarantinedCount).toBe(0);
    expect(report.scannedCounts.transactions).toBe(1);
    expect(report.scannedCounts.debts).toBe(1);
  });

  it('safely auto-adopts unassigned or imported guest items without data loss', () => {
    const guestUid = 'guest_1790323022021_x4h6hxl';

    // Simulate imported data that previously lacked userId or had 'anonymous_or_server'
    useTransactionsStore.getState().setTransactions([
      {
        id: 'tx_imported_1',
        userId: 'anonymous_or_server',
        date: new Date('2026-03-02'),
        description: 'Groceries at Naivas',
        amount: 4500,
        modeOfPayment: 'M-Pesa',
        frequency: 'one-time',
        variability: 'variable',
      } as any,
      {
        id: 'tx_imported_2',
        date: new Date('2026-03-03'),
        description: 'Fuel at Rubis',
        amount: 5000,
        modeOfPayment: 'Credit Card',
        frequency: 'one-time',
        variability: 'variable',
      } as any,
    ]);

    const report = runComprehensiveSecurityAudit({
      currentUserId: guestUid,
      isGuest: true,
      userRole: 'guest',
      autoRemediate: true,
    });

    expect(report.overallStatus).toBe('passed');
    expect(report.remediatedCount).toBe(2);
    expect(report.quarantinedCount).toBe(0);

    // Verify items in store now have the current guest user ID
    const updatedTxs = useTransactionsStore.getState().transactions;
    expect(updatedTxs[0].userId).toBe(guestUid);
    expect(updatedTxs[1].userId).toBe(guestUid);
  });

  it('detects and flags foreign authenticated cross-tenant intrusion', () => {
    const currentUserId = 'usr_alice_123';
    const intruderUserId = 'usr_bob_456';

    useTransactionsStore.getState().setTransactions([
      {
        id: 'tx_bob_1',
        userId: intruderUserId,
        date: new Date('2026-03-01'),
        description: 'Private Corporate Consulting',
        amount: 850000,
        modeOfPayment: 'Bank',
        frequency: 'one-time',
        variability: 'variable',
      },
    ]);

    const report = runComprehensiveSecurityAudit({
      currentUserId,
      isGuest: false,
      userRole: 'client',
      autoRemediate: false,
    });

    expect(report.overallStatus).toBe('failed');
    expect(report.quarantinedCount).toBe(1);
    const tenantCheck = report.checks.find((c) => c.id === 'tenant_isolation');
    expect(tenantCheck?.status).toBe('failed');
  });

  it('identifies mathematical ledger anomalies such as NaN amounts', () => {
    const userId = 'usr_test_math';

    useTransactionsStore.getState().setTransactions([
      {
        id: 'tx_corrupt',
        userId,
        date: new Date('2026-03-01'),
        description: 'Corrupt Entry',
        amount: NaN,
        modeOfPayment: 'Bank',
        frequency: 'one-time',
        variability: 'fixed',
      },
    ]);

    const report = runComprehensiveSecurityAudit({
      currentUserId: userId,
      isGuest: false,
      userRole: 'client',
      autoRemediate: true,
    });

    const ledgerCheck = report.checks.find((c) => c.id === 'ledger_integrity');
    expect(ledgerCheck?.status).toBe('warning');
  });
});
