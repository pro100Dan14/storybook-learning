/**
 * Base64 Decoding Utility
 * 
 * Provides robust Base64 decoding with support for:
 * - Standard Base64 and Base64URL
 * - Missing padding (auto-fixed)
 * - Whitespace trimming
 * 
 * Throws clear errors for invalid input.
 */

/**
 * Decode Base64 string to Buffer
 * 
 * @param {string} input - Base64 encoded string (standard or Base64URL)
 * @returns {Buffer} Decoded binary data
 * @throws {Error} If input is empty, invalid, or cannot be decoded
 */
export function decodeBase64ToBuffer(input) {
  if (typeof input !== 'string') {
    throw new Error('INVALID_BASE64: Input must be a string');
  }
  
  // Trim whitespace
  const cleaned = input.trim().replace(/\s+/g, '');
  
  if (!cleaned) {
    throw new Error('INVALID_BASE64: Input is empty after trimming whitespace');
  }
  
  // Validate: input must contain only valid Base64 or Base64URL characters
  // Valid characters: A-Z, a-z, 0-9, +, /, =, -, _
  const validBase64Regex = /^[A-Za-z0-9+\/=\-_]+$/;
  if (!validBase64Regex.test(cleaned)) {
    throw new Error('INVALID_BASE64: Input contains invalid characters');
  }
  
  // Add padding if needed (Base64 requires length to be multiple of 4)
  let padded = cleaned;
  const missingPadding = padded.length % 4;
  if (missingPadding) {
    padded += '='.repeat(4 - missingPadding);
  }
  
  // Try standard Base64 first
  try {
    const decoded = Buffer.from(padded, 'base64');
    if (decoded.length === 0 && cleaned.length > 0) {
      throw new Error('INVALID_BASE64: Decoded buffer is empty');
    }
    return decoded;
  } catch (e) {
    // Fallback to Base64URL (replace - with +, _ with /)
    try {
      const base64urlText = padded.replace(/-/g, '+').replace(/_/g, '/');
      // Re-add padding if needed after replacement
      const missingPaddingAfter = base64urlText.length % 4;
      const finalText = missingPaddingAfter 
        ? base64urlText + '='.repeat(4 - missingPaddingAfter)
        : base64urlText;
      
      const decoded = Buffer.from(finalText, 'base64');
      if (decoded.length === 0 && cleaned.length > 0) {
        throw new Error('INVALID_BASE64: Decoded buffer is empty');
      }
      return decoded;
    } catch (e2) {
      throw new Error('INVALID_BASE64: Malformed Base64 payload');
    }
  }
}

