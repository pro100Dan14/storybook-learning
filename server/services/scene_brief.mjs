/**
 * Scene Brief Builder
 * 
 * Generates detailed, coherent scene descriptions for page illustrations.
 * Ensures realistic backgrounds with thoughtful environment details.
 * 
 * The scene brief is injected into page prompts as an ENVIRONMENT block
 * to guide Gemini toward realistic, coherent backgrounds instead of
 * abstract gradients or random patterns.
 */

/**
 * Russian folk tale environment presets
 * Each contains realistic, detailed environment descriptions
 */
export const ENVIRONMENT_PRESETS = {
  izba_interior: {
    name: "Traditional Russian Izba Interior",
    environment: "Warm wooden interior of traditional Russian log house (изба). Hand-hewn log walls with visible wood grain, low ceiling with exposed beams. Red-painted wooden window frames with carved decorations (наличники). Icon corner (красный угол) with embroidered cloth.",
    lighting: "Warm golden light from small windows, soft shadows in corners. Candle or oil lamp glow adding warm highlights.",
    keyObjects: "Wooden table with embroidered tablecloth, copper samovar with steam rising, ceramic painted bowls, wooden spoons, hand-woven rugs on floor, traditional Russian stove (печь) in corner",
    timeVariants: {
      morning: "Soft morning light streaming through windows, golden dust motes in air, fresh bread smell implied",
      afternoon: "Bright cheerful light, activity feeling, perhaps cooking smells implied",
      evening: "Warm orange candlelight, cozy shadows, hearth glow, intimate atmosphere"
    }
  },
  
  forest_edge: {
    name: "Russian Forest Edge (Опушка)",
    environment: "Edge of mixed Russian forest where meadow meets trees. Tall white birch trees (берёзы) with distinctive bark, dark green pines (сосны) in background. Wildflowers in meadow - chamomile, cornflowers. Moss-covered fallen logs.",
    lighting: "Natural forest lighting with dappled shadows. Sun filtering through leaves creating light patterns on ground.",
    keyObjects: "Birch trees with peeling white bark, wild mushrooms near tree roots, forest flowers, berry bushes, small stream or path leading into forest, butterflies",
    timeVariants: {
      morning: "Misty morning light, dew on grass and flowers, soft haze between trees, peaceful awakening",
      afternoon: "Bright sunshine, sharp shadows under trees, buzzing insects, warm summer feeling",
      evening: "Golden sunset light through trees, long shadows, peaceful settling, first stars appearing"
    }
  },
  
  forest_path: {
    name: "Forest Path",
    environment: "Winding path through deep Russian forest. Dense pine and birch canopy overhead. Path covered with fallen leaves or pine needles. Ferns and forest undergrowth on sides.",
    lighting: "Filtered light through dense canopy, green-gold tones, mysterious but not scary. Light pools where sun breaks through.",
    keyObjects: "Worn path of packed earth, tree roots crossing path, mushroom circles, moss-covered rocks, small woodland creatures peeking from ferns, carved wooden signpost",
    timeVariants: {
      morning: "Soft mist at ground level, mysterious but safe, adventure beginning feeling",
      afternoon: "Clear visibility, warm light pools, confident exploration mood",
      evening: "Lengthening shadows, path of light leading forward, journey continuing"
    }
  },
  
  forest_clearing: {
    name: "Magical Forest Clearing",
    environment: "Circular clearing in the forest, naturally open to sky. Ring of trees around edges, soft grass in center. Perhaps a large moss-covered stone or old stump as focal point.",
    lighting: "Natural spotlight effect - sky visible above, light concentrated in clearing center. Magical golden-green glow feeling.",
    keyObjects: "Ancient oak or birch in center, fairy ring of mushrooms, woodland flowers, small stream crossing corner, perhaps an old well or stone marker, fireflies or magical sparkles",
    timeVariants: {
      morning: "Fresh dew, first light touching clearing center, sense of discovery",
      afternoon: "Full magical light, warmth in the open space, wonder and curiosity",
      evening: "Soft golden light, fireflies beginning to glow, magical transition time"
    }
  },
  
  village_scene: {
    name: "Russian Village",
    environment: "Traditional Russian village (деревня) with log houses along dirt road. Houses have carved window frames, wooden fences with decorative gates. Kitchen gardens between houses.",
    lighting: "Open sky light, clear visibility, domestic warmth from windows.",
    keyObjects: "Wooden houses with carved decorations, picket fences, flower gardens, chickens in yard, wooden well with bucket, hay stacks, distant church dome (optional)",
    timeVariants: {
      morning: "Roosters crowing (implied), activity beginning, smoke from chimneys",
      afternoon: "Peaceful village life, people at work, warm summer day feeling",
      evening: "Windows glowing warm, families gathering, cozy domestic scene"
    }
  },
  
  river_bank: {
    name: "River Bank",
    environment: "Gentle river bank with willow trees. Slow-moving water reflecting sky. Reeds and water lilies along shore. Small wooden dock or fishing spot.",
    lighting: "Water reflections creating soft light, peaceful riverside atmosphere.",
    keyObjects: "Willow trees trailing into water, water lilies, wooden bridge or dock, small boat tied up, fish jumping (implied), dragonflies",
    timeVariants: {
      morning: "Mist rising from water, peaceful fishing time, soft reflections",
      afternoon: "Sparkling water, warm sun, playful riverside activity",
      evening: "Golden reflections, calm water, contemplative mood"
    }
  }
};

