/**
 * Illustration Pipeline v3
 * SDXL + InstantID (or fallback to Gemini) with strict style + text guard
 *
 * - Unified 2D storybook style with Russian folk motifs
 * - No raw photo compositing (only model-generated images)
 * - Identity validation (InsightFace) + bounded retries
 * - Text detection guard
 *
 * Feature selection:
 *   ILLUSTRATION_PIPELINE = "auto" | "gemini" | "sdxl_instantid"
 *     default: "auto" (use instantid if token present, else gemini)
 *   INSTANTID_ENABLED (bool) default: true when token exists
 *   CONTROLNET_POSE_ENABLED (bool) default: true
 *   OCR_GUARD_ENABLED (bool) default: true
 *   DISABLE_RAW_PHOTO_COMPOSITING (bool) default: true
 */

import fs from "fs";
import path from "path";
import { generateInstantIdImage, isInstantIdAvailable } from "../providers/instantid.mjs";
import { buildReplicatePromptV3, getNegativePrompt } from "../prompts/replicate_v3.mjs";
import { STYLE_PRESET_V3 } from "../prompts/storytelling_v3.mjs";
import { autoSelectSceneBrief } from "./scene_brief.mjs";
import { checkIdentityForPages } from "../utils/identity-guard.mjs";
import { detectText } from "./text_detection.mjs";
import { assertPromptValid, validateNoPhotoCompositing } from "../utils/prompt-linter.mjs";

const PIPELINE = (process.env.ILLUSTRATION_PIPELINE || "auto").toLowerCase();
const INSTANTID_ENABLED = process.env.INSTANTID_ENABLED === "false" ? false : true;
const OCR_GUARD_ENABLED = process.env.OCR_GUARD_ENABLED === "false" ? false : true;
const DISABLE_RAW_PHOTO_COMPOSITING = process.env.DISABLE_RAW_PHOTO_COMPOSITING !== "false";

// Identity thresholds (calibrate as needed)
const V3_SIMILARITY_THRESHOLD = parseFloat(process.env.V3_SIMILARITY_THRESHOLD || "0.4");
const V3_MAX_PAGE_RETRIES = parseInt(process.env.V3_MAX_PAGE_RETRIES || "2", 10);

/** Decide if we should use InstantID */
export function shouldUseInstantId() {
  if (PIPELINE === "sdxl_instantid") return true;
  if (PIPELINE === "gemini") return false;
  // auto
  return INSTANTID_ENABLED && isInstantIdAvailable();
}

/** Build CharacterLock object */
export function buildCharacterLock({ bookId, identity, outfitDescription }) {
  return {
    identity_source_image_id: identity.child_id || "child_photo",
    outfit_description: outfitDescription,
    hair_description: identity.hair
      ? `${identity.hair.color || ""} ${identity.hair.length || ""} ${identity.hair.style || ""}`.trim()
      : "",
    style_preset: STYLE_PRESET_V3,
    base_seed: Math.abs(hashString(bookId)) % 10_000_000,
    version: 1,
    created_at: new Date().toISOString()
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/** Generate single page via InstantID */
async function generatePageInstantId({
  pageNumber,
  pageText,
  beat,
  identity,
  outfitDescription,
  characterLock,
  heroReference,
  requestId,
  bookDir,
  seed,
  identityStrength
}) {
  const sceneBrief = autoSelectSceneBrief(pageNumber, pageText, beat);

  // Build prompt using new v3 template (validated, no contradictions)
  const prompt = buildReplicatePromptV3({
    pageNumber,
    pageText,
    sceneBrief,
    identity,
    outfitDescription
  });

  // Double-check: ensure no photo compositing mentioned
  const compositingCheck = validateNoPhotoCompositing(prompt);
  if (!compositingCheck.valid) {
    throw new Error(`Prompt validation failed: ${compositingCheck.message}`);
  }

  // Get negative prompt
  const negativePrompt = getNegativePrompt();

  // Log prompt for debugging (first 200 chars only)
  const promptPreview = prompt.length > 200 ? prompt.substring(0, 200) + "..." : prompt;
  console.log(`[${requestId}] Page ${pageNumber} prompt: ${promptPreview}`);
  console.log(`[${requestId}] Page ${pageNumber} identity_strength: ${identityStrength.toFixed(2)}`);

  // InstantID call - ONLY uses identity reference, NO additional photo inputs
  // This ensures model generates stylized face, not pastes photo
  const result = await generateInstantIdImage({
    prompt,
    identityBase64: heroReference.base64,
    seed,
    identityStrength,
    negativePrompt
  });

  const base64 = result.dataUrl.split("base64,")[1];
  const outPath = path.join(bookDir, `page_${pageNumber}_v3.png`);
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));

  // Optional OCR guard
  let textDetected = false;
  if (OCR_GUARD_ENABLED) {
    const ocrRes = await detectText({ imagePath: outPath, requestId });
    textDetected = ocrRes.textDetected || ocrRes.watermarkSuspected;
  }

  return {
    promptUsed: prompt,
    mimeType: result.mimeType || "image/png",
    dataUrl: result.dataUrl,
    base64,
    outPath,
    textDetected,
    raw: result.raw
  };
}

