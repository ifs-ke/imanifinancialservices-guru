// src/__tests__/adminHashingTest.test.ts
import { describe, it, expect } from 'vitest';
import stringify from 'fast-json-stable-stringify';
import { prepareDataForHashing } from '@/lib/prepareDataForHashing';
import { hashData, verifyHash } from '@/lib/storage-utils';
import {
  getHashForServerComparison,
  getHashForServerPreparedObject,
  verifyClientDataHashAction,
  simulateSaveWithPotentialMismatchAction,
  testDataHashing,
  testHashingAlgorithmComparison,
} from '@/app/actions/adminTestActions';

describe('Admin Connection Page Hashing Test Suite', () => {
  const sampleStringData = {
    transactions: [
      {
        id: 'tx_admin_str_1',
        date: '2026-03-15T10:00:00.000Z',
        description: 'String Test Transaction Alpha',
        amount: 100.5,
        modeOfPayment: 'Cash',
      },
    ],
    gettingStartedDismissed: true,
    startDate: '2026-01-01T00:00:00.000Z',
  };

  const sampleObjectData = {
    debts: [
      {
        id: 'd_admin_obj_1',
        description: 'Object Test Debt Bravo',
        principal: 2500.75,
        interestRate: 7.5,
        minPayment: 120,
        term: 'long' as const,
      },
    ],
    gettingStartedDismissed: false,
    endDate: '2026-12-31T23:59:59.999Z',
  };

  describe('String & Object Hash Comparison Server Actions', () => {
    it('getHashForServerComparison produces SHA-256 hash matching client hashData', async () => {
      const preparedClientData = prepareDataForHashing(sampleStringData);
      const clientString = stringify(preparedClientData);
      const clientHash = await hashData(clientString);

      const serverResult = await getHashForServerComparison(clientString);

      expect(serverResult.success).toBe(true);
      expect(serverResult.hash).toBe(clientHash);
      expect(serverResult.serverHash).toBe(clientHash);
      expect(serverResult.message).toBe('String hash calculated successfully.');
      expect(serverResult.duration).toBeGreaterThanOrEqual(0);
    });

    it('getHashForServerPreparedObject normalizes and hashes raw object matching client calculation', async () => {
      const clientPrepared = prepareDataForHashing(sampleObjectData);
      const clientString = stringify(clientPrepared);
      const clientHash = await hashData(clientString);

      const serverResult = await getHashForServerPreparedObject(sampleObjectData);

      expect(serverResult.success).toBe(true);
      expect(serverResult.hash).toBe(clientHash);
      expect(serverResult.serverHash).toBe(clientHash);
      expect(serverResult.serverPreparedString).toBe(clientString);
      expect(serverResult.preparedString).toBe(clientString);
      expect(serverResult.message).toBe('Prepared object hash calculated successfully.');
      expect(serverResult.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('End-to-End Client vs Server Data Hash Verification (verifyClientDataHashAction)', () => {
    it('confirms client and server hashes match exactly for canonical payloads', async () => {
      const clientPrepared = prepareDataForHashing(sampleObjectData);
      const clientString = stringify(clientPrepared);
      const clientHash = await hashData(clientString);

      const verificationResult = await verifyClientDataHashAction(sampleObjectData, clientHash);

      expect(verificationResult.success).toBe(true);
      expect(verificationResult.hashesMatch).toBe(true);
      expect(verificationResult.clientHashMatches).toBe(true);
      expect(verificationResult.serverCalculatedHash).toBe(clientHash);
      expect(verificationResult.message).toContain('match exactly');
    });

    it('detects hash mismatch when payload content or amounts change', async () => {
      const clientPrepared = prepareDataForHashing(sampleObjectData);
      const clientString = stringify(clientPrepared);
      const originalClientHash = await hashData(clientString);

      const tamperedData = {
        ...sampleObjectData,
        debts: [
          {
            ...sampleObjectData.debts[0],
            principal: 9999.99, // Tampered principal
          },
        ],
      };

      const verificationResult = await verifyClientDataHashAction(tamperedData, originalClientHash);

      expect(verificationResult.success).toBe(true);
      expect(verificationResult.hashesMatch).toBe(false);
      expect(verificationResult.serverCalculatedHash).not.toBe(originalClientHash);
      expect(verificationResult.message).toContain('mismatch');
    });
  });

  describe('Stale Hash Simulation (simulateSaveWithPotentialMismatchAction)', () => {
    it('succeeds with status 200 when no stale hash is provided', async () => {
      const simResult = await simulateSaveWithPotentialMismatchAction(sampleStringData);

      expect(simResult.success).toBe(true);
      expect(simResult.status).toBe(200);
      expect(simResult.mismatchDetected).toBe(false);
      expect(simResult.newServerHash).toBeDefined();
      expect(typeof simResult.newServerHash).toBe('string');
    });

    it('detects 409 Conflict when a stale server hash token is provided', async () => {
      const simResult = await simulateSaveWithPotentialMismatchAction(
        sampleStringData,
        'stale-token-hash-2026'
      );

      expect(simResult.success).toBe(false);
      expect(simResult.status).toBe(409);
      expect(simResult.mismatchDetected).toBe(true);
      expect(simResult.message).toContain('Conflict detected');
      expect(simResult.currentServerHash).toBeDefined();
    });

    it('detects mismatch when modified payload is sent with an actual initial hash', async () => {
      const initialPayload = { transactions: [{ id: 'stale_tx_1', description: 'Initial', amount: 100, modeOfPayment: 'Bank' }] };
      const initialHash = await hashData(stringify(prepareDataForHashing(initialPayload as any)));

      const modifiedPayload = { transactions: [{ id: 'stale_tx_1', description: 'Modified', amount: 200, modeOfPayment: 'Bank' }] };

      const simResult = await simulateSaveWithPotentialMismatchAction(modifiedPayload, initialHash);

      expect(simResult.success).toBe(false);
      expect(simResult.status).toBe(409);
      expect(simResult.mismatchDetected).toBe(true);
      expect(simResult.clientProvidedOriginalHash).toBe(initialHash);
      expect(simResult.serverHashOfDataSent).not.toBe(initialHash);
      expect(simResult.message).toBe('Conflict detected: Stale server hash.');
    });
  });

  describe('Hashing Performance & Algorithm Diagnostics', () => {
    it('testDataHashing helper executes normalization and returns a valid SHA-256 hash', async () => {
      const result = await testDataHashing(sampleStringData);

      expect(result.success).toBe(true);
      expect(result.hash).toBeDefined();
      expect(result.hash?.length).toBe(64); // Standard SHA-256 hex length
    });

    it('testHashingAlgorithmComparison compares fast-json-stable-stringify and JSON.stringify', async () => {
      const comparisonResult = await testHashingAlgorithmComparison(sampleStringData);

      expect(comparisonResult.success).toBe(true);
      expect(comparisonResult.results).toBeDefined();
      if (comparisonResult.results) {
        expect(comparisonResult.results.fastJsonStableStringifyLength).toBeGreaterThan(0);
        expect(comparisonResult.results.jsonStringifyLength).toBeGreaterThan(0);
        expect(typeof comparisonResult.results.hashesMatch).toBe('boolean');
      }
    });

    it('verifyHash utility correctly validates matching and non-matching hashes', async () => {
      const text = 'Integrity test text for admin console';
      const validHash = await hashData(text);

      expect(await verifyHash(text, validHash)).toBe(true);
      expect(await verifyHash(text, 'invalid_hash_string')).toBe(false);
      expect(await verifyHash('altered_text', validHash)).toBe(false);
    });
  });

  describe('Proof of Error Messages & Mismatch Diagnostics', () => {
    it('returns explicit error message when verifyClientDataHashAction catches a normalization error', async () => {
      // Symbols inside sharedWith array cause Array.prototype.sort() to throw TypeError, triggering try/catch
      const invalidPayload: any = {
        transactions: [
          {
            id: 'tx_err_1',
            sharedWith: [Symbol('sym1'), Symbol('sym2')],
          },
        ],
      };

      const result = await verifyClientDataHashAction(invalidPayload, 'dummy_hash');

      expect(result.success).toBe(false);
      expect(result.hashesMatch).toBe(false);
      expect(result.serverCalculatedHash).toBe('');
      expect(result.message).toContain('Failed to verify hash:');
    });

    it('returns "Hash mismatch detected." message on mismatching clientHash', async () => {
      const result = await verifyClientDataHashAction(sampleStringData, 'incorrect_hash_value_123');

      expect(result.success).toBe(true);
      expect(result.hashesMatch).toBe(false);
      expect(result.message).toBe('Hash mismatch detected.');
    });

    it('returns "Conflict detected: Stale server hash." with status 409 on stale saves', async () => {
      const result = await simulateSaveWithPotentialMismatchAction(sampleStringData, 'stale-hash-version-key');

      expect(result.success).toBe(false);
      expect(result.status).toBe(409);
      expect(result.message).toBe('Conflict detected: Stale server hash.');
      expect(result.currentServerHash).toBeDefined();
      expect(result.currentServerHash?.length).toBe(64);
    });

    it('returns explicit error message when testDataHashing catches a normalization error', async () => {
      const invalidPayload: any = {
        transactions: [
          {
            id: 'tx_err_2',
            sharedWith: [Symbol('sym1'), Symbol('sym2')],
          },
        ],
      };

      const result = await testDataHashing(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error hashing data:');
    });

    it('returns explicit error message when testHashingAlgorithmComparison catches a normalization error', async () => {
      const invalidPayload: any = {
        transactions: [
          {
            id: 'tx_err_3',
            sharedWith: [Symbol('sym1'), Symbol('sym2')],
          },
        ],
      };

      const result = await testHashingAlgorithmComparison(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Comparison test failed:');
    });
  });
});
