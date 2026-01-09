#!/usr/bin/env node
/**
 * Test runner for FaceID evaluation harness
 * Tests evaluator behavior without requiring real images
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Create temporary test fixtures
const testFixturesDir = path.join(__dirname, '.test_fixtures');
const testGoodDir = path.join(testFixturesDir, 'good');
const testBadDir = path.join(testFixturesDir, 'bad');
const testRefPath = path.join(testFixturesDir, 'reference.jpg');
const testMockPath = path.join(__dirname, '.test_mock.mjs');

// Cleanup function
function cleanup() {
  if (fs.existsSync(testFixturesDir)) {
    fs.rmSync(testFixturesDir, { recursive: true, force: true });
  }
  if (fs.existsSync(testMockPath)) {
    fs.unlinkSync(testMockPath);
  }
}

// Create mock implementation
function createMock() {
  const mockCode = `// Mock FaceID implementation for testing
import fs from 'fs';
import path from 'path';

export async function validateFaceDetected(imagePath) {
  const fileName = path.basename(imagePath);
  
  // Simulate no face for specific test cases
  if (fileName.includes('no-face')) {
    return { ok: false, face_detected: false, error: 'NO_FACE_DETECTED', message: 'No face detected' };
  }
  
  return { ok: true, face_detected: true };
}

export async function extractReferenceEmbedding(refPath, outputPath) {
  // Simulate successful extraction
  fs.writeFileSync(outputPath, JSON.stringify({ ok: true, embedding_dim: 512 }));
  return { ok: true, embedding_dim: 512 };
}

export async function checkSimilarity(refPath, candidatePath) {
  const fileName = path.basename(candidatePath);
  const dir = path.dirname(candidatePath);
  const set = dir.includes('good') ? 'good' : 'bad';
  
  // Simulate different scores based on filename
  let similarity = 0.5; // default
  
  if (set === 'good') {
    if (fileName.includes('pass')) {
      similarity = 0.45; // Above threshold 0.32
    } else if (fileName.includes('fail')) {
      similarity = 0.25; // Below threshold 0.32
    }
  } else if (set === 'bad') {
    similarity = 0.15; // Below threshold (should pass for bad set)
  }
  
  return {
    ok: true,
    similarity,
    face_detected_ref: true,
    face_detected_candidate: true
  };
}
`;
  fs.writeFileSync(testMockPath, mockCode);
}

// Test cases
const tests = [
  {
    name: 'Good set: one passes, one fails',
    setup: () => {
      fs.mkdirSync(testGoodDir, { recursive: true });
      fs.writeFileSync(path.join(testGoodDir, 'good-pass.jpg'), 'fake image');
      fs.writeFileSync(path.join(testGoodDir, 'good-fail.jpg'), 'fake image');
      fs.writeFileSync(testRefPath, 'fake reference');
    },
    expected: {
      totalGood: 2,
      goodPassed: 1,
      goodFailed: 1
    }
  },
  {
    name: 'Bad set: both fail (low similarity)',
    setup: () => {
      fs.mkdirSync(testBadDir, { recursive: true });
      fs.writeFileSync(path.join(testBadDir, 'bad-1.jpg'), 'fake image');
      fs.writeFileSync(path.join(testBadDir, 'bad-2.jpg'), 'fake image');
      fs.writeFileSync(testRefPath, 'fake reference');
    },
    expected: {
      totalBad: 2,
      badPassed: 2,
      badFailed: 0
    }
  },
  {
    name: 'Error path: NO_FACE_DETECTED',
    setup: () => {
      fs.mkdirSync(testGoodDir, { recursive: true });
      fs.writeFileSync(path.join(testGoodDir, 'no-face.jpg'), 'fake image');
      fs.writeFileSync(testRefPath, 'fake reference');
    },
    expected: {
      totalGood: 1,
      goodFailed: 1,
      hasError: true
    }
  }
];

async function runTest(test) {
  console.log(`\nRunning: ${test.name}`);
  
  // Cleanup and setup
  cleanup();
  test.setup();
  createMock();
  
  // Run evaluator
  const evalScript = path.join(__dirname, 'faceid-eval.mjs');
  const args = [
    '--ref', testRefPath,
    '--threshold', '0.32',
    '--out', path.join(testFixturesDir, 'report'),
    '--format', 'json',
    '--fixtures-dir', testFixturesDir,
    '--mock', testMockPath
  ];
  
  try {
    const { stdout, stderr } = await execFileAsync('node', [evalScript, ...args]);
    
    if (stderr) {
      console.log('  STDERR:', stderr);
    }
    if (stdout) {
      console.log('  STDOUT:', stdout.substring(0, 200));
    }
    
    // Parse JSON report
    const reportPath = path.join(testFixturesDir, 'report', 'report.json');
    if (!fs.existsSync(reportPath)) {
      // Try alternative path
      const altPath = path.join(testFixturesDir, 'report.json');
      if (fs.existsSync(altPath)) {
        const report = JSON.parse(fs.readFileSync(altPath, 'utf8'));
        // Verify expectations
        let passed = true;
        for (const [key, expectedValue] of Object.entries(test.expected)) {
          if (key === 'hasError') {
            const hasError = report.results.some(r => r.decision === 'ERROR');
            if (hasError !== expectedValue) {
              console.log(`  ✗ Expected hasError=${expectedValue}, got ${hasError}`);
              passed = false;
            } else {
              console.log(`  ✓ Error handling correct`);
            }
          } else {
            const actual = report.summary[key];
            if (actual !== expectedValue) {
              console.log(`  ✗ Expected ${key}=${expectedValue}, got ${actual}`);
              passed = false;
            } else {
              console.log(`  ✓ ${key}: ${actual}`);
            }
          }
        }
        return passed;
      }
      throw new Error(`Report JSON not found at ${reportPath} or ${altPath}`);
    }
    
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    // Verify expectations
    let passed = true;
    for (const [key, expectedValue] of Object.entries(test.expected)) {
      if (key === 'hasError') {
        // Check if any result has ERROR decision
        const hasError = report.results.some(r => r.decision === 'ERROR');
        if (hasError !== expectedValue) {
          console.log(`  ✗ Expected hasError=${expectedValue}, got ${hasError}`);
          passed = false;
        } else {
          console.log(`  ✓ Error handling correct`);
        }
      } else {
        const actual = report.summary[key];
        if (actual !== expectedValue) {
          console.log(`  ✗ Expected ${key}=${expectedValue}, got ${actual}`);
          passed = false;
        } else {
          console.log(`  ✓ ${key}: ${actual}`);
        }
      }
    }
    
    return passed;
  } catch (error) {
    console.log(`  ✗ Test failed: ${error.message}`);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.log('STDERR:', error.stderr);
    return false;
  } finally {
    cleanup();
  }
}

async function testStrictMode() {
  console.log('\nRunning: Strict mode test');
  
  cleanup();
  fs.mkdirSync(testGoodDir, { recursive: true });
  fs.writeFileSync(path.join(testGoodDir, 'good-fail.jpg'), 'fake image'); // Will fail
  fs.writeFileSync(testRefPath, 'fake reference');
  createMock();
  
  const evalScript = path.join(__dirname, 'faceid-eval.mjs');
  const args = [
    '--ref', testRefPath,
    '--threshold', '0.32',
    '--out', path.join(testFixturesDir, 'report'),
    '--format', 'json',
    '--fixtures-dir', testFixturesDir,
    '--strict',
    '--mock', testMockPath
  ];
  
  try {
    await execFileAsync('node', [evalScript, ...args]);
    console.log('  ✗ Strict mode should have failed (good fixture failed)');
    cleanup();
    return false;
  } catch (error) {
    if (error.code === 1) {
      console.log('  ✓ Strict mode correctly returned exit code 1');
      cleanup();
      return true;
    } else {
      console.log(`  ✗ Unexpected error: ${error.message}`);
      cleanup();
      return false;
    }
  }
}

async function testOutputFormats() {
  console.log('\nRunning: Output format test');
  
  cleanup();
  fs.mkdirSync(testGoodDir, { recursive: true });
  fs.writeFileSync(path.join(testGoodDir, 'test.jpg'), 'fake image');
  fs.writeFileSync(testRefPath, 'fake reference');
  createMock();
  
  const evalScript = path.join(__dirname, 'faceid-eval.mjs');
  const args = [
    '--ref', testRefPath,
    '--threshold', '0.32',
    '--out', path.join(testFixturesDir, 'report'),
    '--format', 'both',
    '--fixtures-dir', testFixturesDir,
    '--mock', testMockPath
  ];
  
  try {
    await execFileAsync('node', [evalScript, ...args]);
    
    const jsonPath = path.join(testFixturesDir, 'report', 'report.json');
    const csvPath = path.join(testFixturesDir, 'report', 'report.csv');
    
    if (!fs.existsSync(jsonPath)) {
      console.log('  ✗ JSON file not created');
      cleanup();
      return false;
    }
    
    if (!fs.existsSync(csvPath)) {
      console.log('  ✗ CSV file not created');
      cleanup();
      return false;
    }
    
    // Verify JSON structure
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!json.config || !json.summary || !json.results) {
      console.log('  ✗ JSON missing required fields');
      cleanup();
      return false;
    }
    
    // Verify CSV header
    const csv = fs.readFileSync(csvPath, 'utf8');
    if (!csv.includes('set,fileName,filePath')) {
      console.log('  ✗ CSV missing header');
      cleanup();
      return false;
    }
    
    console.log('  ✓ Both JSON and CSV created with correct structure');
    cleanup();
    return true;
  } catch (error) {
    console.log(`  ✗ Test failed: ${error.message}`);
    cleanup();
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('FaceID Evaluation Test Suite');
  console.log('============================');
  
  let allPassed = true;
  
  for (const test of tests) {
    const passed = await runTest(test);
    if (!passed) allPassed = false;
  }
  
  const strictPassed = await testStrictMode();
  if (!strictPassed) allPassed = false;
  
  const formatPassed = await testOutputFormats();
  if (!formatPassed) allPassed = false;
  
  console.log('\n============================');
  if (allPassed) {
    console.log('✓ All tests passed');
    process.exit(0);
  } else {
    console.log('✗ Some tests failed');
    process.exit(1);
  }
}

// Cleanup on exit
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});

runAllTests().catch(error => {
  console.error('Fatal error:', error);
  cleanup();
  process.exit(1);
});

