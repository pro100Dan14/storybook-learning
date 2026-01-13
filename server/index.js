// server/index.js

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

// ---- ADC bootstrap (local dev) ----
function resolveAdcPath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function ensureLocalAdc() {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return;

  const defaultRel = "./gcp-sa.json";

  // If env var missing, set a sane default for local dev.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultRel;
  }

  const resolved = resolveAdcPath(process.env.GOOGLE_APPLICATION_CREDENTIALS);

  // Re-assign resolved absolute path so downstream libs see a stable value.
  if (resolved) process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;

  const exists = resolved ? fs.existsSync(resolved) : false;

  console.log(
    `[ADC] NODE_ENV=${process.env.NODE_ENV || "undefined"} ` +
    `GOOGLE_APPLICATION_CREDENTIALS=${resolved || "null"} exists=${exists}`
  );

  if (!exists) {
    console.warn(
      `[ADC] Service account file not found. Put gcp-sa.json in server/ or set GOOGLE_APPLICATION_CREDENTIALS to an absolute path.`
    );
  }
}

ensureLocalAdc();
// ---- end ADC bootstrap ----

// Hard startup check: GEMINI_API_KEY required when using Gemini providers
const providerText = (process.env.PROVIDER_TEXT || "gemini").toLowerCase();
const providerImage = (process.env.PROVIDER_IMAGE || "gemini").toLowerCase();
const geminiApiKey = process.env.GEMINI_API_KEY;
if ((providerText === "gemini" || providerImage === "gemini") && (!geminiApiKey || geminiApiKey.trim() === "")) {
  console.error("FATAL: GEMINI_API_KEY missing");
  console.error("Set GEMINI_API_KEY in server/.env or environment");
  process.exit(1);
}

import express from "express";
import cors from "cors";
import multer from "multer";
import { GoogleAuth } from "google-auth-library";
import { FACE_IDENTITY_BLOCK, FACE_IDENTITY_PROHIBITIONS } from "./prompts/face_identity.mjs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { generateTextUnified } from "./services/gen-text.mjs";
import { generateImageUnified } from "./services/gen-image.mjs";
import { decodeBase64ToBuffer } from "./utils/base64-decode.mjs";
import { getGeminiAccessToken } from "./utils/gemini-auth.mjs";

const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// CORS configuration for Lovable and mobile apps
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Allow all Lovable domains
    if (
      origin.match(/^https?:\/\/.*\.lovable\.app$/) ||
      origin.match(/^https?:\/\/.*\.lovableproject\.com$/) ||
      origin.match(/^https?:\/\/localhost(:\d+)?$/) ||
      origin.match(/^https?:\/\/127\.0\.0\.1(:\d+)?$/) ||
      origin.match(/^https?:\/\/.*\.lovable\.dev$/)
    ) {
      return callback(null, true);
    }
    
    // Allow all origins for development
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware (handles OPTIONS automatically)
app.use(cors(corsOptions));

app.get("/debug/adc", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  const resolved = raw ? path.resolve(raw) : "";
  const exists = resolved ? fs.existsSync(resolved) : false;

  let googleAuthOk = false;
  let projectId = null;
  let googleAuthError = null;

  try {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    googleAuthOk = Boolean(client);
    try {
      projectId = await auth.getProjectId();
    } catch (e) {
      projectId = null;
    }
  } catch (e) {
    googleAuthOk = false;
    googleAuthError = e && e.message ? e.message : String(e);
  }

  let geminiTokenOk = false;
  let geminiTokenError = null;

  try {
    const token = await getGeminiAccessToken();
    geminiTokenOk = Boolean(token && token.trim().length > 0);
  } catch (e) {
    geminiTokenOk = false;
    geminiTokenError = e && e.message ? e.message : String(e);
  }

  res.status(200).json({
    ok: true,
    nodeEnv: process.env.NODE_ENV || null,
    googleApplicationCredentials: raw || null,
    resolved: resolved || null,
    exists,
    cwd: process.cwd(),
    googleAuthOk,
    projectId,
    googleAuthError,
    geminiTokenOk,
    geminiTokenError,
  });
});

app.get("/debug/book", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  
  const providerText = (process.env.PROVIDER_TEXT || "gemini").toLowerCase();
  const providerImage = (process.env.PROVIDER_IMAGE || "gemini").toLowerCase();
  const geminiTextModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  
  res.status(200).json({
    ok: true,
    DEBUG_BOOK: process.env.DEBUG_BOOK === "1",
    providerText,
    providerImage,
    geminiTextModel,
    geminiImageModel,
    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    hasGoogleApplicationCredentials: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  });
});

// Configure multer for file uploads (memory storage, no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 35 * 1024 * 1024, // 35MB
  }
});

// Parse JSON for backward compatibility
// express.json only parses application/json content-type, so it won't interfere with multipart
app.use(express.json({ limit: "35mb" }));


function stripDataUrlPrefix(maybeBase64) {
  if (!maybeBase64) return "";
  const s = String(maybeBase64).trim();
  const idx = s.indexOf("base64,");
  if (idx !== -1) return s.slice(idx + "base64,".length).trim();
  return s;
}

