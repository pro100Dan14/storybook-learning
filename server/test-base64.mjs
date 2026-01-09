/**
 * Base64 Decoding Utility Tests
 * 
 * Tests for decodeBase64ToBuffer function covering:
 * - Valid Base64
 * - Valid Base64URL
 * - Missing padding
 * - Whitespace
 * - Empty input (must fail)
 * - Garbage input (must fail)
 * 
 * Run with: node server/test-base64.mjs
 */

import { decodeBase64ToBuffer } from './utils/base64-decode.mjs';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    testsFailed++;
    console.error(`❌ ${name}: ${e.message}`);
  }
}

console.log('=== Base64 Decoding Tests ===\n');

// Test 1: Valid standard Base64
test('Valid standard Base64', () => {
  const result = decodeBase64ToBuffer('SGVsbG8gV29ybGQ=');
  if (result.toString() !== 'Hello World') {
    throw new Error(`Expected 'Hello World', got '${result.toString()}'`);
  }
  if (result.length !== 11) {
    throw new Error(`Expected length 11, got ${result.length}`);
  }
});

// Test 2: Valid Base64URL
test('Valid Base64URL', () => {
  const result = decodeBase64ToBuffer('SGVsbG8tV29ybGQ');
  if (result.toString() !== 'Hello-World') {
    throw new Error(`Expected 'Hello-World', got '${result.toString()}'`);
  }
  if (result.length !== 11) {
    throw new Error(`Expected length 11, got ${result.length}`);
  }
});

// Test 3: Missing padding
test('Missing padding (auto-fixed)', () => {
  const result = decodeBase64ToBuffer('SGVsbG8gV29ybGQ');
  if (result.toString() !== 'Hello World') {
    throw new Error(`Expected 'Hello World', got '${result.toString()}'`);
  }
});

// Test 4: Whitespace handling
test('Whitespace stripped', () => {
  const result = decodeBase64ToBuffer('  SGVsbG8gV29ybGQ=  \n\t');
  if (result.toString() !== 'Hello World') {
    throw new Error(`Expected 'Hello World', got '${result.toString()}'`);
  }
});

// Test 5: Empty input (must fail)
test('Empty input throws', () => {
  try {
    decodeBase64ToBuffer('');
    throw new Error('Expected error for empty input');
  } catch (e) {
    if (!e.message.includes('INVALID_BASE64')) {
      throw new Error(`Expected INVALID_BASE64 error, got: ${e.message}`);
    }
  }
});

// Test 6: Whitespace-only input (must fail)
test('Whitespace-only input throws', () => {
  try {
    decodeBase64ToBuffer('   \n\t  ');
    throw new Error('Expected error for whitespace-only input');
  } catch (e) {
    if (!e.message.includes('INVALID_BASE64')) {
      throw new Error(`Expected INVALID_BASE64 error, got: ${e.message}`);
    }
  }
});

// Test 7: Garbage input (must fail)
test('Garbage input throws', () => {
  try {
    decodeBase64ToBuffer('!!!@@@###$$$');
    throw new Error('Expected error for garbage input');
  } catch (e) {
    if (!e.message.includes('INVALID_BASE64')) {
      throw new Error(`Expected INVALID_BASE64 error, got: ${e.message}`);
    }
  }
});

// Test 8: Invalid characters (must fail)
test('Invalid characters throw', () => {
  try {
    decodeBase64ToBuffer('!!!@@@###$$$%%%');
    throw new Error('Expected error for invalid characters');
  } catch (e) {
    if (!e.message.includes('INVALID_BASE64')) {
      throw new Error(`Expected INVALID_BASE64 error, got: ${e.message}`);
    }
  }
});

// Test 8b: Invalid characters mixed with valid Base64 (must fail)
test('Invalid characters mixed with valid Base64 throw', () => {
  try {
    decodeBase64ToBuffer('SGVsbG8!@#V29ybGQ');
    throw new Error('Expected error for invalid characters in Base64');
  } catch (e) {
    if (!e.message.includes('INVALID_BASE64')) {
      throw new Error(`Expected INVALID_BASE64 error, got: ${e.message}`);
    }
  }
});

// Test 9: Non-string input (must fail)
test('Non-string input throws', () => {
  try {
    decodeBase64ToBuffer(null);
    throw new Error('Expected error for non-string input');
  } catch (e) {
    if (!e.message.includes('INVALID_BASE64')) {
      throw new Error(`Expected INVALID_BASE64 error, got: ${e.message}`);
    }
  }
});

// Test 10: Base64URL with underscores
test('Base64URL with underscores', () => {
  const result = decodeBase64ToBuffer('SGVsbG8_V29ybGQ');
  // Underscore becomes slash in Base64, so 'SGVsbG8_V29ybGQ' -> 'SGVsbG8/V29ybGQ==' -> 'Hello?World'
  // The '?' is byte 0x3F (63), which is '/' in Base64 encoding
  const expected = Buffer.from('SGVsbG8/V29ybGQ==', 'base64').toString();
  if (result.toString() !== expected) {
    throw new Error(`Expected '${expected}', got '${result.toString()}'`);
  }
  if (result.length !== 11) {
    throw new Error(`Expected length 11, got ${result.length}`);
  }
});

console.log(`\n=== Test Summary ===`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
}

process.exit(0);

