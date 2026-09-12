import { describe, it, expect, beforeEach } from 'vitest';
import { useDebtStore } from '@/store/debtStore';

describe('useDebtStore State Engine', () => {
  beforeEach(() => {
    useDebtStore.getState().clearDebts();
  });

  it('adds debt item with generated UUID and versioning', () => {
    const store = useDebtStore.getState();
    const newDebt = store.addDebt({
      description: 'Business Credit Line',
      principal: 250000,
      interestRate: 14.0,
      minPayment: 18000,
      term: 'short',
    });

    expect(newDebt.id).toBeDefined();
    expect(newDebt._acknowledgementVersion).toBe(1);

    const state = useDebtStore.getState();
    expect(state.debts).toHaveLength(1);
    expect(state.debts[0].principal).toBe(250000);
  });

  it('sorts debts by description and term length correctly', () => {
    const store = useDebtStore.getState();
    store.addDebt({ description: 'Vehicle Loan', principal: 1000000, interestRate: 13, minPayment: 30000, term: 'long' });
    store.addDebt({ description: 'Bank Overdraft', principal: 50000, interestRate: 18, minPayment: 10000, term: 'short' });

    const state = useDebtStore.getState();
    expect(state.debts[0].description).toBe('Bank Overdraft');
    expect(state.debts[1].description).toBe('Vehicle Loan');
  });

  it('updates debt parameters and tracks acknowledged principal changes', () => {
    const store = useDebtStore.getState();
    const debt = store.addDebt({
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
});
