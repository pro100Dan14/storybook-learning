#!/usr/bin/env node
/**
 * Regression test for FaceID JSON parsing with noisy stdout
 */

import { extractJsonFromStdout } from '../server/utils/face-id/index.mjs';
import assert from 'assert';

function testNoisyStdout() {
  console.log('Test: Noisy stdout with JSON at end');
  
  const noisyStdout = `Applied providers: ['CPUExecutionProvider']
find model: /path/to/model.onnx
Some warning message
{"ok": true, "similarity": 0.45, "face_detected_ref": true, "face_detected_candidate": true}`;
  
  const result = extractJsonFromStdout(noisyStdout);
  
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.similarity, 0.45);
  assert.strictEqual(result.face_detected_ref, true);
  assert.strictEqual(result.face_detected_candidate, true);
  
  console.log('  ✓ Parsed JSON correctly from noisy stdout');
  return true;
}

function testMultipleJsonLines() {
  console.log('Test: Multiple JSON lines, take last');
  
  const multiJsonStdout = `{"ok": false, "error": "OLD_ERROR"}
{"ok": true, "similarity": 0.50, "face_detected_ref": true}`;
  
  const result = extractJsonFromStdout(multiJsonStdout);
  
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.similarity, 0.50);
  
  console.log('  ✓ Took last JSON line correctly');
  return true;
}

function testNoJsonLine() {
  console.log('Test: No JSON line in stdout');
  
  const noJsonStdout = `Applied providers: ['CPUExecutionProvider']
find model: /path/to/model.onnx
Some warning message`;
  
  try {
    extractJsonFromStdout(noJsonStdout);
    console.log('  ✗ Should have thrown error');
    return false;
  } catch (error) {
    if (error.message.includes('FACE_ID_PARSE_FAILED')) {
      console.log('  ✓ Correctly threw FACE_ID_PARSE_FAILED');
      return true;
    } else {
      console.log(`  ✗ Wrong error: ${error.message}`);
      return false;
    }
  }
}

function testEmptyStdout() {
  console.log('Test: Empty stdout');
  
  try {
    extractJsonFromStdout('');
    console.log('  ✗ Should have thrown error');
    return false;
  } catch (error) {
    if (error.message.includes('FACE_ID_PARSE_FAILED')) {
      console.log('  ✓ Correctly threw FACE_ID_PARSE_FAILED');
      return true;
    } else {
      console.log(`  ✗ Wrong error: ${error.message}`);
      return false;
    }
  }
}

function testWhitespaceHandling() {
  console.log('Test: Whitespace handling');
  
  const whitespaceStdout = `   \n  \n  {"ok": true, "test": "value"}  \n  `;
  
  const result = extractJsonFromStdout(whitespaceStdout);
  
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.test, 'value');
  
  console.log('  ✓ Handled whitespace correctly');
  return true;
}

// Run all tests
console.log('FaceID JSON Parsing Regression Tests');
console.log('=====================================');

let allPassed = true;

try {
  allPassed = testNoisyStdout() && allPassed;
  allPassed = testMultipleJsonLines() && allPassed;
  allPassed = testNoJsonLine() && allPassed;
  allPassed = testEmptyStdout() && allPassed;
  allPassed = testWhitespaceHandling() && allPassed;
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}

console.log('\n=====================================');
if (allPassed) {
  console.log('✓ All parsing tests passed');
  process.exit(0);
} else {
  console.log('✗ Some parsing tests failed');
  process.exit(1);
}




