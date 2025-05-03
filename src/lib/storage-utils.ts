// src/lib/storage-utils.ts
import crypto from 'crypto'; // Import Node.js crypto

/**
 * Encodes a string using Base64. Isomorphic.
 */
export function encode(str: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      // Browser environment
      return window.btoa(unescape(encodeURIComponent(str)));
    } else if (typeof Buffer !== 'undefined') {
      // Node.js environment
      return Buffer.from(str, 'utf8').toString('base64');
    } else {
      throw new Error('Cannot perform Base64 encoding: btoa and Buffer are unavailable.');
    }
  } catch (e) {
    console.error("Base64 encoding failed:", e);
    return str;
  }
}

/**
 * Decodes a Base64 encoded string. Isomorphic.
 */
export function decode(encodedStr: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      // Browser environment
      return decodeURIComponent(escape(window.atob(encodedStr)));
    } else if (typeof Buffer !== 'undefined') {
      // Node.js environment
      return Buffer.from(encodedStr, 'base64').toString('utf8');
    } else {
      throw new Error('Cannot perform Base64 decoding: atob and Buffer are unavailable.');
    }
  } catch (e) {
    console.error("Base64 decoding failed:", e);
    return encodedStr;
  }
}


/**
 * Hashes data using SHA-256. Isomorphic (works in browser and Node.js/Edge).
 * Uses crypto.subtle in the browser and Node.js crypto module on the server.
 *
 * @param data The string data to hash.
 * @returns A promise resolving to the SHA-256 hash as a hexadecimal string.
 */
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      // Browser environment
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } else if (typeof crypto !== 'undefined' && crypto.createHash) {
      // Node.js / Edge environment (using Node.js crypto module)
      const hash = crypto.createHash('sha256');
      hash.update(dataBuffer);
      return hash.digest('hex');
    } else {
      throw new Error('Hashing environment not supported (missing crypto.subtle or Node.js crypto).');
    }
  } catch (error) {
    console.error("SHA-256 Hashing failed:", error);
    // Fallback or rethrow depending on desired error handling
    // Returning a predictable string helps identify hashing failures vs mismatches
    return 'hashing_failed_error';
  }
}

/**
 * Verifies data against an expected SHA-256 hash.
 *
 * @param data The original string data.
 * @param expectedHash The expected hexadecimal hash string.
 * @returns A promise resolving to true if the calculated hash matches the expected hash, false otherwise.
 */
export async function verifyHash(data: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash || expectedHash === 'hashing_failed_error') {
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
        console.warn(`Hash mismatch: Expected ${expectedHash}, but got ${calculatedHash}`);
        // Log the data being hashed for easier debugging (be cautious with sensitive data in logs)
        // console.log("Data that resulted in hash mismatch:", data.substring(0, 200) + "..."); // Log truncated data
    }
    return match;
  } catch (error) {
    console.error("Hash verification encountered an error:", error);
    return false;
  }
}