/**
 * Page-specific scene recommendations for 4-page structure
 */
export const PAGE_SCENE_TEMPLATES = {
  1: {
    recommended: ["izba_interior", "village_scene", "forest_edge"],
    mood: "Safe, warm, familiar, grounding",
    purpose: "Establish safety and home - the child's known world",
    narrative: "Beginning of story, everything is calm and ordinary"
  },
  2: {
    recommended: ["forest_edge", "forest_clearing", "river_bank"],
    mood: "Curious, magical, wondrous, gentle surprise",
    purpose: "Discovery of something magical - wonder without fear",
    narrative: "The magical element appears, child notices something special"
  },
  3: {
    recommended: ["forest_path", "forest_clearing", "river_bank"],
    mood: "Adventure, gentle determination, helpful",
    purpose: "Small journey or challenge - growth without danger",
    narrative: "Child acts, perhaps with help, accomplishes small goal"
  },
  4: {
    recommended: ["izba_interior", "village_scene", "forest_edge"],
    mood: "Joy, peace, warmth, resolution, home",
    purpose: "Return and integration - magic becomes part of life",
    narrative: "Child returns home, magic keepsake, warm ending"
  }
};

/**
 * Get detailed scene brief for a page
 * @param {number} pageNumber - Page number (1-4)
 * @param {string} [presetName] - Specific preset to use, or auto-select
 * @param {string} [timeOfDay] - "morning", "afternoon", or "evening"
 * @returns {object} Complete scene brief
 */
export function getSceneBrief(pageNumber, presetName = null, timeOfDay = null) {
  const pageTemplate = PAGE_SCENE_TEMPLATES[pageNumber] || PAGE_SCENE_TEMPLATES[1];
  
  // Select preset
  let preset;
  if (presetName && ENVIRONMENT_PRESETS[presetName]) {
    preset = ENVIRONMENT_PRESETS[presetName];
  } else {
    // Auto-select based on page number
    const recommendedPresets = pageTemplate.recommended;
    const autoPreset = recommendedPresets[0]; // Default to first recommended
    preset = ENVIRONMENT_PRESETS[autoPreset];
  }
  
  // Select time of day
  const time = timeOfDay || (pageNumber === 4 ? "evening" : pageNumber === 1 ? "morning" : "afternoon");
  const timeVariant = preset.timeVariants[time] || preset.timeVariants.afternoon;
  
  return {
    environment: preset.environment,
    timeOfDay: time,
    lighting: preset.lighting + " " + timeVariant,
    keyObjects: preset.keyObjects,
    mood: pageTemplate.mood,
    purpose: pageTemplate.purpose,
    presetName: presetName || pageTemplate.recommended[0]
  };
}

/**
 * Generate environment block for page prompt
 * @param {object} sceneBrief - Scene brief object
 * @returns {string} Formatted environment block for prompt
 */
