// Identity guard - face consistency checking with embeddings
// NOTE: This module requires @tensorflow/tfjs-node and @tensorflow-models/face-landmarks-detection to be installed
// If not available, identity checking will be skipped gracefully

import fs from 'node:fs';
import path from 'node:path';

let tf = null;
let faceLandmarksDetection = null;
let model = null;
let dependenciesAvailable = null;

/**
 * Check if dependencies are available (lazy check)
 */
async function checkDependencies() {
  if (dependenciesAvailable !== null) {
    return dependenciesAvailable;
  }
  
  try {
    tf = await import('@tensorflow/tfjs-node');
    faceLandmarksDetection = await import('@tensorflow-models/face-landmarks-detection');
    dependenciesAvailable = true;
    return true;
  } catch (error) {
    console.warn('Identity guard: TensorFlow dependencies not available, identity checking will be skipped');
    dependenciesAvailable = false;
    return false;
  }
}

/**
 * Load face detection model (lazy initialization)
 */
async function loadModel() {
  if (!await checkDependencies()) {
    return null;
  }
  
  if (!model) {
    try {
      model = await faceLandmarksDetection.load(
        faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
        { maxFaces: 1 }
      );
    } catch (error) {
      console.error('Identity guard: Failed to load face detection model:', error.message);
      return null;
    }
  }
  return model;
}

/**
 * Extract face embedding from image buffer
 * Returns normalized embedding vector or null if no face found or dependencies unavailable
 */
async function extractFaceEmbedding(imageBuffer) {
  if (!await checkDependencies()) {
    return null;
  }
  
  try {
    const detectionModel = await loadModel();
    if (!detectionModel) {
      return null;
    }
    
    // Convert buffer to tensor
    const imageTensor = tf.node.decodeImage(imageBuffer, 3);
    
    // Detect face
    const faces = await detectionModel.estimateFaces({
      input: imageTensor,
      returnTensors: false,
      flipHorizontal: false,
      staticImageMode: true
    });
    
    imageTensor.dispose();
    
    if (!faces || faces.length === 0) {
      return null; // No face detected
    }
    
    // Extract key points from the first face
    const face = faces[0];
    const keypoints = face.keypoints || [];
    
    if (keypoints.length < 10) {
      return null; // Not enough keypoints
    }
    
    // Create simple embedding from keypoint positions (normalized)
    // Using relative positions of key facial landmarks
    const embedding = [];
    const nose = keypoints.find(kp => kp.name === 'noseTip') || keypoints[0];
    
    for (const kp of keypoints.slice(0, 68)) { // Standard 68-point model
      if (kp) {
        embedding.push((kp.x - nose.x) / 100); // Normalized relative to nose
        embedding.push((kp.y - nose.y) / 100);
      }
    }
    
    // Pad or truncate to fixed size
    while (embedding.length < 136) embedding.push(0);
    embedding.length = 136;
    
    // Normalize vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude);
    }
    
    return embedding;
  } catch (error) {
    console.error('Face embedding extraction error:', error.message);
    return null;
  }
}

/**
 * Compare two embeddings using cosine similarity
 * Returns similarity score between 0 and 1 (1 = identical)
 */
function compareEmbeddings(embed1, embed2) {
  if (!embed1 || !embed2 || embed1.length !== embed2.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < embed1.length; i++) {
    dotProduct += embed1[i] * embed2[i];
    mag1 += embed1[i] * embed1[i];
    mag2 += embed2[i] * embed2[i];
  }
  
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  
  if (mag1 === 0 || mag2 === 0) return 0;
  
  return dotProduct / (mag1 * mag2);
}

/**
 * Compare page image to hero reference (MVP - no retries)
 * @param {string} pageImageBase64 - Page image as data URL or base64
 * @param {object} heroReference - Hero reference object with { base64, mimeType, path, bookId }
 * @param {string} mode - 'dev' or 'prod'
 * @param {number} threshold - Similarity threshold (default 0.62)
 * @returns {Promise<{similar: boolean, score: number, threshold: number, error?: string, skipped?: boolean}>}
 */
