// src/__tests__/adminUserSearchAndDebtClassification.test.ts
import { describe, it, expect } from 'vitest';
import { DebtItemFormDataSchema, DebtClassificationSchema } from '@/lib/schemas';
import type { DebtItem, DebtClassification } from '@/lib/types';
import type { AppUserProfile } from '@/lib/roles';
import { computeDebtStatus, getDaysOverdue } from '@/lib/debtUtils';

describe('Admin User Search Filtering Logic', () => {
  const mockUsers: AppUserProfile[] = [
    {
      uid: 'uid-1',
      email: 'seanwambua@gmail.com',
      displayName: 'Sean Wambua',
      role: 'admin',
      status: 'active',
      spendingLimitKes: 5000,
      incurredCostKes: 250,
      totalReads: 120,
      totalWrites: 45,
      totalStorageKb: 10,
      totalApiCalls: 50,
      totalAiForecasts: 12,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-20T00:00:00Z',
    },
    {
      uid: 'uid-2',
      email: 'jane.auditor@firm.co.ke',
      displayName: 'Jane Mwangi',
      role: 'auditor',
      status: 'active',
      spendingLimitKes: 2000,
      incurredCostKes: 80,
      totalReads: 500,
      totalWrites: 10,
      totalStorageKb: 5,
      totalApiCalls: 20,
      totalAiForecasts: 0,
      createdAt: '2026-09-05T00:00:00Z',
      updatedAt: '2026-09-18T00:00:00Z',
    },
    {
      uid: 'uid-3',
      email: 'alex.client@sme.ke',
      displayName: 'Alex Kamau',
      role: 'client',
      status: 'suspended',
      spendingLimitKes: 1000,
      incurredCostKes: 950,
      totalReads: 350,
      totalWrites: 80,
      totalStorageKb: 25,
      totalApiCalls: 85,
      totalAiForecasts: 5,
      createdAt: '2026-09-10T00:00:00Z',
      updatedAt: '2026-09-22T00:00:00Z',
    },
  ];

  const filterUsers = (
    users: AppUserProfile[],
    searchTerm: string,
    roleFilter: 'ALL' | string = 'ALL',
    statusFilter: 'ALL' | string = 'ALL'
  ) => {
    return users.filter(u => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = 
        !term ||
        u.displayName.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.uid.toLowerCase().includes(term);

      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  };

  it('filters platform users accurately by name (case-insensitive)', () => {
    const results = filterUsers(mockUsers, 'wambua');
    expect(results).toHaveLength(1);
    expect(results[0].email).toBe('seanwambua@gmail.com');
  });

  it('filters platform users accurately by email address', () => {
    const results = filterUsers(mockUsers, 'jane.auditor');
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('Jane Mwangi');
  });

  it('filters across role and search term simultaneously', () => {
    const results = filterUsers(mockUsers, 'ke', 'auditor');
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toBe('Jane Mwangi');
  });

  it('returns empty array when search query matches no user', () => {
    const results = filterUsers(mockUsers, 'nonexistent@example.com');
    expect(results).toHaveLength(0);
  });
});

describe('Debt Classification & Schema Mechanics', () => {
  it('validates a personal debt with 0% optional interest and assigned date', () => {
    const payload = {
      date: '2026-09-25',
      classification: 'personal',
      description: 'Brother Kevin Emergency Loan',
      principal: 45000,
      interestRate: 0,
      minPayment: 5000,
      term: 'short',
    };

    const parsed = DebtItemFormDataSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.classification).toBe('personal');
      expect(parsed.data.interestRate).toBe(0);
      expect(parsed.data.date).toBe('2026-09-25');
    }
  });

  it('validates an institutional debt with positive interest rate', () => {
    const payload = {
      date: '2026-08-10',
      classification: 'institutional',
      description: 'Cooperative Bank Asset Financing',
      principal: 350000,
      interestRate: 14.5,
      minPayment: 22000,
      term: 'long',
    };

    const parsed = DebtItemFormDataSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.classification).toBe('institutional');
      expect(parsed.data.interestRate).toBe(14.5);
      expect(parsed.data.term).toBe('long');
    }
  });

  it('allows interestRate to be omitted or null (optional)', () => {
    const payload = {
      date: '2026-09-12',
      classification: 'personal',
      description: 'Family Interest Free Seed Loan',
      principal: 100000,
      minPayment: 10000,
      term: 'short',
    };

    const parsed = DebtItemFormDataSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.interestRate).toBeUndefined();
    }
  });

  it('rejects invalid date formats', () => {
    const payload = {
      date: 'invalid-date',
      classification: 'personal',
      description: 'Invalid Date Debt',
      principal: 10000,
      minPayment: 1000,
      term: 'short',
    };

    const parsed = DebtItemFormDataSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it('validates debt status, dueDate, and notes correctly', () => {
    const payload = {
      date: '2026-09-01',
      dueDate: '2026-12-31',
      classification: 'institutional',
      description: 'Equity Bank Asset Facility',
      principal: 200000,
      interestRate: 12.0,
      minPayment: 18000,
      term: 'long',
      status: 'active',
      notes: 'Collateral: Logbook #12345',
    };

    const parsed = DebtItemFormDataSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('active');
      expect(parsed.data.dueDate).toBe('2026-12-31');
      expect(parsed.data.notes).toBe('Collateral: Logbook #12345');
    }
  });
});

describe('Automatic Overdue Detection & Debt Status Engine', () => {
  const asOfDate = new Date('2026-09-25T00:00:00Z');

  it('evaluates status as active when due date is in the future', () => {
    const debt: Partial<DebtItem> = {
      principal: 50000,
      date: '2026-08-01',
      dueDate: '2026-12-01',
      term: 'short',
      status: 'active',
    };
    const status = computeDebtStatus(debt, asOfDate);
    expect(status).toBe('active');
  });

  it('automatically evaluates status as overdue when dueDate is in the past', () => {
    const debt: Partial<DebtItem> = {
      principal: 30000,
      date: '2026-01-10',
      dueDate: '2026-06-30', // Passed due date
      term: 'short',
      status: 'active',
    };
    const status = computeDebtStatus(debt, asOfDate);
    expect(status).toBe('overdue');
  });

  it('calculates days overdue accurately', () => {
    const debt: Partial<DebtItem> = {
      principal: 30000,
      date: '2026-01-10',
      dueDate: '2026-09-15', // 10 days before 2026-09-25
      term: 'short',
      status: 'active',
    };
    const days = getDaysOverdue(debt, asOfDate);
    expect(days).toBe(10);
  });

  it('automatically marks short-term debt over 365 days old as overdue even without explicit dueDate', () => {
    const debt: Partial<DebtItem> = {
      principal: 15000,
      date: '2025-05-01', // Over 1 year ago
      term: 'short',
      status: 'active',
    };
    const status = computeDebtStatus(debt, asOfDate);
    expect(status).toBe('overdue');
  });

  it('returns paid_off status if principal is 0 regardless of past due date', () => {
    const debt: Partial<DebtItem> = {
      principal: 0,
      date: '2025-01-01',
      dueDate: '2025-06-01',
      term: 'short',
      status: 'paid_off',
    };
    const status = computeDebtStatus(debt, asOfDate);
    expect(status).toBe('paid_off');
  });

  it('respects in_grace status when explicit', () => {
    const debt: Partial<DebtItem> = {
      principal: 80000,
      date: '2026-07-01',
      dueDate: '2026-10-15',
      term: 'short',
      status: 'in_grace',
    };
    const status = computeDebtStatus(debt, asOfDate);
    expect(status).toBe('in_grace');
  });
});

