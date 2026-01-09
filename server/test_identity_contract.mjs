import fs from "fs";

const SERVER_URL = "http://localhost:8787";
const PHOTO_FILE = "/tmp/child_base64.txt";

console.log("=== Testing /api/identity contract ===");

// Check health
try {
  const healthRes = await fetch(`${SERVER_URL}/health`);
  if (!healthRes.ok) {
    console.error("❌ Server health check failed");
    process.exit(1);
  }
  const healthData = await healthRes.json();
  if (!healthData.requestId) {
    console.error("❌ Health response missing requestId");
    process.exit(1);
  }
  console.log("✅ Server is healthy, requestId:", healthData.requestId);
} catch (e) {
  console.error("❌ Server is not running at", SERVER_URL);
  console.error("   Start server with: cd server && npm run dev");
  process.exit(1);
}

// Read photo
if (!fs.existsSync(PHOTO_FILE)) {
  console.error(`❌ Photo file not found: ${PHOTO_FILE}`);
  process.exit(1);
}
console.log("✅ Photo file exists");

const photoBase64 = fs.readFileSync(PHOTO_FILE, "utf8").trim();

// Generate identity
console.log("2. Calling /api/identity...");
let response;
try {
  const res = await fetch(`${SERVER_URL}/api/identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: photoBase64,
      mimeType: "image/jpeg"
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ HTTP ${res.status}`);
    try {
      const errorJson = JSON.parse(errorText);
      console.error(JSON.stringify(errorJson, null, 2));
    } catch {
      console.error(errorText);
    }
    process.exit(1);
  }

  response = await res.json();
} catch (e) {
  console.error("❌ Request failed:", e.message);
  process.exit(1);
}

// Validate response structure
console.log("3. Validating response structure...");

if (!response.identity || typeof response.identity !== "object") {
  console.error("❌ Response missing 'identity' object");
  process.exit(1);
}
console.log("✅ Response has 'identity' object");

if (!response.identity_text || typeof response.identity_text !== "string") {
  console.error("❌ Response missing 'identity_text' string");
  process.exit(1);
}
console.log("✅ Response has 'identity_text' string");

if (!response.requestId || typeof response.requestId !== "string") {
  console.error("❌ Response missing 'requestId'");
  process.exit(1);
}
console.log("✅ Response has 'requestId':", response.requestId);

// Validate identity structure (minimal checks)
const identity = response.identity;
const requiredFields = [
  "child_id", "age_range", "skin_tone", "hair", "eyes", "face",
  "distinctive_marks", "must_keep_same", "must_not",
  "short_visual_summary", "negative_prompt"
];

for (const field of requiredFields) {
  if (!(field in identity)) {
    console.error(`❌ Identity missing required field: ${field}`);
    process.exit(1);
  }
}
console.log("✅ Identity has all required fields");

// Validate content quality
if (!Array.isArray(identity.must_keep_same) || identity.must_keep_same.length < 3) {
  console.error(`❌ Identity must_keep_same must be array with at least 3 items, got: ${identity.must_keep_same?.length || 0}`);
  process.exit(1);
}
console.log(`✅ Identity must_keep_same has ${identity.must_keep_same.length} items`);

if (!identity.short_visual_summary || identity.short_visual_summary.trim().length < 40) {
  console.error(`❌ Identity short_visual_summary must be at least 40 chars, got: ${identity.short_visual_summary?.length || 0}`);
  process.exit(1);
}
console.log(`✅ Identity short_visual_summary has ${identity.short_visual_summary.length} characters`);

if (!identity.negative_prompt || identity.negative_prompt.trim().length === 0) {
  console.error("❌ Identity negative_prompt must be non-empty");
  process.exit(1);
}
console.log("✅ Identity negative_prompt is non-empty");

if (!identity.hair?.color || !identity.hair?.length || !identity.hair?.style) {
  console.error("❌ Identity hair missing required fields");
  process.exit(1);
}
console.log("✅ Identity hair has all required fields");

if (!identity.eyes?.color || !identity.eyes?.shape) {
  console.error("❌ Identity eyes missing required fields");
  process.exit(1);
}
console.log("✅ Identity eyes has all required fields");

if (!identity.face?.shape || !Array.isArray(identity.face?.features) || identity.face.features.length < 2) {
  console.error("❌ Identity face missing required fields or features array too short");
  process.exit(1);
}
console.log(`✅ Identity face has shape and ${identity.face.features.length} features`);

// Validate identity_text content
if (response.identity_text.length < 40) {
  console.error(`❌ identity_text too short: ${response.identity_text.length} chars`);
  process.exit(1);
}
console.log(`✅ identity_text has ${response.identity_text.length} characters`);

if (!response.identity_text.includes(identity.short_visual_summary)) {
  console.error("❌ identity_text should include short_visual_summary");
  process.exit(1);
}
console.log("✅ identity_text includes short_visual_summary");

console.log("");
console.log("=== All identity contract tests passed ===");
console.log(`Identity child_id: ${identity.child_id}`);
console.log(`Identity text preview: ${response.identity_text.substring(0, 80)}...`);



