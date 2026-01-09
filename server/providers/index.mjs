// Provider factory and registry
// Selects provider based on PROVIDER_TEXT and PROVIDER_IMAGE env vars

import { GeminiTextProvider, GeminiImageProvider } from "./gemini.mjs";
import { DummyTextProvider, DummyImageProvider } from "./dummy.mjs";

const PROVIDER_TEXT = (process.env.PROVIDER_TEXT || "gemini").toLowerCase();
const PROVIDER_IMAGE = (process.env.PROVIDER_IMAGE || "gemini").toLowerCase();

let textProvider = null;
let imageProvider = null;

export function getTextProvider() {
  if (!textProvider) {
    if (PROVIDER_TEXT === "dummy") {
      textProvider = new DummyTextProvider();
    } else {
      textProvider = new GeminiTextProvider();
    }
  }
  return textProvider;
}

export function getImageProvider() {
  if (!imageProvider) {
    if (PROVIDER_IMAGE === "dummy") {
      imageProvider = new DummyImageProvider();
    } else {
      imageProvider = new GeminiImageProvider();
    }
  }
  return imageProvider;
}


