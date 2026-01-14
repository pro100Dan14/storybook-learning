/**
 * Hero Reference Image Generation Service
 * Extracted from index.js for modularity
 */

import { generateImageUnified } from "./gen-image.mjs";
import { buildHeroReferencePrompt, buildHeroReferenceFallbackPrompt } from "../prompts/storytelling.mjs";

/**
 * Generate hero reference image with retry and fallback
 * @param {object} identity - Character identity object
 * @param {string} photoBase64 - Base64 encoded photo
 * @param {string} mimeType - Photo MIME type
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<object>} Hero reference result with mimeType, dataUrl, base64
 */
export async function generateHeroReference(identity, photoBase64, mimeType, requestId) {
  const prompt = buildHeroReferencePrompt(identity);
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    try {
      const result = await generateImageUnified({
        prompt,
        images: [{ base64: photoBase64, mimeType: mimeType || "image/jpeg" }],
        requestId
      });
      const elapsed = Date.now() - attemptStart;
      
      // Extract base64 from dataUrl for backward compatibility
      const base64 = result.dataUrl.split("base64,")[1];
      
      console.log(`[${requestId}] HERO: SUCCESS (attempt ${attempt}, ${elapsed}ms, mimeType: ${result.mimeType})`);
      
      return {
        mimeType: result.mimeType,
        dataUrl: result.dataUrl,
        base64: base64
      };
    } catch (e) {
      const elapsed = Date.now() - attemptStart;
      const finishReason = e.finishReason;
      const safetyRatings = e.safetyRatings;
      const safetyStr = safetyRatings ? safetyRatings.map(r => `${r.category}:${r.probability}`).join(",") : "none";
      
      if (e.message === "NO_IMAGE_RETURNED") {
        console.log(`[${requestId}] HERO: attempt ${attempt} failed (${elapsed}ms, finishReason: ${finishReason}, safetyRatings: ${safetyStr})`);
      } else {
        console.error(`[${requestId}] HERO: attempt ${attempt} exception:`, e?.message || e);
      }
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }
  
  // Fallback: Try face-avoiding prompt
  console.log(`[${requestId}] HERO: All ${maxAttempts} attempts failed, trying fallback (face-avoiding)...`);
  const fallbackStartTime = Date.now();
  try {
    const fallbackPrompt = buildHeroReferenceFallbackPrompt(identity);
    const result = await generateImageUnified({
      prompt: fallbackPrompt,
      images: [{ base64: photoBase64, mimeType: mimeType || "image/jpeg" }],
      requestId
    });
    const elapsed = Date.now() - fallbackStartTime;
    
    // Extract base64 from dataUrl
    const base64 = result.dataUrl.split("base64,")[1];
    const finishReason = result.raw?.candidates?.[0]?.finishReason || result.raw?.response?.candidates?.[0]?.finishReason;
    
    console.log(`[${requestId}] HERO: FALLBACK SUCCESS (${elapsed}ms, mimeType: ${result.mimeType}, finishReason: ${finishReason})`);
    
    return {
      mimeType: result.mimeType,
      dataUrl: result.dataUrl,
      base64: base64,
      isFallback: true
    };
  } catch (e) {
    const elapsed = Date.now() - fallbackStartTime;
    const finishReason = e.finishReason;
    const safetyRatings = e.safetyRatings;
    const safetyStr = safetyRatings ? safetyRatings.map(r => `${r.category}:${r.probability}`).join(",") : "none";
    console.error(`[${requestId}] HERO: FALLBACK failed (${elapsed}ms, finishReason: ${finishReason}, safetyRatings: ${safetyStr})`);
  }
  
  throw new Error("NO_HERO_IMAGE_RETURNED");
}