function isValidImageBufferForMime(buf, mimeType) {
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


// Helper: Validate identity JSON structure and content quality
// Returns {valid: boolean, reason: string} for detailed error reporting
// MVP mode: Only validate structure, not quality constraints
function validateIdentityJSON(jsonObj) {
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

// Normalize identity: ensure all expected fields exist with correct types
function normalizeIdentity(jsonObj) {
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
 * @returns {Object} Detection result with { suspicious: boolean, reason?: string, pattern?: string }
 */
function detectTextTruncation(text) {
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

// Helper: Extract JSON from text (handle markdown, leading/trailing text)
function extractJSONFromText(text) {
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

// Helper: Build hero reference prompt (for stable master image) - Russian fairy tale style
function buildHeroReferencePrompt(identity) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const identityText = buildIdentityText(identity);
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  return `
Generate a stable master reference image of the child hero for a Russian folk fairy tale storybook (русская народная сказка).

${getRussianFairyTaleArtStyle()}

COMPOSITION:
- Medium shot, head and shoulders, face clearly visible
- Neutral expression, no grin, no extreme emotion
- Russian folk clothing (traditional garments, not modern)
- No accessories, no text, no logos, no modern clothing
- Avoid far shots where the face becomes tiny and ambiguous

Character identity:
${identityText}

CRITICAL RULES - MUST KEEP SAME:
${mustKeepRules || "- Keep the same face, proportions, and hairstyle"}
- Same face geometry, same eye distance, same nose shape, same mouth shape
- Do not stylize facial identity, do not change hairline

${getRussianFairyTaleNegative()}

FORBIDDEN:
- No modern objects, no logos, no text
- No accessories, no glasses, no hats
- No extreme expressions or emotions
- No modern clothing, no swimwear

This will be used as the PRIMARY identity reference for all storybook pages.
`.trim();
}

// Helper: Build face-avoiding fallback hero reference prompt
function buildHeroReferenceFallbackPrompt(identity) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const identityText = buildIdentityText(identity);
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  return `
Generate a stable master reference image of the child hero for a Russian folk fairy tale storybook (русская народная сказка).

${getRussianFairyTaleArtStyle()}

COMPOSITION:
- Full body or back-facing hero, face not visible
- Hair silhouette clearly visible from behind or side
- Body proportions consistent with the child photo
- Russian folk clothing (traditional garments, not modern)
- Neutral pose, no extreme emotion
- No accessories, no text, no logos, no modern clothing

Character identity (body and hair):
${identityText}

CRITICAL RULES - MUST KEEP SAME:
${mustKeepRules || "- Keep the same hair color, hair style, body proportions"}
- Same hair silhouette and body proportions
- Do not change hairline or body structure

${getRussianFairyTaleNegative()}

FORBIDDEN:
- No modern objects, no logos, no text
- No accessories, no glasses, no hats
- No extreme expressions or emotions
- Face must NOT be visible (back or side view only)
- No modern clothing, no swimwear

This is a fallback reference image that avoids face visibility while maintaining identity through hair and body.
`.trim();
}

// Helper: Get age-appropriate style note
function getAgeStyleNote(ageGroup) {
  if (ageGroup === "2-3" || ageGroup === "3-4") {
    return "For younger children: simpler compositions, fewer details, very clear subject.";
  } else if (ageGroup === "6-8") {
    return "For older children: slightly richer backgrounds, but still children's illustration style.";
  }
  return "";
}

// Helper: Get Russian folk fairy tale art style (single source of truth)
function getRussianFairyTaleArtStyle() {
  return `
ART STYLE - RUSSIAN FOLK FAIRY TALE ILLUSTRATION (русская народная сказка):
СТИЛЬ - РУССКАЯ НАРОДНАЯ СКАЗКА:

Artistic References / Художественные референсы:
- Ivan Bilibin (Иван Билибин): decorative borders, flat perspective, folk patterns
- Yuri Vasnetsov (Юрий Васнецов): warm earthy palette, simplified forms, cozy atmosphere
- Boris Zvorykin (Борис Зворыкин): detailed folk costumes, traditional architecture, magical mood

Medium / Техника:
- Gouache or tempera paint (гуашь или темпера)
- Visible paper grain texture (видимая текстура бумаги)
- Hand-drawn black outlines (ручная обводка черным контуром)
- Matte finish, no glossy digital shading (матовый финиш, без глянцевого цифрового затенения)

Color Palette / Цветовая палитра:
- Warm earthy tones: ochre (охра), muted reds (приглушенные красные), sage green (шалфейный зеленый)
- Sky blue (небесно-голубой) for skies and water
- Natural wood tones (натуральные древесные тона)
- Avoid bright neon colors, avoid pastel gradients (избегать ярких неоновых цветов, избегать пастельных градиентов)

Composition / Композиция:
- Decorative elements, folk patterns (декоративные элементы, народные узоры)
- Simplified, slightly flattened perspective (упрощенная, слегка уплощенная перспектива)
- Clear foreground and background separation (четкое разделение переднего и заднего плана)
- Traditional Russian architecture: izba (изба), wooden houses, folk motifs (традиционная русская архитектура)

Clothing / Одежда:
- Russian folk garments: sarafan (сарафан), kosovorotka (косоворотка), valenki (валенки)
- Traditional headwear: kokoshnik (кокошник), ushanka (ушанка)
- NO modern clothing, NO swimwear, NO contemporary fashion (БЕЗ современной одежды, БЕЗ купальников)

Mood / Настроение:
- Calm, cozy, magical, timeless (спокойное, уютное, волшебное, вневременное)
- Warm domestic atmosphere (теплая домашняя атмосфера)
- Gentle wonder, no fear or danger (нежное удивление, без страха и опасности)

CRITICAL: This is NOT modern Western picture book style. NOT Disney, NOT Pixar, NOT modern nursery watercolor.
КРИТИЧНО: Это НЕ современный западный стиль детской книги. НЕ Дисней, НЕ Пиксар, НЕ современная детская акварель.
`.trim();
}

// Helper: Get Russian fairy tale negative constraints
function getRussianFairyTaleNegative() {
  return `
AVOID / ИЗБЕГАТЬ:
- Disney / Pixar / DreamWorks animation style (стиль анимации Дисней / Пиксар / DreamWorks)
- Modern nursery watercolor / pastel gradient kid-app style (современная детская акварель / пастельный градиент в стиле детских приложений)
- Glossy digital shading, cinematic lighting, hyperrealism (глянцевое цифровое затенение, кинематографическое освещение, гиперреализм)
- Modern clothing, swimwear, modern interiors (современная одежда, купальники, современные интерьеры)
- Anime style, 3D render, computer graphics (стиль аниме, 3D рендер, компьютерная графика)
- Swimming pools, modern city streets, contemporary settings (бассейны, современные городские улицы, современные декорации)
- Western children's book aesthetics (западная эстетика детских книг)
`.trim();
}

// Helper: Get detailed age-based writing rubric
function getAgeRubric(ageGroup) {
  switch(ageGroup) {
    case "2-3":
      return {
        sentenceLength: "3-5 words per sentence",
        vocabulary: "Very simple, familiar words only",
        imagery: "Concrete, visible objects only",
        dialogue: "None or minimal (1-2 words)",
        repetition: "High - repeat key words and phrases",
        humor: "None - keep it simple and warm",
        rhythm: "Strong rhythm, easy to read aloud",
        complexity: "Very low - one idea per sentence",
        wordCount: "40-80 words per page",
        structure: "1-2 short paragraphs per page"
      };
    case "3-4":
      return {
        sentenceLength: "4-7 words per sentence",
        vocabulary: "Simple, familiar words",
        imagery: "Concrete descriptions",
        dialogue: "Minimal, very simple",
        repetition: "Moderate - some repetition for rhythm",
        humor: "Gentle, simple humor",
        rhythm: "Pleasant rhythm, easy to read aloud",
        complexity: "Low - clear cause and effect",
        wordCount: "60-110 words per page",
        structure: "2-3 short paragraphs per page"
      };
    case "4-6":
      return {
        sentenceLength: "5-10 words per sentence",
        vocabulary: "Richer vocabulary, but still clear",
        imagery: "Light metaphors allowed",
        dialogue: "Some simple dialogue",
        repetition: "Low - varied language",
        humor: "Gentle humor and playfulness",
        rhythm: "Natural rhythm, pleasant to read",
        complexity: "Moderate - richer descriptions",
        wordCount: "90-150 words per page",
        structure: "2-4 paragraphs per page"
      };
    case "6-8":
      return {
        sentenceLength: "6-12 words per sentence, varied structure",
        vocabulary: "Richer vocabulary, some sophisticated words",
        imagery: "Figurative language, metaphors, sensory details",
        dialogue: "At least one dialogue line on pages 2 or 3",
        repetition: "Minimal - varied and engaging",
        humor: "Subtle humor and wordplay",
        rhythm: "Sophisticated rhythm, engaging to read",
        complexity: "Higher - richer narrative, small twists",
        wordCount: "120-180 words per page",
        structure: "3-5 paragraphs per page"
      };
    default:
      return getAgeRubric("4-6");
  }
}


// QUALITY CHECKLIST SYSTEM - Deterministic validation and enforcement
// Severity levels: ERROR (must remediate) vs WARNING (log only)

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

// Helper: Create word boundary regex (handles Latin, Cyrillic, underscores, alphanumerics)
// Boundaries are "not a letter, digit, or underscore" on both sides
// Exported for testing/verification purposes only
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

// Count words in text (simple word count)
// Exported for testing/verification purposes only
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// Check if text contains dialogue with proper detection
// Requires at least two dialogue turns AND at least one speech verb near dialogue
// Avoids counting bullet lists or hyphenated narrative as dialogue
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

// Count hero name mentions in text (Cyrillic-safe, word boundary)
function countHeroMentions(text, heroName) {
  if (!text || !heroName || typeof text !== 'string' || typeof heroName !== 'string') return 0;
  const regex = makeWordBoundaryRegex(heroName, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

// Check for repetition heuristic: same sentence start across pages
// Normalizes heroName to {HERO} token, compares first 4 words, and first 8 characters
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

// Validate single page text quality
// Exported for testing/verification purposes only
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

// Validate entire story quality
// Exported for testing/verification purposes only
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

// Generate safe fallback text for a page
// Exported for testing/verification purposes only
export function generateSafeFallbackText(pageNum, heroName, theme, ageGroup) {
  const ageRubric = getAgeRubric(ageGroup);
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

// MASTER STORYTELLING PROMPT - Single Source of Truth
// This is a CHILDREN'S STORYBOOK WRITER AND EDITOR prompt
function getMasterStorytellingPrompt(ageGroup, heroName, theme) {
  const ageRubric = getAgeRubric(ageGroup);
  
  return `
========================
ROLE
========================
You are a professional children's fairy tale writer AND a senior literary editor.
You write stories that are meant to be read aloud before sleep.
Your primary goal is emotional safety, warmth, and quiet wonder.

Children do not "consume a plot".
Children experience an emotional state.

You are responsible for that state.

========================
GLOBAL CONSTRAINTS
========================
- Always generate EXACTLY 4 pages.
- Never generate more or fewer pages.
- Each page represents ONE emotional beat.
- No modern language.
- No slang.
- No sarcasm.
- No philosophy.
- No explicit morals or lessons.
- No danger, violence, villains, or fear.
- No urgency.
- No "saving the world".

The story must feel calm, warm, predictable, and safe.

========================
CANONICAL 4-PAGE STRUCTURE
========================

PAGE 1 — SAFE WORLD
Purpose: grounding and safety.
- Calm, familiar environment.
- Nothing happens yet.
- The world is kind and understandable.
- The hero is an ordinary child.
- Focus on light, warmth, sounds, smells, stillness.

PAGE 2 — QUIET WONDER
Purpose: gentle curiosity.
- A small, non-threatening magical element appears.
- The magic does not demand action.
- No conflict.
- The child notices, wonders, observes.

PAGE 3 — SMALL JOURNEY
Purpose: soft movement and growth.
- A tiny challenge or decision.
- No danger.
- The child moves, asks, or tries.
- Help is allowed.
- The child succeeds gently.

PAGE 4 — RETURN AND WARMTH
Purpose: emotional closure.
- Calm returns.
- The magic becomes part of life.
- The child is safe.
- Feeling of "home", "evening", "warm light".
- No explanations or morals.

========================
AGE-BASED WRITING RULES (${ageGroup})
========================

${ageGroup === "2-3" ? `AGE 2–3:
- Very short sentences (${ageRubric.sentenceLength}).
- Repetition is GOOD.
- Minimal vocabulary (${ageRubric.vocabulary}).
- Rhythm matters more than meaning.
- ${ageRubric.structure}.` : ''}

${ageGroup === "3-4" ? `AGE 3–4:
- Short, clear sentences (${ageRubric.sentenceLength}).
- Simple dialogue allowed.
- Gentle questions.
- ${ageRubric.structure}.` : ''}

${ageGroup === "4-6" ? `AGE 4–6:
- Richer language, but still simple (${ageRubric.vocabulary}).
- Soft metaphors allowed (${ageRubric.imagery}).
- Calm pacing (${ageRubric.rhythm}).
- ${ageRubric.structure}.` : ''}

${ageGroup === "6-8" ? `AGE 6–8:
- Literary children's prose (${ageRubric.vocabulary}).
- Dialogue REQUIRED (${ageRubric.dialogue}).
- Inner thoughts allowed.
- Longer sentences, but clear (${ageRubric.sentenceLength}).
- ${ageRubric.structure}.
- Must feel "smart", not "adult".` : ''}

The text MUST clearly change with age.
If age changes, style MUST change.

Target word count: ${ageRubric.wordCount}.

========================
TEXT QUALITY RULES
========================
- Text must be pleasant to read aloud.
- No rushed pacing.
- No abstract words (like "meaning", "important", "lesson").
- No modern concepts.
- No explicit teaching.

If a parent reads this aloud slowly,
it should sound natural and soothing.

========================
IMAGE–TEXT ALIGNMENT RULE
========================
- Images show the OUTER world.
- Text expresses INNER state.
- Images must never be more dramatic than the text.
- Calm text → calm image.
- Quiet wonder → soft, restrained image.

========================
EDITOR PASS (MANDATORY)
========================
After writing the story:
- Reread it as an editor.
- Improve rhythm.
- Remove harsh transitions.
- Soften language.
- Preserve the same plot.
- Make the text calmer and more musical.

========================
FAILURE CONDITIONS
========================
The output is INVALID if:
- Page count is not 4.
- Any page contains fear, danger, or urgency.
- The text sounds generic or "AI-like".
- The style does not change with age.
- The ending explains or moralizes.

========================
FINAL GOAL
========================
Produce a children's fairy tale that feels:
- Warm
- Safe
- Calm
- Magical
- Predictably good

The child should want to hear it again tomorrow.

========================
STORY PARAMETERS
========================
Hero name: ${heroName}
Theme/setting: ${theme}
Age group: ${ageGroup}

Generate a story that follows the canonical 4-page structure above.
`.trim();
}

// Helper: Build image prompt with identity (supports hero reference)
// ALWAYS uses FACE_IDENTITY_BLOCK verbatim - never modified per page
function buildImagePromptWithIdentity(pageText, scenePrompt, identity, prevPagesText = "", useHeroReference = false, ageGroup = "4-6") {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  const mustNotRules = Array.isArray(identity.must_not) 
    ? identity.must_not.map(r => `- ${r}`).join("\n")
    : "";
  
  const negativeRules = [
    identity.negative_prompt || "",
    ...(mustNotRules ? [mustNotRules] : [])
  ].filter(Boolean).join("\n");
  
  // ALWAYS insert FACE_IDENTITY_BLOCK verbatim - never modify
  // ALWAYS include FACE_IDENTITY_PROHIBITIONS in system rules
  
  return `
You are illustrating a page from a Russian folk fairy tale (русская народная сказка) for ages ${ageGroup}.

${getRussianFairyTaleArtStyle()}

${getAgeStyleNote(ageGroup) ? `${getAgeStyleNote(ageGroup)}\n` : ""}

COMPOSITION:
- Clear subject
- Simple background
- No visual clutter
- Decorative folk elements

No modern objects, no logos, no text on image.

${FACE_IDENTITY_PROHIBITIONS}

Story context for continuity:
${prevPagesText ? `- Previous pages: ${prevPagesText}` : "- Beginning of story"}
- Current page: ${pageText}
${scenePrompt ? `- Scene: ${scenePrompt}` : ""}

Character identity (MUST match the child photo exactly):
${identity.short_visual_summary || ""}

${FACE_IDENTITY_BLOCK}

CRITICAL RULES - MUST KEEP SAME:
${mustKeepRules || "- Keep the same face, proportions, and hairstyle"}
- Do not stylize facial identity, do not change hairline
- Avoid far shots where the face becomes tiny and ambiguous

${negativeRules ? `FORBIDDEN:\n${negativeRules}` : ""}

${getRussianFairyTaleNegative()}

${useHeroReference ? "Match the hero reference image (hero.jpg) exactly for face and hair. Use the child photo only to confirm identity, not to reinvent a new face." : "Use the provided child photo as the identity reference."}
Medium or wide shot, avoid close-up portraits.
Show full body or at least torso and legs.
`.trim();
}

// Helper: Simple hash function for debug logging
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

// Helper: Generate short request ID
function generateRequestId() {
  return Math.random().toString(36).substring(2, 10);
}

// Middleware: Add requestId to every request (must be after generateRequestId)
app.use((req, res, next) => {
  req.requestId = generateRequestId();
  next();
});

// Helper: Build identity_text from identity object (for backward compatibility)
function buildIdentityText(identity) {
  if (!identity || typeof identity !== "object") return "";
  
  const summary = identity.short_visual_summary || "";
  const rules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.join(". ")
    : "";
  
  return [summary, rules].filter(Boolean).join(". ");
}

// Helper: Convert string identity to object (for backward compatibility)
function normalizeIdentityInput(identityInput) {
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

// Internal helper: Generate hero reference image (with retry and fallback)
async function generateHeroReference(identity, photoBase64, mimeType, requestId) {
  const prompt = buildHeroReferencePrompt(identity);
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    try {
      const result = await generateImageUnified({
        prompt,
        images: [{ base64: photoBase64, mimeType: mimeType || "image/jpeg" }],
        requestId
      });
      const elapsed = Date.now() - attemptStart;
      
      // Extract base64 from dataUrl for backward compatibility
      const base64 = result.dataUrl.split("base64,")[1];
      
      console.log(`[${requestId}] HERO: SUCCESS (attempt ${attempt}, ${elapsed}ms, mimeType: ${result.mimeType})`);
      
      return {
        mimeType: result.mimeType,
        dataUrl: result.dataUrl,
        base64: base64
      };
    } catch (e) {
      const elapsed = Date.now() - attemptStart;
      const finishReason = e.finishReason;
      const safetyRatings = e.safetyRatings;
      const safetyStr = safetyRatings ? safetyRatings.map(r => `${r.category}:${r.probability}`).join(",") : "none";
      
      if (e.message === "NO_IMAGE_RETURNED") {
        console.log(`[${requestId}] HERO: attempt ${attempt} failed (${elapsed}ms, finishReason: ${finishReason}, safetyRatings: ${safetyStr})`);
      } else {
        console.error(`[${requestId}] HERO: attempt ${attempt} exception:`, e?.message || e);
      }
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }
  
  // Fallback: Try face-avoiding prompt
  console.log(`[${requestId}] HERO: All ${maxAttempts} attempts failed, trying fallback (face-avoiding)...`);
  try {
    const fallbackPrompt = buildHeroReferenceFallbackPrompt(identity);
    const startTime = Date.now();
    const result = await generateImageUnified({
      prompt: fallbackPrompt,
      images: [{ base64: photoBase64, mimeType: mimeType || "image/jpeg" }],
      requestId
    });
    const elapsed = Date.now() - startTime;
    
    // Extract base64 from dataUrl
    const base64 = result.dataUrl.split("base64,")[1];
    const finishReason = result.raw?.candidates?.[0]?.finishReason || result.raw?.response?.candidates?.[0]?.finishReason;
    
    console.log(`[${requestId}] HERO: FALLBACK SUCCESS (${elapsed}ms, mimeType: ${result.mimeType}, finishReason: ${finishReason})`);
    
    return {
      mimeType: result.mimeType,
      dataUrl: result.dataUrl,
      base64: base64,
      isFallback: true
    };
  } catch (e) {
    const elapsed = Date.now() - startTime;
    const finishReason = e.finishReason;
    const safetyRatings = e.safetyRatings;
    const safetyStr = safetyRatings ? safetyRatings.map(r => `${r.category}:${r.probability}`).join(",") : "none";
    console.error(`[${requestId}] HERO: FALLBACK failed (${elapsed}ms, finishReason: ${finishReason}, safetyRatings: ${safetyStr})`);
  }
  
  throw new Error("NO_HERO_IMAGE_RETURNED");
}

app.get("/health", (req, res) => {
  res.json({ ok: true, requestId: req.requestId });
});

app.post("/api/story", async (req, res) => {
  try {
    const { name, theme } = req.body || {};
    const safeName = (name || "Герой").toString().slice(0, 80);
    const safeTheme = (theme || "волшебный лес").toString().slice(0, 120);

    const prompt = `
Напиши одно короткое предложение на русском языке в стиле русской народной сказки.
Герой: ${safeName}.
Место: ${safeTheme}.
Без современности, без жаргона, без сарказма.
`.trim();

    const result = await generateTextUnified({
      prompt,
      images: [],
      requestId: req.requestId
    });

    res.json({ text: result.text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "GEMINI_ERROR", message: String(e?.message || e) });
  }
});

app.post("/api/identity", async (req, res) => {
  const requestId = req.requestId;
  const startTime = Date.now();
  
  try {
    const { imageBase64, mimeType } = req.body || {};
    const cleanBase64 = stripDataUrlPrefix(imageBase64);
    
    // Validate Base64 payload
    if (cleanBase64 && cleanBase64.length >= 10) {
      try {
        const decodedBuffer = decodeBase64ToBuffer(cleanBase64);
        if (decodedBuffer.length === 0) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_BASE64",
            message: "Malformed Base64 payload",
            requestId
          });
        }
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_BASE64",
          message: "Malformed Base64 payload",
          requestId
        });
      }
    }
    if (!cleanBase64) {
      return res.status(400).json({ 
        error: "NO_IMAGE", 
        requestId 
      });
    }

    const prompt = `
Analyze the child's photo and return ONLY a valid JSON object with the following exact structure.
Do NOT include any markdown, explanations, or additional text. Return ONLY the JSON.

Required JSON structure:
{
  "child_id": "short stable identifier (e.g. 'child_001')",
  "age_range": "string (e.g. '4-6' or '5-7')",
  "skin_tone": "string (e.g. 'light', 'medium', 'olive')",
  "hair": {
    "color": "string (e.g. 'brown', 'blonde', 'black')",
    "length": "string (e.g. 'short', 'medium', 'long')",
    "style": "string (e.g. 'straight', 'curly', 'wavy')"
  },
  "eyes": {
    "color": "string (e.g. 'brown', 'blue', 'green')",
    "shape": "string (e.g. 'round', 'almond', 'wide')"
  },
  "face": {
    "shape": "string (e.g. 'round', 'oval', 'square')",
    "features": ["array of strings describing distinctive facial features"]
  },
  "distinctive_marks": ["array of strings describing any distinctive marks or features"],
  "must_keep_same": ["array of strings with rules that MUST be kept the same in all images"],
  "must_not": ["array of strings with things that MUST NOT appear"],
  "short_visual_summary": "string (concise visual description for image generation prompts)",
  "negative_prompt": "string (negative prompt rules for image generation)"
}

Focus only on stable physical features: hair color/style, eye color, face shape, skin tone.
Ignore emotions, background, clothing, and temporary features.
`.trim();

    let identityJSON = null;
    let rawText = "";
    let lastValidationReason = "";
    const maxAttempts = 3;

    // Use GEMINI_IDENTITY_MODEL for identity extraction (not GEMINI_TEXT_MODEL)
    const identityModel = process.env.GEMINI_IDENTITY_MODEL || "gemini-2.5-flash";
    
    // FORCE_IDENTITY_FAIL: Test fallback path (dev/test only)
    const forceIdentityFail = process.env.FORCE_IDENTITY_FAIL === "1" && process.env.NODE_ENV !== "production";

    for (let attempt = 1; attempt <= maxAttempts && !identityJSON; attempt++) {
      if (forceIdentityFail) {
        lastValidationReason = "FORCE_IDENTITY_FAIL enabled for testing";
        console.log(`[${requestId}] FORCE_IDENTITY_FAIL: Simulating identity failure`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        continue;
      }
      try {
        const attemptStart = Date.now();
        const result = await generateTextUnified({
          prompt,
          images: [{ base64: cleanBase64, mimeType: mimeType || "image/jpeg" }],
          requestId,
          modelOverride: identityModel
        });
        const attemptTime = Date.now() - attemptStart;

        rawText = result.text;
        const extracted = extractJSONFromText(rawText);
        
        if (extracted) {
          // Normalize first, then validate structure
          const normalized = normalizeIdentity(extracted);
          if (normalized) {
            const validation = validateIdentityJSON(normalized);
            if (validation.valid) {
              identityJSON = normalized;
              console.log(`[${requestId}] Identity attempt ${attempt}: SUCCESS (${attemptTime}ms, raw_text_len: ${rawText.length})`);
            } else {
              lastValidationReason = validation.reason;
              console.log(`[${requestId}] Identity attempt ${attempt}: FAILED (${attemptTime}ms, raw_text_len: ${rawText.length}, reason: ${validation.reason})`);
              if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          } else {
            lastValidationReason = "Failed to normalize identity structure";
            console.log(`[${requestId}] Identity attempt ${attempt}: FAILED (${attemptTime}ms, raw_text_len: ${rawText.length}, reason: ${lastValidationReason})`);
            if (attempt < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } else {
          lastValidationReason = "Failed to extract JSON from text";
          console.log(`[${requestId}] Identity attempt ${attempt}: FAILED (${attemptTime}ms, raw_text_len: ${rawText.length}, reason: ${lastValidationReason})`);
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (e) {
        lastValidationReason = `Exception: ${e?.message || e}`;
        console.error(`[${requestId}] Identity generation attempt ${attempt} failed:`, e?.message || e);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    const totalTime = Date.now() - startTime;

    if (!identityJSON) {
      return res.status(500).json({ 
        error: "IDENTITY_INVALID", 
        message: "Failed to generate valid identity JSON after 3 attempts",
        reason: lastValidationReason,
        raw_text: rawText,
        requestId,
        attempts: maxAttempts,
        total_time_ms: totalTime
      });
    }

    const identityText = buildIdentityText(identityJSON);

    return res.json({
      identity: identityJSON,
      identity_text: identityText,
      raw_text: rawText,
      requestId
    });
  } catch (e) {
    console.error(`[${requestId}] Identity error:`, e);
    return res.status(500).json({ 
      error: "IDENTITY_ERROR", 
      message: String(e?.message || e),
      requestId 
    });
  }
});

app.post("/api/hero", async (req, res) => {
  const requestId = req.requestId;
  const startTime = Date.now();
  
  try {
    const body = req.body || {};
    const identityInput = body.identity;
    
    // Normalize identity
    if (!identityInput) {
      return res.status(400).json({ 
        error: "IDENTITY_REQUIRED", 
        message: "Identity is required (object or string)",
        requestId 
      });
    }
    
    const identity = normalizeIdentityInput(identityInput);
    if (!identity) {
      return res.status(400).json({ 
        error: "IDENTITY_REQUIRED", 
        message: "Identity must be a valid identity object or non-empty string",
        requestId 
      });
    }
    
    const rawPhotoBase64 = body.photoBase64 || body.imageBase64 || "";
    const finalPhotoBase64 = stripDataUrlPrefix(rawPhotoBase64);
    const finalMimeType = body.photoMimeType || body.mimeType || "image/jpeg";
    
    if (!finalPhotoBase64 || finalPhotoBase64.length < 10) {
      return res.status(400).json({ 
        error: "PHOTO_REQUIRED",
        requestId 
      });
    }
    
    const heroRef = await generateHeroReference(identity, finalPhotoBase64, finalMimeType, requestId);
    const totalTime = Date.now() - startTime;
    
    return res.json({
      ok: true,
      requestId,
      hero: {
        mimeType: heroRef.mimeType,
        dataUrl: heroRef.dataUrl
      }
    });
  } catch (e) {
    console.error(`[${requestId}] HERO error:`, e);
    return res.status(500).json({ 
      error: "HERO_ERROR", 
      message: String(e?.message || e),
      requestId 
    });
  }
});

app.post("/api/image", async (req, res) => {
  const requestId = req.requestId;
  const startTime = Date.now();
  
  try {
    const body = req.body || {};

    const pageText = body.pageText || "";
    const scenePrompt = body.imagePrompt || body.prompt || "";
    const identityInput = body.identity;

    // Normalize identity: accept both object and string, but require it
    if (!identityInput) {
      return res.status(400).json({ 
        error: "IDENTITY_REQUIRED", 
        message: "Identity is required (object or string)",
        requestId 
      });
    }

    const identity = normalizeIdentityInput(identityInput);
    if (!identity) {
      return res.status(400).json({ 
        error: "IDENTITY_REQUIRED", 
        message: "Identity must be a valid identity object or non-empty string",
        requestId 
      });
    }

    const rawPhotoBase64 =
      body.photoBase64 ||
      body.imageBase64 ||
      "";

    const finalPhotoBase64 = stripDataUrlPrefix(rawPhotoBase64);
    const finalMimeType =
      body.photoMimeType ||
      body.mimeType ||
      "image/jpeg";

    if (!finalPhotoBase64 || finalPhotoBase64.length < 10) {
      return res.status(400).json({ error: "PHOTO_REQUIRED", requestId });
    }
    
    // Validate Base64 payload
    try {
      const decodedBuffer = decodeBase64ToBuffer(finalPhotoBase64);
      if (decodedBuffer.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_BASE64",
          message: "Malformed Base64 payload",
          requestId
        });
      }
    } catch (e) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_BASE64",
        message: "Malformed Base64 payload",
        requestId
      });
    }

    // Optional hero reference
    const heroBase64 = body.heroBase64 ? stripDataUrlPrefix(body.heroBase64) : null;
    const heroMimeType = body.heroMimeType || "image/png";
    const useHeroReference = !!heroBase64;

    // Debug logging
    const identityHash = simpleHash(JSON.stringify(identity));
    console.log(`[${requestId}] IMAGE: identity hash: ${identityHash}, child_id: ${identity.child_id || "legacy"}, hero provided: ${useHeroReference}`);

    const promptText = buildImagePromptWithIdentity(pageText, scenePrompt, identity, "", useHeroReference);
    const promptHash = simpleHash(promptText);
    console.log(`[${requestId}] IMAGE: prompt hash: ${promptHash}`);

    // Build images array for unified service
    const images = [];
    if (useHeroReference) {
      // Hero reference as PRIMARY, child photo as SECONDARY
      images.push({ base64: heroBase64, mimeType: heroMimeType });
      images.push({ base64: heroBase64, mimeType: heroMimeType });
    } else {
      // Only child photo
      images.push({ base64: finalPhotoBase64, mimeType: finalMimeType });
    }

    // ВАЖНО: просим модель вернуть именно IMAGE.
    const imageStart = Date.now();
    try {
      const imageResult = await generateImageUnified({
        prompt: promptText,
        images: images,
        requestId
      });
      const imageTime = Date.now() - imageStart;
      const totalTime = Date.now() - startTime;

      console.log(`[${requestId}] IMAGE: SUCCESS (${imageTime}ms model, ${totalTime}ms total)`);

      return res.json({
        mimeType: imageResult.mimeType,
        dataUrl: imageResult.dataUrl,
        requestId
      });
    } catch (e) {
      const imageTime = Date.now() - imageStart;
      const finishReason = e.finishReason;
      const safetyRatings = e.safetyRatings;
      const safetyStr = safetyRatings ? safetyRatings.map(r => `${r.category}:${r.probability}`).join(",") : "none";
      
      if (e.message === "NO_IMAGE_RETURNED") {
        console.log(`[${requestId}] IMAGE: No image returned (${imageTime}ms, finishReason: ${finishReason}, safety: ${safetyStr})`);
        return res.status(500).json({ 
          error: "NO_IMAGE_RETURNED",
          finishReason,
          requestId 
        });
      }
      throw e;
    }
  } catch (e) {
    console.error(`[${requestId}] IMAGE error:`, e);
    return res.status(500).json({ 
      error: "IMAGE_ERROR", 
      message: String(e?.message || e),
      requestId 
    });
  }
});

// Middleware to handle both multipart/form-data and JSON for /api/book
const handleBookUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  // If multipart/form-data, use multer
  if (contentType.includes('multipart/form-data')) {
    return upload.single('photo')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          ok: false,
          error: "UPLOAD_ERROR",
          message: err.message || "File upload failed",
          requestId: req.requestId || 'unknown'
        });
      }
      
      // Convert uploaded file to base64 for backward compatibility
      if (req.file) {
        // Strict mime allowlist for uploads
        if (req.file.mimetype && !ALLOWED_PHOTO_MIME_TYPES.has(req.file.mimetype)) {
          return res.status(400).json({
            error: "PHOTO_REQUIRED",
            message:
              "Photo must be an image (jpeg/png/webp). Send via: (1) multipart/form-data with -F \"photo=@/path/to/image.jpg\"; or (2) JSON with photoBase64 from a real image file.",
            requestId: req.requestId || "unknown",
          });
        }
        if (!isValidImageBufferForMime(req.file.buffer, req.file.mimetype)) {
          return res.status(400).json({
            error: "PHOTO_REQUIRED",
            message:
              "Photo must be a valid image file (jpeg/png/webp). Send via: (1) multipart/form-data with -F \"photo=@/path/to/image.jpg\"; or (2) JSON with photoBase64 from a real image file.",
            requestId: req.requestId || "unknown",
          });
        }
        req.body.photoBase64 = req.file.buffer.toString('base64');
        req.body.photoMimeType = req.file.mimetype || 'image/jpeg';
      }
      
      // Multer automatically populates req.body with form fields (name, theme, pages, etc.)
      // No need to extract them manually
      
      next();
    });
  }
  
  // Otherwise, let express.json handle it (backward compatibility)
  next();
};

