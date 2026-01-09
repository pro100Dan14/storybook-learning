// Gemini authentication helpers
// Provides scoped GoogleAuth client and access token retrieval for Gemini API

import { GoogleAuth } from "google-auth-library";

// Cached GoogleAuth client with required scopes for Gemini API
let geminiAuthClient = null;

// Helper: Get cached Gemini auth client with proper scopes
export function getGeminiAuthClient() {
  if (!geminiAuthClient) {
    geminiAuthClient = new GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/generative-language",
        "https://www.googleapis.com/auth/cloud-platform",
      ],
    });
  }
  return geminiAuthClient;
}

// Helper: Get access token for Gemini API requests
export async function getGeminiAccessToken() {
  try {
    const auth = getGeminiAuthClient();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    
    if (!accessToken || !accessToken.token || accessToken.token.trim() === "") {
      throw new Error("Failed to obtain access token: token is empty");
    }
    
    return accessToken.token;
  } catch (error) {
    const errorMsg = error && error.message ? error.message : String(error);
    throw new Error(`Failed to get Gemini access token: ${errorMsg}`);
  }
}

