/**
 * Storytelling Prompts v3 - Unified 2D storybook style (Russian folk motifs)
 * Single coherent style for face and scene:
 * - High-quality children's storybook illustration
 * - Clean ink outlines, subtle watercolor/gouache texture
 * - Warm palette, Russian folk ornaments/costumes/architecture
 * - NOT Pixar 3D, NOT photoreal, NOT anime
 */

/** Unified art style block */
export function getUnifiedStorybookStyleV3() {
  return `
ART STYLE - CHILDREN'S STORYBOOK (RUSSIAN FOLK MOTIFS):
- 2D illustration with clean ink outlines
- Subtle watercolor / gouache texture, paper grain visible
- Warm, earthy palette with muted reds, ochres, sage greens, sky blue accents
- Russian folk ornaments on clothing and decor
- Professional book illustration quality (no amateur look)
- Soft lighting, no harsh CGI shine
- NOT 3D render, NOT Pixar, NOT photoreal, NOT anime
`.trim();
}

/** Negative constraints */
export function getStrictNegativesV3() {
  return `
ABSOLUTE FORBIDDENS:
- NO text, NO letters, NO watermark, NO signature, NO logo, NO caption
- NO modern objects, NO electronics, NO cars, NO plastic
- NO photoreal faces, NO pasted photos, NO collage look
- NO deformed faces, NO extra limbs, NO body glitches
- NO anime, NO 3D render, NO glossy CGI, NO hyperrealism
`.trim();
}

/** Build outfit lock string */
export function buildOutfitLock(outfitDescription, hairDescription = "") {
  const parts = [];
  if (outfitDescription) parts.push(`Outfit (LOCKED for all pages): ${outfitDescription}`);
  if (hairDescription) parts.push(`Hair (LOCKED): ${hairDescription}`);
  return parts.join("\n");
}

/**
 * Build page prompt (v3, unified style)
 * @param {object} params
 * @param {string} params.pageText
 * @param {object} params.sceneBrief
 * @param {object} params.identity
 * @param {string} params.outfitDescription
 * @param {string} params.hairDescription
 * @param {number} params.pageNumber
 * @returns {string}
 */
export function buildPagePromptV3({
  pageText,
  sceneBrief,
  identity,
  outfitDescription,
  hairDescription,
  pageNumber
}) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }

  const mustKeepRules = Array.isArray(identity.must_keep_same)
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";

  return `
ILLUSTRATE PAGE ${pageNumber} of a Russian folk children's storybook.

${getUnifiedStorybookStyleV3()}

=== ENVIRONMENT (Realistic, Coherent) ===
Setting: ${sceneBrief.environment}
Time of Day: ${sceneBrief.timeOfDay}
Lighting: ${sceneBrief.lighting}
Key Objects: ${sceneBrief.keyObjects}
Mood: ${sceneBrief.mood}

=== PAGE CONTENT ===
"${pageText}"

=== CHARACTER APPEARANCE (LOCKED) ===
${identity.short_visual_summary || "Child hero"}
${buildOutfitLock(outfitDescription, hairDescription)}
${mustKeepRules ? `\nMUST PRESERVE:\n${mustKeepRules}` : ""}

=== FRAMING ===
- Face visible and recognizable (15-25% image width)
- Medium shot (full body or 3/4) preferred
- Vary poses/angles across pages (front, 3/4 left/right)
- Clear foreground/background separation

${getStrictNegativesV3()}
`.trim();
}

/** Style preset metadata for CharacterLock */
export const STYLE_PRESET_V3 = "rus_folk_storybook_v1";





