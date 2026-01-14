/**
 * Quality Checklist System - Deterministic validation and enforcement
 * Extracted from index.js for modularity
 * 
 * Severity levels: ERROR (must remediate) vs WARNING (log only)
 */

import { getAgeRubric } from "../prompts/storytelling.mjs";

// Unicode property escape support check with fallback
let UNICODE_PROPERTY_ESCAPES_SUPPORTED = false;
let WORD_BOUNDARY_MODE = 'unicode'; // 'unicode' or 'fallback'

function testUnicodePropertyEscapes() {
  try {
    // Test if \p{P} works
    const testRegex = /\p{P}/u;
    if (testRegex.test('.')) {
      UNICODE_PROPERTY_ESCAPES_SUPPORTED = true;
      WORD_BOUNDARY_MODE = 'unicode';
      return true;
    }
  } catch (e) {
    // Fallback mode
  }
  UNICODE_PROPERTY_ESCAPES_SUPPORTED = false;
  WORD_BOUNDARY_MODE = 'fallback';
  console.error('[QUALITY CHECKLIST] ERROR: Unicode property escapes not supported, using fallback mode');
  return false;
}

// Run self-test at startup
testUnicodePropertyEscapes();

/**
 * Get current word boundary mode ('unicode' or 'fallback')
 * @returns {string} Current mode
 */
export function getWordBoundaryMode() {
  return WORD_BOUNDARY_MODE;
}

/**
 * Create word boundary regex (handles Latin, Cyrillic, underscores, alphanumerics)
 * Boundaries are "not a letter, digit, or underscore" on both sides
 * @param {string} word - Word to match
 * @param {string} flags - Regex flags
 * @returns {RegExp} Word boundary regex
 */
export function makeWordBoundaryRegex(word, flags = 'i') {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  if (WORD_BOUNDARY_MODE === 'unicode' && UNICODE_PROPERTY_ESCAPES_SUPPORTED) {
    // Unicode mode: use \p{L} for letters, \p{N} for digits, plus underscore
    // Boundary = not (letter or digit or underscore)
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, flags + 'u');
  } else {
    // Fallback mode: explicit character classes for Latin + Cyrillic
    // [a-zA-ZА-ЯЁа-яё0-9_] = word characters
    // Boundary = not word character on both sides
    return new RegExp(`(?<![a-zA-ZА-ЯЁа-яё0-9_])${escaped}(?![a-zA-ZА-ЯЁа-яё0-9_])`, flags);
  }
}

// Safety ERROR words: violence, injury, threat, fear, urgency, loss, death, weapon, blood, scream, chase
// Use word boundaries to avoid substring matches
const SAFETY_ERROR_WORDS = [
  'опасно', 'страшно', 'боится', 'бояться', 'испуг', 'ужас', 'тревога', 'паника',
  'опасность', 'угроза', 'враг', 'злодей', 'злой', 'плохой', 'плохо',
  'побег', 'прятаться', 'спасаться', 'спастись', 'спасение',
  'драка', 'бить', 'ударить', 'удар', 'война', 'сражение', 'бой', 'конфликт',
  'атака', 'нападение', 'агрессия', 'жестокий',
  'срочно', 'спешить', 'торопиться', 'потерял', 'потерять', 'пропал',
  'исчез', 'исчезнуть', 'умер', 'смерть', 'умирать',
  'кровь', 'оружие', 'крик', 'кричать', 'погоня', 'преследование'
];

// Style WARNING words: slang, modern buzzwords, sarcasm, explicit morals, abstract terms
const STYLE_WARNING_WORDS = [
  'айфон', 'компьютер', 'интернет', 'телефон', 'телевизор', 'машина', 'автомобиль',
  'самолёт', 'аэропорт', 'школа', 'учитель', 'урок', 'домашнее задание',
  'смысл', 'значение', 'важно', 'важность', 'мораль', 'научиться',
  'понять', 'понимание', 'философия', 'истина', 'правда', 'ложь',
  'грустно', 'печаль', 'одиноко', 'одиночество', 'злость', 'раздражение',
  'разочарование', 'обида', 'обиженный'
];

