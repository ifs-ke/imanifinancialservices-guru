import { describe, it, expect, beforeEach } from 'vitest';
import { useDebtStore } from '@/store/debtStore';

describe('useDebtStore State Engine', () => {
  beforeEach(() => {
    useDebtStore.getState().clearDebts();
  });

  it('adds debt item with generated UUID, date, and classification', () => {
    const store = useDebtStore.getState();
    const newDebt = store.addDebt({
      date: '2026-09-20',
      classification: 'personal',
      description: 'Family Support Loan',
      principal: 250000,
      interestRate: 0,
      minPayment: 18000,
      term: 'short',
    });

    expect(newDebt.id).toBeDefined();
    expect(newDebt._acknowledgementVersion).toBe(1);
    expect(newDebt.classification).toBe('personal');
    expect(newDebt.date).toBe('2026-09-20');

    const state = useDebtStore.getState();
    expect(state.debts).toHaveLength(1);
    expect(state.debts[0].principal).toBe(250000);
    expect(state.debts[0].classification).toBe('personal');
  });

  it('sorts debts by date descending and description', () => {
    const store = useDebtStore.getState();
    store.addDebt({ date: '2026-08-01', classification: 'institutional', description: 'Vehicle Loan', principal: 1000000, interestRate: 13, minPayment: 30000, term: 'long' });
    store.addDebt({ date: '2026-09-15', classification: 'institutional', description: 'Bank Overdraft', principal: 50000, interestRate: 18, minPayment: 10000, term: 'short' });

    const state = useDebtStore.getState();
    expect(state.debts[0].description).toBe('Bank Overdraft');
    expect(state.debts[1].description).toBe('Vehicle Loan');
  });

  it('updates debt parameters and tracks acknowledged principal changes', () => {
    const store = useDebtStore.getState();
    const debt = store.addDebt({
      date: '2026-09-10',
      classification: 'institutional',
      description: 'Supplier Credit',
      principal: 80000,
      interestRate: 0,
      minPayment: 20000,
      term: 'short',
    });

    store.updateDebt({ ...debt, principal: 60000 });
    expect(useDebtStore.getState().debts[0].principal).toBe(60000);

    store.acknowledgeDebtChange(debt.id);
    const ack = useDebtStore.getState().acknowledgedPrincipals[debt.id];
    expect(ack).toBeDefined();
    expect(ack.principal).toBe(60000);
  });

  it('normalizes debt status and automatically flags overdue debts when due date is in past', () => {
    const store = useDebtStore.getState();
    const pastDueDate = '2025-06-30';
    const futureDueDate = '2027-12-31';

    const overdueDebt = store.addDebt({
      date: '2025-01-01',
      dueDate: pastDueDate,
      classification: 'institutional',
      description: 'Defaulted Bridge Loan',
      principal: 150000,
      interestRate: 14,
      minPayment: 15000,
      term: 'short',
      status: 'active',
    });

    const activeDebt = store.addDebt({
      date: '2026-09-01',
      dueDate: futureDueDate,
      classification: 'personal',
      description: 'Family Tuition Assistance',
      principal: 50000,
      interestRate: 0,
      minPayment: 5000,
      term: 'short',
      status: 'active',
    });

    const state = useDebtStore.getState();
    const foundOverdue = state.debts.find(d => d.id === overdueDebt.id);
    const foundActive = state.debts.find(d => d.id === activeDebt.id);

    expect(foundOverdue?.status).toBe('overdue');
    expect(foundActive?.status).toBe('active');
  });

  it('allows manual status updates such as marking debt as paid_off', () => {
    const store = useDebtStore.getState();
    const debt = store.addDebt({
      date: '2026-09-01',
      classification: 'personal',
      description: 'Friend Quick Loan',
      principal: 10000,
      interestRate: 0,
      minPayment: 10000,
      term: 'short',
      status: 'active',
    });

    store.updateDebt({
      ...debt,
      status: 'paid_off',
      principal: 0,
    });

    const state = useDebtStore.getState();
    expect(state.debts[0].status).toBe('paid_off');
  });
});
