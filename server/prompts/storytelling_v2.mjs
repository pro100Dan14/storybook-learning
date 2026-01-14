/**
 * Storytelling Prompts v2 - Fixed style (no contradiction)
 * 
 * KEY CHANGE: Unified art style for entire image.
 * - Face AND scene are both unified 2D storybook style
 * - Russian folk elements come from CONTENT (costumes, architecture, patterns)
 * - NO style conflict: removed "AVOID Pixar" contradictions
 * 
 * This enables better face consistency because the model doesn't have to
 * reconcile two incompatible styles (Pixar face + Bilibin scene).
 */

/**
 * Get unified storybook art style (single source of truth)
 * Used for both hero assets and page illustrations
 * @returns {string} Art style description
 */
export function getUnified3DAnimatedStyle() {
  // Name kept for backward compatibility, but style is 2D storybook now
  return `
ART STYLE - CHILDREN'S STORYBOOK (RUSSIAN FOLK MOTIFS):
- 2D illustration with clean ink outlines
- Subtle watercolor / gouache texture, paper grain visible
- Warm, earthy palette with muted reds, ochres, sage greens, sky blue accents
- Russian folk ornaments on clothing and decor
- Professional book illustration quality
- NOT 3D render, NOT Pixar, NOT photoreal, NOT anime
`.trim();
}

/**
 * Get Russian folk setting description (content, not style)
 * @returns {string} Setting description
 */
export function getRussianFolkSetting() {
  return `
RUSSIAN FOLK SETTING (Content):
- Traditional Russian architecture: wooden izba (избa) with carved window frames
- Russian forest: birch trees (берёзы), pine forest (сосновый лес)
- Folk patterns and decorations on buildings, fabrics, objects
- Traditional items: samovar (самовар), wooden toys, painted spoons
- NO modern objects, NO electronics, NO plastic items

CLOTHING - Russian folk garments:
- Girls: sarafan (сарафан), kokoshnik (кокошник) headpiece, valenki (валенки) boots
- Boys: kosovorotka (косоворотка) shirt, sharovary (шаровары) pants, ushanka (ушанка) hat
- Warm earthy colors: ochre, muted red, sage green, sky blue
- Folk embroidery and patterns on clothing
`.trim();
}

/**
 * Get strict prohibitions for image generation
 * @returns {string} Prohibitions
 */
export function getImageProhibitions() {
  return `
ABSOLUTELY FORBIDDEN:
- NO text, NO letters, NO words, NO captions
- NO watermarks, NO signatures, NO logos, NO copyright marks
- NO modern objects, NO electronics, NO cars, NO plastic
- NO scary elements, NO violence, NO danger, NO villains
- NO abstract backgrounds, NO random patterns, NO visual noise
- NO swimwear, NO revealing clothing
- NO deformed faces, NO extra limbs, NO anatomical errors
`.trim();
}

/**
 * Build hero head asset prompt (face + hair only)
 * This creates the reference face that will be composited onto pages
 * @param {object} identity - Identity object with character details
 * @returns {string} Prompt for hero head generation
 */
export function buildHeroHeadPromptV2(identity) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  return `
CREATE A HEAD/FACE REFERENCE ASSET for a children's storybook character.

${getUnified3DAnimatedStyle()}

COMPOSITION - HEAD CLOSE-UP:
- Head and hair filling 85% of frame
- Face clearly visible, front-facing or slight 3/4 angle (max 20 degrees)
- Include full hair (top, sides, any bangs/fringe)
- Neck visible but cut off at base
- TRANSPARENT or solid light gray (#E8E8E8) background
- NO body, NO clothing visible, NO accessories unless in source photo

FACE REQUIREMENTS - EXACT LIKENESS:
The illustrated face must be INSTANTLY recognizable as the child in the photo.
Parents should immediately say "That's my child!"

Copy from photo with precision:
- Exact face shape (round, oval, heart, etc.)
- Exact eye shape, color, spacing, and expression tendency
- Exact nose shape and proportions
- Exact mouth shape and lip proportions
- Exact eyebrow shape and thickness
- Exact hair color, cut, texture, and styling
- Exact skin tone (convert to illustrated equivalent)

${mustKeepRules ? `MUST PRESERVE:\n${mustKeepRules}` : ""}

EXPRESSION:
- Neutral to gentle smile
- Eyes looking forward or slightly to camera
- Natural, relaxed expression
- NO exaggerated cartoon expressions
- NO wide open mouth, NO extreme emotions

${getImageProhibitions()}

OUTPUT: Clean head/face asset for compositing onto storybook pages.
`.trim();
}

