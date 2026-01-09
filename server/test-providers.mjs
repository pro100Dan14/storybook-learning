// Test provider abstraction layer
// Tests dummy providers to ensure deterministic outputs

import fs from "fs";

const SERVER_URL = "http://localhost:8787";
const PHOTO_FILE = "/tmp/child_base64.txt";

console.log("=== Testing Provider Abstraction Layer ===");
console.log("Using PROVIDER_TEXT=dummy and PROVIDER_IMAGE=dummy");

// Check health
try {
  const healthRes = await fetch(`${SERVER_URL}/health`);
  if (!healthRes.ok) {
    console.error("❌ Server health check failed");
    process.exit(1);
  }
  const healthData = await healthRes.json();
  console.log("✅ Server is healthy, requestId:", healthData.requestId);
} catch (e) {
  console.error("❌ Server is not running at", SERVER_URL);
  console.error("   Start server with: cd server && PROVIDER_TEXT=dummy PROVIDER_IMAGE=dummy npm run dev");
  process.exit(1);
}

// Read photo if available
let photoBase64 = null;
if (fs.existsSync(PHOTO_FILE)) {
  photoBase64 = fs.readFileSync(PHOTO_FILE, "utf8").trim();
  console.log("✅ Photo file exists");
} else {
  // Create a minimal test photo (1x1 PNG base64)
  photoBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  console.log("⚠️  Using minimal test photo (1x1 PNG)");
}

// Test 1: /api/identity with dummy provider
console.log("\n1. Testing /api/identity with PROVIDER_TEXT=dummy...");
try {
  const res = await fetch(`${SERVER_URL}/api/identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: photoBase64,
      mimeType: "image/png"
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("❌ /api/identity failed:", res.status, errorText);
    process.exit(1);
  }

  const data = await res.json();
  
  // Verify deterministic output structure
  if (!data.identity || typeof data.identity !== "object") {
    console.error("❌ /api/identity: Missing or invalid identity object");
    process.exit(1);
  }
  
  if (!data.identity.child_id || !data.identity.child_id.startsWith("dummy_")) {
    console.error("❌ /api/identity: child_id should start with 'dummy_' for dummy provider");
    console.error("   Got:", data.identity.child_id);
    process.exit(1);
  }
  
  console.log("✅ /api/identity: SUCCESS");
  console.log("   child_id:", data.identity.child_id);
  console.log("   age_range:", data.identity.age_range);
} catch (e) {
  console.error("❌ /api/identity exception:", e.message);
  process.exit(1);
}

// Test 2: /api/image with dummy provider
console.log("\n2. Testing /api/image with PROVIDER_IMAGE=dummy...");
try {
  const identity = {
    child_id: "test_001",
    age_range: "5-7",
    skin_tone: "light",
    hair: { color: "brown", length: "medium", style: "straight" },
    eyes: { color: "brown", shape: "round" },
    face: { shape: "oval", features: ["small nose", "round cheeks"] },
    distinctive_marks: [],
    must_keep_same: ["Keep the same face", "Keep the same hair color"],
    must_not: ["Do not change hair color"],
    short_visual_summary: "A child with brown hair and brown eyes",
    negative_prompt: "No modern objects"
  };

  const res = await fetch(`${SERVER_URL}/api/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageText: "Test page text",
      identity: identity,
      photoBase64: photoBase64,
      photoMimeType: "image/png"
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("❌ /api/image failed:", res.status, errorText);
    process.exit(1);
  }

  const data = await res.json();
  
  // Verify deterministic output
  if (!data.mimeType || !data.dataUrl) {
    console.error("❌ /api/image: Missing mimeType or dataUrl");
    process.exit(1);
  }
  
  if (data.mimeType !== "image/png") {
    console.error("❌ /api/image: Expected mimeType 'image/png', got:", data.mimeType);
    process.exit(1);
  }
  
  if (!data.dataUrl.startsWith("data:image/png;base64,")) {
    console.error("❌ /api/image: Invalid dataUrl format");
    process.exit(1);
  }
  
  console.log("✅ /api/image: SUCCESS");
  console.log("   mimeType:", data.mimeType);
  console.log("   dataUrl length:", data.dataUrl.length);
} catch (e) {
  console.error("❌ /api/image exception:", e.message);
  process.exit(1);
}

// Test 3: /api/book with dummy providers (minimal test)
console.log("\n3. Testing /api/book with PROVIDER_TEXT=dummy and PROVIDER_IMAGE=dummy...");
try {
  const res = await fetch(`${SERVER_URL}/api/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test Hero",
      theme: "test theme",
      pages: 2, // Minimal pages for faster test
      photoBase64: photoBase64,
      photoMimeType: "image/png"
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("❌ /api/book failed:", res.status, errorText);
    process.exit(1);
  }

  const data = await res.json();
  
  // Verify response structure
  if (!data.ok || !data.bookId) {
    console.error("❌ /api/book: Missing ok or bookId");
    process.exit(1);
  }
  
  if (!data.pages || !Array.isArray(data.pages)) {
    console.error("❌ /api/book: Missing or invalid pages array");
    process.exit(1);
  }
  
  // Verify report paths exist
  const reportJsonPath = `server/jobs/${data.bookId}/report.json`;
  const reportHtmlPath = `server/jobs/${data.bookId}/report.html`;
  
  if (!fs.existsSync(reportJsonPath)) {
    console.error("❌ /api/book: report.json not found at", reportJsonPath);
    process.exit(1);
  }
  
  if (!fs.existsSync(reportHtmlPath)) {
    console.error("❌ /api/book: report.html not found at", reportHtmlPath);
    process.exit(1);
  }
  
  console.log("✅ /api/book: SUCCESS");
  console.log("   bookId:", data.bookId);
  console.log("   pages generated:", data.pages.length);
  console.log("   report.json exists:", fs.existsSync(reportJsonPath));
  console.log("   report.html exists:", fs.existsSync(reportHtmlPath));
} catch (e) {
  console.error("❌ /api/book exception:", e.message);
  process.exit(1);
}

console.log("\n✅ All provider tests passed!");
console.log("\nSummary:");
console.log("- /api/identity returns deterministic dummy output");
console.log("- /api/image returns deterministic dummy output");
console.log("- /api/book completes and generates reports");

