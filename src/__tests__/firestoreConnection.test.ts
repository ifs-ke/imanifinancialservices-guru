import { describe, it, expect } from 'vitest';
import { resolvedFirebaseConfig, OperationType, handleFirestoreError, db } from '@/lib/firebase';
import { checkDatabaseConnection } from '@/app/actions/adminTestActions';

describe('Firestore Connection & Backend Reliability', () => {
  describe('Firebase & Firestore Configuration Resolution', () => {
    it('resolves valid Firebase project configuration from environment or embedded blueprint', () => {
      expect(resolvedFirebaseConfig).toBeDefined();
      expect(resolvedFirebaseConfig.projectId).toBeDefined();
      expect(typeof resolvedFirebaseConfig.projectId).toBe('string');
      expect(resolvedFirebaseConfig.projectId.length).toBeGreaterThan(0);
      expect(resolvedFirebaseConfig.authDomain).toBeDefined();
    });

    it('initializes Firestore database client instance with custom databaseId handling', () => {
      expect(db).toBeDefined();
      expect(db.app).toBeDefined();
      expect(resolvedFirebaseConfig.projectId).toBeDefined();
      if (resolvedFirebaseConfig.firestoreDatabaseId) {
        expect(resolvedFirebaseConfig.firestoreDatabaseId).toContain('ai-studio-imanifinancialse');
      }
    });

    it('provides testFirestoreConnection probe that resolves safely in online or offline modes', async () => {
      const { testFirestoreConnection } = await import('@/lib/firebase');
      expect(typeof testFirestoreConnection).toBe('function');
      const connectionResult = await testFirestoreConnection();
      expect(typeof connectionResult).toBe('boolean');
    });
  });

  describe('handleFirestoreError Diagnostic Serializer', () => {
    it('formats structured error metadata containing operation type, path, and auth context', () => {
      const mockPath = 'users/test_user_uid/transactions';
      const mockError = new Error('Permission denied: Missing read access');

      expect(() => {
        handleFirestoreError(mockError, OperationType.GET, mockPath);
      }).toThrowError();

      try {
        handleFirestoreError(mockError, OperationType.CREATE, mockPath);
      } catch (err: any) {
        const parsed = JSON.parse(err.message);
        expect(parsed.operationType).toBe('create');
        expect(parsed.path).toBe(mockPath);
        expect(parsed.error).toContain('Permission denied');
        expect(parsed.authInfo).toBeDefined();
      }
    });
  });

  describe('checkDatabaseConnection Diagnostic Action', () => {
    it('executes database connection probe and returns standard diagnostic payload', async () => {
      const result = await checkDatabaseConnection();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
      if (result.duration !== undefined) {
        expect(result.duration).toBeGreaterThanOrEqual(0);
      }
      if (result.data) {
        expect(result.data.firestoreStatus).toBeDefined();
      }
    });
  });
});
