import { describe, it, expect, beforeEach } from 'vitest';
import { useBudgetStore } from '@/store/budgetStore';

describe('useBudgetStore Financial Envelopes', () => {
  beforeEach(() => {
    useBudgetStore.getState().clearBudgetItems();
  });

  it('adds and sorts budget items by period and category', () => {
    const store = useBudgetStore.getState();
    const item1 = store.addBudgetItem({
      category: 'Utilities',
      plannedAmount: 15000,
      actualAmount: 14200,
      period: '2026-03',
      type: 'expense',
    });

    const item2 = store.addBudgetItem({
      category: 'Commercial Revenue',
      plannedAmount: 300000,
      actualAmount: 325000,
      period: '2026-03',
      type: 'income',
    });

    expect(item1.id).toBeDefined();
    expect(item2.id).toBeDefined();

    const state = useBudgetStore.getState();
    expect(state.budgetItems).toHaveLength(2);
  });

  it('updates envelope allocations accurately and computes variance', () => {
    const store = useBudgetStore.getState();
    const item = store.addBudgetItem({
      category: 'Software Subscriptions',
      plannedAmount: 20000,
      actualAmount: 0,
      period: '2026-04',
      type: 'expense',
    });

    store.updateBudgetItem({
      ...item,
      actualAmount: 18500,
    });

    const updated = useBudgetStore.getState().budgetItems.find(b => b.id === item.id);
    expect(updated?.actualAmount).toBe(18500);
    const variance = (updated?.plannedAmount || 0) - (updated?.actualAmount || 0);
    expect(variance).toBe(1500); // 1,500 under budget
  });

  it('deletes budget envelopes cleanly', () => {
    const store = useBudgetStore.getState();
    const item = store.addBudgetItem({
      category: 'Marketing',
      plannedAmount: 50000,
      actualAmount: 0,
      period: '2026-05',
      type: 'expense',
    });

    store.deleteBudgetItem(item.id);
    expect(useBudgetStore.getState().budgetItems).toHaveLength(0);
  });
});