export function formatEnvironmentBlock(sceneBrief) {
  return `
=== ENVIRONMENT (Detailed, Realistic) ===
Setting: ${sceneBrief.environment}

Time of Day: ${sceneBrief.timeOfDay}
Lighting: ${sceneBrief.lighting}

Key Objects to Include: ${sceneBrief.keyObjects}

Mood: ${sceneBrief.mood}

IMPORTANT ENVIRONMENT RULES:
- Background must be realistic and coherent - no abstract gradients
- All objects should make sense in context - no random items
- Lighting should be consistent across entire image
- Environment should feel lived-in and authentic
- NO modern objects, NO anachronisms
- NO text, NO signs with words, NO written labels
`.trim();
}

/**
 * Parse page text for environment hints
 * @param {string} pageText - Page text content
 * @returns {object} Hints for scene selection
 */
export function parseTextForEnvironmentHints(pageText) {
  const text = (pageText || "").toLowerCase();
  
  const hints = {
    isInterior: false,
    isForest: false,
    isWater: false,
    isVillage: false,
    timeOfDay: null,
    specificElements: []
  };
  
  // Interior indicators
  if (text.includes("дом") || text.includes("изба") || text.includes("комнат") || 
      text.includes("печ") || text.includes("окн") || text.includes("home") ||
      text.includes("inside") || text.includes("house")) {
    hints.isInterior = true;
  }
  
  // Forest indicators
  if (text.includes("лес") || text.includes("дерев") || text.includes("берёз") ||
      text.includes("гриб") || text.includes("тропинк") || text.includes("forest") ||
      text.includes("tree") || text.includes("path")) {
    hints.isForest = true;
  }
  
  // Water indicators
  if (text.includes("река") || text.includes("ручей") || text.includes("озер") ||
      text.includes("вод") || text.includes("мост") || text.includes("river") ||
      text.includes("stream") || text.includes("bridge")) {
    hints.isWater = true;
  }
  
  // Village indicators
  if (text.includes("деревн") || text.includes("сел") || text.includes("двор") ||
      text.includes("village") || text.includes("yard")) {
    hints.isVillage = true;
  }
  
  // Time of day
  if (text.includes("утр") || text.includes("рассвет") || text.includes("morning") || text.includes("dawn")) {
    hints.timeOfDay = "morning";
  } else if (text.includes("вечер") || text.includes("закат") || text.includes("evening") || text.includes("sunset")) {
    hints.timeOfDay = "evening";
  }
  
  return hints;
}

/**
 * Auto-select best scene preset based on page context
 * @param {number} pageNumber - Page number
 * @param {string} pageText - Page text content
 * @param {string} beat - Story beat
 * @returns {object} Scene brief with auto-selected preset
 */
export function autoSelectSceneBrief(pageNumber, pageText, beat) {
  const hints = parseTextForEnvironmentHints(pageText + " " + beat);
  const pageTemplate = PAGE_SCENE_TEMPLATES[pageNumber] || PAGE_SCENE_TEMPLATES[1];
  
  let selectedPreset = null;
  
  // Priority selection based on text hints
  if (hints.isInterior) {
    selectedPreset = "izba_interior";
  } else if (hints.isWater) {
    selectedPreset = "river_bank";
  } else if (hints.isForest) {
    // Check if it's a path or clearing
    const text = (pageText + " " + beat).toLowerCase();
    if (text.includes("тропинк") || text.includes("дорог") || text.includes("путь") || text.includes("path")) {
      selectedPreset = "forest_path";
    } else if (text.includes("полян") || text.includes("clearing")) {
      selectedPreset = "forest_clearing";
    } else {
      selectedPreset = "forest_edge";
    }
  } else if (hints.isVillage) {
    selectedPreset = "village_scene";
  }
  
  // Fallback to page template recommendation
  if (!selectedPreset) {
    selectedPreset = pageTemplate.recommended[0];
  }
  
  // Get the brief
  const brief = getSceneBrief(pageNumber, selectedPreset, hints.timeOfDay);
  
  return {
    ...brief,
    autoSelected: true,
    hints
  };
}




