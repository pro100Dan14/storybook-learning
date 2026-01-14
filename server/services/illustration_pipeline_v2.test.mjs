/**
 * Tests for Illustration Pipeline v2
 * 
 * Unit tests covering:
 * - Feature flag behavior
 * - Scene brief generation
 * - Character assets (mocked)
 * - Compositing (mocked)
 * - Face selection heuristics
 */

import assert from "assert";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  isV2Enabled,
  getV2Config,
  buildSceneBrief
} from "./illustration_pipeline_v2.mjs";

import {
  getOutfitDescription,
  getOutfitIndexFromBookId
} from "./character_assets.mjs";

import {
  getUnified3DAnimatedStyle,
  getRussianFolkSetting,
  getImageProhibitions,
  getPredefinedOutfit,
  inferGenderFromIdentity,
  buildHeroHeadPromptV2,
  buildPagePromptV2
} from "../prompts/storytelling_v2.mjs";

import {
  getSceneBrief,
  autoSelectSceneBrief,
  parseTextForEnvironmentHints,
  formatEnvironmentBlock
} from "./scene_brief.mjs";
import { compositeHeroHead } from "./face_composite.mjs";

// =============================================================================
// Feature Flag Tests
// =============================================================================

describe("Feature Flags", () => {
  it("getV2Config returns expected structure", () => {
    const config = getV2Config();
    assert.ok(typeof config.v2Enabled === "boolean");
    assert.ok(typeof config.characterAssetsEnabled === "boolean");
    assert.ok(typeof config.compositeEnabled === "boolean");
    assert.ok(typeof config.similarityThreshold === "number");
    assert.ok(typeof config.maxPageRetries === "number");
  });
});

// =============================================================================
// Prompt Tests
// =============================================================================

