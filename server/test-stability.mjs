import fs from "fs";
import path from "path";
import { readPhotoBase64, getPhotoMimeType } from "./utils/photo-reader.mjs";

const SERVER_URL = "http://localhost:8787";

console.log("=== Stability Test: Contract Behavior ===\n");

// Check health
console.log("1. Checking server health...");
try {
  const healthRes = await fetch(`${SERVER_URL}/health`);
  if (!healthRes.ok) {
    console.error("❌ Server health check failed");
    process.exit(1);
  }
  console.log("✅ Server is healthy");
} catch (e) {
  console.error("❌ Server is not running at", SERVER_URL);
  console.error("   Start server with: cd server && npm run dev");
  process.exit(1);
}

// Check GEMINI_API_KEY via /debug/config
console.log("2. Checking GEMINI_API_KEY...");
try {
  const configRes = await fetch(`${SERVER_URL}/debug/config`);
  if (!configRes.ok) {
    console.error("❌ Config endpoint failed");
    process.exit(1);
  }
  const config = await configRes.json();
  if (!config.hasGeminiApiKey) {
    console.error("❌ GEMINI_API_KEY is missing");
    console.error("   Set GEMINI_API_KEY in server/.env and restart server");
    process.exit(1);
  }
  console.log("✅ GEMINI_API_KEY is configured\n");
} catch (e) {
  console.error("❌ Failed to check config:", e.message);
  process.exit(1);
}

// Read photo
let photoBase64;
let photoMimeType;
try {
  photoBase64 = readPhotoBase64();
  photoMimeType = getPhotoMimeType();
  console.log("✅ Photo file loaded\n");
} catch (e) {
  console.error(`❌ Failed to load photo: ${e.message}`);
  process.exit(1);
}

// TEST A: Baseline (no flags)
console.log("=".repeat(60));
console.log("TEST A: Baseline (No Test Flags)");
console.log("=".repeat(60));