/**
 * Build hero full body reference prompt (outfit lock)
 * This establishes the consistent outfit for the entire book
 * @param {object} identity - Identity object
 * @param {string} outfitDescription - Locked outfit description
 * @returns {string} Prompt for full body reference
 */
export function buildHeroFullBodyPromptV2(identity, outfitDescription) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  return `
CREATE A FULL BODY CHARACTER REFERENCE for a children's storybook.

${getUnified3DAnimatedStyle()}

CHARACTER DETAILS:
${identity.short_visual_summary || "Young child character"}

COMPOSITION - FULL BODY STANDING:
- Full body visible from head to feet
- Character standing naturally, relaxed pose
- Arms at sides or slightly away from body
- Facing camera, slight 3/4 angle acceptable
- Plain light background (#F0F0F0) for clean reference
- Full lighting, no dramatic shadows

FACE AND HAIR:
- Same face as hero_head reference (use hero_head.jpg as guide)
- Same hair color, style, and texture
${mustKeepRules ? `\nMUST PRESERVE:\n${mustKeepRules}` : ""}

OUTFIT - LOCKED FOR ENTIRE BOOK:
${outfitDescription}

This exact outfit will appear on every page of the book.
Do not vary the clothing, colors, or accessories.

${getImageProhibitions()}

OUTPUT: Full body character reference with locked outfit for story consistency.
`.trim();
}

/**
 * Build page illustration prompt v2 (unified style, no conflict)
 * @param {string} pageText - Text content of the page
 * @param {object} sceneBrief - Scene description object
 * @param {object} identity - Character identity
 * @param {string} outfitDescription - Locked outfit description
 * @param {number} pageNumber - Page number (1-4)
 * @param {string} ageGroup - Age group for complexity
 * @returns {string} Page illustration prompt
 */
export function buildPagePromptV2(pageText, sceneBrief, identity, outfitDescription, pageNumber, ageGroup = "4-6") {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  // Age-based composition complexity
  let compositionNote = "";
  if (ageGroup === "2-3" || ageGroup === "3-4") {
    compositionNote = "COMPOSITION: Simple, clear, minimal background details. Child is 40-50% of image height.";
  } else if (ageGroup === "6-8") {
    compositionNote = "COMPOSITION: Can include more environmental details, but child remains clear focal point. Child is 35-45% of image height.";
  } else {
    compositionNote = "COMPOSITION: Balanced detail level. Child is 35-45% of image height.";
  }
  
  return `
ILLUSTRATE PAGE ${pageNumber} of a Russian folk children's storybook (ages ${ageGroup}).

${getUnified3DAnimatedStyle()}

${getRussianFolkSetting()}

=== SCENE DESCRIPTION ===
${sceneBrief.environment || "Russian folk setting"}
Time of day: ${sceneBrief.timeOfDay || "daytime"}
Lighting: ${sceneBrief.lighting || "warm natural light"}
Key objects: ${sceneBrief.keyObjects || "traditional Russian items"}
Mood: ${sceneBrief.mood || "warm, safe, magical"}

=== PAGE CONTENT ===
"${pageText}"

=== CHARACTER APPEARANCE ===
${identity.short_visual_summary || "Young child character"}

The character's face and hair MUST match the hero_head reference exactly.
Use the fullbody_ref for body proportions and pose guidance.

OUTFIT (same on every page):
${outfitDescription}

${mustKeepRules ? `MUST PRESERVE:\n${mustKeepRules}` : ""}

=== ${compositionNote} ===
- Child character is the main subject, clearly visible
- Face must be visible and large enough to recognize (15-25% of image width)
- Medium shot preferred: full body or 3/4 body visible
- NO extreme close-ups (face only), NO far shots (tiny figure)
- Character positioned in scene naturally, interacting with environment
- Clear foreground/background separation
- Camera angle: eye level or slightly above (child's perspective)

=== CRITICAL REQUIREMENTS ===
1. Face MUST match hero_head reference - same features, same style
2. Hair MUST be identical to reference - color, style, texture
3. Outfit MUST match fullbody_ref exactly - no variations
4. Background realistic and coherent - no abstract elements
5. Lighting consistent across face and environment

${getImageProhibitions()}

Generate a warm, safe, magical illustration that makes children feel joy and wonder.
`.trim();
}