describe("Prompts v2", () => {
  it("getUnified3DAnimatedStyle returns valid prompt text", () => {
    const style = getUnified3DAnimatedStyle();
    assert.ok(style.includes("3D ANIMATED"));
    assert.ok(style.includes("Pixar"));
    assert.ok(style.includes("DreamWorks"));
    // Should NOT mention Bilibin or traditional gouache
    assert.ok(!style.includes("gouache"));
    assert.ok(!style.includes("Bilibin"));
  });

  it("getRussianFolkSetting describes content not style", () => {
    const setting = getRussianFolkSetting();
    assert.ok(setting.includes("Russian"));
    assert.ok(setting.includes("izba") || setting.includes("избa"));
    assert.ok(setting.includes("sarafan") || setting.includes("сарафан"));
    // Should NOT say "paint style" or "art technique"
    assert.ok(!setting.toLowerCase().includes("paint style"));
  });

  it("getImageProhibitions includes text ban", () => {
    const prohibitions = getImageProhibitions();
    assert.ok(prohibitions.includes("NO text"));
    assert.ok(prohibitions.includes("NO watermark"));
    assert.ok(prohibitions.includes("NO signature"));
    assert.ok(prohibitions.includes("NO logo"));
  });

  it("getPredefinedOutfit returns different outfits for girl/boy", () => {
    const girlOutfit = getPredefinedOutfit("girl", 0);
    const boyOutfit = getPredefinedOutfit("boy", 0);
    const neutralOutfit = getPredefinedOutfit("neutral", 0);

    assert.ok(girlOutfit.includes("sarafan"));
    assert.ok(boyOutfit.includes("kosovorotka"));
    assert.ok(neutralOutfit.includes("tunic") || neutralOutfit.includes("shirt"));
    
    // Different outfits for same gender, different index
    const girlOutfit2 = getPredefinedOutfit("girl", 1);
    assert.notStrictEqual(girlOutfit, girlOutfit2);
  });

  it("inferGenderFromIdentity detects gender from summary", () => {
    assert.strictEqual(inferGenderFromIdentity({ short_visual_summary: "4-year-old girl" }), "girl");
    assert.strictEqual(inferGenderFromIdentity({ short_visual_summary: "young boy" }), "boy");
    assert.strictEqual(inferGenderFromIdentity({ short_visual_summary: "child with brown hair" }), "neutral");
    assert.strictEqual(inferGenderFromIdentity({ short_visual_summary: "девочка" }), "girl");
    assert.strictEqual(inferGenderFromIdentity({ short_visual_summary: "мальчик" }), "boy");
  });

  it("buildHeroHeadPromptV2 requires identity object", () => {
    assert.throws(() => buildHeroHeadPromptV2(null));
    assert.throws(() => buildHeroHeadPromptV2("string"));
  });

  it("buildHeroHeadPromptV2 generates valid prompt", () => {
    const identity = {
      short_visual_summary: "4-year-old girl with brown hair",
      must_keep_same: ["Brown wavy hair", "Round face shape"]
    };
    const prompt = buildHeroHeadPromptV2(identity);
    
    assert.ok(prompt.includes("FACE REFERENCE ASSET"));
    assert.ok(prompt.includes("HEAD CLOSE-UP"));
    assert.ok(prompt.includes("Brown wavy hair"));
    assert.ok(prompt.includes("3D"));
    // Should NOT contain contradictions
    assert.ok(!prompt.includes("AVOID Pixar"));
  });

  it("buildPagePromptV2 includes all required sections", () => {
    const identity = {
      short_visual_summary: "child character",
      must_keep_same: []
    };
    const sceneBrief = {
      environment: "Forest edge",
      timeOfDay: "morning",
      lighting: "soft light",
      keyObjects: "birch trees",
      mood: "peaceful"
    };
    const outfitDescription = "Red sarafan with golden embroidery";
    
    const prompt = buildPagePromptV2("Page text here", sceneBrief, identity, outfitDescription, 1, "4-6");
    
    assert.ok(prompt.includes("PAGE 1"));
    assert.ok(prompt.includes("SCENE DESCRIPTION"));
    assert.ok(prompt.includes("Forest edge"));
    assert.ok(prompt.includes("Red sarafan"));
    assert.ok(prompt.includes("3D ANIMATED"));
    assert.ok(prompt.includes("NO text"));
    // Should NOT have style conflict
    assert.ok(!prompt.includes("AVOID Pixar"));
    assert.ok(!prompt.includes("AVOID DreamWorks"));
  });
});

// =============================================================================
// Character Assets Tests
// =============================================================================

describe("Character Assets", () => {
  it("getOutfitIndexFromBookId returns consistent values", () => {
    const bookId1 = "550e8400-e29b-41d4-a716-446655440000";
    const bookId2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    
    const index1a = getOutfitIndexFromBookId(bookId1);
    const index1b = getOutfitIndexFromBookId(bookId1);
    const index2 = getOutfitIndexFromBookId(bookId2);
    
    // Same bookId should give same index
    assert.strictEqual(index1a, index1b);
    // Index should be in valid range
    assert.ok(index1a >= 0 && index1a < 5);
    assert.ok(index2 >= 0 && index2 < 5);
  });

  it("getOutfitDescription returns user outfit if valid", () => {
    const bookId = "test-book-id";
    const identity = { short_visual_summary: "girl" };
    const userOutfit = "Custom blue dress with silver stars, matching shoes";
    
    const outfit = getOutfitDescription(bookId, identity, userOutfit);
    assert.strictEqual(outfit, userOutfit);
  });

  it("getOutfitDescription falls back to predefined if no user outfit", () => {
    const bookId = "test-book-id";
    const identity = { short_visual_summary: "girl" };
    
    const outfit = getOutfitDescription(bookId, identity, null);
    assert.ok(outfit.includes("sarafan") || outfit.includes("kosovorotka") || outfit.includes("tunic"));
  });
});

// =============================================================================
// Scene Brief Tests
// =============================================================================

