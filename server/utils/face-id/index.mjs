// FaceID integration - InsightFace embeddings for face consistency
// Wraps Python face_id.py script for face detection and similarity checking

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const FACE_ID_SCRIPT = path.join(REPO_ROOT, 'tools', 'face_id.py');

const DEBUG_FACE_ID = process.env.DEBUG_FACE_ID === 'true' || process.env.DEBUG_FACE_ID === '1';
const FACE_ID_ENABLED = process.env.FACE_ID_ENABLED === 'true' || process.env.FACE_ID_ENABLED === '1';
const FACE_ID_THRESHOLD = parseFloat(process.env.FACE_ID_THRESHOLD || '0.32');
const FACE_ID_MAX_ATTEMPTS = parseInt(process.env.FACE_ID_MAX_ATTEMPTS || '2', 10);
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

/**
 * Extract the last JSON object line from stdout, handling noisy output
 * @param {string} stdout - Raw stdout from Python process
 * @returns {object} Parsed JSON object
 * @throws {Error} If no valid JSON line found
 */
export function extractJsonFromStdout(stdout) {
  if (!stdout || typeof stdout !== 'string') {
    throw new Error('FACE_ID_PARSE_FAILED: Empty or invalid stdout');
  }

  // Split by newline, trim each line
  const lines = stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Find lines that look like JSON objects (start with { and end with })
  const jsonLines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}');
  });

  if (jsonLines.length === 0) {
    throw new Error('FACE_ID_PARSE_FAILED: No JSON object found in stdout');
  }

  // Take the last JSON line (most recent output)
  const jsonLine = jsonLines[jsonLines.length - 1];

  try {
    return JSON.parse(jsonLine);
  } catch (parseError) {
    throw new Error(`FACE_ID_PARSE_FAILED: Failed to parse JSON: ${parseError.message}`);
  }
}

/**
 * Check if FaceID is enabled
 */
export function isFaceIdEnabled() {
  return FACE_ID_ENABLED;
}

/**
 * Get FaceID configuration
 */
export function getFaceIdConfig() {
  return {
    enabled: FACE_ID_ENABLED,
    threshold: FACE_ID_THRESHOLD,
    maxAttempts: FACE_ID_MAX_ATTEMPTS
  };
}

/**
 * Extract face embedding from reference photo and save to job folder
 * @param {string} referencePhotoPath - Path to reference photo (e.g., jobs/:bookId/hero.jpg)
 * @param {string} outputJsonPath - Path to save embedding JSON (e.g., jobs/:bookId/face_ref.json)
 * @returns {Promise<{ok: boolean, embedding?: number[], embedding_dim?: number, error?: string}>}
 */
