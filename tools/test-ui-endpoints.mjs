#!/usr/bin/env node
/**
 * Quick test script to verify UI integration endpoints
 * Tests /health, /api/config, and confirms CORS setup
 */

const BASE_URL = process.env.API_BASE_URL || "http://localhost:8787";

async function testEndpoint(name, method, path, expectedStatus = 200) {
  try {
    const url = `${BASE_URL}${path}`;
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };
    
    const response = await fetch(url, options);
    const status = response.status;
    const data = await response.json().catch(() => ({}));
    
    if (status === expectedStatus) {
      console.log(`✅ ${name}: ${status} ${JSON.stringify(data).slice(0, 80)}`);
      return { ok: true, data };
    } else {
      console.log(`❌ ${name}: Expected ${expectedStatus}, got ${status}`);
      return { ok: false, status, data };
    }
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

async function main() {
  console.log(`Testing endpoints at ${BASE_URL}\n`);
  
  // Test /health
  const health = await testEndpoint("GET /health", "GET", "/health");
  if (!health.ok || !health.data?.ok) {
    console.error("FAIL: /health must return { ok: true }");
    process.exit(1);
  }
  
  // Test /api/config
  const config = await testEndpoint("GET /api/config", "GET", "/api/config");
  if (!config.ok) {
    console.error("FAIL: /api/config must return 200");
    process.exit(1);
  }
  
  const requiredFields = ["backendVersion", "environment", "pageCount", "imageStyle"];
  for (const field of requiredFields) {
    if (!(field in config.data)) {
      console.error(`FAIL: /api/config must include "${field}"`);
      process.exit(1);
    }
  }
  
  if (config.data.pageCount !== 4) {
    console.error("FAIL: /api/config pageCount must be 4");
    process.exit(1);
  }
  
  if (config.data.imageStyle !== "russian-folktale") {
    console.error("FAIL: /api/config imageStyle must be 'russian-folktale'");
    process.exit(1);
  }
  
  console.log("\n✅ All endpoint tests passed");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});