/**
 * Run v3 pipeline (InstantID preferred, fallback to caller if unavailable)
 * @param {object} params
 * @returns {Promise<{success:boolean, pages:Array, warnings:Array, pipelineUsed:string}>}
 */
export async function runV3Pipeline({
  bookId,
  bookDir,
  identity,
  heroReference,
  pageContents,
  outfitDescription,
  requestId,
  ageGroup
}) {
  const warnings = [];
  const pages = [];
  const pipelineUsed = shouldUseInstantId() ? "sdxl_instantid" : "gemini";

  if (!shouldUseInstantId()) {
    return { success: false, warnings: ["INSTANTID_NOT_AVAILABLE"], pages: [], pipelineUsed };
  }

    // Character lock
    const characterLock = buildCharacterLock({ bookId, identity, outfitDescription });

    // Pipeline mode enforcement: use ONLY replicate_v3 for entire book
    const pipelineMode = "replicate_v3";
    console.log(`[${requestId}] Pipeline mode: ${pipelineMode} (enforced for entire book)`);

    // Generate pages with retries
    for (let i = 0; i < pageContents.length; i++) {
      const pageNumber = i + 1;
      const { pageText, beat } = pageContents[i];

      let best = null;
      let attempt = 0;
      // Start with LOW identity strength to avoid photo paste, increase if similarity low
      // Lower values (0.6-0.65) = more stylized face, less photo-like
      let identityStrength = parseFloat(process.env.INSTANTID_INITIAL_STRENGTH || "0.6");

      while (attempt < V3_MAX_PAGE_RETRIES && !best) {
        attempt++;
        // Deterministic seed: base_seed + page_index * 101 (larger step for variation)
        const seed = characterLock.base_seed + (pageNumber - 1) * 101 + attempt;

      try {
        const gen = await generatePageInstantId({
          pageNumber,
          pageText,
          beat,
          identity,
          outfitDescription,
          characterLock,
          heroReference,
          requestId,
          bookDir,
          seed,
          identityStrength
        });

        // Identity check (InsightFace)
        const comparison = await checkIdentityForPages({
          pages: [{
            pageNumber,
            dataUrl: gen.dataUrl,
            base64: gen.base64,
            mimeType: gen.mimeType
          }],
          heroReference,
          bookDir,
          mode: "dev",
          threshold: V3_SIMILARITY_THRESHOLD
        });

        const score = comparison[0]?.score || 0;
        const similar = comparison[0]?.similar || false;

        if (!similar && attempt < V3_MAX_PAGE_RETRIES) {
          // Increase identity strength slightly, but cap at 0.75 to avoid photoreal faces
          // Higher values tend to paste photo-like faces instead of stylized illustrations
          identityStrength = Math.min(0.75, identityStrength + 0.05);
          console.log(`[${requestId}] Page ${pageNumber} attempt ${attempt}: similarity ${score.toFixed(3)} < ${V3_SIMILARITY_THRESHOLD}, retrying with strength ${identityStrength.toFixed(2)}`);
          continue;
        }

        best = {
          pageNumber,
          pageText,
          beat,
          dataUrl: gen.dataUrl,
          mimeType: gen.mimeType,
          base64: gen.base64,
          hasImage: true,
          similarity: score,
          textDetected: gen.textDetected,
          attempts: attempt,
          outPath: gen.outPath,
          pipeline: pipelineUsed
        };
      } catch (err) {
        if (attempt >= V3_MAX_PAGE_RETRIES) {
          best = {
            pageNumber,
            pageText,
            beat,
            hasImage: false,
            error: err.message || "INSTANTID_ERROR",
            attempts: attempt,
            pipeline: pipelineUsed
          };
        }
      }
    }

    pages.push(best);
  }

  const success = pages.every(p => p && p.hasImage);
  return { success, pages, warnings, pipelineUsed };
}


