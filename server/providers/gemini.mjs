// Gemini provider implementation
// Uses existing @google/genai SDK

import { GoogleGenAI } from "@google/genai";
import { getGeminiAccessToken } from "../utils/gemini-auth.mjs";

const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// Helper: Make authenticated request to Gemini API
async function makeGeminiRequest(model, contents, config = {}) {
  const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  
  try {
    const accessToken = await getGeminiAccessToken();
    
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        ...config,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMsg = `Gemini API error: ${response.status} ${response.statusText}`;
      // Log full error details for debugging
      try {
        const errorJson = JSON.parse(errorText);
        console.error(`[Gemini API] ${errorMsg}`, JSON.stringify(errorJson, null, 2));
      } catch {
        console.error(`[Gemini API] ${errorMsg}`, errorText.substring(0, 1000));
      }
      const enhancedError = new Error(errorMsg);
      enhancedError.status = response.status;
      enhancedError.statusText = response.statusText;
      enhancedError.details = errorText;
      throw enhancedError;
    }

    return await response.json();
  } catch (error) {
    if (error.message && error.message.includes("Gemini API error")) {
      throw error;
    }
    throw new Error(`Failed to call Gemini API: ${error.message || String(error)}`);
  }
}

// Helper: Extract text from Gemini response
function extractText(result) {
  try {
    if (result?.response?.text) return String(result.response.text()).trim();
  } catch {}

  const parts =
    result?.response?.candidates?.[0]?.content?.parts ||
    result?.candidates?.[0]?.content?.parts ||
    [];

  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

// Helper: Extract first inline image part
function extractFirstInlineImagePart(result) {
  const parts =
    result?.response?.candidates?.[0]?.content?.parts ||
    result?.candidates?.[0]?.content?.parts ||
    [];

  return parts.find((p) => p?.inlineData?.data);
}

export class GeminiTextProvider {
  async generateText({ prompt, images = [], requestId }) {
    const parts = [{ text: prompt }];

    // Add images if provided
    for (const img of images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType || "image/jpeg",
          data: img.base64,
        },
      });
    }

    const contents = [
      {
        role: "user",
        parts,
      },
    ];

    let result;
    if (ai) {
      // Use SDK with API key
      result = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents,
        config: {
          generationConfig: {
            maxOutputTokens: 8192, // Maximum tokens for gemini-2.5-flash to prevent text truncation
          },
        },
      });
    } else {
      // Use raw HTTP request with scoped access token
      result = await makeGeminiRequest(GEMINI_TEXT_MODEL, contents, {
        generationConfig: {
          maxOutputTokens: 8192, // Maximum tokens for gemini-2.5-flash to prevent text truncation
        },
      });
    }

    const text = extractText(result);
    const raw = result;

    return { text, raw };
  }
}

export class GeminiImageProvider {
  async generateImage({ prompt, images = [], requestId }) {
    const DEBUG_BOOK = process.env.DEBUG_BOOK === "1";
    const authMode = ai ? "api-key" : "adc-token";
    
    if (DEBUG_BOOK) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "debug",
        requestId: requestId || "unknown",
        message: "Gemini image generation starting",
        authMode,
      }));
    }
    
    const parts = [{ text: prompt }];

    // Add images if provided
    for (const img of images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType || "image/jpeg",
          data: img.base64,
        },
      });
    }

    const contents = [
      {
        role: "user",
        parts,
      },
    ];

    let result;
    let responseStatus = null;
    
    try {
      if (ai) {
        // Use SDK with API key - SDK supports responseModalities
        result = await ai.models.generateContent({
          model: GEMINI_IMAGE_MODEL,
          contents,
          config: {
            responseModalities: ["IMAGE"],
          },
        });
        responseStatus = 200; // SDK doesn't expose status, assume success if no error
      } else {
        // Use raw HTTP request with scoped access token
        // REST API doesn't support responseModalities in request body
        // For image generation, we need to use generationConfig with imageGenerationConfig
        // or rely on the model to return images by default when appropriate
        try {
          // For REST API, we don't pass responseModalities - the model should return images
          // if the prompt requests image generation
          result = await makeGeminiRequest(GEMINI_IMAGE_MODEL, contents, {
            generationConfig: {
              temperature: 0.4,
            },
          });
          responseStatus = 200;
        } catch (error) {
          // Extract status from error object or message
          responseStatus = error.status || (error.message?.match(/error: (\d+)/)?.[1] ? parseInt(error.message.match(/error: (\d+)/)[1], 10) : null);
          throw error;
        }
      }
    } catch (error) {
      if (DEBUG_BOOK) {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          requestId: requestId || "unknown",
          message: "Gemini image generation failed",
          authMode,
          responseStatus,
          errorMessage: error?.message?.substring(0, 200) || String(error).substring(0, 200),
        }));
      }
      throw error;
    }
    
    if (DEBUG_BOOK) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "debug",
        requestId: requestId || "unknown",
        message: "Gemini image generation completed",
        authMode,
        responseStatus,
      }));
    }

    const imagePart = extractFirstInlineImagePart(result);
    const cand = result?.candidates?.[0] || result?.response?.candidates?.[0];
    const finishReason = cand?.finishReason;
    const safetyRatings = cand?.safetyRatings;

    if (!imagePart) {
      // Log detailed info for debugging
      const parts = result?.response?.candidates?.[0]?.content?.parts || 
                    result?.candidates?.[0]?.content?.parts || 
                    [];
      const partTypes = parts.map(p => {
        if (p.inlineData) return "inlineData";
        if (p.text) return "text";
        return "unknown";
      }).join(", ");
      
      if (DEBUG_BOOK) {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "warn",
          requestId: requestId || "unknown",
          message: "Gemini returned no image part",
          finishReason: finishReason || "unknown",
          safetyRatings: safetyRatings ? safetyRatings.map(r => `${r.category}:${r.probability}`).join(",") : "none",
          partsCount: parts.length,
          partTypes: partTypes || "none",
        }));
      }
      
      const error = new Error("NO_IMAGE_RETURNED");
      error.finishReason = finishReason;
      error.safetyRatings = safetyRatings;
      error.raw = result;
      throw error;
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const base64 = imagePart.inlineData.data;
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return { mimeType, dataUrl, raw: result };
  }
}