describe("Scene Brief", () => {
  it("getSceneBrief returns valid structure for each page", () => {
    for (let page = 1; page <= 4; page++) {
      const brief = getSceneBrief(page);
      assert.ok(brief.environment);
      assert.ok(brief.timeOfDay);
      assert.ok(brief.lighting);
      assert.ok(brief.keyObjects);
      assert.ok(brief.mood);
      assert.ok(brief.presetName);
    }
  });

  it("getSceneBrief respects preset override", () => {
    const brief = getSceneBrief(1, "forest_clearing", "evening");
    assert.ok(brief.environment.includes("clearing"));
    assert.strictEqual(brief.timeOfDay, "evening");
    assert.strictEqual(brief.presetName, "forest_clearing");
  });

  it("parseTextForEnvironmentHints detects interior", () => {
    const hints1 = parseTextForEnvironmentHints("The child was inside the warm izba");
    assert.ok(hints1.isInterior);
    
    const hints2 = parseTextForEnvironmentHints("В доме было тепло");
    assert.ok(hints2.isInterior);
  });

  it("parseTextForEnvironmentHints detects forest", () => {
    const hints = parseTextForEnvironmentHints("Walking through the forest path");
    assert.ok(hints.isForest);
  });

  it("parseTextForEnvironmentHints detects time of day", () => {
    const morning = parseTextForEnvironmentHints("Early утром the sun rose");
    assert.strictEqual(morning.timeOfDay, "morning");
    
    const evening = parseTextForEnvironmentHints("As evening approached");
    assert.strictEqual(evening.timeOfDay, "evening");
  });

  it("autoSelectSceneBrief picks appropriate preset", () => {
    const forestBrief = autoSelectSceneBrief(2, "In the magical forest clearing", "Discovery");
    assert.ok(forestBrief.presetName.includes("forest"));
    assert.ok(forestBrief.autoSelected);
    
    const homeBrief = autoSelectSceneBrief(1, "At home in the warm izba", "Safe world");
    assert.ok(homeBrief.presetName === "izba_interior");
  });

  it("formatEnvironmentBlock produces valid prompt section", () => {
    const brief = getSceneBrief(1);
    const block = formatEnvironmentBlock(brief);
    
    assert.ok(block.includes("=== ENVIRONMENT"));
    assert.ok(block.includes("Setting:"));
    assert.ok(block.includes("Time of Day:"));
    assert.ok(block.includes("NO text"));
    assert.ok(block.includes("NO abstract gradients"));
  });

  it("disallows raw photo compositing when policy enabled", async () => {
    const res = await compositeHeroHead({
      heroHeadPath: "/tmp/fake.png",
      pageImagePath: "/tmp/fake2.png",
      outputPath: "/tmp/out.png",
      isStylizedSource: false
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, "RAW_PHOTO_COMPOSITING_DISABLED");
  });
});

// =============================================================================
// Build Scene Brief (Pipeline v2)
// =============================================================================

describe("buildSceneBrief (Pipeline v2)", () => {
  it("returns valid structure for each page", () => {
    for (let page = 1; page <= 4; page++) {
      const brief = buildSceneBrief(page, "Page text", "Story beat");
      assert.ok(brief.environment);
      assert.ok(brief.timeOfDay);
      assert.ok(brief.lighting);
      assert.ok(brief.keyObjects);
      assert.ok(brief.mood);
    }
  });

  it("page 1 is safe/home focused", () => {
    const brief = buildSceneBrief(1, "", "");
    assert.ok(brief.mood.toLowerCase().includes("safe") || brief.mood.toLowerCase().includes("warm"));
  });

  it("page 4 is evening/home focused", () => {
    const brief = buildSceneBrief(4, "", "");
    assert.ok(brief.timeOfDay === "evening" || brief.environment.includes("izba"));
  });
});

// =============================================================================
// Run Tests
// =============================================================================

console.log("Running Illustration Pipeline v2 tests...");

