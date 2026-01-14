/**
 * Illustration Pipeline v2
 * 
 * Main orchestrator for the v2 illustration generation flow:
 * 1. Create character assets (hero_head, hero_fullbody_ref)
 * 2. Generate page scenes with unified style prompts
 * 3. Composite hero_head onto each page for deterministic identity
 * 4. Validate with InsightFace
 * 5. Retry/regenerate if validation fails
 * 
 * Feature flags:
 * - ILLUSTRATION_V2_ENABLED: Master switch for v2 pipeline
 * - CHARACTER_ASSETS_ENABLED: Enable character asset generation
 * - FACE_COMPOSITE_ENABLED: Enable face compositing post-processing
 */

import fs from "fs";
import path from "path";
import { generateImageUnified } from "./gen-image.mjs";
import { 
  createCharacterAssets, 
  loadCharacterAssets,
  isCharacterAssetsEnabled 
} from "./character_assets.mjs";
import { compositeWithRetry, isCompositeAvailable } from "./face_composite.mjs";
import { buildPagePromptV2 } from "../prompts/storytelling_v2.mjs";

// Feature flags
const V2_ENABLED = process.env.ILLUSTRATION_V2_ENABLED === "true" || 
                   process.env.ILLUSTRATION_V2_ENABLED === "1";
const COMPOSITE_ENABLED = process.env.FACE_COMPOSITE_ENABLED === "true" || 
                          process.env.FACE_COMPOSITE_ENABLED === "1";

// Thresholds for v2 (higher because we composite the exact face)
const V2_SIMILARITY_THRESHOLD = parseFloat(process.env.V2_SIMILARITY_THRESHOLD || "0.45");
const V2_MAX_PAGE_RETRIES = parseInt(process.env.V2_MAX_PAGE_RETRIES || "2", 10);

/**
 * Check if v2 pipeline is enabled
 * @returns {boolean}
 */
export function isV2Enabled() {
  return V2_ENABLED;
}

/**
 * Get v2 configuration
 * @returns {object}
 */
export function getV2Config() {
  return {
    v2Enabled: V2_ENABLED,
    characterAssetsEnabled: isCharacterAssetsEnabled(),
    compositeEnabled: COMPOSITE_ENABLED,
    similarityThreshold: V2_SIMILARITY_THRESHOLD,
    maxPageRetries: V2_MAX_PAGE_RETRIES
  };
}

/**
 * Build scene brief from page context
 * @param {number} pageNumber - Page number (1-4)
 * @param {string} pageText - Text content
 * @param {string} beat - Story beat
 * @returns {object} Scene brief
 */
export function buildSceneBrief(pageNumber, pageText, beat) {
  // Default scene briefs for 4-page Russian folk fairy tale structure
  const sceneBriefs = {
    1: {
      environment: "Warm interior of traditional Russian izba (избa) with wooden walls, painted window frames, or peaceful forest edge (опушка леса) with birch trees",
      timeOfDay: "Morning, soft golden light streaming through windows",
      lighting: "Warm ambient light, no harsh shadows, cozy atmosphere",
      keyObjects: "Wooden furniture, embroidered tablecloth, samovar on table, traditional Russian home items",
      mood: "Safe, warm, peaceful, calm domestic atmosphere"
    },
    2: {
      environment: "Magical clearing in Russian forest, birch trees with golden leaves, soft moss, perhaps a stream nearby",
      timeOfDay: "Midday with dappled sunlight through leaves",
      lighting: "Magical golden-green light filtering through forest canopy, subtle sparkle effect",
      keyObjects: "Glowing mushroom, firebird feather, talking birch tree, magical flowers, woodland creatures",
      mood: "Gentle wonder, curiosity, magical discovery, no fear"
    },
    3: {
      environment: "Forest path leading somewhere, small bridge over stream, or meeting place with friendly animal",
      timeOfDay: "Afternoon, warm golden hour light beginning",
      lighting: "Soft directional light suggesting movement and journey",
      keyObjects: "Small wooden bridge, stepping stones, friendly fox or hare, magic key or object, path markers",
      mood: "Gentle adventure, soft determination, friendly help, no danger"
    },
    4: {
      environment: "Return to izba interior, now with magical element integrated, warm evening atmosphere",
      timeOfDay: "Evening, golden sunset light, candles or hearth glow",
      lighting: "Warm orange-gold light, cozy shadows, intimate lighting",
      keyObjects: "Samovar with steam rising, magic keepsake glowing softly, warm blanket, family items",
      mood: "Joy, peace, warmth, home, contentment, gentle resolution"
    }
  };

  // Get base brief or fallback
  const baseBrief = sceneBriefs[pageNumber] || sceneBriefs[1];

  // Customize based on beat/text if needed
  const customBrief = { ...baseBrief };

  // Add text context
  if (pageText) {
    customBrief.pageText = pageText;
  }
  if (beat) {
    customBrief.beat = beat;
  }

  return customBrief;
}

