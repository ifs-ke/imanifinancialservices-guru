import { describe, it, expect } from 'vitest';
import { normalizeRole, hasRole, type RoleUser } from '@/lib/roles';

describe('Role-Based Access Control (RBAC) Helpers', () => {
  describe('normalizeRole', () => {
    it('normalizes undefined, null, and empty strings to "client"', () => {
      expect(normalizeRole(undefined)).toBe('client');
      expect(normalizeRole(null)).toBe('client');
      expect(normalizeRole('')).toBe('client');
    });

    it('maps legacy "user" string to modern "client"', () => {
      expect(normalizeRole('user')).toBe('client');
    });

    it('preserves valid roles: admin, auditor, client', () => {
      expect(normalizeRole('admin')).toBe('admin');
      expect(normalizeRole('auditor')).toBe('auditor');
      expect(normalizeRole('client')).toBe('client');
    });
  });

  describe('hasRole', () => {
    it('checks direct role attribute on user object', () => {
      const adminUser: RoleUser = { id: 'u1', role: 'admin' };
      const clientUser: RoleUser = { id: 'u2', role: 'client' };

      expect(hasRole('admin', adminUser)).toBe(true);
      expect(hasRole('auditor', adminUser)).toBe(false);
      expect(hasRole('client', clientUser)).toBe(true);
    });

    it('checks privateMetadata and publicMetadata if top-level role is absent', () => {
      const auditorUser: RoleUser = { id: 'u3', privateMetadata: { role: 'auditor' } };
      const adminPublicUser: RoleUser = { id: 'u4', publicMetadata: { role: 'admin' } };

      expect(hasRole('auditor', auditorUser)).toBe(true);
      expect(hasRole('admin', adminPublicUser)).toBe(true);
    });

    it('returns false safely when user is null', () => {
      expect(hasRole('admin', null)).toBe(false);
      expect(hasRole('auditor', null)).toBe(false);
    });
  });
});
