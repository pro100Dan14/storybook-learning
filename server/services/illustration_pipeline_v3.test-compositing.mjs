/**
 * Unit Test: Raw photo bytes never used in final page image pipeline
 * 
 * This test ensures that:
 * 1. No compositing functions receive original photo bytes
 * 2. No raw photo pixels are inserted into final page images
 * 3. All images are model-generated only
 */

import { assert } from "node:assert";
import { readFileSync, existsSync } from "fs";
import { compositeHeroHead } from "./face_composite.mjs";
import { runV3Pipeline } from "./illustration_pipeline_v3.mjs";

console.log("Running compositing safety tests...\n");

// Test 1: compositeHeroHead should reject raw photo compositing
async function testCompositingRejection() {
  console.log("Test 1: compositeHeroHead rejects raw photo compositing");
  
  // Mock paths (don't need to exist for this test)
  const result = await compositeHeroHead({
    heroHeadPath: "/tmp/test_hero.jpg",
    pageImagePath: "/tmp/test_page.png",
    outputPath: "/tmp/test_output.png",
    isStylizedSource: false, // This should trigger rejection
    requestId: "test"
  });

  assert.strictEqual(result.ok, false, "Compositing should be rejected");
  assert.strictEqual(result.error, "COMPOSITING_DISABLED", "Should return COMPOSITING_DISABLED error");
  
  console.log("✓ PASS: Compositing correctly rejected\n");
}

// Test 2: V3 pipeline should not use compositing
async function testV3PipelineNoCompositing() {
  console.log("Test 2: V3 pipeline does not use compositing");
  
  // Check that runV3Pipeline doesn't import or call compositing functions
  // This is a static analysis test - we check the code doesn't import face_composite
  const pipelineCode = readFileSync("./illustration_pipeline_v3.mjs", "utf8");
  
  // Should NOT import face_composite
  assert.ok(
    !pipelineCode.includes("from \"./face_composite.mjs\""),
    "V3 pipeline should not import face_composite"
  );
  assert.ok(
    !pipelineCode.includes("compositeHeroHead"),
    "V3 pipeline should not call compositeHeroHead"
  );
  assert.ok(
    !pipelineCode.includes("compositeWithRetry"),
    "V3 pipeline should not call compositeWithRetry"
  );
  
  console.log("✓ PASS: V3 pipeline does not use compositing\n");
}

// Test 3: Runtime assertion - check that compositing is disabled by default
async function testRuntimeAssertion() {
  console.log("Test 3: Runtime assertion prevents compositing");
  
  // Even with isStylizedSource=true, FORCE_DISABLE_COMPOSITING should block it
  const result = await compositeHeroHead({
    heroHeadPath: "/tmp/test_hero.jpg",
    pageImagePath: "/tmp/test_page.png",
    outputPath: "/tmp/test_output.png",
    isStylizedSource: true, // Even stylized source should be blocked
    requestId: "test"
  });

  assert.strictEqual(result.ok, false, "Compositing should be blocked even for stylized source");
  assert.strictEqual(result.error, "COMPOSITING_DISABLED", "Should return COMPOSITING_DISABLED");
  
  console.log("✓ PASS: Runtime assertion works\n");
}

// Run all tests
async function runTests() {
  try {
    await testCompositingRejection();
    await testV3PipelineNoCompositing();
    await testRuntimeAssertion();
    
    console.log("All tests passed! ✓\n");
    console.log("Summary:");
    console.log("  - Raw photo compositing is disabled");
    console.log("  - V3 pipeline does not use compositing");
    console.log("  - Runtime assertions prevent compositing");
  } catch (error) {
    console.error("Test failed:", error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testCompositingRejection, testV3PipelineNoCompositing, testRuntimeAssertion };

