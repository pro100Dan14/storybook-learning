/**
 * Character Assets Service
 * 
 * Creates and manages hero_head and hero_fullbody_ref assets for v2 pipeline.
 * These assets are generated once per book and used for consistent character rendering.
 * 
 * hero_head: Face + hair close-up for compositing
 * hero_fullbody_ref: Full body with locked outfit for Gemini reference
 */

import fs from "fs";
import path from "path";
import { generateImageUnified } from "./gen-image.mjs";
import {
  buildHeroHeadPromptV2,
  buildHeroFullBodyPromptV2,
  getPredefinedOutfit,
  inferGenderFromIdentity,
  getOutfitIndexFromBookId
} from "../prompts/storytelling_v2.mjs";

// Feature flags
const CHARACTER_ASSETS_ENABLED = process.env.CHARACTER_ASSETS_ENABLED === "true" || 
                                  process.env.CHARACTER_ASSETS_ENABLED === "1";

/**
 * Check if character assets feature is enabled
 * @returns {boolean}
 */
export function isCharacterAssetsEnabled() {
  return CHARACTER_ASSETS_ENABLED;
}

/**
 * Get or create outfit description for a book
 * @param {string} bookId - Book UUID
 * @param {object} identity - Identity object
 * @param {string} [userOutfit] - Optional user-specified outfit
 * @returns {string} Outfit description
 */
export function getOutfitDescription(bookId, identity, userOutfit = null) {
  // Option 1: User specified outfit
  if (userOutfit && typeof userOutfit === "string" && userOutfit.trim().length > 10) {
    return userOutfit.trim();
  }
  
  // Option 2: Deterministic selection from predefined outfits
  const gender = inferGenderFromIdentity(identity);
  const outfitIndex = getOutfitIndexFromBookId(bookId);
  return getPredefinedOutfit(gender, outfitIndex);
}

/**
 * Generate hero head asset (face + hair close-up)
 * @param {object} params
 * @param {string} params.bookId - Book UUID
 * @param {string} params.bookDir - Book directory path
 * @param {object} params.identity - Identity object
 * @param {string} params.photoBase64 - Child photo base64
 * @param {string} params.photoMimeType - Photo MIME type
 * @param {string} params.requestId - Request ID for logging
 * @returns {Promise<{success: boolean, path?: string, base64?: string, mimeType?: string, error?: string}>}
 */
