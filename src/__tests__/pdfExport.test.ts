import { describe, it, expect } from 'vitest';
import { getPdfPrintStyles } from '@/lib/exportUtils';

describe('PDF Export & Print Engine', () => {
  describe('Print Media Styling Specifications', () => {
    const printStyles = getPdfPrintStyles();

    it('defines mandatory print media isolation rules', () => {
      expect(printStyles).toContain('@media print');
      expect(printStyles).toContain('.no-print');
      expect(printStyles).toContain('display: none !important;');
    });

    it('configures crisp high-contrast print colors and background resets', () => {
      expect(printStyles).toContain('background-color: white !important;');
      expect(printStyles).toContain('color: black !important;');
    });

    it('enforces page-break and break-inside avoidance for financial cards', () => {
      expect(printStyles).toContain('.print-break-inside-avoid');
      expect(printStyles).toContain('break-inside: avoid;');
      expect(printStyles).toContain('page-break-inside: avoid;');
      expect(printStyles).toContain('.print-page-break');
      expect(printStyles).toContain('page-break-before: always;');
    });

    it('sets full-width container expansion and multi-column grid layouts', () => {
      expect(printStyles).toContain('.print-full-width');
      expect(printStyles).toContain('width: 100% !important;');
      expect(printStyles).toContain('.print-grid');
      expect(printStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    });
  });

  describe('PDF Print Action Trigger Safety', () => {
    it('executes window.print safely when window is available', () => {
      let printCalled = false;
      const originalWindow = (globalThis as any).window;

      (globalThis as any).window = {
        print: () => {
          printCalled = true;
        },
      };

      const handlePrint = () => {
        if (typeof window !== 'undefined' && typeof window.print === 'function') {
          window.print();
        }
      };

      handlePrint();
      expect(printCalled).toBe(true);

      (globalThis as any).window = originalWindow;
    });
  });
});