export async function compareToHero(pageImageBase64, heroReference, mode = 'dev', threshold = 0.62) {
  try {
    // Check dependencies
    const hasDependencies = await checkDependencies();

    // MVP: Hard fail in production if dependencies missing
    // Temporarily disabled: allow skipping even in production
    // if (mode === 'prod' && !hasDependencies) {
    //   throw new Error('Identity guard unavailable in production. Install @tensorflow/tfjs-node and @tensorflow-models/face-landmarks-detection.');
    // }

    // Dev mode: skip with explicit marker
    if (!hasDependencies) {
      return {
        similar: false, // Mark as failed in dev if dependencies unavailable
        score: 0.0,
        threshold,
        skipped: true,
        error: 'Identity guard dependencies not available - check skipped (dev mode)'
      };
    }
    
    // Use provided hero reference (per-book)
    const heroBuffer = Buffer.from(heroReference.base64, 'base64');
    
    // Convert page image from data URL or base64
    let pageBuffer;
    if (pageImageBase64.startsWith('data:image/')) {
      const base64Data = pageImageBase64.split(',')[1];
      pageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      pageBuffer = Buffer.from(pageImageBase64, 'base64');
    }
    
    // Extract embeddings
    const heroEmbedding = await extractFaceEmbedding(heroBuffer);
    if (!heroEmbedding) {
      return { similar: false, score: 0, threshold, error: 'No face detected in hero reference' };
    }
    
    const pageEmbedding = await extractFaceEmbedding(pageBuffer);
    if (!pageEmbedding) {
      return { similar: false, score: 0, threshold, error: 'No face detected in page image' };
    }
    
    // Compare
    const similarity = compareEmbeddings(heroEmbedding, pageEmbedding);
    
    return {
      similar: similarity >= threshold,
      score: similarity,
      threshold,
      skipped: false
    };
  } catch (error) {
    // Re-throw in production mode
    if (mode === 'prod') {
      throw error;
    }
    
    // Return error result in dev mode
    return {
      similar: false,
      score: 0,
      threshold,
      error: error.message,
      skipped: false
    };
  }
}

