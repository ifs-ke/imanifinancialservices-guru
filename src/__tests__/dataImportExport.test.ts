import { describe, it, expect } from 'vitest';
import {
  buildFullExportPayload,
  validateImportPayload,
  generateCsvExport,
} from '@/lib/exportUtils';

describe('Data Import & Export Subsystem', () => {
  describe('Full JSON Export Payload Packaging', () => {
    it('packages store states into versioned and timestamped JSON structure', () => {
      const mockState = {
        transactions: [
          { id: 'tx_1', date: '2026-03-01', description: 'Consulting Income', amount: 50000, category: 'Income' },
        ],
        debts: [
          { id: 'd_1', description: 'Car Loan', principal: 400000, interestRate: 12, minPayment: 15000, term: 'medium' },
        ],
        investmentItems: [
          { id: 'inv_1', name: 'S&P 500 ETF', value: 120000, assetClass: 'equity' },
        ],
        assetItems: [
          { id: 'a_1', name: 'Emergency Fund', value: 300000 },
        ],
        otherLiabilityItems: [],
        budgetItems: [
          { id: 'b_1', category: 'Housing', allocatedAmount: 40000, period: '2026-03' },
        ],
        statementSettings: {
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-03-31T23:59:59.999Z',
        },
      };

      const payload = buildFullExportPayload(mockState as any);

      expect(payload.version).toBe('1.0');
      expect(payload.exportedAt).toBeDefined();
      expect(payload.transactions).toHaveLength(1);
      expect(payload.debts).toHaveLength(1);
      expect(payload.investmentItems).toHaveLength(1);
      expect(payload.assetItems).toHaveLength(1);
      expect(payload.budgetItems).toHaveLength(1);
      expect(payload.statementSettings?.startDate).toBe('2026-01-01T00:00:00.000Z');
    });

    it('supplies safe defaults for missing or undefined collections', () => {
      const emptyPayload = buildFullExportPayload({});

      expect(emptyPayload.transactions).toEqual([]);
      expect(emptyPayload.debts).toEqual([]);
      expect(emptyPayload.investmentItems).toEqual([]);
      expect(emptyPayload.assetItems).toEqual([]);
      expect(emptyPayload.otherLiabilityItems).toEqual([]);
      expect(emptyPayload.budgetItems).toEqual([]);
      expect(emptyPayload.version).toBe('1.0');
    });
  });

  describe('Data Import Payload Validation', () => {
    it('accepts valid export payloads and accurately counts entities', () => {
      const validPayload = {
        transactions: [{ id: 'tx_1', amount: 100 }],
        debts: [{ id: 'd_1', principal: 500 }],
        investmentItems: [{ id: 'inv_1', value: 1000 }],
        budgetItems: [{ id: 'b_1', allocatedAmount: 200 }, { id: 'b_2', allocatedAmount: 300 }],
        assetItems: [],
        otherLiabilityItems: [],
      };

      const result = validateImportPayload(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.counts).toEqual({
        transactions: 1,
        debts: 1,
        investments: 1,
        budgetItems: 2,
        assets: 0,
        liabilities: 0,
      });
    });

    it('rejects invalid or null objects with error message', () => {
      expect(validateImportPayload(null).isValid).toBe(false);
      expect(validateImportPayload('invalid string').isValid).toBe(false);
      expect(validateImportPayload(undefined).isValid).toBe(false);
    });

    it('rejects payloads missing essential transaction or debt arrays', () => {
      const corruptedPayload = {
        transactions: [{ id: 'tx_1' }],
        // missing debts array
      };

      const result = validateImportPayload(corruptedPayload);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Missing essential data collections');
    });
  });

  describe('CSV Generation & Export Formatting', () => {
    it('generates standard RFC 4180 compliant CSV string from record array', () => {
      const records = [
        { category: 'Housing', allocatedAmount: 45000, spentAmount: 42000 },
        { category: 'Transport', allocatedAmount: 15000, spentAmount: 16200 },
      ];

      const csv = generateCsvExport(records);
      expect(csv).toContain('"category","allocatedAmount","spentAmount"');
      expect(csv).toContain('"Housing"');
      expect(csv).toContain('45000');
      expect(csv).toContain('"Transport"');
      expect(csv).toContain('16200');
    });

    it('returns empty string when no records are supplied', () => {
      expect(generateCsvExport([])).toBe('');
    });
  });
});