app.post("/api/book", handleBookUpload, async (req, res) => {
  const requestId = req.requestId;
  
  
  try {
    const startTime = Date.now();
    
    // A) Generate unique book_id and create per-book directory
    const bookId = randomUUID();
    const jobsDir = path.join(__dirname, "jobs");
    const bookDir = path.join(jobsDir, bookId);
    
    // Ensure jobs directory exists
    if (!fs.existsSync(jobsDir)) {
      fs.mkdirSync(jobsDir, { recursive: true });
    }
    if (!fs.existsSync(bookDir)) {
      fs.mkdirSync(bookDir, { recursive: true });
    }
    
    const mode = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
    const IDENTITY_THRESHOLD = parseFloat(process.env.IDENTITY_SIMILARITY_THRESHOLD || '0.62');
    
    // Unified warnings array for non-fatal issues
    const warnings = [];
    
    // Structured logging helper
    const logBook = (level, message, data = {}) => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        bookId,
        requestId,
        message,
        ...data
      };
      console.log(JSON.stringify(logEntry));
    };
    
    try {
    const {
      name,
      theme,
      photoBase64,
      imageBase64,
      photos, // Array of photos
      mimeType,
      photoMimeType,
      ageGroup, // Age group selector: "2-3", "3-4", "4-6", "6-8"
      _testFlags, // Test flags from request body (dev/test only)
    } = req.body || {};
    
    // Parse and normalize pages parameter (multipart sends strings, JSON may send numbers)
    const rawPages = req.body?.pages;
    const pages = Number.parseInt(String(rawPages ?? ""), 10);
    const pagesSafe = Number.isFinite(pages) ? pages : 4;
    const pagesClamped = Math.max(1, Math.min(8, pagesSafe));
    const pageCount = pagesClamped;
    
    // DEBUG_BOOK instrumentation (gated by env flag)
    const DEBUG_BOOK = process.env.DEBUG_BOOK === "1";
    if (DEBUG_BOOK) {
      const contentType = req.headers["content-type"] || "";
      const photoSource = req.file ? "multipart-file" : (req.body?.photoBase64 ? "json-base64" : "none");
      const photoBase64Len = req.body?.photoBase64 ? String(req.body.photoBase64).length : 0;
      const hasPhotoMimeType = Boolean(req.body?.photoMimeType);
      
      logBook("debug", "Request parsing", {
        contentType: contentType.substring(0, 50),
        pagesRawType: typeof rawPages,
        pagesRawValue: String(rawPages ?? "undefined"),
        pagesClamped,
        photoSource,
        hasPhotoMimeType,
        photoBase64Length: photoBase64Len,
      });
    }
    
    // Validate and default ageGroup
    const validAgeGroups = ["2-3", "3-4", "4-6", "6-8"];
    const finalAgeGroup = validAgeGroups.includes(ageGroup) ? ageGroup : "4-6";
    
    // Get age style note immediately after finalAgeGroup is computed (before any image prompt building)
    let ageStyleNote = getAgeStyleNote(finalAgeGroup);
    if (typeof ageStyleNote !== "string") ageStyleNote = "";
    
    // Extract test flags from request body (with fallback to process.env)
    // This allows tests to pass flags per-request without restarting server
    const testFlags = {
      forceIdentityFail: _testFlags?.forceIdentityFail === true || 
                        (process.env.FORCE_IDENTITY_FAIL === "1" && process.env.NODE_ENV !== "production"),
      forceImageFail: _testFlags?.forceImageFail === true || 
                      (process.env.FORCE_IMAGE_FAIL === "1" && process.env.NODE_ENV !== "production"),
    };

    const safeName = (name || "Герой").toString().slice(0, 80);
    const safeTheme = (theme || "волшебный лес").toString().slice(0, 120);

    // B) Validate Base64 photo payloads before processing
    // Note: photoBase64 may come from multipart upload (via handleBookUpload middleware)
    // or from JSON body. Both paths populate req.body.photoBase64.
    const rawPhotoBase64 = photoBase64 || imageBase64 || "";
    const strippedPhotoBase64 = stripDataUrlPrefix(rawPhotoBase64);
    const inferredPhotoMimeType = (photoMimeType || mimeType || "image/jpeg").toLowerCase();

    const photoRequiredMessage =
      'Photo is required. Send via: (1) multipart/form-data with -F "photo=@/path/to/image.jpg"; or (2) JSON with photoBase64 from a real image file (use: base64 -i image.jpg | tr -d \'\\n\').';

    // Strict, practical validation: reject obviously invalid payloads like "AA=="
    if (strippedPhotoBase64) {
      if (strippedPhotoBase64.length < 10) {
        return res.status(400).json({
          error: "PHOTO_REQUIRED",
          message: photoRequiredMessage,
          requestId,
        });
      }
      if (!ALLOWED_PHOTO_MIME_TYPES.has(inferredPhotoMimeType)) {
        return res.status(400).json({
          error: "PHOTO_REQUIRED",
          message:
            `${photoRequiredMessage} Allowed photoMimeType: image/jpeg, image/png, image/webp.`,
          requestId,
        });
      }
      try {
        const decodedBuffer = decodeBase64ToBuffer(strippedPhotoBase64);
        if (decodedBuffer.length === 0) {
          return res.status(400).json({
            error: "PHOTO_REQUIRED",
            message: photoRequiredMessage,
            requestId,
          });
        }
        if (!isValidImageBufferForMime(decodedBuffer, inferredPhotoMimeType)) {
          return res.status(400).json({
            error: "PHOTO_REQUIRED",
            message: photoRequiredMessage,
            requestId,
          });
        }
      } catch (e) {
        return res.status(400).json({
          error: "PHOTO_REQUIRED",
          message: photoRequiredMessage,
          requestId,
        });
      }
    }
    
    // Validate photos array if present (ignore empty entries; reject invalid ones)
    if (photos && Array.isArray(photos)) {
      for (const photo of photos) {
        if (photo && photo.base64) {
          const stripped = stripDataUrlPrefix(photo.base64);
          if (!stripped) continue;
          if (stripped.length < 10) {
            return res.status(400).json({ error: "PHOTO_REQUIRED", message: photoRequiredMessage, requestId });
          }
          const mt = (photo.mimeType || photo.photoMimeType || "image/jpeg").toLowerCase();
          if (!ALLOWED_PHOTO_MIME_TYPES.has(mt)) {
            return res.status(400).json({
              error: "PHOTO_REQUIRED",
              message: `${photoRequiredMessage} Allowed photoMimeType: image/jpeg, image/png, image/webp.`,
              requestId
            });
          }
          try {
            const decodedBuffer = decodeBase64ToBuffer(stripped);
            if (decodedBuffer.length === 0) {
              return res.status(400).json({ error: "PHOTO_REQUIRED", message: photoRequiredMessage, requestId });
            }
            if (!isValidImageBufferForMime(decodedBuffer, mt)) {
              return res.status(400).json({ error: "PHOTO_REQUIRED", message: photoRequiredMessage, requestId });
            }
          } catch (e) {
            return res.status(400).json({ error: "PHOTO_REQUIRED", message: photoRequiredMessage, requestId });
          }
        }
      }
    }

    // B) Select best hero photo from uploaded photos
    let selectedHero = null;
    let allPhotos = [];
    
    // Normalize input: support both single photo and photos array
    // Only include photos that have valid base64 and allowed mime type
    if (photos && Array.isArray(photos) && photos.length > 0) {
      allPhotos = photos
        .map(p => {
          const base64 = p.base64 || p.imageBase64 || p.photoBase64 || "";
          const stripped = stripDataUrlPrefix(base64);
          const mt = (p.mimeType || p.photoMimeType || "image/jpeg").toLowerCase();
          // Only include if base64 is valid and mime type allowed
          if (stripped && stripped.length >= 10 && ALLOWED_PHOTO_MIME_TYPES.has(mt)) {
            try {
              const decoded = decodeBase64ToBuffer(stripped);
              if (decoded.length > 0) {
                return {
                  base64: base64,
                  mimeType: mt
                };
              }
            } catch {}
          }
          return null;
        })
        .filter(p => p !== null);
    } else if (photoBase64 || imageBase64) {
      const rawBase64 = photoBase64 || imageBase64;
      const stripped = stripDataUrlPrefix(rawBase64);
      const mt = (photoMimeType || mimeType || "image/jpeg").toLowerCase();
      // Only include if base64 is valid (already validated above, but double-check)
      if (stripped && stripped.length >= 10) {
        try {
          const decoded = decodeBase64ToBuffer(stripped);
          if (decoded.length > 0) {
            allPhotos = [{
              base64: rawBase64,
              mimeType: ALLOWED_PHOTO_MIME_TYPES.has(mt) ? mt : "image/jpeg"
            }];
          }
        } catch {}
      }
    }
    
    if (allPhotos.length === 0) {
      logBook('error', 'No photos provided', {});
      return res.status(400).json({ 
        error: "PHOTO_REQUIRED", 
        message: photoRequiredMessage,
        requestId, 
        bookId 
      });
    }
    
    // Select best hero photo
    try {
      const { selectBestHeroPhoto } = await import("./utils/photo-selector.mjs");
      const selection = await selectBestHeroPhoto(allPhotos, mode);
      selectedHero = selection.photo;
      
      logBook('info', 'Hero photo selected', {
        selectedIndex: selection.index,
        reason: selection.reason,
        stats: selection.stats
      });
    } catch (selectError) {
      logBook('error', 'Hero photo selection failed', { error: selectError.message });
      return res.status(500).json({ 
        error: "HERO_SELECTION_FAILED", 
        message: selectError.message,
        requestId,
        bookId 
      });
    }
    
    const heroBase64 = stripDataUrlPrefix(selectedHero.base64);
    const heroMimeType = selectedHero.mimeType || "image/jpeg";
    
    if (!heroBase64 || heroBase64.length < 10) {
      logBook('error', 'Selected hero photo has invalid base64', {});
      return res.status(400).json({ 
        error: "PHOTO_REQUIRED", 
        message: photoRequiredMessage,
        requestId, 
        bookId 
      });
    }
    
    // Save hero reference to book directory
    const { saveHeroReference } = await import("./utils/hero-reference.mjs");
    const heroPath = saveHeroReference({
      bookId,
      jobsDir,
      imageData: heroBase64,
      mimeType: heroMimeType
    });
    
    logBook('info', 'Hero reference saved', { heroPath });
    
    // Load hero reference for use
    const { ensureHeroReference } = await import("./utils/hero-reference.mjs");
    const heroReference = ensureHeroReference({ bookId, heroPath });
    
    const finalPhotoBase64 = heroBase64;
    const finalMimeType = heroMimeType;

    // Helper: Create safe fallback identity (always valid for downstream image generation)
    function createFallbackIdentity() {
      return {
        child_id: "fallback",
        age_range: "",
        skin_tone: "",
        hair: { color: "", length: "", style: "" },
        eyes: { color: "", shape: "" },
        face: { shape: "", features: [] },
        distinctive_marks: [],
        must_keep_same: [],
        must_not: [],
        short_visual_summary: "young child, neutral appearance, storybook illustration",
        negative_prompt: "no text, no logos"
      };
    }

    // 1) Identity (canonical description as JSON) - NON-BLOCKING
    // Wrap entire identity generation in try/catch to ensure it never crashes
    let identity = null;
    let identityFallbackUsed = false;
    let identityError = null;
    let identityRawText = "";
    
    try {
      const identityPrompt = `
Analyze the child's photo and return ONLY a valid JSON object with the following exact structure.
Do NOT include any markdown, explanations, or additional text. Return ONLY the JSON.

Required JSON structure:
{
  "child_id": "short stable identifier (e.g. 'child_001')",
  "age_range": "string (e.g. '4-6' or '5-7')",
  "skin_tone": "string (e.g. 'light', 'medium', 'olive')",
  "hair": {
    "color": "string (e.g. 'brown', 'blonde', 'black')",
    "length": "string (e.g. 'short', 'medium', 'long')",
    "style": "string (e.g. 'straight', 'curly', 'wavy')"
  },
  "eyes": {
    "color": "string (e.g. 'brown', 'blue', 'green')",
    "shape": "string (e.g. 'round', 'almond', 'wide')"
  },
  "face": {
    "shape": "string (e.g. 'round', 'oval', 'square')",
    "features": ["array of strings describing distinctive facial features"]
  },
  "distinctive_marks": ["array of strings describing any distinctive marks or features"],
  "must_keep_same": ["array of strings with rules that MUST be kept the same in all images"],
  "must_not": ["array of strings with things that MUST NOT appear"],
  "short_visual_summary": "string (concise visual description for image generation prompts)",
  "negative_prompt": "string (negative prompt rules for image generation)"
}

Focus only on stable physical features: hair color/style, eye color, face shape, skin tone.
Ignore emotions, background, clothing, and temporary features.
`.trim();

      let lastValidationReason = "";
      const maxIdentityAttempts = 3;

      // Use GEMINI_IDENTITY_MODEL for identity extraction (not GEMINI_TEXT_MODEL)
      const identityModel = process.env.GEMINI_IDENTITY_MODEL || "gemini-2.5-flash";
      
      // FORCE_IDENTITY_FAIL: Test fallback path (dev/test only)
      // Check request body first, then fall back to process.env
      const forceIdentityFail = testFlags.forceIdentityFail;

      // Use selected hero photo for identity generation
      for (let attempt = 1; attempt <= maxIdentityAttempts && !identity; attempt++) {
        if (forceIdentityFail) {
          lastValidationReason = "FORCE_IDENTITY_FAIL enabled for testing";
          logBook('info', 'FORCE_IDENTITY_FAIL: Simulating identity failure', { attempt });
          if (attempt < maxIdentityAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          continue;
        }
        
        try {
          const attemptStart = Date.now();
          const identityResult = await generateTextUnified({
            prompt: identityPrompt,
            images: [{ base64: heroBase64, mimeType: heroMimeType }],
            requestId,
            modelOverride: identityModel
          });
          const attemptTime = Date.now() - attemptStart;

          identityRawText = identityResult.text;
          const extracted = extractJSONFromText(identityRawText);
          
          if (extracted) {
            // Normalize first, then validate structure
            const normalized = normalizeIdentity(extracted);
            if (normalized) {
              const validation = validateIdentityJSON(normalized);
              if (validation.valid) {
                identity = normalized;
                logBook('info', 'Identity generation succeeded', { attempt, attemptTimeMs: attemptTime, rawTextLen: identityRawText.length });
                break;
              } else {
                lastValidationReason = validation.reason;
                logBook('warn', 'Identity validation failed', { attempt, attemptTimeMs: attemptTime, reason: validation.reason });
                if (attempt < maxIdentityAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            } else {
              lastValidationReason = "Failed to normalize identity structure";
              logBook('warn', 'Identity normalization failed', { attempt, attemptTimeMs: attemptTime });
              if (attempt < maxIdentityAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          } else {
            lastValidationReason = "Failed to extract JSON from text";
            logBook('warn', 'Identity JSON extraction failed', { attempt, attemptTimeMs: attemptTime });
            if (attempt < maxIdentityAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (e) {
          lastValidationReason = `Exception: ${e?.message || e}`;
          logBook('error', 'Identity generation attempt failed', { attempt, error: e?.message || e });
          if (attempt < maxIdentityAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      // Use fallback if generation failed
      if (!identity) {
        identityError = lastValidationReason || "Failed to generate valid identity JSON after 3 attempts";
        logBook('warn', 'Using fallback identity', { reason: identityError });
        identity = createFallbackIdentity();
        identityFallbackUsed = true;
        warnings.push({ code: "IDENTITY_FALLBACK", message: "Identity fallback used" });
        if (identityError) {
          const safeMessage = identityError.length > 100 ? identityError.substring(0, 100) + "..." : identityError;
          warnings.push({ code: "IDENTITY_ERROR", message: safeMessage });
        }
      }
    } catch (identityGenError) {
      // Catch-all: If anything in identity generation throws, use fallback
      identityError = `Identity generation error: ${identityGenError?.message || identityGenError}`;
      logBook('error', 'Identity generation crashed, using fallback', { error: identityError });
      identity = createFallbackIdentity();
      identityFallbackUsed = true;
      warnings.push({ code: "IDENTITY_FALLBACK", message: "Identity fallback used" });
      const safeMessage = identityError.length > 100 ? identityError.substring(0, 100) + "..." : identityError;
      warnings.push({ code: "IDENTITY_ERROR", message: safeMessage });
    }

    // 2) Outline (4 pages for children's storybook) - JSON output
    // Use MASTER STORYTELLING PROMPT as single source of truth
    const masterPrompt = getMasterStorytellingPrompt(finalAgeGroup, safeName, safeTheme);
    const outlinePrompt = `
${masterPrompt}

========================
OUTLINE GENERATION TASK
========================
Create a 4-page story outline in JSON format following the canonical structure above.

OUTPUT FORMAT (JSON only, no markdown, no extra text):
{
  "title": "Short story title (3-5 words)",
  "beats": [
    {"page": 1, "scene": "Safe world - calm, familiar environment", "goal": "Grounding and safety", "emotion": "calm/safety/peace"},
    {"page": 2, "scene": "Quiet wonder - small magical element appears", "goal": "Gentle curiosity, no conflict", "emotion": "wonder/curiosity/joy"},
    {"page": 3, "scene": "Small journey - tiny challenge, no danger", "goal": "Soft movement, child succeeds gently", "emotion": "determination/joy"},
    {"page": 4, "scene": "Return and warmth - calm returns, magic becomes part of life", "goal": "Emotional closure, feeling of home", "emotion": "joy/peace/warmth"}
  ],
  "motif": "One word theme (e.g., friendship, discovery, kindness)",
  "closingLine": "Final warm message (one sentence, no moral)"
}

CRITICAL: 
- Output ONLY valid JSON. No markdown, no explanations, no code blocks.
- Follow the canonical 4-page structure exactly.
- Ensure each beat matches the emotional purpose of its page.
`.trim();

    let outlineJSON = null;
    let outlineLines = [];
    const maxOutlineRetries = 3;
    
    for (let attempt = 1; attempt <= maxOutlineRetries; attempt++) {
      try {
        const outlineResult = await generateTextUnified({
          prompt: outlinePrompt,
          images: [],
          requestId
        });
        
        const outlineText = outlineResult.text;
        outlineJSON = extractJSONFromText(outlineText);
        
        if (outlineJSON && outlineJSON.beats && Array.isArray(outlineJSON.beats) && outlineJSON.beats.length >= pageCount) {
          outlineLines = outlineJSON.beats.slice(0, pageCount).map(beat => beat.scene || beat.goal || "");
          break;
        }
      } catch (err) {
        console.log(`[${requestId}] Outline generation attempt ${attempt} failed:`, err.message);
      }
    }
    
    // Fallback: deterministic outline if JSON parsing failed
    if (!outlineJSON || !outlineLines.length || outlineLines.length < pageCount) {
      console.log(`[${requestId}] Using fallback deterministic outline`);
      warnings.push({ code: "OUTLINE_FALLBACK", message: "Outline JSON parsing failed, using fallback" });
      outlineLines = [
        `${safeName} находится в ${safeTheme}. Всё спокойно и безопасно.`,
        `${safeName} замечает что-то волшебное и интересное.`,
        `${safeName} отправляется в нежное путешествие.`,
        `${safeName} возвращается домой с радостью.`
      ].slice(0, pageCount);
    }

    // 3) Page texts (children's storybook style, age-appropriate) - JSON output
    // Use MASTER STORYTELLING PROMPT as single source of truth
    const ageRubric = getAgeRubric(finalAgeGroup);
    
    const outlineJSONForPages = outlineJSON || {
      beats: outlineLines.map((line, i) => ({
        page: i + 1,
        scene: line,
        goal: "",
        emotion: "wonder"
      }))
    };
    
    const ageRubricForPrompt = getAgeRubric(finalAgeGroup);
    // Simplified prompt to reduce input tokens and leave more room for output
    const pagesPrompt = `
Write 4 complete page texts for a Russian children's picture book (ages ${finalAgeGroup}).

OUTLINE:
${JSON.stringify(outlineJSONForPages.beats, null, 2)}

OUTPUT FORMAT (JSON only):
{
  "pages": [
    {"page": 1, "text": "Complete page 1 text ending with punctuation."},
    {"page": 2, "text": "Complete page 2 text ending with punctuation."},
    {"page": 3, "text": "Complete page 3 text ending with punctuation."},
    {"page": 4, "text": "Complete page 4 text ending with punctuation."}
  ]
}

REQUIREMENTS:
- Age ${finalAgeGroup}: ${ageRubricForPrompt.wordCount} words per page
- Calm, warm, safe tone. No fear or danger.
- Each page text MUST be COMPLETE - ${ageRubricForPrompt.wordCount.split('-')[0]}+ words, ends with punctuation.
- NEVER cut text mid-word. NEVER use "..." ellipsis.
- Output ONLY valid JSON. No markdown.
`.trim();

    let pagesJSON = null;
    let pageTexts = [];
    const maxPageRetries = 3;
    
    for (let attempt = 1; attempt <= maxPageRetries; attempt++) {
      try {
        const pagesTextResult = await generateTextUnified({
          prompt: pagesPrompt,
          images: [],
          requestId
        });
        
        const pagesTextRaw = pagesTextResult.text;
        
        // Diagnostic: Check finishReason from Gemini API response
        const rawCandidate = pagesTextResult.raw?.candidates?.[0] || pagesTextResult.raw?.response?.candidates?.[0];
        const rawFinishReason = rawCandidate?.finishReason;
        const rawTokenCount = rawCandidate?.tokenCount;
        
        // Log text length for monitoring (non-PII metrics only)
        const rawTextLength = pagesTextRaw ? pagesTextRaw.length : 0;
        logBook('debug', 'Page text generation raw response', {
          attempt,
          rawTextLength,
          finishReason: rawFinishReason || 'unknown',
          tokenCount: rawTokenCount ? JSON.stringify(rawTokenCount) : 'unknown',
          rawTextPreview: rawTextLength > 0 ? pagesTextRaw.substring(0, 100) : ''
        });
        
        if (rawFinishReason === 'MAX_TOKENS') {
          logBook('error', 'Text generation truncated by MAX_TOKENS', {
            attempt,
            requestedMaxOutputTokens: 8192,
            actualTokenCount: rawTokenCount ? JSON.stringify(rawTokenCount) : 'unknown',
            rawTextLength
          });
        }
        
        // Log end of text to see how it ends
        const textEnd = pagesTextRaw ? pagesTextRaw.substring(Math.max(0, pagesTextRaw.length - 200)) : '';
        logBook('debug', 'Raw text end (last 200 chars)', {
          attempt,
          textEnd: textEnd,
          textEndLength: textEnd.length
        });
        
        // Check for truncation in raw response
        const truncationCheck = detectTextTruncation(pagesTextRaw);
        if (truncationCheck.suspicious) {
          logBook('warn', 'Suspicious truncation detected in raw text', {
            attempt,
            reason: truncationCheck.reason,
            pattern: truncationCheck.pattern,
            rawTextLength,
            textEnd: textEnd
          });
        }
        
        pagesJSON = extractJSONFromText(pagesTextRaw);
        
        if (pagesJSON && pagesJSON.pages && Array.isArray(pagesJSON.pages) && pagesJSON.pages.length >= pageCount) {
          pageTexts = pagesJSON.pages.slice(0, pageCount).map(p => p.text || "");
          
          // Check for truncation - only reject if text is clearly truncated (mid-word cut, ellipsis)
          // Don't reject based on word count alone - that's checked later in quality validation
          let hasCriticalTruncation = false;
          
          // Log and check truncation for each page text
          for (let i = 0; i < pageTexts.length; i++) {
            const pageText = pageTexts[i];
            const pageTextLength = pageText ? pageText.length : 0;
            const pageWordCount = countWords(pageText);
            const pageTruncationCheck = detectTextTruncation(pageText);
            
            logBook('debug', 'Page text extracted', {
              pageNumber: i + 1,
              textLength: pageTextLength,
              wordCount: pageWordCount,
              suspiciousTruncation: pageTruncationCheck.suspicious,
              truncationReason: pageTruncationCheck.reason
            });
            
            // Only reject if text is clearly truncated (mid-word cut or ellipsis), not just short
            if (pageTruncationCheck.suspicious && (pageTruncationCheck.reason === 'mid_word_cut' || pageTruncationCheck.reason === 'trailing_ellipsis')) {
              hasCriticalTruncation = true;
              logBook('warn', 'Critical truncation detected in page text - will retry', {
                pageNumber: i + 1,
                reason: pageTruncationCheck.reason,
                pattern: pageTruncationCheck.pattern,
                textLength: pageTextLength,
                wordCount: pageWordCount,
                textPreview: pageTextLength > 0 ? pageText.substring(Math.max(0, pageTextLength - 50)) : ''
              });
            } else if (pageTruncationCheck.suspicious) {
              // Other truncation patterns (like incomplete sentence) - log but don't reject
              logBook('info', 'Minor truncation pattern detected, accepting text', {
                pageNumber: i + 1,
                reason: pageTruncationCheck.reason,
                textLength: pageTextLength,
                wordCount: pageWordCount
              });
            }
          }
          
          // Only reject if critical truncation detected (mid-word cut or ellipsis)
          if (!hasCriticalTruncation) {
            break;
          } else {
            logBook('warn', 'Text generation result rejected due to critical truncation, retrying', {
              attempt,
              maxAttempts: maxPageRetries
            });
            // Continue to next attempt
          }
        }
      } catch (err) {
        console.log(`[${requestId}] Page text generation attempt ${attempt} failed:`, err.message);
      }
    }
    
    // Fallback: use simple text parsing if JSON failed
    if (!pagesJSON || !pageTexts.length || pageTexts.length < pageCount) {
      console.log(`[${requestId}] Using fallback page text parsing`);
      warnings.push({ code: "PAGE_TEXT_FALLBACK", message: "Page text JSON parsing failed, using fallback" });
      const pagesTextResult = await generateTextUnified({
        prompt: pagesPrompt.replace(/OUTPUT FORMAT.*$/s, "Output 4 blocks of text, separated by blank lines."),
        images: [],
        requestId
      });
      const pagesTextRaw = pagesTextResult.text;
      const pageBlocks = pagesTextRaw.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
      pageTexts = pageBlocks.length >= pageCount
        ? pageBlocks.slice(0, pageCount)
        : pagesTextRaw.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, pageCount);
    }
    
    // 3b) Editor pass - improve quality without changing structure
    // Use MASTER STORYTELLING PROMPT editor rules
    if (pagesJSON && pageTexts.length === pageCount) {
      try {
        const ageRubricForEditor = getAgeRubric(finalAgeGroup);
        // Simplified editor prompt to reduce input tokens
        const editorPrompt = `
Improve these ${finalAgeGroup} children's book page texts. Keep plot/structure, improve rhythm and warmth.

CURRENT PAGES:
${JSON.stringify(pagesJSON.pages, null, 2)}

OUTPUT FORMAT (JSON only):
{
  "pages": [
    {"page": 1, "text": "Improved complete text ending with punctuation."},
    {"page": 2, "text": "Improved complete text ending with punctuation."},
    {"page": 3, "text": "Improved complete text ending with punctuation."},
    {"page": 4, "text": "Improved complete text ending with punctuation."}
  ]
}

REQUIREMENTS:
- Maintain or exceed original length (${ageRubricForEditor.wordCount} words per page)
- Each text MUST be COMPLETE - ends with punctuation, no mid-word cuts, no "..."
- Improve rhythm, warmth, clarity. Keep plot unchanged.
- Output ONLY valid JSON.
`.trim();
        
        const editorResult = await generateTextUnified({
          prompt: editorPrompt,
          images: [],
          requestId
        });
        
        // Log editor pass text length
        const editorTextLength = editorResult.text ? editorResult.text.length : 0;
        logBook('debug', 'Editor pass raw response', {
          rawTextLength: editorTextLength
        });
        
        const editorJSON = extractJSONFromText(editorResult.text);
        if (editorJSON && editorJSON.pages && Array.isArray(editorJSON.pages) && editorJSON.pages.length === pageCount) {
          const newPageTexts = editorJSON.pages.map(p => p.text || "");
          
          // Check truncation in editor pass results
          for (let i = 0; i < newPageTexts.length; i++) {
            const pageText = newPageTexts[i];
            const pageTruncationCheck = detectTextTruncation(pageText);
            if (pageTruncationCheck.suspicious) {
              logBook('warn', 'Suspicious truncation in editor pass page text', {
                pageNumber: i + 1,
                reason: pageTruncationCheck.reason
              });
            }
          }
          
          pageTexts = newPageTexts;
          console.log(`[${requestId}] Editor pass applied successfully`);
        } else {
          console.log(`[${requestId}] Editor pass failed, using original text`);
        }
      } catch (err) {
        console.log(`[${requestId}] Editor pass error:`, err.message);
        // Continue with original text
      }
    }
    
    // QUALITY CHECKLIST: Validate story quality after editor pass
    logBook('info', 'Running quality checklist validation', { ageGroup: finalAgeGroup, heroName: safeName, unicodeMode: WORD_BOUNDARY_MODE });
    const qualityCheck = validateStoryQuality(pageTexts, finalAgeGroup, safeName);
    
    // Add all warnings to warnings array (non-blocking)
    for (const warning of qualityCheck.warnings) {
      warnings.push({ code: `QUALITY_${warning.code}`, message: warning.message });
    }
    
    // Handle ERRORS: must remediate, maximum 2 attempts per page
    if (qualityCheck.errors.length > 0) {
      logBook('warn', 'Quality checklist found ERRORS', { 
        errorCount: qualityCheck.errors.length,
        warningCount: qualityCheck.warnings.length,
        errors: qualityCheck.errors.map(e => e.code)
      });
      
      // Add error codes to warnings array
      for (const error of qualityCheck.errors) {
        warnings.push({ code: `QUALITY_${error.code}`, message: error.message });
      }
      
      // Extract page numbers that need regeneration (ERROR level only)
      const pagesToRegenerate = new Map(); // pageIndex -> attemptCount
      for (const error of qualityCheck.errors) {
        const pageMatch = error.message.match(/Page (\d+)/);
        if (pageMatch) {
          const pageIndex = parseInt(pageMatch[1]) - 1; // Convert to 0-based index
          if (pageIndex >= 0 && pageIndex < pageCount) {
            pagesToRegenerate.set(pageIndex, 0); // Initialize attempt count
          }
        }
      }
      
      // Regenerate failing pages (max 2 attempts per page)
      for (const [pageIndex, attemptCount] of pagesToRegenerate.entries()) {
        if (attemptCount >= 2) continue; // Max 2 attempts
        
        const pageNum = pageIndex + 1;
        const pageErrors = qualityCheck.errors.filter(e => e.message.includes(`Page ${pageNum}`));
        const violations = pageErrors.map(e => e.code).join(', ');
        
        logBook('info', `Regenerating page ${pageNum} (attempt ${attemptCount + 1}/2)`, {
          pageNum,
          ageGroup: finalAgeGroup,
          violations,
          attemptNumber: attemptCount + 1
        });
        
        try {
          const regeneratePrompt = `
${masterPrompt}

========================
REGENERATE PAGE ${pageNum}
========================
Regenerate ONLY page ${pageNum} text. This page failed quality checks.

VIOLATIONS DETECTED: ${violations}

OUTLINE BEAT FOR THIS PAGE:
${JSON.stringify(outlineJSONForPages.beats[pageIndex] || {}, null, 2)}

REQUIREMENTS:
- Must match the canonical structure for page ${pageNum}
- Must be age-appropriate for ${finalAgeGroup}
- Must NOT contain any safety error words or themes
- Must be safe, calm, and warm
- Must be within word count range for age ${finalAgeGroup}
${finalAgeGroup === '6-8' ? '- Must include dialogue if possible\n- Must mention hero name at least once' : ''}

OUTPUT FORMAT (JSON only):
{
  "page": ${pageNum},
  "text": "Regenerated page text that passes all quality checks"
}

CRITICAL: Output ONLY valid JSON. No markdown, no explanations.
`.trim();
          
          const regenerateResult = await generateTextUnified({
            prompt: regeneratePrompt,
            images: [],
            requestId
          });
          
          const regenerateJSON = extractJSONFromText(regenerateResult.text);
          if (regenerateJSON && regenerateJSON.text && typeof regenerateJSON.text === 'string') {
            const newText = regenerateJSON.text.trim();
            const revalidation = validatePageQuality(newText, pageNum, finalAgeGroup, safeName);
            
            if (revalidation.valid || revalidation.errors.length === 0) {
              // Success: no errors (warnings are acceptable)
              pageTexts[pageIndex] = newText;
              logBook('info', `Page ${pageNum} regenerated successfully`, {
                pageNum,
                ageGroup: finalAgeGroup,
                violations,
                attemptNumber: attemptCount + 1,
                actionTaken: 'regenerated',
                wordCount: revalidation.wordCount
              });
              pagesToRegenerate.delete(pageIndex); // Remove from regeneration list
            } else {
              // Still has errors, increment attempt count
              pagesToRegenerate.set(pageIndex, attemptCount + 1);
              logBook('warn', `Page ${pageNum} regeneration still has errors`, {
                pageNum,
                ageGroup: finalAgeGroup,
                violations,
                attemptNumber: attemptCount + 1,
                remainingErrors: revalidation.errors.map(e => e.code)
              });
            }
          } else {
            // JSON parsing failed, increment attempt count
            pagesToRegenerate.set(pageIndex, attemptCount + 1);
            logBook('warn', `Page ${pageNum} regeneration JSON parse failed`, {
              pageNum,
              ageGroup: finalAgeGroup,
              violations,
              attemptNumber: attemptCount + 1
            });
          }
        } catch (regenerateError) {
          // Regeneration error, increment attempt count
          pagesToRegenerate.set(pageIndex, attemptCount + 1);
          logBook('warn', `Page ${pageNum} regeneration error`, {
            pageNum,
            ageGroup: finalAgeGroup,
            violations,
            attemptNumber: attemptCount + 1,
            error: regenerateError.message
          });
        }
      }
      
      // Apply safe fallback to pages that still have errors after max attempts
      for (const [pageIndex, attemptCount] of pagesToRegenerate.entries()) {
        if (attemptCount >= 2) {
          const pageNum = pageIndex + 1;
          pageTexts[pageIndex] = generateSafeFallbackText(pageNum, safeName, safeTheme, finalAgeGroup);
          logBook('warn', `Page ${pageNum} using safe fallback after max attempts`, {
            pageNum,
            ageGroup: finalAgeGroup,
            violations: qualityCheck.errors.filter(e => e.message.includes(`Page ${pageNum}`)).map(e => e.code).join(', '),
            attemptNumber: 2,
            actionTaken: 'fallback'
          });
          warnings.push({ code: 'QUALITY_FALLBACK', message: `Page ${pageNum} used safe fallback text after regeneration failed` });
        }
      }
      
      // Re-validate after remediation
      const recheck = validateStoryQuality(pageTexts, finalAgeGroup, safeName);
      
      // Check if dialogue requirement is still unmet after remediation (age 6-8)
      if (finalAgeGroup === '6-8' && recheck.dialogueCount < 2) {
        // Dialogue was WARNING initially, but if still missing after all remediation attempts,
        // we've effectively "failed" to fix it twice (once in initial generation, once in remediation)
        // Mark as persistent WARNING (not ERROR, as fallback text may not have dialogue)
        logBook('warn', 'Dialogue requirement still unmet after remediation', {
          dialogueCount: recheck.dialogueCount,
          required: 2,
          note: 'Fallback text may not include dialogue'
        });
      }
      
      if (recheck.errors.length === 0) {
        logBook('info', 'Quality checklist ERRORS resolved after remediation', {
          errorCount: 0,
          warningCount: recheck.warnings.length,
          avgWordCount: recheck.avgWordCount.toFixed(1),
          dialogueCount: recheck.dialogueCount,
          totalHeroMentions: recheck.totalHeroMentions
        });
      } else {
        logBook('error', 'Quality checklist still has ERRORS after remediation', {
          remainingErrorCount: recheck.errors.length,
          warningCount: recheck.warnings.length
        });
        // All errors should be resolved by fallback, but log if any remain
        // This should never happen if fallback text is safe, but log for safety
        for (const error of recheck.errors) {
          warnings.push({ code: `QUALITY_${error.code}`, message: error.message });
        }
      }
    } else {
      logBook('info', 'Quality checklist passed', {
        errorCount: 0,
        warningCount: qualityCheck.warnings.length,
        avgWordCount: qualityCheck.avgWordCount.toFixed(1),
        dialogueCount: qualityCheck.dialogueCount,
        totalHeroMentions: qualityCheck.totalHeroMentions
      });
    }

    // Hero reference is already selected and saved above
    // heroReference is now the per-book hero from jobs/<book_id>/hero.jpg

    // 4) Images (one per page with retry logic)
    const outPages = [];

    // Helper to create concrete scene for 4-page Russian folk fairy tale structure
    const createConcreteScene = (pageNum, pageText, beat, prevPagesText) => {
      if (pageNum === 1) {
        // Page 1: Safe home / izba / forest edge / village
        return "Russian folk fairy tale setting: hero at home (изба) or forest edge (опушка леса) or village (деревня), traditional Russian wooden house with carved window frames, warm domestic atmosphere, safe and welcoming, Russian folk fairy tale illustration style";
      }
      if (pageNum === 2) {
        // Page 2: Gentle discovery: glowing mushroom, firebird feather, talking birch, magic path
        return "Russian folk fairy tale discovery: hero finding something magical - glowing mushroom (светящийся гриб), firebird feather (перо жар-птицы), talking birch tree (говорящая береза), magic path (волшебная тропинка), gentle wonder, no fear, Russian folk fairy tale illustration style";
      }
      if (pageNum === 3) {
        // Page 3: Small journey: crossing a brook, meeting kind fox/hare, finding a key, no danger
        return "Russian folk fairy tale journey: hero crossing a brook (ручеек) or meeting kind fox (добрая лиса) or hare (заяц), finding a magic key (волшебный ключ), gentle adventure, no danger, Russian folk fairy tale illustration style";
      }
      if (pageNum === 4) {
        // Page 4: Warm resolution: back home with small wonder (samovar steam, warm light, magic keepsake)
        return "Russian folk fairy tale resolution: hero back home (дома), warm izba interior with samovar steam (пар от самовара), warm light, magic keepsake (волшебная вещица), cozy and joyful, Russian folk fairy tale illustration style";
      }
      // Fallback
      return "Russian folk fairy tale scene, traditional setting, warm atmosphere";
    };

    // Debug: log identity hash
    const identityHash = simpleHash(JSON.stringify(identity));
    console.log(`[${requestId}] BOOK: identity hash: ${identityHash}, child_id: ${identity.child_id}, hero reference: ${heroReference ? "YES" : "NO"}`);
    
    let imageRetriesCount = 0; // Track pages that required retries
    
    for (let i = 0; i < pageCount; i++) {
      const beat = outlineLines[i] || "";
      const pageText = pageTexts[i] || "";
      const prevPagesText = pageTexts.slice(Math.max(0, i - 2), i).join(" ");
      const pageNum = i + 1;
      const pageIndex = i;

      let imagePart = null;
      const maxAttempts = 3;
      let requiredRetry = false;

      for (let attempt = 1; attempt <= maxAttempts && !imagePart; attempt++) {
        const attemptIndex = attempt;
        let imagePromptText = "";

        if (attempt === 1) {
          // Attempt 1: Base prompt with identity
          const concreteScene = createConcreteScene(pageNum, pageText, beat, prevPagesText);
          imagePromptText = buildImagePromptWithIdentity(
            pageText,
            `Plot beat: ${beat}. Concrete scene: ${concreteScene}`,
            identity,
            prevPagesText,
            !!heroReference,
            finalAgeGroup
          );
        } else if (attempt === 2) {
          // Attempt 2: Strengthened prompt with explicit composition (Russian fairy tale style)
          const env = beat.includes("лес") || beat.includes("forest") 
            ? "Russian forest path with birch trees (лесная тропинка с березами)" 
            : beat.includes("изба") || beat.includes("дом") 
            ? "near wooden izba in Russian village (у деревянной избы в русской деревне)" 
            : "Russian village or forest setting (русская деревня или лес)";
          
          const basePrompt = buildImagePromptWithIdentity(pageText, "", identity, prevPagesText, !!heroReference, finalAgeGroup);
          imagePromptText = `
You are illustrating a page from a Russian folk fairy tale (русская народная сказка) for ages ${finalAgeGroup}.

${getRussianFairyTaleArtStyle()}

${getAgeStyleNote(finalAgeGroup) ? `${getAgeStyleNote(finalAgeGroup)}\n\n` : ""}

COMPOSITION REQUIREMENTS:
- Clear subject, simple background, no visual clutter
- Full body of the character visible, or at least torso and legs
- Character in Russian fairy tale environment: ${env}
- Action clearly visible: ${pageText}
- Warm, gentle light (morning or afternoon)
- No modern objects, no logos, no text

${getRussianFairyTaleNegative()}

Story context:
- Previous: ${prevPagesText || "beginning"}
- Current: ${pageText}
- Beat: ${beat}

${basePrompt.split("Character identity")[1] || ""}
`.trim();
        } else {
          // Attempt 3: Fallback scene with identity (4-page Russian fairy tale structure)
          const fallbackScenes = [
            "Russian folk fairy tale: hero at home in izba (изба) or forest edge (опушка), traditional Russian wooden house, warm domestic atmosphere, safe and welcoming, Russian folk fairy tale illustration style",
            "Russian folk fairy tale: hero discovering something magical - glowing mushroom (светящийся гриб) or firebird feather (перо жар-птицы) or talking birch (говорящая береза), gentle wonder, no fear, Russian folk fairy tale illustration style",
            "Russian folk fairy tale: hero crossing a brook (ручеек) or meeting kind fox (добрая лиса) or hare (заяц), gentle journey, no danger, Russian folk fairy tale illustration style",
            "Russian folk fairy tale: hero back home in izba (изба), warm interior with samovar steam (пар от самовара), warm light, magic keepsake (волшебная вещица), cozy and joyful, Russian folk fairy tale illustration style"
          ];
          const fallbackScene = fallbackScenes[i % fallbackScenes.length];
          imagePromptText = buildImagePromptWithIdentity(
            fallbackScene,
            "",
            identity,
            "",
            !!heroReference,
            finalAgeGroup
          );
        }

        // Debug logging
        const promptHash = simpleHash(imagePromptText);
        console.log(`[${requestId}] BOOK: Page ${pageNum} (index ${pageIndex}), attempt ${attemptIndex}: prompt hash: ${promptHash}`);

        try {
          const imageStart = Date.now();
          
          // E) ALWAYS use per-book hero reference as PRIMARY (and ONLY) face reference
          if (!heroReference || !heroReference.base64) {
            logBook('error', 'Hero reference missing for page generation', { pageNum });
            throw new Error(`Hero reference missing for book ${bookId}`);
          }
          
          const imageResult = await generateImageUnified({
            prompt: imagePromptText,
            images: [{ base64: heroReference.base64, mimeType: heroReference.mimeType }],
            requestId,
            testFlags // Pass test flags to image generation
          });
          const imageTime = Date.now() - imageStart;

          // Validate image result
          if (!imageResult || !imageResult.dataUrl) {
            throw new Error("NO_IMAGE_RETURNED: generateImageUnified returned result without dataUrl");
          }

          // Extract image data from unified result
          const dataUrlParts = imageResult.dataUrl.split("base64,");
          if (dataUrlParts.length < 2 || !dataUrlParts[1]) {
            throw new Error("NO_IMAGE_RETURNED: dataUrl format invalid");
          }
          
          const base64 = dataUrlParts[1];
          if (!base64 || base64.trim().length === 0) {
            throw new Error("NO_IMAGE_RETURNED: base64 data is empty");
          }
          
          imagePart = {
            inlineData: {
              mimeType: imageResult.mimeType || "image/png",
              data: base64
            }
          };
          
          const cand = imageResult.raw?.candidates?.[0] || imageResult.raw?.response?.candidates?.[0];
          const finishReason = cand?.finishReason;
          const safetyRatings = cand?.safetyRatings;
          
          console.log(`[${requestId}] BOOK: Page ${pageNum} (index ${pageIndex}), attempt ${attemptIndex}: SUCCESS (${imageTime}ms)`);
          if (attempt > 1) {
            requiredRetry = true;
          }
        } catch (imgError) {
          const finishReason = imgError.finishReason;
          const safetyRatings = imgError.safetyRatings;
          const safetyStr = safetyRatings ? safetyRatings.map(r => `${r.category}:${r.probability}`).join(",") : "none";
          
          // FORCE_IMAGE_FAIL should be a blocking error - re-throw it
          if (imgError.message?.includes("FORCE_IMAGE_FAIL")) {
            throw imgError;
          }
          
          // Check if it's a NO_IMAGE_RETURNED error (from provider or validation)
          const isNoImageError = imgError.message === "NO_IMAGE_RETURNED" || 
                                 imgError.message?.includes("NO_IMAGE_RETURNED");
          
          if (isNoImageError) {
            console.log(`[${requestId}] BOOK: Page ${pageNum} (index ${pageIndex}), attempt ${attemptIndex}: No image (finishReason: ${finishReason || "unknown"}, safety: ${safetyStr}), retrying...`);
            
            if (DEBUG_BOOK) {
              logBook("debug", "Image generation returned no image", {
                pageNumber: pageNum,
                attempt: attemptIndex,
                finishReason: finishReason || "unknown",
                safetyRatings: safetyStr,
                errorMessage: imgError.message?.substring(0, 200),
              });
            }
          } else {
            console.error(`[${requestId}] BOOK: Page ${pageNum} (index ${pageIndex}), attempt ${attemptIndex} failed:`, imgError?.message || imgError);
            
            if (DEBUG_BOOK) {
              logBook("debug", "Image generation error", {
                pageNumber: pageNum,
                attempt: attemptIndex,
                errorMessage: imgError.message?.substring(0, 200) || String(imgError).substring(0, 200),
                errorType: imgError.constructor?.name || "Error",
              });
            }
          }
          
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }
      
      if (requiredRetry) {
        imageRetriesCount++;
      }
      
      // Small delay between pages to avoid rate limiting
      if (i < pageCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }

if (!imagePart) {
        console.error(`[${requestId}] BOOK: Page ${pageNum} (index ${pageIndex}): All ${maxAttempts} attempts failed`);
        const pageData = {
          pageNumber: pageNum,
          pageText,
          beat,
          dataUrl: null, // Explicitly set to null when no image
          hasImage: false, // Frontend expects this field
          error: "NO_IMAGE_RETURNED",
        };
        
        if (DEBUG_BOOK) {
          logBook("debug", "Page image generation failed", {
            pageNumber: pageNum,
            hasImage: false,
            dataUrlLength: 0,
            error: "NO_IMAGE_RETURNED",
          });
        }
        
        outPages.push(pageData);
        continue;
}

const outMime = imagePart.inlineData.mimeType || "image/png";
const outBase64 = imagePart.inlineData.data;
      const dataUrl = `data:${outMime};base64,${outBase64}`;

      const pageData = {
        pageNumber: pageNum,
        pageText,
        beat,
        mimeType: outMime,
        dataUrl,
        hasImage: Boolean(dataUrl), // Frontend contract: must be true when dataUrl exists
        base64: outBase64, // Store for identity checking
      };
      
      if (DEBUG_BOOK) {
        logBook("debug", "Page image generated", {
          pageNumber: pageNum,
          hasImage: Boolean(dataUrl),
          dataUrlLength: dataUrl ? dataUrl.length : 0,
          error: null,
        });
      }

      outPages.push(pageData);
    }

    // 5) Identity check - cross-page FaceID consistency (policy lives in identity-guard) with fallback
    logBook('info', 'Running identity check', { threshold: IDENTITY_THRESHOLD });
    let identityResults = [];
    let identityCheckError = null;
    
    try {
      const { checkIdentityForPages } = await import("./utils/identity-guard.mjs");
      identityResults = await checkIdentityForPages({
        pages: outPages,
        heroReference,
        bookDir,
        mode,
        threshold: IDENTITY_THRESHOLD
      });

      // Log results (keeps existing logging semantics)
      for (let i = 0; i < outPages.length; i++) {
        const page = outPages[i];
        const comparison = identityResults[i];
        if (!comparison) continue;

        if (comparison.skipped) {
          logBook('warn', 'IDENTITY: page skipped', {
            pageNum: page.pageNumber,
            mode,
            error: comparison.error
          });
        } else if (comparison.similar) {
          logBook('info', 'Page passed identity check', {
            pageNum: page.pageNumber,
            score: comparison.score?.toFixed(3) || 0
          });
        } else {
          logBook('warn', 'Page failed identity check', {
            pageNum: page.pageNumber,
            score: comparison.score?.toFixed(3) || 0,
            threshold: comparison.threshold || IDENTITY_THRESHOLD,
            error: comparison.error
          });
        }
      }
    } catch (identityError) {
      identityCheckError = identityError;
      logBook('error', 'Identity check error', { error: identityError?.message || identityError });
      
      // MVP: Hard fail in production if dependencies missing
      // Temporarily disabled: allow skipping even in production
      // if (mode === 'prod' && identityError.message?.includes('unavailable in production')) {
      //   throw identityError;
      // }
      
      // Mark all pages as failed if check errored
      for (let i = 0; i < outPages.length; i++) {
        if (!identityResults[i]) {
          identityResults.push({
            similar: false,
            score: 0,
            error: identityError.message || 'IDENTITY_CHECK_ERROR'
          });
        }
      }
    }
    
    // Add image retries warning if any pages required retries
    if (imageRetriesCount > 0) {
      warnings.push({ code: "IMAGE_RETRIES", message: `${imageRetriesCount} page(s) required retries` });
    }
    
    // Generate reports (always, even if check failed)
    const { saveReports } = await import("./utils/report-generator.mjs");
    const reportPaths = saveReports({
      bookDir,
      bookId,
      heroReference,
      pages: outPages,
      identityResults,
      threshold: IDENTITY_THRESHOLD,
      mode,
      warnings, // Pass warnings to report generator
      ageGroup: finalAgeGroup // Pass ageGroup to report generator
    });
    
    logBook('info', 'Reports generated', { jsonPath: reportPaths.jsonPath, htmlPath: reportPaths.htmlPath });
    
    // Store report paths for response
    const reportJsonPath = reportPaths.jsonPath;
    const reportHtmlPath = reportPaths.htmlPath;
    
    // Enforce "ok:true only after artifacts exist"
    const heroFilePath = path.join(bookDir, "hero.jpg");
    const missingArtifacts = [];
    
    if (!fs.existsSync(heroFilePath)) {
      missingArtifacts.push("hero.jpg");
    }
    if (!fs.existsSync(reportHtmlPath)) {
      missingArtifacts.push("report.html");
    }
    if (!fs.existsSync(reportJsonPath)) {
      missingArtifacts.push("report.json");
    }
    
    if (missingArtifacts.length > 0) {
      throw new Error(`ARTIFACTS_MISSING: ${missingArtifacts.join(", ")}`);
    }

    const identityText = buildIdentityText(identity);
    const totalTime = Date.now() - startTime;
    logBook('info', 'Book generation completed', {
      totalTimeMs: totalTime,
      pageCount,
      pagesWithImages: outPages.filter(p => p.dataUrl).length,
      pagesFailed: outPages.filter(p => p.identityCheckFailed).length
    });

    const response = {
      ok: true,
      bookId,
      name: safeName,
      theme: safeTheme,
      ageGroup: finalAgeGroup,
      identity,
      identity_text: identityText,
      outline: outlineLines,
      pages: outPages,
      requestId,
      identityThreshold: IDENTITY_THRESHOLD,
      mode,
      identityFallbackUsed,
      warnings, // Add unified warnings array
      ...(identityError ? { identityError } : {})
    };
    
    if (heroReference) {
      response.hero_reference = {
        mimeType: heroReference.mimeType,
        dataUrl: `data:${heroReference.mimeType};base64,${heroReference.base64}`
      };
    }

    // H) MVP: Always keep reports - never delete book directory in MVP
    // Reports are in jobs/<bookId>/ and should persist for inspection
    logBook('info', 'Book directory and reports kept', { bookDir, jsonPath: reportJsonPath, htmlPath: reportHtmlPath });


    return res.json(response);
  } catch (e) {
    logBook('error', 'Book generation error', { error: e?.message || e });
    
    // Cleanup on error
    if (!process.env.DEBUG_KEEP_JOBS) {
      try {
        if (fs.existsSync(bookDir)) {
          fs.rmSync(bookDir, { recursive: true, force: true });
        }
      } catch {}
    }
    
    return res.status(500).json({ 
      ok: false,
      error: "BOOK_ERROR", 
      message: String(e?.message || e),
      requestId,
      bookId
    });
    }
  } catch (err) {
    console.error(`[${requestId}] /api/book unhandled error:`, err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: err?.message || "Unknown error",
      requestId
    });
  }
});

// Serve job artifacts (reports and hero images) for a specific book
// Security: Validate bookId to prevent path traversal
app.get("/jobs/:bookId/report.html", (req, res) => {
  const { bookId } = req.params;
  
  // Validate bookId format (UUID v4 pattern)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }
  
  const filePath = path.join(__dirname, "jobs", bookId, "report.html");
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Report not found" });
  }
  
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.sendFile(filePath);
});

app.get("/jobs/:bookId/report.json", (req, res) => {
  const { bookId } = req.params;
  
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }
  
  const filePath = path.join(__dirname, "jobs", bookId, "report.json");
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Report JSON not found" });
  }
  
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.sendFile(filePath);
});

app.get("/jobs/:bookId/hero.jpg", (req, res) => {
  const { bookId } = req.params;
  
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }
  
  const filePath = path.join(__dirname, "jobs", bookId, "hero.jpg");
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Hero image not found" });
  }
  
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.sendFile(filePath);
});

// Debug endpoint: configuration info (no secrets, no external API calls)
const getConfigResponse = () => {
  const providerText = (process.env.PROVIDER_TEXT || "gemini").toLowerCase();
  const providerImage = (process.env.PROVIDER_IMAGE || "gemini").toLowerCase();
  const geminiTextModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  
  return {
    providerText,
    providerImage,
    geminiTextModel,
    geminiImageModel,
    nodeEnv: process.env.NODE_ENV || "development",
    hasGeminiApiKey: !!process.env.GEMINI_API_KEY
  };
};

app.get("/debug/config", (req, res) => {
  res.json(getConfigResponse());
});

// Alias endpoint for /api/debug/config (via Vite proxy)
app.get("/api/debug/config", (req, res) => {
  res.json(getConfigResponse());
});

// Serve frontend static files (built React app)
const webDistPath = path.join(__dirname, "..", "web", "dist");
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  
  // SPA fallback: serve index.html for all non-API routes
  app.get("*", (req, res, next) => {
    // Don't serve index.html for API routes or jobs routes
    if (req.path.startsWith("/api") || req.path.startsWith("/jobs") || req.path.startsWith("/debug")) {
      return next();
    }
    
    const indexPath = path.join(webDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// Error handler middleware: ensure /api/* routes always return JSON
app.use((err, req, res, next) => {
  // Only handle errors for /api/* routes
  if (req.path.startsWith('/api/')) {
    const requestId = req.requestId || 'unknown';
    console.error(`[${requestId}] Express error handler:`, err);
    
    // If headers already sent, just end the response
    if (res.headersSent) {
      return res.end();
    }
    
    // Always return JSON for /api/* routes
    return res.status(err.status || 500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: err?.message || "Unknown error",
      requestId
    });
  }
  
  // For non-API routes, use default behavior
  next(err);
});

const PORT = 8787;

// Startup logging: print provider and model configuration
const geminiTextModel = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// Handle unhandled promise rejections to prevent HTML error pages
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Using PROVIDER_TEXT=${providerText} model=${geminiTextModel}`);
  console.log(`Using PROVIDER_IMAGE=${providerImage} model=${geminiImageModel}`);
});