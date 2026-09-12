/**
 * @file exportUtils.ts
 * @description Centralized utilities for JSON state bundling, CSV conversion,
 * schema validation for data import/export, and PDF executive print formatting.
 */

import Papa from 'papaparse';

export interface FullExportPayload {
  transactions: any[];
  debts: any[];
  investmentItems: any[];
  assetItems: any[];
  otherLiabilityItems: any[];
  budgetItems: any[];
  publishedBudgets?: Record<string, any>;
  ownedReviews?: Record<string, any>;
  sharedReviews?: Record<string, any>;
  notifications?: any[];
  acknowledgedPrincipals?: Record<string, any>;
  statementSettings?: {
    startDate?: string;
    endDate?: string;
  };
  version: string;
  exportedAt: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  counts?: {
    transactions: number;
    debts: number;
    investments: number;
    budgetItems: number;
    assets: number;
    liabilities: number;
  };
}

/**
 * Builds a standardized, versioned JSON export payload from store states.
 */
export function buildFullExportPayload(data: Partial<FullExportPayload>): FullExportPayload {
  return {
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    debts: Array.isArray(data.debts) ? data.debts : [],
    investmentItems: Array.isArray(data.investmentItems) ? data.investmentItems : [],
    assetItems: Array.isArray(data.assetItems) ? data.assetItems : [],
    otherLiabilityItems: Array.isArray(data.otherLiabilityItems) ? data.otherLiabilityItems : [],
    budgetItems: Array.isArray(data.budgetItems) ? data.budgetItems : [],
    publishedBudgets: data.publishedBudgets || {},
    ownedReviews: data.ownedReviews || {},
    sharedReviews: data.sharedReviews || {},
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    acknowledgedPrincipals: data.acknowledgedPrincipals || {},
    statementSettings: {
      startDate: data.statementSettings?.startDate,
      endDate: data.statementSettings?.endDate,
    },
    version: data.version || '1.0',
    exportedAt: data.exportedAt || new Date().toISOString(),
  };
}

/**
 * Validates whether an incoming parsed object is a compatible application export payload.
 */
export function validateImportPayload(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Data payload is not a valid JSON object.' };
  }

  if (!Array.isArray(data.transactions) || !Array.isArray(data.debts)) {
    return {
      isValid: false,
      error: 'Missing essential data collections (transactions or debts arrays).',
    };
  }

  return {
    isValid: true,
    counts: {
      transactions: data.transactions.length,
      debts: data.debts.length,
      investments: Array.isArray(data.investmentItems) ? data.investmentItems.length : 0,
      budgetItems: Array.isArray(data.budgetItems) ? data.budgetItems.length : 0,
      assets: Array.isArray(data.assetItems) ? data.assetItems.length : 0,
      liabilities: Array.isArray(data.otherLiabilityItems) ? data.otherLiabilityItems.length : 0,
    },
  };
}

/**
 * Generates formatted CSV string from arbitrary data rows.
 */
export function generateCsvExport<T extends Record<string, any>>(data: T[], fields?: string[]): string {
  if (!data || data.length === 0) {
    return '';
  }
  return Papa.unparse(data, {
    quotes: true,
    header: true,
    columns: fields,
  });
}

/**
 * Returns CSS print media queries and layout styles for high-fidelity PDF output.
 */
export function getPdfPrintStyles(): string {
  return `
    @media print {
      body {
        background-color: white !important;
        color: black !important;
      }
      .no-print {
        display: none !important;
      }
      .print-full-width {
        width: 100% !important;
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
      }
      .print-grid {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 1.5rem !important;
      }
      .print-border {
        border: 1px solid #d4d4d4 !important;
        box-shadow: none !important;
        border-radius: 12px !important;
        background-color: white !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-break-inside-avoid {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-page-break {
        page-break-before: always;
      }
    }
  `;
}