export async function generateHeroHead({ bookId, bookDir, identity, photoBase64, photoMimeType, requestId }) {
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    
    try {
      const prompt = buildHeroHeadPromptV2(identity);
      
      const result = await generateImageUnified({
        prompt,
        images: [{ base64: photoBase64, mimeType: photoMimeType || "image/jpeg" }],
        requestId
      });
      
      const elapsed = Date.now() - attemptStart;
      
      if (!result || !result.dataUrl) {
        console.log(`[${requestId}] HERO_HEAD: attempt ${attempt} no image returned (${elapsed}ms)`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        continue;
      }
      
      // Extract base64 from dataUrl
      const base64 = result.dataUrl.split("base64,")[1];
      if (!base64) {
        console.log(`[${requestId}] HERO_HEAD: attempt ${attempt} invalid dataUrl format (${elapsed}ms)`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        continue;
      }
      
      // Save to disk
      const assetPath = path.join(bookDir, "hero_head.png");
      const buffer = Buffer.from(base64, "base64");
      fs.writeFileSync(assetPath, buffer);
      
      console.log(`[${requestId}] HERO_HEAD: SUCCESS (attempt ${attempt}, ${elapsed}ms)`);
      
      return {
        success: true,
        path: assetPath,
        base64,
        mimeType: result.mimeType || "image/png"
      };
    } catch (error) {
      const elapsed = Date.now() - attemptStart;
      const errorMsg = error?.message || String(error);
      console.error(`[${requestId}] HERO_HEAD: attempt ${attempt} error (${elapsed}ms):`, errorMsg.substring(0, 200));
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }
  
  return {
    success: false,
    error: `Failed to generate hero_head after ${maxAttempts} attempts`
  };
}

/**
 * Generate hero full body reference (with locked outfit)
 * @param {object} params
 * @param {string} params.bookId - Book UUID
 * @param {string} params.bookDir - Book directory path
 * @param {object} params.identity - Identity object
 * @param {string} params.outfitDescription - Locked outfit description
 * @param {string} params.heroHeadBase64 - Hero head base64 for reference
 * @param {string} params.heroHeadMimeType - Hero head MIME type
 * @param {string} params.photoBase64 - Original child photo base64
 * @param {string} params.photoMimeType - Original photo MIME type
 * @param {string} params.requestId - Request ID for logging
 * @returns {Promise<{success: boolean, path?: string, base64?: string, mimeType?: string, error?: string}>}
 */
export async function generateHeroFullBody({ 
  bookId, 
  bookDir, 
  identity, 
  outfitDescription,
  heroHeadBase64,
  heroHeadMimeType,
  photoBase64,
  photoMimeType,
  requestId 
}) {
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    
    try {
      const prompt = buildHeroFullBodyPromptV2(identity, outfitDescription);
      
      // Use hero_head as primary reference, original photo as secondary
      const images = [
        { base64: heroHeadBase64, mimeType: heroHeadMimeType || "image/png" }
      ];
      
      // Optionally include original photo for body proportions
      // But this may trigger safety filters, so we make it configurable
      const sendOriginalPhoto = process.env.SEND_ORIGINAL_PHOTO_TO_FULLBODY !== "false";
      if (sendOriginalPhoto && photoBase64) {
        images.push({ base64: photoBase64, mimeType: photoMimeType || "image/jpeg" });
      }
      
      const result = await generateImageUnified({
        prompt,
        images,
        requestId
      });
      
      const elapsed = Date.now() - attemptStart;
      
      if (!result || !result.dataUrl) {
        console.log(`[${requestId}] HERO_FULLBODY: attempt ${attempt} no image returned (${elapsed}ms)`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        continue;
      }
      
      // Extract base64 from dataUrl
      const base64 = result.dataUrl.split("base64,")[1];
      if (!base64) {
        console.log(`[${requestId}] HERO_FULLBODY: attempt ${attempt} invalid dataUrl format (${elapsed}ms)`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        continue;
      }
      
      // Save to disk
      const assetPath = path.join(bookDir, "hero_fullbody_ref.jpg");
      const buffer = Buffer.from(base64, "base64");
      fs.writeFileSync(assetPath, buffer);
      
      console.log(`[${requestId}] HERO_FULLBODY: SUCCESS (attempt ${attempt}, ${elapsed}ms)`);
      
      return {
        success: true,
        path: assetPath,
        base64,
        mimeType: result.mimeType || "image/jpeg"
      };
    } catch (error) {
      const elapsed = Date.now() - attemptStart;
      const errorMsg = error?.message || String(error);
      console.error(`[${requestId}] HERO_FULLBODY: attempt ${attempt} error (${elapsed}ms):`, errorMsg.substring(0, 200));
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }
  
  return {
    success: false,
    error: `Failed to generate hero_fullbody_ref after ${maxAttempts} attempts`
  };
}

/**
 * Create all character assets for a book
 * @param {object} params
 * @param {string} params.bookId - Book UUID
 * @param {string} params.bookDir - Book directory path
 * @param {object} params.identity - Identity object
 * @param {string} params.photoBase64 - Child photo base64
 * @param {string} params.photoMimeType - Photo MIME type
 * @param {string} [params.userOutfit] - Optional user-specified outfit
 * @param {string} params.requestId - Request ID for logging
 * @returns {Promise<{success: boolean, assets?: object, error?: string}>}
 */
export async function createCharacterAssets({ 
  bookId, 
  bookDir, 
  identity, 
  photoBase64, 
  photoMimeType, 
  userOutfit,
  requestId 
}) {
  const startTime = Date.now();
  
  console.log(`[${requestId}] Creating character assets for book ${bookId}`);
  
  // Step 1: Determine outfit
  const outfitDescription = getOutfitDescription(bookId, identity, userOutfit);
  console.log(`[${requestId}] Outfit determined: ${outfitDescription.substring(0, 50)}...`);
  
  // Save outfit to metadata file
  const metadataPath = path.join(bookDir, "character_assets.json");
  const metadata = {
    bookId,
    outfitDescription,
    gender: inferGenderFromIdentity(identity),
    createdAt: new Date().toISOString()
  };
  
  // Step 2: Generate hero_head
  const heroHeadResult = await generateHeroHead({
    bookId,
    bookDir,
    identity,
    photoBase64,
    photoMimeType,
    requestId
  });
  
  if (!heroHeadResult.success) {
    return {
      success: false,
      error: `hero_head generation failed: ${heroHeadResult.error}`
    };
  }
  
  metadata.heroHead = {
    path: heroHeadResult.path,
    mimeType: heroHeadResult.mimeType
  };
  
  // Step 3: Generate hero_fullbody_ref
  const fullBodyResult = await generateHeroFullBody({
    bookId,
    bookDir,
    identity,
    outfitDescription,
    heroHeadBase64: heroHeadResult.base64,
    heroHeadMimeType: heroHeadResult.mimeType,
    photoBase64,
    photoMimeType,
    requestId
  });
  
  if (!fullBodyResult.success) {
    return {
      success: false,
      error: `hero_fullbody_ref generation failed: ${fullBodyResult.error}`
    };
  }
  
  metadata.heroFullBody = {
    path: fullBodyResult.path,
    mimeType: fullBodyResult.mimeType
  };
  
  // Save metadata
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  
  const totalTime = Date.now() - startTime;
  console.log(`[${requestId}] Character assets created successfully (${totalTime}ms)`);
  
  return {
    success: true,
    assets: {
      heroHead: {
        path: heroHeadResult.path,
        base64: heroHeadResult.base64,
        mimeType: heroHeadResult.mimeType
      },
      heroFullBody: {
        path: fullBodyResult.path,
        base64: fullBodyResult.base64,
        mimeType: fullBodyResult.mimeType
      },
      outfitDescription,
      metadataPath
    }
  };
}

/**
 * Load character assets from disk (if they exist)
 * @param {string} bookDir - Book directory path
 * @returns {{loaded: boolean, assets?: object}}
 */
export function loadCharacterAssets(bookDir) {
  const metadataPath = path.join(bookDir, "character_assets.json");
  
  if (!fs.existsSync(metadataPath)) {
    return { loaded: false };
  }
  
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    
    const heroHeadPath = path.join(bookDir, "hero_head.png");
    const fullBodyPath = path.join(bookDir, "hero_fullbody_ref.jpg");
    
    if (!fs.existsSync(heroHeadPath) || !fs.existsSync(fullBodyPath)) {
      return { loaded: false };
    }
    
    const heroHeadBuffer = fs.readFileSync(heroHeadPath);
    const fullBodyBuffer = fs.readFileSync(fullBodyPath);
    
    return {
      loaded: true,
      assets: {
        heroHead: {
          path: heroHeadPath,
          base64: heroHeadBuffer.toString("base64"),
          mimeType: metadata.heroHead?.mimeType || "image/png"
        },
        heroFullBody: {
          path: fullBodyPath,
          base64: fullBodyBuffer.toString("base64"),
          mimeType: metadata.heroFullBody?.mimeType || "image/jpeg"
        },
        outfitDescription: metadata.outfitDescription
      }
    };
  } catch (error) {
    console.error("Failed to load character assets:", error.message);
    return { loaded: false };
  }
}




