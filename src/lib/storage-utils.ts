// src/lib/storage-utils.ts

/**
 * Encodes a string using Base64. Isomorphic.
 * NOTE: Base64 is an encoding scheme, NOT encryption. It provides no confidentiality
 * and is easily reversible. It's used here primarily to ensure safe storage in
 * Session Storage, but does not protect the data itself from access if the
 * browser's storage is compromised. For sensitive data caching, encryption should be used.
 *
 * @param str The string to encode.
 * @returns The Base64 encoded string.
 */
export function encode(str: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      // Browser environment: Use btoa, handle potential UTF-8 issues
      return window.btoa(unescape(encodeURIComponent(str)));
    } else if (typeof Buffer !== 'undefined') {
      // Node.js environment: Use Buffer
      return Buffer.from(str, 'utf8').toString('base64');
    } else {
      throw new Error('Cannot perform Base64 encoding: btoa and Buffer are unavailable.');
    }
  } catch (e) {
    console.error("Base64 encoding failed:", e);
    // Fallback might be problematic, throwing might be better depending on context.
    // For now, return original string to avoid breaking things, but log the error.
    return str;
  }
}

/**
 * Decodes a Base64 encoded string. Isomorphic.
 *
 * @param encodedStr The Base64 encoded string.
 * @returns The decoded original string.
 */
export function decode(encodedStr: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      // Browser environment: Use atob, handle potential UTF-8 issues
      return decodeURIComponent(escape(window.atob(encodedStr)));
    } else if (typeof Buffer !== 'undefined') {
      // Node.js environment: Use Buffer
      return Buffer.from(encodedStr, 'base64').toString('utf8');
    } else {
      throw new Error('Cannot perform Base64 decoding: atob and Buffer are unavailable.');
    }
  } catch (e) {
    console.error("Base64 decoding failed:", e);
    // Fallback might be problematic, throwing might be better depending on context.
    // For now, return original encoded string, but log the error.
    return encodedStr;
  }
}


/**
 * Hashes data using SHA-256. Isomorphic (works in browser and Node.js/Edge).
 * Uses crypto.subtle in the browser and Node.js crypto module on the server.
 * This provides data integrity verification, ensuring data hasn't been tampered with.
 * It does NOT provide confidentiality (encryption).
 *
 * @param data The string data to hash.
 * @returns A promise resolving to the SHA-256 hash as a hexadecimal string.
 */
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  try {
    const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
      ? globalThis.crypto.subtle
      : (typeof window !== 'undefined' && window.crypto && window.crypto.subtle)
        ? window.crypto.subtle
        : null;

    if (subtle) {
      const hashBuffer = await subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } else if (typeof crypto !== 'undefined' && (crypto as any).createHash) {
      const hash = (crypto as any).createHash('sha256');
      hash.update(dataBuffer);
      return hash.digest('hex');
    } else {
      console.error("SHA-256 Hashing environment not supported: Missing crypto.subtle or Node.js crypto.");
      throw new Error('Hashing environment not supported.');
    }
  } catch (error) {
    console.error("SHA-256 Hashing failed:", error);
    return 'hashing_failed_error';
  }
}

/**
 * Verifies data integrity against an expected SHA-256 hash.
 *
 * @param data The original string data (should be generated using the same stable stringify method).
 * @param expectedHash The expected hexadecimal hash string received from the other party (client or server).
 * @returns A promise resolving to true if the calculated hash matches the expected hash, false otherwise.
 */
export async function verifyHash(data: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash || typeof expectedHash !== 'string' || expectedHash === 'hashing_failed_error') {
    console.warn("Hash verification skipped: Invalid or missing expected hash.");
    // Decide behavior: If no hash was ever stored (e.g., first load), maybe allow?
    // If hash failed previously, definitely reject. For now, strict check:
    return false;
  }
  try {
    const calculatedHash = await hashData(data);
    if (calculatedHash === 'hashing_failed_error') {
        console.error("Hash verification failed: Could not calculate hash for input data.");
        return false;
    }
    const match = calculatedHash === expectedHash;
    if (!match) {
        console.warn(`Data Integrity Check Failed: Hash mismatch! Expected ${expectedHash}, but got ${calculatedHash}. Data may have been altered or serialization differs.`);
        // Log truncated data for debugging (Caution with sensitive data in production logs)
        // console.log("Data that resulted in hash mismatch (truncated):", data.substring(0, 300) + (data.length > 300 ? "..." : ""));
    }
    return match;
  } catch (error) {
    console.error("Hash verification encountered an error:", error);
    return false;
  }
}