const testBaseline = async () => {
  console.log("\nRunning /api/book (baseline, no test flags)...");
  
  const requestBody = {
    pages: 4, // Use fewer pages for faster test
    photoBase64: photoBase64,
    photoMimeType: photoMimeType,
  };

  try {
    const res = await fetch(`${SERVER_URL}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();
    
    // Assertions for baseline
    let passed = true;
    
    if (res.status !== 200) {
      console.error(`❌ Expected HTTP 200, got ${res.status}`);
      passed = false;
    }
    
    if (data.ok !== true) {
      console.error(`❌ Expected ok === true, got ${data.ok}`);
      passed = false;
    }
    
    if (!data.bookId) {
      console.error(`❌ Expected bookId to exist, got ${data.bookId}`);
      passed = false;
    }
    
    // Baseline should NOT have identity fallback
    const hasIdentityFallback = data.warnings?.some(w => w.code === "IDENTITY_FALLBACK") || data.identityFallbackUsed;
    if (hasIdentityFallback) {
      console.error(`❌ Baseline test should NOT have identity fallback`);
      passed = false;
    }
    
    if (passed) {
      console.log("✅ Response contract: PASS");
      console.log(`   - ok: ${data.ok}`);
      console.log(`   - bookId: ${data.bookId}`);
      console.log(`   - identityFallbackUsed: ${data.identityFallbackUsed}`);
      console.log(`   - warnings: ${JSON.stringify(data.warnings || [])}`);
      
      // Verify artifacts exist
      const bookDir = path.join(process.cwd(), "jobs", data.bookId);
      const heroPath = path.join(bookDir, "hero.jpg");
      const reportHtmlPath = path.join(bookDir, "report.html");
      const reportJsonPath = path.join(bookDir, "report.json");
      
      const artifacts = {
        hero: fs.existsSync(heroPath),
        reportHtml: fs.existsSync(reportHtmlPath),
        reportJson: fs.existsSync(reportJsonPath)
      };
      
      const allExist = artifacts.hero && artifacts.reportHtml && artifacts.reportJson;
      
      if (allExist) {
        console.log("✅ Artifacts exist: PASS");
        console.log(`   - hero.jpg: ${artifacts.hero}`);
        console.log(`   - report.html: ${artifacts.reportHtml}`);
        console.log(`   - report.json: ${artifacts.reportJson}`);
        
        // Check report.html references
        const reportHtml = fs.readFileSync(reportHtmlPath, "utf8");
        const hasHeroRef = reportHtml.includes("hero") || reportHtml.includes("Hero Reference");
        const hasPagesRef = reportHtml.includes("Page") || reportHtml.includes("page");
        
        if (hasHeroRef && hasPagesRef) {
          console.log("✅ Report.html references: PASS");
          console.log(`   - References hero: ${hasHeroRef}`);
          console.log(`   - References pages: ${hasPagesRef}`);
        } else {
          console.log("⚠️  Report.html may be missing some references");
        }
      } else {
        console.error("❌ Artifacts missing: FAIL");
        console.error(`   - hero.jpg: ${artifacts.hero}`);
        console.error(`   - report.html: ${artifacts.reportHtml}`);
        console.error(`   - report.json: ${artifacts.reportJson}`);
        passed = false;
      }
      
      return passed;
    } else {
      console.error("❌ Response contract: FAIL");
      console.error(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (e) {
    console.error("❌ Request failed:", e.message);
    return false;
  }
};

// TEST B: Identity failure non-blocking
console.log("\n" + "=".repeat(60));
console.log("TEST B: Identity Failure Non-Blocking");
console.log("=".repeat(60));

const testIdentityFail = async () => {
  console.log("\nRunning /api/book with _testFlags.forceIdentityFail=true...");
  
  const requestBody = {
    pages: 4, // Use fewer pages for faster test
    photoBase64: photoBase64,
    photoMimeType: photoMimeType,
    _testFlags: {
      forceIdentityFail: true
    }
  };

  try {
    const res = await fetch(`${SERVER_URL}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();
    
    // Assertions for identity fail
    let passed = true;
    
    if (res.status !== 200) {
      console.error(`❌ Expected HTTP 200, got ${res.status}`);
      passed = false;
    }
    
    if (data.ok !== true) {
      console.error(`❌ Expected ok === true, got ${data.ok}`);
      passed = false;
    }
    
    if (!data.bookId) {
      console.error(`❌ Expected bookId to exist, got ${data.bookId}`);
      passed = false;
    }
    
    // Check warnings for identity fallback
    const hasIdentityFallback = data.warnings?.some(w => w.code === "IDENTITY_FALLBACK") || data.identityFallbackUsed;
    if (!hasIdentityFallback) {
      console.error(`❌ Expected identityFallbackUsed or IDENTITY_FALLBACK warning`);
      passed = false;
    }
    
    if (passed) {
      console.log("✅ Response contract: PASS");
      console.log(`   - ok: ${data.ok}`);
      console.log(`   - bookId: ${data.bookId}`);
      console.log(`   - identityFallbackUsed: ${data.identityFallbackUsed}`);
      console.log(`   - warnings: ${JSON.stringify(data.warnings || [])}`);
      
      // Verify artifacts exist
      const bookDir = path.join(process.cwd(), "jobs", data.bookId);
      const heroPath = path.join(bookDir, "hero.jpg");
      const reportHtmlPath = path.join(bookDir, "report.html");
      const reportJsonPath = path.join(bookDir, "report.json");
      
      const artifacts = {
        hero: fs.existsSync(heroPath),
        reportHtml: fs.existsSync(reportHtmlPath),
        reportJson: fs.existsSync(reportJsonPath)
      };
      
      const allExist = artifacts.hero && artifacts.reportHtml && artifacts.reportJson;
      
      if (allExist) {
        console.log("✅ Artifacts exist: PASS");
        console.log(`   - hero.jpg: ${artifacts.hero}`);
        console.log(`   - report.html: ${artifacts.reportHtml}`);
        console.log(`   - report.json: ${artifacts.reportJson}`);
      } else {
        console.error("❌ Artifacts missing: FAIL");
        console.error(`   - hero.jpg: ${artifacts.hero}`);
        console.error(`   - report.html: ${artifacts.reportHtml}`);
        console.error(`   - report.json: ${artifacts.reportJson}`);
        passed = false;
      }
      
      return passed;
    } else {
      console.error("❌ Response contract: FAIL");
      console.error(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (e) {
    console.error("❌ Request failed:", e.message);
    return false;
  }
};

// TEST C: Image failure is blocking
console.log("\n" + "=".repeat(60));
console.log("TEST C: Image Failure is Blocking");
console.log("=".repeat(60));

const testImageFail = async () => {
  console.log("\nRunning /api/book with _testFlags.forceImageFail=true...");
  
  const requestBody = {
    pages: 2, // Use minimal pages for faster test
    photoBase64: photoBase64,
    photoMimeType: photoMimeType,
    _testFlags: {
      forceImageFail: true
    }
  };

  try {
    const res = await fetch(`${SERVER_URL}/api/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();
    
    // Assertions for image fail
    let passed = true;
    
    if (res.status !== 500) {
      console.error(`❌ Expected HTTP 500, got ${res.status}`);
      passed = false;
    }
    
    if (data.ok !== false) {
      console.error(`❌ Expected ok === false, got ${data.ok}`);
      passed = false;
    }
    
    if (!data.error || data.error !== "BOOK_ERROR") {
      console.error(`❌ Expected error: "BOOK_ERROR", got ${data.error}`);
      passed = false;
    }
    
    // Check that error message mentions FORCE_IMAGE_FAIL or IMAGE_ERROR
    const errorMessage = data.message || "";
    const hasImageError = errorMessage.includes("FORCE_IMAGE_FAIL") || 
                         errorMessage.includes("IMAGE_ERROR") ||
                         errorMessage.includes("image generation");
    if (!hasImageError) {
      console.error(`❌ Expected error message to mention image failure, got: ${errorMessage.substring(0, 100)}`);
      passed = false;
    }
    
    if (passed) {
      console.log("✅ Error response contract: PASS");
      console.log(`   - HTTP status: ${res.status}`);
      console.log(`   - ok: ${data.ok}`);
      console.log(`   - error: ${data.error}`);
      console.log(`   - message: ${data.message?.substring(0, 100)}...`);
      return true;
    } else {
      console.error("❌ Error response contract: FAIL");
      console.error(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (e) {
    console.error("❌ Request failed:", e.message);
    return false;
  }
};

// Run tests
const runTests = async () => {
  console.log("Running all tests sequentially (no server restart required)...\n");
  
  const testA = await testBaseline();
  const testB = await testIdentityFail();
  const testC = await testImageFail();
  
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));
  console.log(`TEST A (Baseline): ${testA ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`TEST B (Identity Fail Non-Blocking): ${testB ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`TEST C (Image Fail Blocking): ${testC ? "✅ PASS" : "❌ FAIL"}`);
  
  const allPassed = testA && testB && testC;
  process.exit(allPassed ? 0 : 1);
};

runTests();


