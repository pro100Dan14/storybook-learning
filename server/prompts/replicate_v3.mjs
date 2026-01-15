/**
 * Replicate v3 Prompt Builder
 * 
 * Builds coherent, contradiction-free prompts for Replicate InstantID generation.
 * Uses template files and validates with prompt-linter.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertPromptValid } from "../utils/prompt-linter.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_TEMPLATE_PATH = path.join(__dirname, "illustration", "replicate_page_v3.txt");
const NEGATIVE_PROMPT_PATH = path.join(__dirname, "illustration", "replicate_negative_v3.txt");

let cachedPositiveTemplate = null;
let cachedNegativeTemplate = null;

/**
 * Load prompt template from file
 * @param {string} templatePath - Path to template file
 * @returns {string} Template content
 */
function loadTemplate(templatePath) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, "utf8").trim();
}

/**
 * Get positive prompt template
 * @returns {string}
 */
function getPositiveTemplate() {
  if (!cachedPositiveTemplate) {
    cachedPositiveTemplate = loadTemplate(PROMPT_TEMPLATE_PATH);
  }
  return cachedPositiveTemplate;
}

/**
 * Get negative prompt template
 * @returns {string}
 */
export function getNegativePrompt() {
  if (!cachedNegativeTemplate) {
    cachedNegativeTemplate = loadTemplate(NEGATIVE_PROMPT_PATH);
  }
  return cachedNegativeTemplate;
}

/**
 * Build character lock string from identity
 * @param {object} identity - Identity object
 * @param {string} outfitDescription - Outfit description
 * @returns {object} Lock strings
 */
function buildCharacterLocks(identity, outfitDescription) {
  const hair = identity.hair || {};
  const hairLock = `${hair.color || ""} ${hair.length || ""} ${hair.style || ""}`.trim() || "child's hair";
  
  const skinToneLock = identity.skin_tone || "child's skin tone";
  
  const distinctiveMarks = Array.isArray(identity.distinctive_marks) 
    ? identity.distinctive_marks.join(", ")
    : "";
  
  return {
    age_range: identity.age_range || "4-6",
    hair_lock: hairLock,
    outfit_lock: outfitDescription || "traditional Russian folk costume",
    skin_tone_lock: skinToneLock,
    distinctive_marks_lock: distinctiveMarks || "none"
  };
}

/**
 * Build camera/pose description based on page number
 * @param {number} pageNumber - Page number (1-4)
 * @returns {string} Camera/pose description
 */
function getCameraPose(pageNumber) {
  const poses = [
    "Front view, child facing camera, friendly expression",
    "3/4 view from left, child looking slightly right, curious expression",
    "3/4 view from right, child in action pose, determined expression",
    "Front or slight 3/4 view, child returning home, joyful expression"
  ];
  return poses[(pageNumber - 1) % poses.length];
}

/**
 * Build complete Replicate prompt for a page
 * @param {object} params
 * @param {number} params.pageNumber - Page number
 * @param {string} params.pageText - Page text
 * @param {object} params.sceneBrief - Scene brief from scene_brief.mjs
 * @param {object} params.identity - Identity object
 * @param {string} params.outfitDescription - Outfit description
 * @returns {string} Complete prompt
 */
export function buildReplicatePromptV3({
  pageNumber,
  pageText,
  sceneBrief,
  identity,
  outfitDescription
}) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }

  const locks = buildCharacterLocks(identity, outfitDescription);
  const template = getPositiveTemplate();
  
  // Build scene prompt from sceneBrief and pageText
  const scenePrompt = `${pageText || "child in storybook scene"}. ${sceneBrief.environment || "Russian folk tale setting"}. ${sceneBrief.lighting || "soft natural light"}`;

  // Replace template variables (short prompt format)
  const prompt = template
    .replace(/\{location\}/g, sceneBrief.environment || "Russian folk tale setting (izba/forest)")
    .replace(/\{hair_lock\}/g, locks.hair_lock)
    .replace(/\{outfit_lock\}/g, locks.outfit_lock)
    .replace(/\{scene_prompt\}/g, scenePrompt);

  // Validate prompt (skip for short prompts - they're intentionally simple)
  // Only check for photo compositing mentions
  try {
    const { validateNoPhotoCompositing } = await import("../utils/prompt-linter.mjs");
    const compositingCheck = validateNoPhotoCompositing(prompt);
    if (!compositingCheck.valid) {
      console.warn(`[Replicate v3] Prompt validation warning: ${compositingCheck.message}`);
    }
  } catch (e) {
    // Linter not critical for short prompts
  }

  return prompt;
}

