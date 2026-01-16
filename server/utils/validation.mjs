/**
 * Validation utilities for input data
 * Extracted from index.js for modularity
 */

/**
 * Strip data URL prefix from base64 string
 * @param {string} maybeBase64 - Base64 string possibly with data URL prefix
 * @returns {string} Clean base64 string
 */
export function stripDataUrlPrefix(maybeBase64) {
  if (!maybeBase64) return "";
  const s = String(maybeBase64).trim();
  const idx = s.indexOf("base64,");
  if (idx !== -1) return s.slice(idx + "base64,".length).trim();
  return s;
}

/**
 * Validate image buffer matches declared MIME type by checking magic bytes
 * @param {Buffer} buf - Image buffer
 * @param {string} mimeType - Declared MIME type
 * @returns {boolean} True if buffer matches MIME type
 */
export function isValidImageBufferForMime(buf, mimeType) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  const mt = String(mimeType || "").toLowerCase();
  if (mt === "image/jpeg") {
    // FF D8 FF
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mt === "image/png") {
    // 89 50 4E 47 0D 0A 1A 0A
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (mt === "image/webp") {
    // "RIFF" .... "WEBP"
    return (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    );
  }
  return false;
}

/**
 * Validate identity JSON structure
 * Returns {valid: boolean, reason: string} for detailed error reporting
 * MVP mode: Only validate structure, not quality constraints
 * @param {object} jsonObj - Identity object to validate
 * @returns {{valid: boolean, reason: string|null}}
 */
export function validateIdentityJSON(jsonObj) {
  if (!jsonObj || typeof jsonObj !== "object") {
    return { valid: false, reason: "Not an object" };
  }
  
  const required = [
    "child_id",
    "age_range",
    "skin_tone",
    "hair",
    "eyes",
    "face",
    "distinctive_marks",
    "must_keep_same",
    "must_not",
    "short_visual_summary",
    "negative_prompt"
  ];
  
  for (const key of required) {
    if (!(key in jsonObj)) {
      return { valid: false, reason: `Missing required field: ${key}` };
    }
  }
  
  // Validate hair object structure
  if (!jsonObj.hair || typeof jsonObj.hair !== "object") {
    return { valid: false, reason: "hair must be an object" };
  }
  if (typeof jsonObj.hair.color !== "string") {
    return { valid: false, reason: "hair.color must be a string" };
  }
  if (typeof jsonObj.hair.length !== "string") {
    return { valid: false, reason: "hair.length must be a string" };
  }
  if (typeof jsonObj.hair.style !== "string") {
    return { valid: false, reason: "hair.style must be a string" };
  }
  
  // Validate eyes object structure
  if (!jsonObj.eyes || typeof jsonObj.eyes !== "object") {
    return { valid: false, reason: "eyes must be an object" };
  }
  if (typeof jsonObj.eyes.color !== "string") {
    return { valid: false, reason: "eyes.color must be a string" };
  }
  if (typeof jsonObj.eyes.shape !== "string") {
    return { valid: false, reason: "eyes.shape must be a string" };
  }
  
  // Validate face object structure
  if (!jsonObj.face || typeof jsonObj.face !== "object") {
    return { valid: false, reason: "face must be an object" };
  }
  if (typeof jsonObj.face.shape !== "string") {
    return { valid: false, reason: "face.shape must be a string" };
  }
  if (!Array.isArray(jsonObj.face.features)) {
    return { valid: false, reason: "face.features must be an array" };
  }
  
  // Validate arrays (structure only, no minimum lengths)
  if (!Array.isArray(jsonObj.distinctive_marks)) {
    return { valid: false, reason: "distinctive_marks must be an array" };
  }
  if (!Array.isArray(jsonObj.must_keep_same)) {
    return { valid: false, reason: "must_keep_same must be an array" };
  }
  if (!Array.isArray(jsonObj.must_not)) {
    return { valid: false, reason: "must_not must be an array" };
  }
  
  // Validate strings (type only, no minimum length)
  if (typeof jsonObj.short_visual_summary !== "string") {
    return { valid: false, reason: "short_visual_summary must be a string" };
  }
  if (typeof jsonObj.negative_prompt !== "string") {
    return { valid: false, reason: "negative_prompt must be a string" };
  }
  
  return { valid: true, reason: null };
}

/**
 * Normalize identity: ensure all expected fields exist with correct types
 * @param {object} jsonObj - Raw identity object
 * @returns {object|null} Normalized identity or null if invalid
 */
