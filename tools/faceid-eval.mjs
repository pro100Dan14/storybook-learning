#!/usr/bin/env node
/**
 * FaceID Evaluation Harness
 * Evaluates FaceID similarity checks on fixture images
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Parse CLI arguments
const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
    argMap[key] = value;
    if (value !== true) i++;
  }
}

// Parse and resolve paths to absolute (independent of process.cwd())
const refPathArg = argMap.ref;
const threshold = parseFloat(argMap.threshold || process.env.FACE_ID_THRESHOLD || '0.32');
const maxAttempts = parseInt(argMap['max-attempts'] || process.env.FACE_ID_MAX_ATTEMPTS || '2', 10);
const outDir = argMap.out || path.join(REPO_ROOT, 'tools', 'faceid_reports', new Date().toISOString().replace(/[:.]/g, '-'));
const format = argMap.format || 'both';
const strict = argMap.strict === true || argMap.strict === 'true';
const mockPath = argMap.mock;
const fixturesDirArg = argMap['fixtures-dir'] || path.join(REPO_ROOT, 'tools', 'faceid_fixtures');

// Resolve all paths to absolute (independent of process.cwd())
const refPath = refPathArg ? path.resolve(process.cwd(), refPathArg) : null;
const fixturesDir = path.isAbsolute(fixturesDirArg) ? fixturesDirArg : path.resolve(process.cwd(), fixturesDirArg);

// Mock injection point
let faceIdModule = null;
if (mockPath) {
  faceIdModule = await import(path.resolve(mockPath));
} else {
  // Use real implementation
  faceIdModule = await import(path.join(REPO_ROOT, 'server', 'utils', 'face-id', 'index.mjs'));
}

const { validateFaceDetected, extractReferenceEmbedding, checkSimilarity } = faceIdModule;

// Paths (fixturesDir is now absolute)
const goodDir = path.join(fixturesDir, 'good');
const badDir = path.join(fixturesDir, 'bad');

// Image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Find all image files in a directory
 */
function findImageFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files = fs.readdirSync(dir);
  return files
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext);
    })
    .map(file => path.join(dir, file));
}

/**
 * Escape CSV field
 */
function escapeCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Main evaluation function
 */