// Safety ERROR patterns (boundary-safe where possible)
const SAFETY_ERROR_PATTERNS = [
  /\bопасн/i, /\bстрашн/i, /\bбоится/i, /\bугроз/i, /\bвраг/i, /\bзлодей/i,
  /\bдрак/i, /\bвойн/i, /\bсражен/i, /\bатака/i, /\bнападен/i,
  /\bсрочно/i, /\bспеши/i, /\bпотеря/i, /\bпропал/i, /\bисчез/i, /\bумер/i, /\bсмерт/i,
  /\bкровь/i, /\bоружие/i, /\bкрик/i, /\bпогоня/i
];

// Style WARNING patterns
const STYLE_WARNING_PATTERNS = [
  /\bурок/i, /\bмораль/i, /\bнаучиться/i, /\bважно/i, /\bсмысл/i
];

/**
 * Count words in text (simple word count)
 * @param {string} text - Text to count words in
 * @returns {number} Word count
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Check if text contains dialogue with proper detection
 * Requires at least two dialogue turns AND at least one speech verb near dialogue
 * Avoids counting bullet lists or hyphenated narrative as dialogue
 * @param {string} text - Text to check
 * @returns {boolean} True if dialogue detected
 */
function hasDialogue(text) {
  if (!text || typeof text !== 'string') return false;
  
  // Speech verbs that must appear near dialogue
  const speechVerbs = ['сказал', 'спросил', 'ответил', 'прошептал', 'подумал', 'спросила', 'ответила', 'произнёс', 'воскликнул'];
  const speechVerbRegex = makeWordBoundaryRegex(speechVerbs.join('|'), 'i');
  const hasSpeechVerb = speechVerbRegex.test(text);
  
  // Count dialogue turns (quoted segments)
  const quoteSegments = text.match(/["«»][^"«»]*["«»]/g) || [];
  const quoteTurnCount = quoteSegments.length;
  
  // Count em-dash dialogue turns (— followed by capital, but NOT at start of line for narrative)
  // Exclude em-dash at start of line or after period (likely narrative, not dialogue)
  const emDashTurns = (text.match(/[.!?]\s*—\s*[А-ЯЁ]/g) || []).length;
  // Also count em-dash after quotes or speech verbs (definitely dialogue)
  const emDashAfterSpeech = (text.match(/(["«»]|сказал|спросил|ответил)\s*—\s*[А-ЯЁ]/gi) || []).length;
  const emDashTurnCount = emDashTurns + emDashAfterSpeech;
  
  // Exclude bullet lists (lines starting with - or •)
  const hasBulletList = /^[\s]*[-•]\s+/m.test(text);
  
  // Exclude hyphenated narrative (em-dash at start of line or paragraph)
  const hasHyphenatedNarrative = /^[\s]*—\s+[А-ЯЁ]/m.test(text);
  
  // Require at least 2 dialogue turns
  const totalTurns = quoteTurnCount + emDashTurnCount;
  if (totalTurns < 2) return false;
  
  // Require at least one speech verb near dialogue
  if (!hasSpeechVerb) return false;
  
  // Exclude if it's a bullet list or hyphenated narrative
  if (hasBulletList || hasHyphenatedNarrative) return false;
  
  return true;
}

/**
 * Count hero name mentions in text (Cyrillic-safe, word boundary)
 * @param {string} text - Text to search
 * @param {string} heroName - Hero name to count
 * @returns {number} Count of mentions
 */
function countHeroMentions(text, heroName) {
  if (!text || !heroName || typeof text !== 'string' || typeof heroName !== 'string') return 0;
  const regex = makeWordBoundaryRegex(heroName, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Check for repetition heuristic: same sentence start across pages
 * Normalizes heroName to {HERO} token, compares first 4 words, and first 8 characters
 * @param {string[]} pageTexts - Array of page texts
 * @param {string} heroName - Hero name to normalize
 * @returns {Array} Array of repetition issues
 */
function checkRepetitionHeuristic(pageTexts, heroName) {
  if (!Array.isArray(pageTexts) || pageTexts.length < 2) return [];
  const issues = [];
  
  // Normalize heroName to {HERO} token in text
  const normalizeText = (text, hero) => {
    if (!text || typeof text !== 'string') return '';
    if (hero && typeof hero === 'string') {
      // Replace hero name with {HERO} token (case-insensitive, word boundary)
      const regex = makeWordBoundaryRegex(hero, 'gi');
      text = text.replace(regex, '{HERO}');
    }
    return text;
  };
  
  const normalizedTexts = pageTexts.map(text => normalizeText(text, heroName));
  
  // Extract first 4 words and first 8 characters
  const sentenceData = normalizedTexts.map(text => {
    const firstSentence = text.split(/[.!?]/)[0].trim();
    const words = firstSentence.split(/\s+/).slice(0, 4);
    const first4Words = words.join(' ').toLowerCase();
    const first8Chars = firstSentence.substring(0, 8).toLowerCase();
    return { first4Words, first8Chars };
  });
  
  for (let i = 0; i < sentenceData.length; i++) {
    for (let j = i + 1; j < sentenceData.length; j++) {
      const data1 = sentenceData[i];
      const data2 = sentenceData[j];
      
      // Check first 4 words match
      if (data1.first4Words && data2.first4Words && data1.first4Words === data2.first4Words) {
        issues.push({ 
          code: 'REPETITION_WARNING', 
          severity: 'WARNING',
          message: `Pages ${i + 1} and ${j + 1} start with the same 4 words`,
          page1: i + 1,
          page2: j + 1
        });
      }
      
      // Check first 8 characters match (catches template reuse)
      if (data1.first8Chars && data2.first8Chars && data1.first8Chars === data2.first8Chars) {
        issues.push({ 
          code: 'REPETITION_WARNING', 
          severity: 'WARNING',
          message: `Pages ${i + 1} and ${j + 1} start with the same 8 characters (possible template reuse)`,
          page1: i + 1,
          page2: j + 1
        });
      }
    }
  }
  return issues;
}

// Word count ranges per age group: [min, max]
const WORD_COUNT_RANGES = {
  '2-3': [6, 20],
  '3-4': [12, 35],
  '4-6': [25, 60],
  '6-8': [60, 110]
};

/**
 * Validate single page text quality
 * @param {string} pageText - Text of the page
 * @param {number} pageNum - Page number (1-based)
 * @param {string} ageGroup - Age group
 * @param {string} heroName - Hero name
 * @returns {object} Validation result
 */
export function validatePageQuality(pageText, pageNum, ageGroup, heroName) {
  const errors = [];
  const warnings = [];
  
  if (!pageText || typeof pageText !== 'string' || pageText.trim().length === 0) {
    errors.push({ code: 'EMPTY_PAGE', severity: 'ERROR', message: `Page ${pageNum} is empty` });
    return { valid: false, errors, warnings, wordCount: 0, hasDialogue: false, heroMentions: 0 };
  }
  
  const text = pageText.toLowerCase();
  const wordCount = countWords(pageText);
  
  // Safety ERROR: Check safety error words with word boundaries
  for (const word of SAFETY_ERROR_WORDS) {
    const regex = makeWordBoundaryRegex(word, 'i');
    if (regex.test(pageText)) {
      errors.push({ code: 'SAFETY_ERROR_WORD', severity: 'ERROR', message: `Page ${pageNum} contains safety error word: ${word}` });
    }
  }
  
  // Safety ERROR: Check safety error patterns
  for (const pattern of SAFETY_ERROR_PATTERNS) {
    if (pattern.test(pageText)) {
      errors.push({ code: 'SAFETY_ERROR_PATTERN', severity: 'ERROR', message: `Page ${pageNum} contains safety error pattern` });
      break;
    }
  }
  
  // Style WARNING: Check style warning words with word boundaries
  for (const word of STYLE_WARNING_WORDS) {
    const regex = makeWordBoundaryRegex(word, 'i');
    if (regex.test(pageText)) {
      warnings.push({ code: 'STYLE_WARNING_WORD', severity: 'WARNING', message: `Page ${pageNum} contains style warning word: ${word}` });
    }
  }
  
  // Style WARNING: Check style warning patterns
  for (const pattern of STYLE_WARNING_PATTERNS) {
    if (pattern.test(pageText)) {
      warnings.push({ code: 'STYLE_WARNING_PATTERN', severity: 'WARNING', message: `Page ${pageNum} contains style warning pattern` });
      break;
    }
  }
  
  // Word count range checks
  const range = WORD_COUNT_RANGES[ageGroup] || WORD_COUNT_RANGES['4-6'];
  const [minWords, maxWords] = range;
  const halfMin = Math.floor(minWords / 2);
  
  if (wordCount < halfMin) {
    errors.push({ code: 'WORD_COUNT_CRITICAL', severity: 'ERROR', message: `Page ${pageNum} has only ${wordCount} words, critical minimum is ${halfMin} for age ${ageGroup}` });
  } else if (wordCount < minWords) {
    warnings.push({ code: 'WORD_COUNT_LOW', severity: 'WARNING', message: `Page ${pageNum} has ${wordCount} words, below recommended ${minWords} for age ${ageGroup}` });
  } else if (wordCount > maxWords) {
    warnings.push({ code: 'WORD_COUNT_HIGH', severity: 'WARNING', message: `Page ${pageNum} has ${wordCount} words, above recommended ${maxWords} for age ${ageGroup}` });
  }
  
  // Hero name continuity check
  const heroMentions = countHeroMentions(pageText, heroName);
  if (ageGroup === '6-8') {
    // Age 6-8: at least 3 mentions total, one on page 1 and page 4 (checked at story level)
  } else if (ageGroup === '2-3' || ageGroup === '3-4' || ageGroup === '4-6') {
    // Ages 2-6: Hero name MUST appear on EVERY page (ERROR level)
    if (heroMentions === 0) {
      errors.push({ code: 'HERO_NAME_MISSING', severity: 'ERROR', message: `Page ${pageNum} does not mention hero name ${heroName} (required for age ${ageGroup})` });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    wordCount,
    hasDialogue: hasDialogue(pageText),
    heroMentions
  };
}

/**
 * Validate entire story quality
 * @param {string[]} pageTexts - Array of page texts
 * @param {string} ageGroup - Age group
 * @param {string} heroName - Hero name
 * @returns {object} Validation result
 */
export function validateStoryQuality(pageTexts, ageGroup, heroName) {
  const EXPECTED_PAGES = 4;
  const allErrors = [];
  const allWarnings = [];
  const pageValidations = [];
  let dialogueCount = 0;
  let totalHeroMentions = 0;
  
  // Check page count
  if (!Array.isArray(pageTexts) || pageTexts.length !== EXPECTED_PAGES) {
    allErrors.push({ code: 'PAGE_COUNT_MISMATCH', severity: 'ERROR', message: `Expected ${EXPECTED_PAGES} pages, got ${pageTexts?.length || 0}` });
    return { valid: false, errors: allErrors, warnings: allWarnings, pageValidations: [] };
  }
  
  // Validate each page
  for (let i = 0; i < pageTexts.length; i++) {
    const pageNum = i + 1;
    const validation = validatePageQuality(pageTexts[i], pageNum, ageGroup, heroName);
    pageValidations.push(validation);
    
    allErrors.push(...validation.errors);
    allWarnings.push(...validation.warnings);
    
    if (validation.hasDialogue) {
      dialogueCount++;
    }
    
    totalHeroMentions += validation.heroMentions || 0;
  }
  
  // Age 6-8 dialogue requirement (at least 2 pages with dialogue)
  if (ageGroup === '6-8') {
    if (dialogueCount < 2) {
      allWarnings.push({ code: 'DIALOGUE_REQUIRED', severity: 'WARNING', message: `Age 6-8 requires dialogue on at least 2 pages, found on ${dialogueCount}` });
    }
  }
  
  // Age 6-8 hero name requirement (at least 3 mentions total, one on page 1 and page 4)
  if (ageGroup === '6-8') {
    if (totalHeroMentions < 3) {
      allWarnings.push({ code: 'HERO_NAME_INSUFFICIENT', severity: 'WARNING', message: `Age 6-8 requires at least 3 hero name mentions total, found ${totalHeroMentions}` });
    }
    // Check page 1 and page 4
    const page1Mentions = pageValidations[0]?.heroMentions || 0;
    const page4Mentions = pageValidations[3]?.heroMentions || 0;
    if (page1Mentions === 0) {
      allWarnings.push({ code: 'HERO_NAME_MISSING_PAGE1', severity: 'WARNING', message: `Age 6-8 requires hero name on page 1` });
    }
    if (page4Mentions === 0) {
      allWarnings.push({ code: 'HERO_NAME_MISSING_PAGE4', severity: 'WARNING', message: `Age 6-8 requires hero name on page 4` });
    }
  }
  
  // Repetition heuristic check (with hero name normalization)
  const repetitionIssues = checkRepetitionHeuristic(pageTexts, heroName);
  allWarnings.push(...repetitionIssues);
  
  // Calculate average word count
  const avgWordCount = pageValidations.reduce((sum, v) => sum + (v.wordCount || 0), 0) / pageValidations.length;
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    pageValidations,
    dialogueCount,
    totalHeroMentions,
    avgWordCount
  };
}

/**
 * Generate safe fallback text for a page
 * @param {number} pageNum - Page number (1-based)
 * @param {string} heroName - Hero name
 * @param {string} theme - Story theme
 * @param {string} ageGroup - Age group
 * @returns {string} Fallback text
 */
export function generateSafeFallbackText(pageNum, heroName, theme, ageGroup) {
  const templates = {
    '2-3': {
      1: `${heroName} дома. Всё спокойно. Всё хорошо.`,
      2: `${heroName} видит что-то интересное. Что это?`,
      3: `${heroName} идёт. Идёт медленно. Всё хорошо.`,
      4: `${heroName} дома. Всё тепло. Всё спокойно.`
    },
    '3-4': {
      1: `${heroName} находится в ${theme}. Всё спокойно и безопасно.`,
      2: `${heroName} замечает что-то волшебное. Это интересно!`,
      3: `${heroName} отправляется в путь. Всё хорошо.`,
      4: `${heroName} возвращается домой. Всё тепло и радостно.`
    },
    '4-6': {
      1: `${heroName} находится в ${theme}. Вокруг спокойно и уютно. Всё знакомо и безопасно. День был тёплым и светлым.`,
      2: `${heroName} замечает что-то необычное. Это что-то волшебное и интересное. ${heroName} подходит ближе и смотрит внимательно.`,
      3: `${heroName} решает посмотреть поближе. Всё получается легко и спокойно. Ничего страшного не происходит.`,
      4: `${heroName} возвращается домой. Всё тепло, уютно и радостно. День подходит к концу.`
    },
    '6-8': {
      1: `${heroName} находился в ${theme}. Вокруг было спокойно и уютно. Всё было знакомо и безопасно. Солнце светило мягко, и птицы пели тихо. ${heroName} чувствовал себя хорошо и спокойно. День был прекрасным и тёплым. Всё вокруг было мирным и добрым.`,
      2: `${heroName} заметил что-то необычное. "Что это?" — спросил он тихо. Это было что-то волшебное и интересное. ${heroName} подошёл ближе, чтобы рассмотреть получше. Всё было очень красиво и спокойно. Ничего страшного не происходило. Вокруг царила тишина и покой.`,
      3: `${heroName} решил посмотреть поближе. "Интересно," — подумал он. Всё получалось легко и спокойно. Никакой опасности не было. ${heroName} чувствовал только радость и удивление. Всё вокруг было добрым и светлым. День продолжался мирно и спокойно.`,
      4: `${heroName} вернулся домой. Всё было тепло, уютно и радостно. Всё было хорошо. ${heroName} был счастлив и спокоен. День прошёл замечательно. Вечер был тихим и спокойным. Всё вокруг было мирным и добрым.`
    }
  };
  
  const ageTemplates = templates[ageGroup] || templates['4-6'];
  return ageTemplates[pageNum] || ageTemplates[1];
}

