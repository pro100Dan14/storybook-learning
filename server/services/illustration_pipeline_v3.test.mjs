/**
 * Tests for illustration_pipeline_v3
 * 
 * Ensures:
 * 1. No raw photo paste/compositing
 * 2. Prompt linting works
 * 3. Pipeline mode enforcement
 */

import { assert } from "node:assert";
import { lintPrompt, validateNoPhotoCompositing, assertPromptValid } from "../utils/prompt-linter.mjs";
import { buildReplicatePromptV3 } from "../prompts/replicate_v3.mjs";

// Mock scene brief
const mockSceneBrief = {
  environment: "Russian izba interior",
  lighting: "warm golden light",
  mood: "cozy and safe",
  keyObjects: "wooden table, samovar"
};

// Mock identity
const mockIdentity = {
  age_range: "4-6",
  hair: { color: "brown", length: "short", style: "straight" },
  skin_tone: "light",
  distinctive_marks: []
};

// Mock outfit
const mockOutfit = "traditional Russian folk costume with embroidered shirt";

console.log("Running illustration_pipeline_v3 tests...\n");

// Test 1: Prompt linting detects contradictions
console.log("Test 1: Prompt linting...");
try {
  const badPrompt = "3D Pixar style illustration with 2D gouache painting";
  const lintResult = lintPrompt(badPrompt);
  assert(!lintResult.valid, "Should detect style contradiction");
  assert(lintResult.errors.length > 0, "Should have errors");
  console.log("✓ Prompt linting works\n");
} catch (error) {
  console.error("✗ Prompt linting test failed:", error.message);
  process.exit(1);
}

// Test 2: No photo compositing validation
console.log("Test 2: Photo compositing validation...");
try {
  const badPrompt = "Paste the real photo face onto the illustration";
  const check = validateNoPhotoCompositing(badPrompt);
  assert(!check.valid, "Should detect photo compositing mention");
  console.log("✓ Photo compositing validation works\n");
} catch (error) {
  console.error("✗ Photo compositing validation test failed:", error.message);
  process.exit(1);
}

// Test 3: Replicate prompt builder creates valid prompts
console.log("Test 3: Replicate prompt builder...");
try {
  const prompt = buildReplicatePromptV3({
    pageNumber: 1,
    pageText: "Child in izba",
    sceneBrief: mockSceneBrief,
    identity: mockIdentity,
    outfitDescription: mockOutfit
  });
  
  assert(typeof prompt === "string", "Prompt should be a string");
  assert(prompt.length > 100, "Prompt should be substantial");
  assert(!prompt.includes("Pixar"), "Should not mention Pixar");
  assert(!prompt.includes("3D"), "Should not mention 3D");
  assert(prompt.includes("storybook"), "Should mention storybook");
  assert(prompt.includes("illustration"), "Should mention illustration");
  
  // Should pass linting
  assertPromptValid(prompt);
  
  console.log("✓ Replicate prompt builder works\n");
} catch (error) {
  console.error("✗ Replicate prompt builder test failed:", error.message);
  process.exit(1);
}

// Test 4: Prompt does not mention photo compositing
console.log("Test 4: No photo compositing in generated prompts...");
try {
  const prompt = buildReplicatePromptV3({
    pageNumber: 2,
    pageText: "Child discovers magic",
    sceneBrief: mockSceneBrief,
    identity: mockIdentity,
    outfitDescription: mockOutfit
  });
  
  const compositingCheck = validateNoPhotoCompositing(prompt);
  assert(compositingCheck.valid, "Generated prompt should not mention compositing");
  
  // Check for specific forbidden terms
  const forbiddenTerms = ["paste", "cutout", "collage", "composite", "real photo", "actual photo"];
  for (const term of forbiddenTerms) {
    assert(!prompt.toLowerCase().includes(term.toLowerCase()), 
      `Prompt should not contain "${term}"`);
  }
  
  console.log("✓ No photo compositing in prompts\n");
} catch (error) {
  console.error("✗ No photo compositing test failed:", error.message);
  process.exit(1);
}

// Test 5: Character locks are consistent
console.log("Test 5: Character locks consistency...");
try {
  const prompt1 = buildReplicatePromptV3({
    pageNumber: 1,
    pageText: "Page 1",
    sceneBrief: mockSceneBrief,
    identity: mockIdentity,
    outfitDescription: mockOutfit
  });
  
  const prompt2 = buildReplicatePromptV3({
    pageNumber: 2,
    pageText: "Page 2",
    sceneBrief: mockSceneBrief,
    identity: mockIdentity,
    outfitDescription: mockOutfit
  });
  
  // Both should contain same character locks
  assert(prompt1.includes(mockOutfit), "Prompt 1 should contain outfit");
  assert(prompt2.includes(mockOutfit), "Prompt 2 should contain outfit");
  assert(prompt1.includes("brown short straight"), "Prompt 1 should contain hair");
  assert(prompt2.includes("brown short straight"), "Prompt 2 should contain hair");
  
  console.log("✓ Character locks are consistent\n");
} catch (error) {
  console.error("✗ Character locks test failed:", error.message);
  process.exit(1);
}

console.log("All tests passed! ✓\n");
console.log("Summary:");
console.log("- Prompt linting works");
console.log("- Photo compositing detection works");
console.log("- Replicate prompts are valid and consistent");
console.log("- No photo compositing mentioned in prompts");
console.log("- Character locks are consistent across pages");