/**
 * Generate single page image with v2 pipeline
 * @param {object} params
 * @param {string} params.bookId - Book UUID
 * @param {string} params.bookDir - Book directory path
 * @param {number} params.pageNumber - Page number (1-4)
 * @param {string} params.pageText - Text content
 * @param {string} params.beat - Story beat
 * @param {object} params.identity - Identity object
 * @param {object} params.assets - Character assets (heroHead, heroFullBody, outfitDescription)
 * @param {string} params.ageGroup - Age group
 * @param {string} params.requestId - Request ID for logging
 * @returns {Promise<{success: boolean, dataUrl?: string, mimeType?: string, compositedPath?: string, error?: string}>}
 */
export async function generatePageImageV2({
  bookId,
  bookDir,
  pageNumber,
  pageText,
  beat,
  identity,
  assets,
  ageGroup,
  requestId
}) {
  const logPrefix = `[${requestId}] PAGE_V2_${pageNumber}`;

  // Build scene brief
  const sceneBrief = buildSceneBrief(pageNumber, pageText, beat);

  // Build v2 prompt (unified style, no conflict)
  const prompt = buildPagePromptV2(
    pageText,
    sceneBrief,
    identity,
    assets.outfitDescription,
    pageNumber,
    ageGroup
  );

  // Prepare reference images
  const images = [];
  
  // Primary: hero_fullbody_ref (for body proportions and outfit)
  if (assets.heroFullBody?.base64) {
    images.push({
      base64: assets.heroFullBody.base64,
      mimeType: assets.heroFullBody.mimeType || "image/jpeg"
    });
  }

  // Secondary: hero_head (for face reference, even though we'll composite)
  if (assets.heroHead?.base64) {
    images.push({
      base64: assets.heroHead.base64,
      mimeType: assets.heroHead.mimeType || "image/png"
    });
  }

  // Generate the page image
  console.log(`${logPrefix}: Generating scene...`);
  const genStart = Date.now();

  try {
    const result = await generateImageUnified({
      prompt,
      images,
      requestId
    });

    const genTime = Date.now() - genStart;

    if (!result || !result.dataUrl) {
      console.log(`${logPrefix}: No image returned (${genTime}ms)`);
      return {
        success: false,
        error: "NO_IMAGE_RETURNED"
      };
    }

    console.log(`${logPrefix}: Scene generated (${genTime}ms)`);

    // Extract base64
    const base64 = result.dataUrl.split("base64,")[1];
    if (!base64) {
      return {
        success: false,
        error: "INVALID_DATAURL"
      };
    }

    // Save raw generated image
    const rawPath = path.join(bookDir, `page_${pageNumber}_raw.png`);
    fs.writeFileSync(rawPath, Buffer.from(base64, "base64"));

    // If compositing is disabled, return the raw result
    if (!COMPOSITE_ENABLED) {
      console.log(`${logPrefix}: Compositing disabled, returning raw`);
      return {
        success: true,
        dataUrl: result.dataUrl,
        mimeType: result.mimeType || "image/png",
        rawPath
      };
    }

    // Composite hero_head onto the page
    const compositedPath = path.join(bookDir, `page_${pageNumber}.png`);
    console.log(`${logPrefix}: Compositing hero head...`);

    const compositeResult = await compositeWithRetry({
      heroHeadPath: assets.heroHead.path,
      pageImagePath: rawPath,
      outputPath: compositedPath,
      includeHair: true,
      requestId
    });

    if (!compositeResult.ok) {
      console.warn(`${logPrefix}: Composite failed: ${compositeResult.error}, using raw image`);
      // Fallback: use raw generated image
      fs.copyFileSync(rawPath, compositedPath);
      return {
        success: true,
        dataUrl: result.dataUrl,
        mimeType: result.mimeType || "image/png",
        rawPath,
        compositedPath,
        compositeError: compositeResult.error
      };
    }

    console.log(`${logPrefix}: Composite successful (method: ${compositeResult.blendMethod})`);

    // Read composited image
    const compositedBuffer = fs.readFileSync(compositedPath);
    const compositedBase64 = compositedBuffer.toString("base64");
    const compositedDataUrl = `data:image/png;base64,${compositedBase64}`;

    return {
      success: true,
      dataUrl: compositedDataUrl,
      mimeType: "image/png",
      rawPath,
      compositedPath,
      blendMethod: compositeResult.blendMethod
    };

  } catch (error) {
    const genTime = Date.now() - genStart;
    console.error(`${logPrefix}: Error (${genTime}ms):`, error.message?.substring(0, 200));
    return {
      success: false,
      error: error.message || "GENERATION_ERROR"
    };
  }
}

/**
 * Generate all pages with v2 pipeline
 * @param {object} params
 * @param {string} params.bookId - Book UUID
 * @param {string} params.bookDir - Book directory path
 * @param {Array} params.pageContents - Array of {pageText, beat} objects
 * @param {object} params.identity - Identity object
 * @param {object} params.assets - Character assets
 * @param {string} params.ageGroup - Age group
 * @param {string} params.requestId - Request ID for logging
 * @returns {Promise<{success: boolean, pages: Array, warnings: Array}>}
 */
