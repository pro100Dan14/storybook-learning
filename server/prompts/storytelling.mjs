/**
 * Storytelling prompts and style configurations
 * Extracted from index.js for modularity
 * 
 * Contains:
 * - Russian fairy tale art style definitions
 * - Age-based writing rubrics
 * - Hero reference prompts
 * - Image prompt builders
 * - Master storytelling prompt
 */

import { FACE_IDENTITY_BLOCK, FACE_IDENTITY_PROHIBITIONS } from "./face_identity.mjs";

/**
 * Build identity_text from identity object (for backward compatibility)
 * @param {object} identity - Identity object
 * @returns {string} Identity text description
 */
export function buildIdentityText(identity) {
  if (!identity || typeof identity !== "object") return "";
  
  const summary = identity.short_visual_summary || "";
  const rules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.join(". ")
    : "";
  
  return [summary, rules].filter(Boolean).join(". ");
}

/**
 * Get age-appropriate style note
 * @param {string} ageGroup - Age group ("2-3", "3-4", "4-6", "6-8")
 * @returns {string} Style note for the age group
 */
export function getAgeStyleNote(ageGroup) {
  if (ageGroup === "2-3" || ageGroup === "3-4") {
    return "For younger children: simpler compositions, fewer details, very clear subject.";
  } else if (ageGroup === "6-8") {
    return "For older children: slightly richer backgrounds, but still children's illustration style.";
  }
  return "";
}

/**
 * Get Russian folk fairy tale art style (single source of truth)
 * @returns {string} Art style description
 */