export function normalizeIdentity(jsonObj) {
  if (!jsonObj || typeof jsonObj !== "object") {
    return null;
  }
  
  return {
    child_id: typeof jsonObj.child_id === "string" ? jsonObj.child_id.trim() || "" : "",
    age_range: typeof jsonObj.age_range === "string" ? jsonObj.age_range.trim() || "" : "",
    skin_tone: typeof jsonObj.skin_tone === "string" ? jsonObj.skin_tone.trim() || "" : "",
    hair: {
      color: typeof jsonObj.hair?.color === "string" ? jsonObj.hair.color.trim() || "" : "",
      length: typeof jsonObj.hair?.length === "string" ? jsonObj.hair.length.trim() || "" : "",
      style: typeof jsonObj.hair?.style === "string" ? jsonObj.hair.style.trim() || "" : ""
    },
    eyes: {
      color: typeof jsonObj.eyes?.color === "string" ? jsonObj.eyes.color.trim() || "" : "",
      shape: typeof jsonObj.eyes?.shape === "string" ? jsonObj.eyes.shape.trim() || "" : ""
    },
    face: {
      shape: typeof jsonObj.face?.shape === "string" ? jsonObj.face.shape.trim() || "" : "",
      features: Array.isArray(jsonObj.face?.features) ? jsonObj.face.features.filter(f => typeof f === "string").map(f => f.trim()) : []
    },
    distinctive_marks: Array.isArray(jsonObj.distinctive_marks) ? jsonObj.distinctive_marks.filter(m => typeof m === "string").map(m => m.trim()) : [],
    must_keep_same: Array.isArray(jsonObj.must_keep_same) ? jsonObj.must_keep_same.filter(r => typeof r === "string").map(r => r.trim()) : [],
    must_not: Array.isArray(jsonObj.must_not) ? jsonObj.must_not.filter(r => typeof r === "string").map(r => r.trim()) : [],
    short_visual_summary: typeof jsonObj.short_visual_summary === "string" ? jsonObj.short_visual_summary.trim() || "" : "",
    negative_prompt: typeof jsonObj.negative_prompt === "string" ? jsonObj.negative_prompt.trim() || "no text, no logos" : "no text, no logos"
  };
}

/**
 * Detect suspicious text truncation patterns
 * @param {string} text - Text to check
 * @returns {{suspicious: boolean, reason?: string, pattern?: string}} Detection result
 */
export function detectTextTruncation(text) {
  if (!text || typeof text !== 'string') {
    return { suspicious: false };
  }
  
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { suspicious: false };
  }
  
  // Pattern 1: Ends with "..." or ".." or "..."
  if (trimmed.endsWith('...') || trimmed.endsWith('..')) {
    return { suspicious: true, reason: 'trailing_ellipsis', pattern: 'ends_with_ellipsis' };
  }
  
  // Pattern 2: Ends mid-word (last word doesn't end with punctuation or space)
  // Check if last character is not punctuation and next-to-last is not a space
  const lastChar = trimmed[trimmed.length - 1];
  const punctuation = /[.!?;:,\s\u2026\u2014\u2013]/; // Includes ellipsis, em-dash, en-dash
  if (!punctuation.test(lastChar) && trimmed.length > 1) {
    const secondLastChar = trimmed[trimmed.length - 2];
    // If second-to-last is also not punctuation/space, likely mid-word
    if (!punctuation.test(secondLastChar)) {
      // Check if it looks like an incomplete word (ends with lowercase letter, no sentence-ending punctuation before)
      const lastWordMatch = trimmed.match(/\s+([^\s.!?;:\u2026]+)$/);
      if (lastWordMatch && lastWordMatch[1].length > 0) {
        const lastWord = lastWordMatch[1];
        // If last word is longer than 3 chars and doesn't end with punctuation, suspect truncation
        if (lastWord.length > 3 && !/[.!?;:]/.test(lastWord)) {
          return { suspicious: true, reason: 'mid_word_cut', pattern: 'ends_mid_word' };
        }
      }
    }
  }
  
  // Pattern 3: Ends with incomplete sentence (no terminal punctuation in last 50 chars)
  const last50Chars = trimmed.slice(-50);
  const hasTerminalPunct = /[.!?]\s*$/.test(last50Chars);
  if (!hasTerminalPunct && trimmed.length > 50) {
    // But allow if it ends with comma, semicolon, or ellipsis (which are valid sentence continuations)
    const lastCharValid = /[,;:\u2026]/.test(lastChar);
    if (!lastCharValid) {
      return { suspicious: true, reason: 'incomplete_sentence', pattern: 'no_terminal_punctuation' };
    }
  }
  
  return { suspicious: false };
}

/**
 * Extract JSON from text (handle markdown, leading/trailing text)
 * @param {string} text - Text containing JSON
 * @returns {object|null} Parsed JSON or null
 */
export function extractJSONFromText(text) {
  if (!text) return null;
  
  // Try to find JSON in markdown code blocks (triple backticks)
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {}
  }
  
  // Find first '{' and last '}' to extract JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonStr = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(jsonStr);
    } catch {}
  }
  
  // Fallback: try to match any JSON object
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {}
  }
  
  return null;
}

/**
 * Convert string identity to object (for backward compatibility)
 * @param {object|string} identityInput - Identity as object or string
 * @returns {object|null} Identity object or null
 */
export function normalizeIdentityInput(identityInput) {
  // If already an object and valid, return as-is
  if (identityInput && typeof identityInput === "object") {
    const validation = validateIdentityJSON(identityInput);
    if (validation.valid) {
      return identityInput;
    }
  }
  
  // If string, convert to minimal object
  if (typeof identityInput === "string" && identityInput.trim().length > 0) {
    return {
      child_id: "legacy_001",
      age_range: "5-7",
      skin_tone: "unknown",
      hair: {
        color: "unknown",
        length: "unknown",
        style: "unknown"
      },
      eyes: {
        color: "unknown",
        shape: "unknown"
      },
      face: {
        shape: "unknown",
        features: ["face features from photo"]
      },
      distinctive_marks: [],
      must_keep_same: ["Keep the same face, proportions, and hairstyle"],
      must_not: ["Do not change hair or eye color"],
      short_visual_summary: identityInput.trim(),
      negative_prompt: "No modern objects, no logos, no text"
    };
  }
  
  return null;
}







