import { describe, it, expect, beforeEach } from 'vitest';
import { useStatementStore } from '@/store/statementStore';

describe('useStatementStore State Engine', () => {
  beforeEach(() => {
    useStatementStore.getState().clearStatementItems();
  });

  it('initializes with empty items and isHydrated state', () => {
    const state = useStatementStore.getState();
    expect(state.assetItems).toEqual([]);
    expect(state.otherLiabilityItems).toEqual([]);
  });

  it('adds and sorts asset items alphabetically', () => {
    const store = useStatementStore.getState();
    store.addAssetItem({ description: 'Real Estate Holding', amount: 5000000, category: 'Property' });
    store.addAssetItem({ description: 'Cash in Bank', amount: 250000, category: 'Liquid' });

    const updatedState = useStatementStore.getState();
    expect(updatedState.assetItems).toHaveLength(2);
    expect(updatedState.assetItems[0].description).toBe('Cash in Bank');
    expect(updatedState.assetItems[1].description).toBe('Real Estate Holding');
  });

  it('updates dates atomically using setStatementDates', () => {
    const store = useStatementStore.getState();
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-12-31');

    store.setStatementDates(startDate, endDate);

    const updatedState = useStatementStore.getState();
    expect(updatedState.startDate).toEqual(startDate);
    expect(updatedState.endDate).toEqual(endDate);
  });

  it('updates and deletes liability items accurately', () => {
    const store = useStatementStore.getState();
    store.setOtherLiabilityItems([
      { id: 'liab_1', description: 'Tax Accrual', amount: 45000 },
      { id: 'liab_2', description: 'Vendor Payable', amount: 15000 },
    ]);

    expect(useStatementStore.getState().otherLiabilityItems).toHaveLength(2);

    store.deleteOtherLiabilityItem('liab_1');
    expect(useStatementStore.getState().otherLiabilityItems).toHaveLength(1);
    expect(useStatementStore.getState().otherLiabilityItems[0].id).toBe('liab_2');
  });
});
