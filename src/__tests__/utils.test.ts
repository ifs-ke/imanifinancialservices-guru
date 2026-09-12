import { describe, it, expect } from 'vitest';
import { formatCurrency, cn } from '@/lib/utils';

describe('Utility Functions', () => {
  describe('formatCurrency', () => {
    it('formats positive currency amounts accurately with KES symbol', () => {
      const formatted = formatCurrency(15000);
      expect(formatted).toContain('15,000');
      expect(formatted).toMatch(/Ksh|KES/);
    });

    it('formats zero correctly', () => {
      const formatted = formatCurrency(0);
      expect(formatted).toContain('0');
      expect(formatted).toMatch(/Ksh|KES/);
    });

    it('returns "N/A" for undefined or NaN values', () => {
      expect(formatCurrency(undefined)).toBe('N/A');
      expect(formatCurrency(NaN)).toBe('N/A');
    });

    it('handles large financial sums cleanly without rounding errors', () => {
      const formatted = formatCurrency(25000000);
      expect(formatted).toContain('25,000,000');
    });
  });

  describe('cn (Class Names Merge)', () => {
    it('merges multiple conditional classes and resolves tailwind conflicts', () => {
      const result = cn('px-4 py-2', 'bg-blue-500', true && 'text-white', false && 'hidden');
      expect(result).toBe('px-4 py-2 bg-blue-500 text-white');
    });

    it('overrides conflicting tailwind utility classes properly', () => {
      const result = cn('p-4', 'p-6');
      expect(result).toBe('p-6');
    });
  });
});
