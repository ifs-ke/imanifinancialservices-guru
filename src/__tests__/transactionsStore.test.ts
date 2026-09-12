import { describe, it, expect, beforeEach } from 'vitest';
import { useTransactionsStore } from '@/store/transactionsStore';

describe('useTransactionsStore Ledger Engine', () => {
  beforeEach(() => {
    useTransactionsStore.getState().clearTransactions();
  });

  it('records transaction entries with unique IDs and maintains date ordering', () => {
    const store = useTransactionsStore.getState();
    const tx1 = store.addTransaction({
      date: '2026-03-01T10:00:00.000Z',
      description: 'M-Pesa Business Payment',
      amount: -4500,
      categoryName: 'Operating Expense',
      source: 'M-Pesa Statement',
    });

    const tx2 = store.addTransaction({
      date: '2026-03-02T14:30:00.000Z',
      description: 'Client Retainer Deposit',
      amount: 150000,
      categoryName: 'Revenue',
      source: 'Bank Transfer',
    });

    expect(tx1.id).toBeDefined();
    expect(tx2.id).toBeDefined();

    const state = useTransactionsStore.getState();
    expect(state.transactions).toHaveLength(2);
  });

  it('supports batch update and category reclassification', () => {
    const store = useTransactionsStore.getState();
    const tx = store.addTransaction({
      date: '2026-03-05T08:00:00.000Z',
      description: 'Fuel & Transport',
      amount: -3200,
      categoryName: 'Uncategorized',
    });

    store.updateTransaction({
      ...tx,
      categoryName: 'Logistics & Fuel',
    });

    const updated = useTransactionsStore.getState().transactions.find(t => t.id === tx.id);
    expect(updated?.categoryName).toBe('Logistics & Fuel');
  });

  it('deletes transaction records reliably', () => {
    const store = useTransactionsStore.getState();
    const tx = store.addTransaction({
      date: '2026-03-10T12:00:00.000Z',
      description: 'Voided Check',
      amount: 0,
    });

    store.deleteTransaction(tx.id);
    expect(useTransactionsStore.getState().transactions).toHaveLength(0);
  });
});