/**
 * Get predefined Russian folk outfits (deterministic selection)
 * @param {string} gender - "girl" or "boy" or "neutral"
 * @param {number} outfitIndex - Index 0-4 for outfit selection
 * @returns {string} Outfit description
 */
export function getPredefinedOutfit(gender = "neutral", outfitIndex = 0) {
  const girlOutfits = [
    `Red sarafan (сарафан) with golden folk embroidery, white blouse with puff sleeves underneath, small red kokoshnik (кокошник) headpiece with pearl trim, brown leather boots`,
    `Sky blue sarafan with white floral pattern, cream blouse, blue ribbon in hair, tan valenki (валенки) felt boots`,
    `Forest green sarafan with golden leaf embroidery, white embroidered blouse, simple green headband, brown ankle boots`,
    `Golden yellow sarafan with red folk trim, white peasant blouse, yellow flower in hair, red soft shoes`,
    `Dusty rose sarafan with cream lace trim, white undershirt, small floral wreath in hair, cream colored boots`
  ];
  
  const boyOutfits = [
    `Red kosovorotka (косоворотка) shirt with golden embroidery at collar and cuffs, dark brown pants, black belt with brass buckle, brown leather boots`,
    `White linen kosovorotka with blue embroidered trim, dark blue sharovary (шаровары) pants, woven belt, tan boots`,
    `Forest green kosovorotka with red folk pattern trim, brown pants, leather belt, valenki (валенки) felt boots`,
    `Cream colored kosovorotka with golden thread embroidery, dark brown pants, rope belt, brown ankle boots`,
    `Sky blue kosovorotka with white collar, gray pants, simple brown belt, black boots`
  ];
  
  const neutralOutfits = [
    `Warm brown tunic with folk embroidery at hem and sleeves, cream colored pants, soft leather belt, brown boots`,
    `Cream linen shirt with subtle folk pattern, earth-toned pants, woven sash belt, tan leather shoes`,
    `Sage green tunic with golden trim, brown leggings, simple rope belt, soft leather boots`,
    `Soft yellow tunic with floral embroidery, light brown pants, fabric belt, ankle boots`,
    `Light blue folk shirt with white trim, gray-brown pants, leather belt, comfortable brown shoes`
  ];
  
  const outfits = gender === "girl" ? girlOutfits : gender === "boy" ? boyOutfits : neutralOutfits;
  const safeIndex = Math.abs(outfitIndex) % outfits.length;
  
  return outfits[safeIndex];
}

/**
 * Determine gender from identity for outfit selection
 * @param {object} identity - Identity object
 * @returns {string} "girl", "boy", or "neutral"
 */
export function inferGenderFromIdentity(identity) {
  if (!identity) return "neutral";
  
  const summary = (identity.short_visual_summary || "").toLowerCase();
  const hairLength = (identity.hair?.length || "").toLowerCase();
  
  // Simple heuristics
  if (summary.includes("girl") || summary.includes("daughter") || summary.includes("девочка")) {
    return "girl";
  }
  if (summary.includes("boy") || summary.includes("son") || summary.includes("мальчик")) {
    return "boy";
  }
  if (hairLength === "long" || summary.includes("ponytail") || summary.includes("pigtail")) {
    return "girl";
  }
  if (hairLength === "short" && !summary.includes("girl")) {
    return "boy";
  }
  
  return "neutral";
}

/**
 * Generate deterministic outfit index from book ID
 * @param {string} bookId - UUID of the book
 * @returns {number} Outfit index 0-4
 */
export function getOutfitIndexFromBookId(bookId) {
  if (!bookId) return 0;
  
  // Simple hash of bookId to get consistent outfit per book
  let hash = 0;
  for (let i = 0; i < bookId.length; i++) {
    const char = bookId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash) % 5;
}

// Re-export functions from v1 that are still needed
export { 
  getMasterStorytellingPrompt,
  getAgeRubric,
  buildIdentityText
} from "./storytelling.mjs";

