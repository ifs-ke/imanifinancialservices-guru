import { describe, it, expect } from 'vitest';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';

describe('prepareDataForHashing Canonical Normalization', () => {
  it('normalizes full snapshot data into stable canonical ordering', () => {
    const rawData = {
      transactions: [
        { id: 'tx2', date: '2026-03-02T10:00:00.000Z', description: 'Supplier Invoice', amount: 45000 },
        { id: 'tx1', date: '2026-03-01T08:00:00.000Z', description: 'Consulting Fee', amount: 120000 },
      ],
      debts: [
        { id: 'd2', description: 'Commercial Term Loan', principal: 500000, interestRate: 14.5, minPayment: 25000, term: 'long' as const },
        { id: 'd1', description: 'Asset Financing', principal: 120000, interestRate: 12.0, minPayment: 15000, term: 'short' as const },
      ],
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-03-31T23:59:59.999Z'),
    };

    const prepared = prepareDataForHashing(rawData);

    // Transactions must be sorted chronologically
    expect(prepared.transactions[0].id).toBe('tx1');
    expect(prepared.transactions[1].id).toBe('tx2');

    // Debts must be sorted alphabetically by description
    expect(prepared.debts[0].description).toBe('Asset Financing');
    expect(prepared.debts[1].description).toBe('Commercial Term Loan');

    // Numbers must be normalized to fixed string format
    expect(prepared.transactions[0].amount).toBe('120000.00');
    expect(prepared.debts[0].principal).toBe('120000.00');
    expect(prepared.debts[0].interestRate).toBe('12.0000');

    // Dates must be in ISO string format
    expect(prepared.startDate).toBe('2026-03-01T00:00:00.000Z');
    expect(prepared.endDate).toBe('2026-03-31T23:59:59.999Z');
  });

  it('handles partial changesets correctly', () => {
    const partialData = {
      transactions: {
        created: [{ id: 'tx_new', date: '2026-04-01T00:00:00.000Z', description: 'New Sale', amount: 8000 }],
        deletedIds: ['tx_old_2', 'tx_old_1'],
      },
    };

    const prepared = prepareDataForHashing(partialData);

    expect(prepared.transactions).toBeDefined();
    expect(prepared.transactions.created).toHaveLength(1);
    expect(prepared.transactions.created[0].amount).toBe('8000.00');
    // deletedIds should be sorted
    expect(prepared.transactions.deletedIds).toEqual(['tx_old_1', 'tx_old_2']);
  });

  it('normalizes nullable and optional fields consistently', () => {
    const rawData = {
      transactions: [
        { id: 'tx_nulls', date: '2026-01-01', description: 'Item with empty note', amount: 500, categoryName: '', notes: undefined },
      ],
    };

    const prepared = prepareDataForHashing(rawData);
    expect(prepared.transactions[0].categoryName).toBeNull();
    expect(prepared.transactions[0].notes).toBeNull();
  });
});
