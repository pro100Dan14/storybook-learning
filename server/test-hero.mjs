import { readPhotoBase64, getPhotoMimeType, getPhotoSourceInfo } from "./utils/photo-reader.mjs";

const SERVER_URL = "http://localhost:8787";

console.log("=== Testing /api/hero endpoint ===");
console.log(`Photo source: ${getPhotoSourceInfo()}`);

// Check health
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

// Read photo
let photoBase64;
let photoMimeType;
try {
  photoBase64 = readPhotoBase64();
  photoMimeType = getPhotoMimeType();
  console.log("✅ Photo file loaded");
} catch (e) {
  console.error(`❌ Failed to load photo: ${e.message}`);
  process.exit(1);
}

// Step 1: Get identity
console.log("1. Getting identity from /api/identity...");
let identityResponse;
try {
  const res = await fetch(`${SERVER_URL}/api/identity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: photoBase64,
      mimeType: photoMimeType
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ /api/identity HTTP ${res.status}`);
    console.error(errorText);
    process.exit(1);
  }

  identityResponse = await res.json();
  if (!identityResponse.identity || typeof identityResponse.identity !== "object") {
    console.error("❌ /api/identity did not return valid identity object");
    process.exit(1);
  }
  console.log("✅ Identity obtained");
} catch (e) {
  console.error("❌ Identity request failed:", e.message);
  process.exit(1);
}

// Step 2: Generate hero reference
console.log("2. Generating hero reference from /api/hero...");
let heroResponse;
let heroErrorInfo = null;
try {
  const res = await fetch(`${SERVER_URL}/api/hero`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: identityResponse.identity,
      photoBase64: photoBase64,
      photoMimeType: photoMimeType
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ /api/hero HTTP ${res.status}`);
    try {
      heroErrorInfo = JSON.parse(errorText);
      console.error(JSON.stringify(heroErrorInfo, null, 2));
    } catch {
      console.error(errorText);
      heroErrorInfo = { error: errorText };
    }
    // Continue to summary instead of exiting immediately
  }

  if (heroErrorInfo) {
    heroResponse = heroErrorInfo;
  } else {
    heroResponse = await res.json();
    
    if (!heroResponse.ok) {
      console.error("❌ Hero response ok is not true");
      heroErrorInfo = heroResponse;
    } else {
      console.log("✅ Hero response ok is true");
      
      if (!heroResponse.hero || typeof heroResponse.hero !== "object") {
        console.error("❌ Hero response missing 'hero' object");
        heroErrorInfo = { error: "Missing hero object" };
      } else {
        console.log("✅ Hero response has 'hero' object");
        
        if (!heroResponse.hero.dataUrl || typeof heroResponse.hero.dataUrl !== "string") {
          console.error("❌ Hero response missing 'hero.dataUrl'");
          heroErrorInfo = { error: "Missing hero.dataUrl" };
        } else {
          console.log("✅ Hero response has 'hero.dataUrl'");
          
          if (!heroResponse.hero.dataUrl.startsWith("data:image/")) {
            console.error("❌ Hero dataUrl is not a valid data URL");
            heroErrorInfo = { error: "Invalid dataUrl format" };
          } else {
            console.log("✅ Hero dataUrl is valid");
            
            if (!heroResponse.requestId) {
              console.error("❌ Hero response missing 'requestId'");
              heroErrorInfo = { error: "Missing requestId" };
            } else {
              console.log("✅ Hero response has 'requestId':", heroResponse.requestId);
            }
          }
        }
      }
    }
  }
} catch (e) {
  console.error("❌ Hero request failed:", e.message);
  heroErrorInfo = { error: e.message };
  heroResponse = heroErrorInfo;
}

// Step 3: Test /api/image with hero reference (if hero was successful)
let imageSuccess = false;
let imageErrorInfo = null;

if (!heroErrorInfo && heroResponse.ok && heroResponse.hero?.dataUrl) {
  console.log("3. Testing /api/image with hero reference...");
  try {
    const res = await fetch(`${SERVER_URL}/api/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: identityResponse.identity,
        photoBase64: photoBase64,
        photoMimeType: photoMimeType,
        heroBase64: heroResponse.hero.dataUrl,
        heroMimeType: heroResponse.hero.mimeType,
        pageText: "Test page text for hero reference"
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ /api/image HTTP ${res.status}`);
      try {
        imageErrorInfo = JSON.parse(errorText);
        console.error(JSON.stringify(imageErrorInfo, null, 2));
      } catch {
        console.error(errorText);
        imageErrorInfo = { error: errorText };
      }
    } else {
      const imageResponse = await res.json();
      
      if (!imageResponse.dataUrl || typeof imageResponse.dataUrl !== "string") {
        console.error("❌ Image response missing 'dataUrl'");
        imageErrorInfo = { error: "Missing dataUrl" };
      } else if (!imageResponse.dataUrl.startsWith("data:image/")) {
        console.error("❌ Image dataUrl is not a valid data URL");
        imageErrorInfo = { error: "Invalid dataUrl format" };
      } else {
        console.log("✅ Image response has valid 'dataUrl'");
        imageSuccess = true;
        
        if (!imageResponse.requestId) {
          console.error("❌ Image response missing 'requestId'");
        } else {
          console.log("✅ Image response has 'requestId':", imageResponse.requestId);
        }
      }
    }
  } catch (e) {
    console.error("❌ Image request failed:", e.message);
    imageErrorInfo = { error: e.message };
  }
} else {
  console.log("3. Skipping /api/image test (hero reference not available)");
}

console.log("");
console.log("=== Test Summary ===");
console.log(`Photo used: ${getPhotoSourceInfo()}`);

const heroSuccess = !heroErrorInfo && heroResponse.ok && heroResponse.hero?.dataUrl;
console.log(`hero: ${heroSuccess ? "success" : "failure"}`);
if (heroSuccess) {
  console.log(`  Mode: ${heroResponse.hero?.isFallback ? "fallback (face-avoiding)" : "standard"}`);
} else {
  const errorMsg = heroErrorInfo?.error || heroResponse?.error || "unknown error";
  console.log(`  Error: ${errorMsg}`);
  if (heroErrorInfo?.finishReason || heroResponse?.finishReason) {
    console.log(`  finishReason: ${heroErrorInfo?.finishReason || heroResponse?.finishReason}`);
  }
}

console.log(`api/image with hero: ${imageSuccess ? "success" : "failure"}`);
if (!imageSuccess && heroSuccess) {
  const errorMsg = imageErrorInfo?.error || "unknown error";
  console.log(`  Error: ${errorMsg}`);
  if (imageErrorInfo?.finishReason) {
    console.log(`  finishReason: ${imageErrorInfo.finishReason}`);
  }
} else if (!heroSuccess) {
  console.log("  (skipped - hero reference not available)");
}

console.log("");

if (heroSuccess && imageSuccess) {
  console.log("=== All hero tests passed ===");
} else {
  console.log("=== Tests completed (some failures) ===");
  process.exit(1);
}