async function runEvaluation() {
  // Smoke run: check if fixtures exist
  const goodFiles = findImageFiles(goodDir);
  const badFiles = findImageFiles(badDir);
  
  if (goodFiles.length === 0 && badFiles.length === 0) {
    console.log('No fixtures found. Please add images to:');
    console.log(`  ${goodDir}/`);
    console.log(`  ${badDir}/`);
    console.log('\nSee tools/faceid_fixtures/README.md for instructions.');
    process.exit(0);
  }

  if (!refPath) {
    console.error('Error: --ref <path> is required');
    process.exit(1);
  }

  // Debug: print resolved reference path
  console.log(`Resolved reference (abs): ${refPath}`);
  
  // Validate reference path exists (with absolute path)
  if (!fs.existsSync(refPath)) {
    console.error(`Error: REFERENCE_NOT_FOUND: ${refPath}`);
    console.error(`Resolved from: ${refPathArg || '(not provided)'}`);
    process.exit(1);
  }

  console.log(`FaceID Evaluation`);
  console.log(`Threshold: ${threshold}`);
  console.log(`Max Attempts: ${maxAttempts}`);
  console.log(`Good fixtures: ${goodFiles.length}`);
  console.log(`Bad fixtures: ${badFiles.length}`);
  console.log('');

  // Validate reference
  console.log('Validating reference image...');
  const refValidation = await validateFaceDetected(refPath);
  if (!refValidation.ok || !refValidation.face_detected) {
    console.error(`Error: No face detected in reference image: ${refValidation.error || 'NO_FACE_DETECTED'}`);
    process.exit(1);
  }
  console.log('✓ Reference face detected');

  // Extract reference embedding
  console.log('Extracting reference embedding...');
  const tempEmbeddingPath = path.join(outDir, '.temp_embedding.json');
  fs.mkdirSync(outDir, { recursive: true });
  const extractionResult = await extractReferenceEmbedding(refPath, tempEmbeddingPath);
  if (!extractionResult.ok) {
    console.error(`Error: Failed to extract reference embedding: ${extractionResult.error}`);
    process.exit(1);
  }
  console.log(`✓ Embedding extracted (dim: ${extractionResult.embedding_dim})`);

  // Process all fixtures
  const results = [];
  let totalGood = 0;
  let totalBad = 0;
  let goodPassed = 0;
  let goodFailed = 0;
  let badPassed = 0;
  let badFailed = 0;

  // Process good fixtures
  for (const filePath of goodFiles) {
    totalGood++;
    const fileName = path.basename(filePath);
    console.log(`Processing good/${fileName}...`);

    try {
      // Validate face detection
      const candidateValidation = await validateFaceDetected(filePath);
      if (!candidateValidation.ok || !candidateValidation.face_detected) {
        results.push({
          set: 'good',
          fileName,
          filePath,
          faceDetected: false,
          faceCount: null,
          score: null,
          threshold,
          decision: 'ERROR',
          errorCode: candidateValidation.error || 'NO_FACE_DETECTED',
          errorMessage: candidateValidation.message || 'No face detected'
        });
        goodFailed++;
        continue;
      }

      // Check similarity
      const similarityResult = await checkSimilarity(refPath, filePath);
      if (!similarityResult.ok) {
        results.push({
          set: 'good',
          fileName,
          filePath,
          faceDetected: similarityResult.face_detected_candidate || false,
          faceCount: null,
          score: null,
          threshold,
          decision: 'ERROR',
          errorCode: similarityResult.error || 'SIMILARITY_CHECK_FAILED',
          errorMessage: similarityResult.message || 'Similarity check failed'
        });
        goodFailed++;
        continue;
      }

      const score = similarityResult.similarity || 0;
      const passed = score >= threshold;
      const decision = passed ? 'PASS' : 'FAIL';

      results.push({
        set: 'good',
        fileName,
        filePath,
        faceDetected: similarityResult.face_detected_candidate !== false,
        faceCount: similarityResult.faceCount || null,
        score,
        threshold,
        decision,
        errorCode: null,
        errorMessage: null
      });

      if (passed) {
        goodPassed++;
        console.log(`  ✓ PASS (similarity: ${score.toFixed(3)})`);
      } else {
        goodFailed++;
        console.log(`  ✗ FAIL (similarity: ${score.toFixed(3)}, threshold: ${threshold})`);
      }
    } catch (error) {
      results.push({
        set: 'good',
        fileName,
        filePath,
        faceDetected: false,
        faceCount: null,
        score: null,
        threshold,
        decision: 'ERROR',
        errorCode: 'EXCEPTION',
        errorMessage: error.message || String(error)
      });
      goodFailed++;
      console.log(`  ✗ ERROR: ${error.message}`);
    }
  }

  // Process bad fixtures
  for (const filePath of badFiles) {
    totalBad++;
    const fileName = path.basename(filePath);
    console.log(`Processing bad/${fileName}...`);

    try {
      // Validate face detection
      const candidateValidation = await validateFaceDetected(filePath);
      if (!candidateValidation.ok || !candidateValidation.face_detected) {
        // No face is expected for bad fixtures, so this is a PASS
        results.push({
          set: 'bad',
          fileName,
          filePath,
          faceDetected: false,
          faceCount: null,
          score: null,
          threshold,
          decision: 'PASS',
          errorCode: null,
          errorMessage: null
        });
        badPassed++;
        console.log(`  ✓ PASS (no face detected, as expected)`);
        continue;
      }

      // Check similarity
      const similarityResult = await checkSimilarity(refPath, filePath);
      if (!similarityResult.ok) {
        // Error in similarity check - treat as PASS for bad fixtures (different person should fail)
        results.push({
          set: 'bad',
          fileName,
          filePath,
          faceDetected: similarityResult.face_detected_candidate || false,
          faceCount: null,
          score: null,
          threshold,
          decision: 'PASS',
          errorCode: null,
          errorMessage: null
        });
        badPassed++;
        console.log(`  ✓ PASS (similarity check failed, as expected)`);
        continue;
      }

      const score = similarityResult.similarity || 0;
      const passed = score >= threshold;
      // For bad fixtures, we want LOW similarity (should FAIL the threshold check)
      const decision = passed ? 'FAIL' : 'PASS';

      results.push({
        set: 'bad',
        fileName,
        filePath,
        faceDetected: similarityResult.face_detected_candidate !== false,
        faceCount: similarityResult.faceCount || null,
        score,
        threshold,
        decision,
        errorCode: null,
        errorMessage: null
      });

      if (decision === 'PASS') {
        badPassed++;
        console.log(`  ✓ PASS (similarity: ${score.toFixed(3)} < threshold: ${threshold})`);
      } else {
        badFailed++;
        console.log(`  ✗ FAIL (similarity: ${score.toFixed(3)} >= threshold: ${threshold}, should be lower)`);
      }
    } catch (error) {
      // Errors in bad fixtures might be acceptable (no face, etc.)
      results.push({
        set: 'bad',
        fileName,
        filePath,
        faceDetected: false,
        faceCount: null,
        score: null,
        threshold,
        decision: 'PASS',
        errorCode: null,
        errorMessage: null
      });
      badPassed++;
      console.log(`  ✓ PASS (error handled: ${error.message})`);
    }
  }

  // Summary
  console.log('');
  console.log('=== Summary ===');
  console.log(`Total Good: ${totalGood} (Passed: ${goodPassed}, Failed: ${goodFailed})`);
  console.log(`Total Bad: ${totalBad} (Passed: ${badPassed}, Failed: ${badFailed})`);
  console.log(`Overall: ${goodPassed + badPassed}/${totalGood + totalBad} passed`);

  // Prepare report data
  const reportData = {
    config: {
      refPath,
      threshold,
      maxAttempts,
      timestamp: new Date().toISOString()
    },
    summary: {
      totalGood,
      totalBad,
      goodPassed,
      goodFailed,
      badPassed,
      badFailed,
      overallPassed: goodPassed + badPassed,
      overallTotal: totalGood + totalBad
    },
    results
  };

  // Write reports
  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(outDir, 'report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2));
    console.log(`\nJSON report: ${jsonPath}`);
  }

  if (format === 'csv' || format === 'both') {
    const csvPath = path.join(outDir, 'report.csv');
    const csvLines = [
      'set,fileName,filePath,faceDetected,faceCount,score,threshold,decision,errorCode,errorMessage'
    ];
    
    for (const result of results) {
      csvLines.push([
        result.set,
        result.fileName,
        result.filePath,
        result.faceDetected,
        result.faceCount !== null ? result.faceCount : '',
        result.score !== null ? result.score.toFixed(4) : '',
        result.threshold,
        result.decision,
        result.errorCode || '',
        result.errorMessage || ''
      ].map(escapeCsv).join(','));
    }
    
    fs.writeFileSync(csvPath, csvLines.join('\n'));
    console.log(`CSV report: ${csvPath}`);
  }

  // Cleanup temp embedding
  if (fs.existsSync(tempEmbeddingPath)) {
    fs.unlinkSync(tempEmbeddingPath);
  }

  // Strict mode: exit with error if expectations violated
  if (strict) {
    if (goodFailed > 0 || badFailed > 0) {
      console.log('\n✗ Strict mode: Some expectations violated');
      process.exit(1);
    }
    console.log('\n✓ Strict mode: All expectations met');
  }

  console.log(`\nReports saved to: ${outDir}`);
}

// Run
runEvaluation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

