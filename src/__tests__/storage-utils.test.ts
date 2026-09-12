import { describe, it, expect } from 'vitest';
import { encode, decode, hashData, verifyHash } from '@/lib/storage-utils';

describe('Storage & Cryptographic Utilities', () => {
  describe('encode & decode', () => {
    it('encodes and decodes standard ASCII strings symmetrically', () => {
      const original = 'IFS-Guru Enterprise Financial Intelligence';
      const encoded = encode(original);
      const decoded = decode(encoded);
      expect(decoded).toBe(original);
    });

    it('handles JSON stringified payloads accurately', () => {
      const payload = JSON.stringify({ userId: 'user_123', balance: 450000.5, tags: ['sme', 'operating'] });
      const encoded = encode(payload);
      const decoded = decode(encoded);
      expect(JSON.parse(decoded)).toEqual(JSON.parse(payload));
    });

    it('safely handles unicode characters and special symbols', () => {
      const original = 'M-Pesa 254700000000 — KES 50,000.00 • © 2026';
      const encoded = encode(original);
      const decoded = decode(encoded);
      expect(decoded).toBe(original);
    });
  });

  describe('hashData & verifyHash', () => {
    it('generates deterministic SHA-256 hexadecimal hash', async () => {
      const data = 'canonical-data-for-audit-sync';
      const hash1 = await hashData(data);
      const hash2 = await hashData(data);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it('produces distinct hashes for even slight data modifications', async () => {
      const hashA = await hashData('amount=1000.00');
      const hashB = await hashData('amount=1000.01');
      expect(hashA).not.toBe(hashB);
    });

    it('verifies integrity successfully for identical payloads', async () => {
      const data = 'consistent-state-payload';
      const expectedHash = await hashData(data);
      const isValid = await verifyHash(data, expectedHash);
      expect(isValid).toBe(true);
    });

    it('rejects verification if the payload was modified or tampered with', async () => {
      const originalData = 'original-unmodified-state';
      const tamperedData = 'tampered-modified-state';
      const originalHash = await hashData(originalData);

      const isValid = await verifyHash(tamperedData, originalHash);
      expect(isValid).toBe(false);
    });

    it('handles invalid or empty expected hash gracefully', async () => {
      expect(await verifyHash('any-data', '')).toBe(false);
      expect(await verifyHash('any-data', 'hashing_failed_error')).toBe(false);
    });
  });
});
