#!/usr/bin/env node
// Regression test: verify /api/book always returns valid JSON on errors

const SERVER_URL = 'http://localhost:8787';

async function testErrorHandling() {
  console.log('Testing /api/book error handling...');
  
  // Test 1: Invalid request (malformed body)
  try {
    const res = await fetch(`${SERVER_URL}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{{{',
    });
    
    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text();
    
    console.log(`  Status: ${res.status}`);
    console.log(`  Content-Type: ${contentType}`);
    console.log(`  Body length: ${rawText.length}`);
    
    // Verify Content-Type includes application/json
    if (!contentType.includes('application/json')) {
      console.error(`  ❌ Content-Type should include application/json, got: ${contentType}`);
      process.exit(1);
    }
    
    // Verify body is valid JSON
    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      console.error(`  ❌ Body is not valid JSON: ${rawText.slice(0, 200)}`);
      process.exit(1);
    }
    
    // Verify required fields
    if (json.ok !== false) {
      console.error(`  ❌ Expected ok: false, got: ${json.ok}`);
      process.exit(1);
    }
    
    if (!json.error) {
      console.error(`  ❌ Missing error field`);
      process.exit(1);
    }
    
    if (!json.message) {
      console.error(`  ❌ Missing message field`);
      process.exit(1);
    }
    
    if (!json.requestId) {
      console.error(`  ❌ Missing requestId field`);
      process.exit(1);
    }
    
    console.log(`  ✅ Error response is valid JSON with required fields`);
    console.log(`     error: ${json.error}`);
    console.log(`     message: ${json.message.substring(0, 50)}...`);
    console.log(`     requestId: ${json.requestId}`);
    
  } catch (e) {
    console.error(`  ❌ Test failed: ${e.message}`);
    process.exit(1);
  }
  
  // Test 2: Missing required fields
  try {
    const res = await fetch(`${SERVER_URL}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    
    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text();
    
    // Verify it's JSON (even if it fails validation)
    if (!contentType.includes('application/json')) {
      console.error(`  ❌ Content-Type should include application/json, got: ${contentType}`);
      process.exit(1);
    }
    
    try {
      const json = JSON.parse(rawText);
      console.log(`  ✅ Missing fields response is valid JSON`);
    } catch (e) {
      console.error(`  ❌ Body is not valid JSON: ${rawText.slice(0, 200)}`);
      process.exit(1);
    }
    
  } catch (e) {
    console.error(`  ❌ Test failed: ${e.message}`);
    process.exit(1);
  }
  
  console.log('\n✅ All error handling tests passed');
}

// Check server health first
try {
  const healthRes = await fetch(`${SERVER_URL}/health`);
  if (!healthRes.ok) {
    console.error('❌ Server health check failed');
    process.exit(1);
  }
} catch (e) {
  console.error('❌ Server is not running at', SERVER_URL);
  console.error('   Start server with: cd server && npm run dev');
  process.exit(1);
}

testErrorHandling();


