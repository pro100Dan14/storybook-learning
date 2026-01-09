// Unified text generation service
// Wraps provider with retry logic and error handling

import { getTextProvider } from "../providers/index.mjs";

export async function generateTextUnified({ prompt, images = [], requestId }) {
  const provider = getTextProvider();

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
    const result = await provider.generateText({
      prompt,
      images: normalizedImages,
      requestId,
    });

    return result;
  } catch (error) {
    // Re-throw with context
    error.provider = provider.constructor.name;
    throw error;
  }
}

