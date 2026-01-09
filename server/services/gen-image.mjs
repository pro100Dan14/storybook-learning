// Unified image generation service
// Wraps provider with error handling and response parsing

import { getImageProvider } from "../providers/index.mjs";

export async function generateImageUnified({ prompt, images = [], requestId, testFlags = {} }) {
  // FORCE_IMAGE_FAIL: Test real failure path (dev/test only)
  // Check testFlags from request body first, then fall back to process.env
  const forceImageFail = testFlags.forceImageFail === true || 
                        (process.env.FORCE_IMAGE_FAIL === "1" && process.env.NODE_ENV !== "production");
  if (forceImageFail) {
    throw new Error("FORCE_IMAGE_FAIL: Simulating image generation failure for testing");
  }

  const provider = getImageProvider();

  // Normalize images format: ensure { base64, mimeType }
  const normalizedImages = images.map((img) => {
    if (typeof img === "string") {
      // Assume it's base64, try to extract from data URL if needed
      const base64 = img.includes("base64,") 
        ? img.split("base64,")[1] 
        : img;
      return { base64, mimeType: "image/jpeg" };
    }
    return {
      base64: img.base64 || img.data || "",
      mimeType: img.mimeType || "image/jpeg",
    };
  });

  try {
    const result = await provider.generateImage({
      prompt,
      images: normalizedImages,
      requestId,
    });

    return result;
  } catch (error) {
    // If provider throws NO_IMAGE_RETURNED, preserve metadata
    if (error.message === "NO_IMAGE_RETURNED") {
      const enhancedError = new Error("NO_IMAGE_RETURNED");
      enhancedError.finishReason = error.finishReason;
      enhancedError.safetyRatings = error.safetyRatings;
      enhancedError.raw = error.raw;
      enhancedError.provider = provider.constructor.name;
      throw enhancedError;
    }

    // Re-throw with context
    error.provider = provider.constructor.name;
    throw error;
  }
}


