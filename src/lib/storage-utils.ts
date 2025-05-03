// src/lib/storage-utils.ts

/**
 * Encodes a string using Base64.
 *
 * WARNING: This is NOT secure encryption, only simple encoding for basic obfuscation.
 * It provides minimal protection against casual viewing of sessionStorage data.
 * Do NOT rely on this for securing sensitive data requiring strong confidentiality.
 *
 * GDPR Considerations: Using sessionStorage means data is automatically cleared when
 * the browser session ends (tab/window closed), which helps with data minimization
 * requirements. For persistence beyond a session, localStorage or IndexedDB would
 * be needed, requiring stronger encryption and explicit user consent/controls.
 */
export function encode(str: string): string {
  try {
    // Ensure environment supports btoa or use a polyfill/library if needed
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(str))); // Handle UTF-8 characters
    } else {
      // Fallback for environments without btoa (like older Node.js without installing Buffer)
      // Consider using Buffer explicitly in Node.js environments: Buffer.from(str).toString('base64')
      console.warn('btoa function not available, using basic fallback (may not handle all characters).');
      // Use Buffer for Node.js environments if available
      // @ts-ignore - Check for Buffer existence in a way that works in browser/node
      if (typeof Buffer !== 'undefined') {
        // @ts-ignore
        return Buffer.from(str).toString('base64');
      }
      throw new Error('Cannot perform Base64 encoding: btoa and Buffer are unavailable.');
    }
  } catch (e) {
    console.error("Base64 encoding failed:", e);
    return str; // Return original string on failure
  }
}

/**
 * Decodes a Base64 encoded string.
 * NOTE: This is NOT secure decryption, just simple decoding.
 */
export function decode(encodedStr: string): string {
  try {
    // Ensure environment supports atob or use a polyfill/library if needed
    if (typeof atob === 'function') {
        return decodeURIComponent(escape(atob(encodedStr))); // Handle UTF-8 characters
    } else {
      // Fallback for environments without atob
      console.warn('atob function not available, using basic fallback.');
       // Use Buffer for Node.js environments if available
       // @ts-ignore
       if (typeof Buffer !== 'undefined') {
         // @ts-ignore
         return Buffer.from(encodedStr, 'base64').toString();
       }
      throw new Error('Cannot perform Base64 decoding: atob and Buffer are unavailable.');
    }
  } catch (e) {
    console.error("Base64 decoding failed:", e);
    // Attempt to return original string if it wasn't valid Base64 or decoding failed
    // This might happen if data wasn't encoded properly before.
    return encodedStr;
  }
}

/**
 * Placeholder for future secure hashing implementation.
 * Currently returns the input string.
 *
 * GDPR Considerations: Hashing sensitive data before storage adds a layer of security,
 * especially if data were to persist longer (e.g., in localStorage). For sessionStorage,
 * the primary security comes from session expiration. Implement proper salted hashing
 * (e.g., using crypto.subtle with PBKDF2 or Argon2) if stronger protection is needed.
 *
 * @param data The string data to hash.
 * @returns A promise resolving to the hashed string (currently returns original).
 */
export async function hashData(data: string): Promise<string> {
    // Placeholder: Replace with actual secure hashing (e.g., SHA-256 with salt)
    // Example using crypto.subtle (requires careful implementation):
    /*
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      // In a real app, generate and store a unique salt per user/data item
      // const salt = window.crypto.getRandomValues(new Uint8Array(16));
      // Use a strong KDF like PBKDF2 or Argon2 if deriving keys
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
      // Convert buffer to hex string for storage
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      // In a real app, you'd store the salt alongside the hash
      return hashHex;
    } catch (error) {
      console.error("Hashing failed:", error);
      return data; // Fallback to original data on error
    }
    */
    console.warn("Data hashing is not implemented. Returning original data.");
    return data; // Current placeholder implementation
}

/**
 * Placeholder for verifying data against a hash.
 * Currently returns true.
 *
 * @param data The original data.
 * @param hash The hash to verify against.
 * @returns A promise resolving to true if the data matches the hash (currently always true).
 */
export async function verifyHash(data: string, hash: string): Promise<boolean> {
    // Placeholder: Implement hash verification corresponding to hashData
    /*
    try {
      const calculatedHash = await hashData(data); // Recalculate hash using the same method/salt
      return calculatedHash === hash;
    } catch (error) {
      console.error("Hash verification failed:", error);
      return false;
    }
    */
    console.warn("Hash verification is not implemented. Returning true.");
    return true; // Current placeholder implementation
}