export async function extractReferenceEmbedding(referencePhotoPath, outputJsonPath) {
  if (!FACE_ID_ENABLED) {
    return { ok: false, error: 'FACE_ID_DISABLED', message: 'FaceID is not enabled' };
  }

  if (!fs.existsSync(referencePhotoPath)) {
    return { ok: false, error: 'FILE_NOT_FOUND', message: `Reference photo not found: ${referencePhotoPath}` };
  }

  const absRefPath = path.resolve(referencePhotoPath);
  if (DEBUG_FACE_ID) {
    console.log(`[FACE_ID] PYTHON_BIN=${PYTHON_BIN}`);
    console.log(`[FACE_ID] Extracting embedding from ${absRefPath}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, [
      FACE_ID_SCRIPT,
      '--extract-only',
      '--reference', absRefPath,
      '--output', outputJsonPath
    ]);

    if (stderr && DEBUG_FACE_ID) {
      console.warn(`[FACE_ID] Python stderr: ${stderr}`);
    }

    // When --output is provided, Python writes JSON to file, not stdout
    // Read from file if it exists, otherwise try parsing stdout (fallback)
    let result;
    if (fs.existsSync(outputJsonPath)) {
      try {
        const fileContent = fs.readFileSync(outputJsonPath, 'utf8');
        result = JSON.parse(fileContent);
      } catch (fileError) {
        // If file read fails, try parsing stdout as fallback
        if (DEBUG_FACE_ID) {
          console.warn(`[FACE_ID] Failed to read output file, trying stdout: ${fileError.message}`);
        }
        result = extractJsonFromStdout(stdout);
      }
    } else {
      // No output file, try parsing stdout (for backward compatibility)
      result = extractJsonFromStdout(stdout);
    }

    if (DEBUG_FACE_ID) {
      console.log(`[FACE_ID] Extraction result: ok=${result.ok}, face_detected=${result.face_detected}`);
    }

    return result;
  } catch (error) {
    if (DEBUG_FACE_ID) {
      console.error(`[FACE_ID] Extraction error: ${error.message}`);
    }
    
    // Check if subprocess failed (non-zero exit code)
    // execFileAsync throws error with .code property when process exits non-zero
    if (error.code && typeof error.code === 'number') {
      const stderr = error.stderr || '';
      const stderrTruncated = stderr.length > 2000 ? stderr.substring(0, 2000) + '...' : stderr;
      const pythonError = new Error(`FACE_ID_PYTHON_FAILED: Python subprocess failed: ${error.message}`);
      pythonError.code = 'FACE_ID_PYTHON_FAILED';
      pythonError.stderr = stderrTruncated;
      throw pythonError;
    }
    
    // Re-throw parse errors as-is
    if (error.message?.includes('FACE_ID_PARSE_FAILED')) {
      throw error;
    }
    
    // Other errors (e.g., ENOENT - executable not found)
    return {
      ok: false,
      error: 'EXTRACTION_FAILED',
      message: `Failed to extract face embedding: ${error.message}`
    };
  }
}

/**
 * Check similarity between reference photo and candidate image
 * @param {string} referencePhotoPath - Path to reference photo
 * @param {string} candidateImagePath - Path to generated page image
 * @returns {Promise<{ok: boolean, similarity?: number, face_detected_ref?: boolean, face_detected_candidate?: boolean, error?: string}>}
 */
export async function checkSimilarity(referencePhotoPath, candidateImagePath) {
  if (!FACE_ID_ENABLED) {
    return { ok: false, error: 'FACE_ID_DISABLED', message: 'FaceID is not enabled' };
  }

  if (!fs.existsSync(referencePhotoPath)) {
    return { ok: false, error: 'FILE_NOT_FOUND', message: `Reference photo not found: ${referencePhotoPath}` };
  }

  if (!fs.existsSync(candidateImagePath)) {
    return { ok: false, error: 'FILE_NOT_FOUND', message: `Candidate image not found: ${candidateImagePath}` };
  }

  const absRefPath = path.resolve(referencePhotoPath);
  const absCandidatePath = path.resolve(candidateImagePath);
  if (DEBUG_FACE_ID) {
    console.log(`[FACE_ID] Checking similarity: ref=${absRefPath}, candidate=${absCandidatePath}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, [
      FACE_ID_SCRIPT,
      '--reference', absRefPath,
      '--candidate', absCandidatePath
    ]);

    if (stderr && DEBUG_FACE_ID) {
      console.warn(`[FACE_ID] Python stderr: ${stderr}`);
    }

    const result = extractJsonFromStdout(stdout);

    if (DEBUG_FACE_ID) {
      console.log(`[FACE_ID] Similarity result: ok=${result.ok}, similarity=${result.similarity}, passed=${result.similarity >= FACE_ID_THRESHOLD}`);
    }

    return result;
  } catch (error) {
    if (DEBUG_FACE_ID) {
      console.error(`[FACE_ID] Similarity check error: ${error.message}`);
    }
    
    // Check if subprocess failed (non-zero exit code)
    // execFileAsync throws error with .code property when process exits non-zero
    if (error.code && typeof error.code === 'number') {
      const stderr = error.stderr || '';
      const stderrTruncated = stderr.length > 2000 ? stderr.substring(0, 2000) + '...' : stderr;
      const pythonError = new Error(`FACE_ID_PYTHON_FAILED: Python subprocess failed: ${error.message}`);
      pythonError.code = 'FACE_ID_PYTHON_FAILED';
      pythonError.stderr = stderrTruncated;
      throw pythonError;
    }
    
    // Re-throw parse errors as-is
    if (error.message?.includes('FACE_ID_PARSE_FAILED')) {
      throw error;
    }
    
    // Other errors (e.g., ENOENT - executable not found)
    return {
      ok: false,
      error: 'SIMILARITY_CHECK_FAILED',
      message: `Failed to check similarity: ${error.message}`
    };
  }
}

/**
 * Validate that input photo has a detectable face
 * @param {string} photoPath - Path to input photo
 * @returns {Promise<{ok: boolean, face_detected?: boolean, error?: string}>}
 */
export async function validateFaceDetected(photoPath) {
  if (!FACE_ID_ENABLED) {
    return { ok: true, face_detected: null, message: 'FaceID disabled, skipping validation' };
  }

  if (!fs.existsSync(photoPath)) {
    return { ok: false, error: 'FILE_NOT_FOUND', message: `Photo not found: ${photoPath}` };
  }

  if (DEBUG_FACE_ID) {
    console.log(`[FACE_ID] Validating face detection in ${photoPath}`);
  }

  try {
    // Use extract-only mode to check if face is detectable
    const tempJsonPath = path.join(path.dirname(photoPath), '.face_check_temp.json');
    const result = await extractReferenceEmbedding(photoPath, tempJsonPath);
    
    // Clean up temp file
    if (fs.existsSync(tempJsonPath)) {
      fs.unlinkSync(tempJsonPath);
    }

    // JSON parsed successfully - check face_detected field
    if (result.face_detected === false) {
      // JSON parsed + face_detected === false -> NO_FACE_DETECTED
      return {
        ok: false,
        face_detected: false,
        error: 'NO_FACE_DETECTED',
        message: result.message || 'No face detected in photo'
      };
    }

    if (result.face_detected === true) {
      // JSON parsed + face_detected === true -> success
      return { ok: true, face_detected: true };
    }

    // JSON parsed but face_detected field missing or unexpected value
    // This shouldn't happen, but treat as parse/validation error
    return {
      ok: false,
      error: 'VALIDATION_FAILED',
      message: `Unexpected result format: face_detected field missing or invalid`
    };
  } catch (error) {
    if (DEBUG_FACE_ID) {
      console.error(`[FACE_ID] Validation error: ${error.message}`);
    }
    
    // Distinguish error types
    if (error.code === 'FACE_ID_PYTHON_FAILED') {
      return {
        ok: false,
        error: 'FACE_ID_PYTHON_FAILED',
        message: `Python subprocess failed: ${error.message}${error.stderr ? '\n' + error.stderr : ''}`
      };
    }
    
    if (error.message?.includes('FACE_ID_PARSE_FAILED')) {
      return {
        ok: false,
        error: 'FACE_ID_PARSE_FAILED',
        message: `Failed to parse Python output: ${error.message}`
      };
    }
    
    return {
      ok: false,
      error: 'VALIDATION_FAILED',
      message: `Failed to validate face: ${error.message}`
    };
  }
}