function parseEnvFloat(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Pure cross-page FaceID policy runner.
 * `similarityFn(a, b)` must behave like FaceID `checkSimilarity`:
 * - resolves to { ok: true, similarity: number, face_detected_candidate?: boolean } on success
 * - may throw errors with codes/messages containing FACE_ID_PYTHON_FAILED / FACE_ID_PARSE_FAILED
 */
export async function computeFaceIdCrossPageResults({ referenceId, pageIds, thresholds, similarityFn }) {
  const results = [];

  let anchorId = null;
  let bestAnchorRefSim = null;
  let prevId = null;

  for (let i = 0; i < pageIds.length; i++) {
    const pageId = pageIds[i];

    const r = {
      refSimilarity: null,
      anchorSimilarity: null,
      prevSimilarity: null,
      anchorUpdated: false,
      thresholds: { ...thresholds },
      status: 'SKIPPED'
    };

    if (!pageId) {
      results.push(r);
      continue;
    }

    r.status = 'PASS';

    const classifyThrown = (e) => {
      const code = e?.code || '';
      const msg = e?.message || '';
      const s = `${code} ${msg}`;
      if (s.includes('FACE_ID_PYTHON_FAILED')) return 'FACE_ID_PYTHON_FAILED';
      if (s.includes('FACE_ID_PARSE_FAILED')) return 'FACE_ID_PARSE_FAILED';
      return 'FACE_ID_PYTHON_FAILED';
    };

    const handleRes = (res) => {
      if (res?.ok && typeof res.similarity === 'number') return { ok: true, similarity: res.similarity };
      if (res?.face_detected_candidate === false) return { ok: false, reason: 'NO_FACE_DETECTED' };
      return { ok: false, reason: res?.error || 'FACE_ID_PARSE_FAILED' };
    };

    // 1) Always compute similarity(reference, pageN)
    try {
      const refRes = await similarityFn(referenceId, pageId);
      const parsed = handleRes(refRes);
      if (parsed.ok) r.refSimilarity = parsed.similarity;
      else {
        r.status = 'FAIL';
        r.failureReason = parsed.reason;
      }
    } catch (e) {
      r.status = 'FAIL';
      r.failureReason = classifyThrown(e);
    }

    // 2) Page 1: set anchor=page1
    if (i === 0) {
      anchorId = pageId;
      bestAnchorRefSim = r.refSimilarity;
    } else {
      // 3) Page N>=2: compute anchor+prev similarities
      if (anchorId) {
        try {
          const aRes = await similarityFn(anchorId, pageId);
          const parsed = handleRes(aRes);
          if (parsed.ok) r.anchorSimilarity = parsed.similarity;
          else if (!r.failureReason) {
            r.status = 'FAIL';
            r.failureReason = parsed.reason;
          }
        } catch (e) {
          r.status = 'FAIL';
          r.failureReason = classifyThrown(e);
        }
      }

      if (prevId) {
        try {
          const pRes = await similarityFn(prevId, pageId);
          const parsed = handleRes(pRes);
          if (parsed.ok) r.prevSimilarity = parsed.similarity;
          else if (!r.failureReason) {
            r.status = 'FAIL';
            r.failureReason = parsed.reason;
          }
        } catch (e) {
          r.status = 'FAIL';
          r.failureReason = classifyThrown(e);
        }
      }
    }

    // PASS rules (only if no FaceID error classification set)
    if (r.status === 'PASS') {
      if (r.refSimilarity === null || r.refSimilarity < thresholds.ref) {
        r.status = 'FAIL';
        r.failureReason = 'REF_BELOW_THRESHOLD';
      } else if (i >= 1 && (r.anchorSimilarity === null || r.anchorSimilarity < thresholds.anchor)) {
        r.status = 'FAIL';
        r.failureReason = 'ANCHOR_BELOW_THRESHOLD';
      } else if (i >= 1 && (r.prevSimilarity === null || r.prevSimilarity < thresholds.prev)) {
        r.status = 'FAIL';
        r.failureReason = 'PREV_BELOW_THRESHOLD';
      }
    }

    // Anchor update rule (avoid counting page1 init)
    if (i >= 1 && r.refSimilarity !== null) {
      if (bestAnchorRefSim === null || r.refSimilarity > bestAnchorRefSim) {
        anchorId = pageId;
        bestAnchorRefSim = r.refSimilarity;
        r.anchorUpdated = true;
      }
    }

    prevId = pageId;
    results.push(r);
  }

  return results;
}

/**
 * Cross-page FaceID identity policy (reference + anchor + previous).
 * Uses FaceID similarity checks if available; otherwise falls back to existing behavior.
 *
 * Returns identityResults array compatible with existing consumers, plus nested faceId info per page.
 */
export async function checkIdentityForPages({ pages, heroReference, bookDir, mode = 'dev', threshold = 0.62 }) {
  // If no hero reference available, fall back to existing behavior
  if (!heroReference) {
    const identityResults = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page?.dataUrl || page?.error) {
        identityResults.push({ similar: false, score: 0, threshold, error: page?.error || 'NO_IMAGE' });
        continue;
      }
      const comparison = await compareToHero(page.dataUrl, heroReference, mode, threshold);
      identityResults.push(comparison);
    }
    return identityResults;
  }

  // FaceID thresholds (safe defaults)
  const refThreshold = parseEnvFloat('FACE_ID_REF_THRESHOLD', 0.32);
  const anchorThreshold = parseEnvFloat('FACE_ID_ANCHOR_THRESHOLD', 0.30);
  const prevThreshold = parseEnvFloat('FACE_ID_PREV_THRESHOLD', 0.28);

  // Try to use FaceID wrapper if present and enabled
  let faceId;
  try {
    faceId = await import('./face-id/index.mjs');
  } catch {
    faceId = null;
  }

  const faceIdEnabled = !!(faceId?.isFaceIdEnabled && faceId.isFaceIdEnabled());
  const heroPath = heroReference?.path || null;

  // If FaceID is not available/enabled, keep existing behavior (TensorFlow compareToHero with skip semantics)
  if (!faceIdEnabled || !heroPath) {
    const identityResults = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page?.dataUrl || page?.error) {
        identityResults.push({ similar: false, score: 0, threshold, error: page?.error || 'NO_IMAGE' });
        continue;
      }
      const comparison = await compareToHero(page.dataUrl, heroReference, mode, threshold);
      identityResults.push(comparison);
    }
    return identityResults;
  }

  const { checkSimilarity } = faceId;

  // Prepare temp image files for FaceID checks (no python parsing here; wrapper handles it)
  const tempPaths = [];
  const pageImagePaths = pages.map((page, idx) => {
    const pageNum = page?.pageNumber || (idx + 1);
    if (!page?.base64 && !page?.dataUrl) return null;
    if (page?.error) return null;

    const ext = (page?.mimeType && page.mimeType.includes('png')) ? 'png' : 'jpg';
    const p = path.join(bookDir, `.faceid_page_${pageNum}.${ext}`);
    tempPaths.push(p);

    const base64Data = page.base64
      ? page.base64
      : (page.dataUrl.startsWith('data:image/') ? (page.dataUrl.split(',')[1] || '') : page.dataUrl);

    try {
      const buf = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(p, buf);
      return p;
    } catch {
      return null;
    }
  });

  const faceIdResults = await computeFaceIdCrossPageResults({
    referenceId: heroPath,
    pageIds: pageImagePaths,
    thresholds: { ref: refThreshold, anchor: anchorThreshold, prev: prevThreshold },
    similarityFn: checkSimilarity
  });

  const identityResults = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = page?.pageNumber || (i + 1);
    const faceIdResult = faceIdResults[i] || {
      refSimilarity: null,
      anchorSimilarity: null,
      prevSimilarity: null,
      anchorUpdated: false,
      thresholds: { ref: refThreshold, anchor: anchorThreshold, prev: prevThreshold },
      status: 'SKIPPED'
    };

    if (!pageImagePaths[i]) {
      identityResults.push({
        similar: false,
        score: 0,
        threshold: refThreshold,
        error: page?.error || 'NO_IMAGE',
        skipped: true,
        faceId: faceIdResult,
        pageNumber: pageNum
      });
      continue;
    }

    identityResults.push({
      similar: faceIdResult.status === 'PASS',
      score: faceIdResult.refSimilarity ?? 0,
      threshold: refThreshold,
      skipped: faceIdResult.status === 'SKIPPED',
      error: faceIdResult.failureReason || null,
      faceId: faceIdResult,
      pageNumber: pageNum
    });
  }

  // Cleanup temp files
  try {
    for (const p of tempPaths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch {}

  return identityResults;
}
