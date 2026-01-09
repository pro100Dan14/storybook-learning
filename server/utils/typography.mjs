// Typographic post-processing for Russian text

/**
 * Replaces straight quotes with curly quotes (ёлочки)
 */
function replaceQuotes(text) {
  // Replace "..." with «...»
  // Simple approach: replace pairs of quotes
  let result = text;
  
  // Replace opening quote
  result = result.replace(/"([^"]+)"/g, (match, content) => {
    return `«${content}»`;
  });
  
  // Replace single quotes inside text (but not in URLs or technical IDs)
  // More careful: only replace quotes that are clearly dialog/quotes
  // Skip if it looks like JSON, URL, or technical identifier
  if (!/https?:\/\//.test(result) && !/^\{/.test(result) && !/^\[/.test(result)) {
    result = result.replace(/'([^']+)'/g, (match, content) => {
      // Skip if looks like technical ID
      if (/^[a-z0-9_-]+$/i.test(content)) return match;
      return `'${content}'`;
    });
  }
  
  return result;
}

/**
 * Adds non-breaking spaces after short prepositions and conjunctions
 */
function addNonBreakingSpaces(text) {
  // Common one- and two-character prepositions and conjunctions in Russian
  const shortWords = [
    'в', 'к', 'о', 'у', 'с', 'и', 'а', 'о', 'я', 'я',
    'из', 'от', 'до', 'по', 'со', 'во', 'ко', 'об', 'про', 'при',
    'но', 'да', 'же', 'ли', 'то', 'ли', 'или', 'что', 'чем', 'чем',
    'как', 'так', 'там', 'здесь', 'где', 'куда', 'откуда'
  ];
  
  let result = text;
  
  // Add non-breaking space after short words followed by space and word
  // Use zero-width space as approximation (Unicode \u00A0 for non-breaking space)
  // But in HTML we'll use &nbsp;
  // For now, just prepare the text - we'll do HTML encoding in HTML generator
  
  return result;
}

/**
 * Main typography function - processes Russian text for book display
 * Does NOT modify JSON, URLs, or technical identifiers
 */
export function processTypography(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Skip if it looks like JSON
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
    return text;
  }
  
  // Skip if it looks like URL
  if (/https?:\/\//.test(text)) {
    return text;
  }
  
  let result = text;
  
  // Replace quotes
  result = replaceQuotes(result);
  
  // Note: Non-breaking spaces are better handled in HTML generation
  // where we can use &nbsp; entity
  
  return result;
}

/**
 * Processes text for HTML output with non-breaking spaces
 */
export function processTypographyHTML(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Skip JSON, URLs, technical identifiers
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || /https?:\/\//.test(text)) {
    return text;
  }
  
  let result = text;
  
  // Replace quotes
  result = replaceQuotes(result);
  
  // Add non-breaking spaces after short prepositions/conjunctions
  // Pattern: word boundary + short word + space + word
  const shortWordsPattern = /\b(в|к|о|у|с|и|а|я|из|от|до|по|со|во|ко|об|про|при|но|да|же|ли|то|или|что|чем|как|так|там|здесь|где|куда|откуда)\s+/gi;
  result = result.replace(shortWordsPattern, (match, word) => {
    return word + '&nbsp;';
  });
  
  return result;
}