export function getRussianFairyTaleArtStyle() {
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

/**
 * Get Russian fairy tale negative constraints
 * @returns {string} Things to avoid in generation
 */
export function getRussianFairyTaleNegative() {
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

/**
 * Get detailed age-based writing rubric
 * @param {string} ageGroup - Age group ("2-3", "3-4", "4-6", "6-8")
 * @returns {object} Writing rubric with guidelines
 */
export function getAgeRubric(ageGroup) {
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

/**
 * Build hero reference prompt (for stable master image)
 * Face: High-quality cartoon/animated style with PERFECT likeness to photo
 * Body/Background: Russian fairy tale style
 * @param {object} identity - Identity object with character details
 * @returns {string} Prompt for hero reference generation
 */
export function buildHeroReferencePrompt(identity) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const identityText = buildIdentityText(identity);
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  return `
Generate a stable master reference image of the child hero for a storybook.

FACE STYLE - HIGH-QUALITY CARTOON/ANIMATED (CRITICAL):
- The FACE must be rendered in modern high-quality cartoon/animated style
- Think Pixar, DreamWorks, or Disney quality for the FACE ONLY
- Smooth, clean cartoon skin with subtle shading
- Expressive cartoon eyes that MATCH the child's real eye shape and color
- The face must be PERFECTLY recognizable as the same child from the photo
- Cartoon stylization but with EXACT likeness - same face shape, same features, same proportions
- NOT anime style, NOT flat 2D cartoon - high quality 3D-like cartoon rendering for face

BODY AND CLOTHING - RUSSIAN FOLK STYLE:
- Russian folk clothing (sarafan, kosovorotka, traditional garments)
- Traditional patterns and decorations on clothing
- Warm earthy color palette for clothes (ochre, muted reds, sage green)

BACKGROUND - RUSSIAN FAIRY TALE:
- Simple, soft folk-style background
- Warm, cozy atmosphere
- Traditional Russian elements if any background shown

COMPOSITION:
- Medium shot, head and shoulders, face clearly visible
- Neutral expression, slight gentle smile allowed
- Face takes up significant portion of the image
- No accessories, no text, no logos, no modern clothing
- Avoid far shots where the face becomes tiny and ambiguous

Character identity (FACE MUST MATCH EXACTLY):
${identityText}

CRITICAL RULES - FACE LIKENESS:
${mustKeepRules || "- Keep the same face, proportions, and hairstyle"}
- Same face geometry, same eye distance, same nose shape, same mouth shape
- Same eye color, same eyebrow shape, same face proportions
- The cartoon face must be INSTANTLY recognizable as the child from the photo
- Do not change hairline, hair color, or hair texture

FORBIDDEN:
- No modern objects, no logos, no text
- No accessories, no glasses, no hats (unless in original photo)
- No extreme expressions or emotions
- No modern clothing, no swimwear
- Do NOT make the face look like a generic cartoon child - it must be THIS specific child

This will be used as the PRIMARY identity reference for all storybook pages.
The face style (cartoon) will be consistent across all pages.
`.trim();
}

/**
 * Build face-avoiding fallback hero reference prompt
 * Used when face generation fails - shows back/side view
 * @param {object} identity - Identity object with character details
 * @returns {string} Fallback prompt for hero reference generation
 */
export function buildHeroReferenceFallbackPrompt(identity) {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const identityText = buildIdentityText(identity);
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  return `
Generate a stable master reference image of the child hero for a storybook.

STYLE:
- High-quality cartoon/animated style for the child's body and hair
- Russian folk clothing (sarafan, kosovorotka, traditional garments)
- Warm folk-style background

COMPOSITION:
- Full body or back-facing hero, face not visible
- Hair silhouette clearly visible from behind or side
- Body proportions consistent with the child photo
- Neutral pose, no extreme emotion
- No accessories, no text, no logos, no modern clothing

Character identity (body and hair):
${identityText}

CRITICAL RULES - MUST KEEP SAME:
${mustKeepRules || "- Keep the same hair color, hair style, body proportions"}
- Same hair silhouette and body proportions
- Same hair color and texture as in the photo
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

/**
 * Get master storytelling prompt - single source of truth for story generation
 * @param {string} ageGroup - Age group ("2-3", "3-4", "4-6", "6-8")
 * @param {string} heroName - Name of the hero character
 * @param {string} theme - Story theme/setting
 * @returns {string} Complete storytelling prompt
 */
export function getMasterStorytellingPrompt(ageGroup, heroName, theme) {
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

/**
 * Build image prompt with identity (supports hero reference)
 * Face: High-quality cartoon style with perfect likeness (matches hero.jpg)
 * Background/Environment: Russian fairy tale style
 * @param {string} pageText - Text of the current page
 * @param {string} scenePrompt - Scene description
 * @param {object} identity - Identity object
 * @param {string} prevPagesText - Previous pages text for context
 * @param {boolean} useHeroReference - Whether to use hero reference
 * @param {string} ageGroup - Age group
 * @returns {string} Image generation prompt
 */
export function buildImagePromptWithIdentity(pageText, scenePrompt, identity, prevPagesText = "", useHeroReference = false, ageGroup = "4-6") {
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
  
  return `
You are illustrating a page from a Russian folk fairy tale (русская народная сказка) for ages ${ageGroup}.

DUAL STYLE APPROACH:

1. FACE STYLE - HIGH-QUALITY CARTOON (CRITICAL):
- The child's FACE must be in modern high-quality cartoon/animated style
- Match the hero reference image (hero.jpg) EXACTLY for face style and likeness
- Pixar/DreamWorks quality cartoon face - smooth, expressive, recognizable
- The face must be PERFECTLY recognizable as the same child
- Same face shape, same eye color, same features as in hero.jpg
- NOT anime, NOT flat 2D - high quality cartoon rendering

2. BACKGROUND AND ENVIRONMENT - RUSSIAN FAIRY TALE:
${getRussianFairyTaleArtStyle()}

3. CLOTHING - RUSSIAN FOLK STYLE:
- Russian folk garments (sarafan, kosovorotka, traditional clothing)
- Warm earthy palette (ochre, muted reds, sage green)
- Traditional patterns and folk decorations

${getAgeStyleNote(ageGroup) ? `${getAgeStyleNote(ageGroup)}\n` : ""}

COMPOSITION:
- Clear subject (the child hero)
- Folk-style background with traditional Russian elements
- No visual clutter
- Decorative folk elements in environment
- Face clearly visible and recognizable

No modern objects, no logos, no text on image.

${FACE_IDENTITY_PROHIBITIONS}

Story context for continuity:
${prevPagesText ? `- Previous pages: ${prevPagesText}` : "- Beginning of story"}
- Current page: ${pageText}
${scenePrompt ? `- Scene: ${scenePrompt}` : ""}

Character identity (FACE MUST MATCH hero.jpg EXACTLY):
${identity.short_visual_summary || ""}

${FACE_IDENTITY_BLOCK}

CRITICAL RULES - FACE CONSISTENCY:
${mustKeepRules || "- Keep the same cartoon face style as in hero.jpg"}
- The cartoon face style must be IDENTICAL to hero.jpg on every page
- Same face geometry, same eye distance, same nose shape, same mouth shape
- Do not change hairline, hair color, or cartoon face style
- Avoid far shots where the face becomes tiny and unrecognizable

${negativeRules ? `FORBIDDEN:\n${negativeRules}` : ""}

${getRussianFairyTaleNegative()}

${useHeroReference ? "IMPORTANT: Match the hero reference image (hero.jpg) EXACTLY for cartoon face style and likeness. The face on this page must look like the SAME cartoon child as in hero.jpg." : "Use the provided child photo as the identity reference."}
Medium or wide shot preferred. Show full body or at least torso.
Face should be clearly visible and large enough to be recognizable.
`.trim();
}

