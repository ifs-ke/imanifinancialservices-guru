// src/lib/storage-utils.ts

/**
 * Encodes a string using Base64.
 * NOTE: This is NOT secure encryption, just simple encoding for basic obfuscation
 * in sessionStorage. Replace with actual encryption logic if higher security is required
 * for data at rest in the browser (though sessionStorage is generally preferred over
 * localStorage for sensitivity due to automatic clearing).
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
      return Buffer.from(str).toString('base64'); // Requires Node.js Buffer
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
      return Buffer.from(encodedStr, 'base64').toString(); // Requires Node.js Buffer
    }
  } catch (e) {
    console.error("Base64 decoding failed:", e);
    // Attempt to return original string if it wasn't valid Base64 or decoding failed
    // This might happen if data wasn't encoded properly before.
    return encodedStr;
  }
}

    