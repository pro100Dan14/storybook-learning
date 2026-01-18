/**
 * Scene utilities
 */

export function normalizeScenes(input) {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // Try JSON array
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }

    // Split by newlines or pipe/semicolon
    let parts = trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 1) {
      parts = trimmed.split(/[|;]/).map((s) => s.trim()).filter(Boolean);
    }
    if (parts.length === 1) {
      // Split into sentences if still one
      parts = trimmed.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    }
    return parts;
  }

  return [];
}