export async function generateAllPagesV2({
  bookId,
  bookDir,
  pageContents,
  identity,
  assets,
  ageGroup,
  requestId
}) {
  const pages = [];
  const warnings = [];

  for (let i = 0; i < pageContents.length; i++) {
    const pageNumber = i + 1;
    const { pageText, beat } = pageContents[i];

    let result = null;
    let attempts = 0;

    // Retry loop
    for (let attempt = 1; attempt <= V2_MAX_PAGE_RETRIES && !result?.success; attempt++) {
      attempts = attempt;

      result = await generatePageImageV2({
        bookId,
        bookDir,
        pageNumber,
        pageText,
        beat,
        identity,
        assets,
        ageGroup,
        requestId
      });

      if (!result.success && attempt < V2_MAX_PAGE_RETRIES) {
        console.log(`[${requestId}] PAGE_V2_${pageNumber}: Retrying (attempt ${attempt + 1}/${V2_MAX_PAGE_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (result.compositeError) {
      warnings.push({
        code: "COMPOSITE_FALLBACK",
        message: `Page ${pageNumber}: composite failed (${result.compositeError}), used raw image`
      });
    }

    pages.push({
      pageNumber,
      pageText,
      beat,
      dataUrl: result.dataUrl || null,
      mimeType: result.mimeType || null,
      hasImage: !!result.dataUrl,
      error: result.success ? null : result.error,
      attempts,
      compositedPath: result.compositedPath,
      rawPath: result.rawPath,
      blendMethod: result.blendMethod
    });

    // Small delay between pages
    if (i < pageContents.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const successCount = pages.filter(p => p.hasImage).length;
  const success = successCount === pageContents.length;

  return {
    success,
    pages,
    warnings,
    stats: {
      total: pageContents.length,
      successful: successCount,
      failed: pageContents.length - successCount
    }
  };
}

/**
 * Full v2 pipeline entry point
 * @param {object} params
 * @param {string} params.bookId - Book UUID
 * @param {string} params.bookDir - Book directory path
 * @param {object} params.identity - Identity object
 * @param {string} params.photoBase64 - Child photo base64
 * @param {string} params.photoMimeType - Photo MIME type
 * @param {Array} params.pageContents - Array of {pageText, beat} objects
 * @param {string} params.ageGroup - Age group
 * @param {string} [params.userOutfit] - Optional user-specified outfit
 * @param {string} params.requestId - Request ID for logging
 * @returns {Promise<{success: boolean, assets?: object, pages?: Array, warnings?: Array, error?: string}>}
 */
export async function runV2Pipeline({
  bookId,
  bookDir,
  identity,
  photoBase64,
  photoMimeType,
  pageContents,
  ageGroup,
  userOutfit,
  requestId
}) {
  const startTime = Date.now();
  const warnings = [];

  console.log(`[${requestId}] V2_PIPELINE: Starting for book ${bookId}`);

  // Step 1: Create or load character assets
  let assets = null;

  // Try to load existing assets
  const loadResult = loadCharacterAssets(bookDir);
  if (loadResult.loaded) {
    console.log(`[${requestId}] V2_PIPELINE: Loaded existing character assets`);
    assets = loadResult.assets;
  } else {
    // Create new assets
    console.log(`[${requestId}] V2_PIPELINE: Creating character assets...`);
    
    const createResult = await createCharacterAssets({
      bookId,
      bookDir,
      identity,
      photoBase64,
      photoMimeType,
      userOutfit,
      requestId
    });

    if (!createResult.success) {
      return {
        success: false,
        error: `Character assets creation failed: ${createResult.error}`
      };
    }

    assets = createResult.assets;
    console.log(`[${requestId}] V2_PIPELINE: Character assets created`);
  }

  // Step 2: Generate all pages
  console.log(`[${requestId}] V2_PIPELINE: Generating ${pageContents.length} pages...`);

  const pagesResult = await generateAllPagesV2({
    bookId,
    bookDir,
    pageContents,
    identity,
    assets,
    ageGroup,
    requestId
  });

  // Merge warnings
  warnings.push(...pagesResult.warnings);

  const totalTime = Date.now() - startTime;
  console.log(`[${requestId}] V2_PIPELINE: Complete (${totalTime}ms, ${pagesResult.stats.successful}/${pagesResult.stats.total} pages)`);

  return {
    success: pagesResult.success,
    assets: {
      heroHeadPath: assets.heroHead?.path,
      heroFullBodyPath: assets.heroFullBody?.path,
      outfitDescription: assets.outfitDescription
    },
    pages: pagesResult.pages,
    warnings,
    stats: pagesResult.stats
  };
}

/**
 * Check if v2 pipeline dependencies are available
 * @returns {Promise<{available: boolean, details: object}>}
 */
export async function checkV2Dependencies() {
  const compositeAvailable = await isCompositeAvailable();

  return {
    available: V2_ENABLED && isCharacterAssetsEnabled(),
    details: {
      v2Enabled: V2_ENABLED,
      characterAssetsEnabled: isCharacterAssetsEnabled(),
      compositeEnabled: COMPOSITE_ENABLED,
      compositeScriptAvailable: compositeAvailable
    }
  };
}

