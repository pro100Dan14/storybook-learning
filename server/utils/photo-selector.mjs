// Photo selector - chooses best hero photo from uploaded set
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tf = null;
let faceLandmarksDetection = null;
let dependenciesAvailable = null;

/**
 * Check if face detection dependencies are available
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
    dependenciesAvailable = false;
    return false;
  }
}

/**
 * Detect faces in image buffer using TensorFlow
 * Returns { faceCount: number, isCentered: boolean, quality: number }
 */
async function detectFaces(imageBuffer) {
  if (!await checkDependencies()) {
    return null;
  }
  
  try {
    let model = null;
    if (!model) {
      model = await faceLandmarksDetection.load(
        faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
        { maxFaces: 2 }
      );
    }
    
    const imageTensor = tf.node.decodeImage(imageBuffer, 3);
    const faces = await model.estimateFaces({
      input: imageTensor,
      returnTensors: false,
      flipHorizontal: false,
      staticImageMode: true
    });
    
    imageTensor.dispose();
    
    if (!faces || faces.length === 0) {
      return { faceCount: 0, isCentered: false, quality: 0 };
    }
    
    if (faces.length > 1) {
      return { faceCount: faces.length, isCentered: false, quality: 0 };
    }
    
    // Check if face is centered (rough heuristic: face center should be near image center)
    const face = faces[0];
    const keypoints = face.keypoints || [];
    if (keypoints.length === 0) {
      return { faceCount: 1, isCentered: false, quality: 0.5 };
    }
    
    // Calculate face center
    let sumX = 0, sumY = 0;
    for (const kp of keypoints) {
      sumX += kp.x;
      sumY += kp.y;
    }
    const faceCenterX = sumX / keypoints.length;
    const faceCenterY = sumY / keypoints.length;
    
    // Image dimensions (approximate from tensor, or use buffer metadata)
    // For simplicity, assume face is centered if center is within 40% of image center
    const imageWidth = 512; // Approximate, will refine
    const imageHeight = 512;
    const centerX = imageWidth / 2;
    const centerY = imageHeight / 2;
    
    const distFromCenter = Math.sqrt(
      Math.pow(faceCenterX - centerX, 2) + Math.pow(faceCenterY - centerY, 2)
    );
    const maxDist = Math.sqrt(Math.pow(imageWidth, 2) + Math.pow(imageHeight, 2)) * 0.3;
    const isCentered = distFromCenter < maxDist;
    
    // Quality based on number of keypoints
    const quality = Math.min(1.0, keypoints.length / 68);
    
    return { faceCount: 1, isCentered, quality };
  } catch (error) {
    return null;
  }
}

/**
 * Estimate image resolution from base64
 * Returns approximate width * height
 */
function estimateResolution(base64) {
  // Decode base64 to get approximate size
  // This is a rough estimate - actual decoding would require full image processing
  const base64Length = base64.length;
  // Approximate: base64 is ~4/3 of original size, and we can estimate from data URL header if present
  // For JPEG, we can try to read dimensions from header, but for simplicity, use size as proxy
  return base64Length; // Larger = higher resolution (rough)
}

/**
 * Select best hero photo from uploaded photos
 * @param {Array} photos - Array of { base64: string, mimeType: string } or single photo object
 * @param {string} mode - 'dev' or 'prod'
 * @returns {Promise<{ photo: object, index: number, stats: object, reason: string }>}
 */
export async function selectBestHeroPhoto(photos, mode = 'dev') {
  // Normalize input: if single photo, wrap in array
  const photoArray = Array.isArray(photos) ? photos : [photos];
  
  if (photoArray.length === 0) {
    throw new Error('No photos provided');
  }
  
  if (photoArray.length === 1) {
    return {
      photo: photoArray[0],
      index: 0,
      stats: { resolution: estimateResolution(photoArray[0].base64 || photoArray[0].imageBase64 || '') },
      reason: 'single_photo'
    };
  }
  
  // Check dependencies
  const hasDependencies = await checkDependencies();
  
  if (mode === 'prod' && !hasDependencies) {
    throw new Error('Identity guard unavailable in production. Install @tensorflow/tfjs-node and @tensorflow-models/face-landmarks-detection.');
  }
  
  // Score each photo
  const scores = [];
  
  for (let i = 0; i < photoArray.length; i++) {
    const photo = photoArray[i];
    const base64 = photo.base64 || photo.imageBase64 || photo.photoBase64 || '';
    
    if (!base64) {
      scores.push({ index: i, score: -1, reason: 'no_base64' });
      continue;
    }
    
    // Clean base64 (remove data URL prefix if present)
    const cleanBase64 = base64.includes('base64,') 
      ? base64.split('base64,')[1] 
      : base64;
    
    const buffer = Buffer.from(cleanBase64, 'base64');
    const resolution = estimateResolution(cleanBase64);
    
    let score = 0;
    let reason = '';
    
    // Resolution score (0-40 points)
    const resolutionScore = Math.min(40, (resolution / 100000) * 40);
    score += resolutionScore;
    
    if (hasDependencies) {
      // Face detection score (0-60 points)
      const faceInfo = await detectFaces(buffer);
      if (faceInfo) {
        if (faceInfo.faceCount === 0) {
          score = -1;
          reason = 'no_face';
        } else if (faceInfo.faceCount > 1) {
          score = -1;
          reason = 'multiple_faces';
        } else {
          // Single face
          score += faceInfo.isCentered ? 30 : 15;
          score += faceInfo.quality * 30;
          reason = `face_detected_centered:${faceInfo.isCentered}_quality:${faceInfo.quality.toFixed(2)}`;
        }
      } else {
        // Detection failed but not fatal
        score += 20; // Partial credit
        reason = 'face_detection_failed';
      }
    } else {
      // Dev mode fallback: resolution-based only
      if (mode === 'dev') {
        console.warn(`[selectBestHeroPhoto] Face detection unavailable in dev mode, using resolution-based selection`);
        reason = 'resolution_only_dev_mode';
      }
    }
    
    scores.push({
      index: i,
      score,
      resolution,
      reason: reason || 'scored'
    });
  }
  
  // Filter out invalid photos (score < 0)
  const validScores = scores.filter(s => s.score >= 0);
  
  if (validScores.length === 0) {
    throw new Error('No valid photos found (all photos failed face detection or have no face)');
  }
  
  // Sort by score descending
  validScores.sort((a, b) => b.score - a.score);
  
  const best = validScores[0];
  const selectedPhoto = photoArray[best.index];
  
  return {
    photo: selectedPhoto,
    index: best.index,
    stats: {
      resolution: best.resolution,
      score: best.score,
      totalPhotos: photoArray.length,
      validPhotos: validScores.length
    },
    reason: best.reason
  };
}



