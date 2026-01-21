/**
 * Seedream 4.5 direct generation (BytePlus)
 * Flow:
 * 1) Upload input photo to public URL (server /jobs)
 * 2) Call Seedream for anchor (prompt1, max_images=1)
 * 3) Call Seedream for scenes (prompt2Base + scenes, max_images=N) using anchor URL
 * 4) Return URLs + dataUrls
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateSeedreamImages } from "./byteplus-seedream-client.mjs";
import { extractSeedreamPrompts } from "./seedream-template.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Use same logic as routes/jobs.mjs: serverDir is parent of current directory
// In Docker: /app (where server/ is copied to)
// In local dev: server (parent of services/)
const serverDir = path.dirname(__dirname);
const JOBS_DIR = path.join(serverDir, "jobs");

const DEFAULT_MODEL = process.env.BYTEPLUS_MODEL || "";
const DEFAULT_SIZE = process.env.BYTEPLUS_SIZE || null;
const DEFAULT_FETCH_TIMEOUT_MS = Number.parseInt(process.env.SEEDREAM_FETCH_TIMEOUT_MS || "", 10);
const FALLBACK_FETCH_TIMEOUT_MS = 60000;
const SEEDREAM_FETCH_TIMEOUT_MS = Number.isFinite(DEFAULT_FETCH_TIMEOUT_MS) && DEFAULT_FETCH_TIMEOUT_MS > 0
  ? DEFAULT_FETCH_TIMEOUT_MS
  : FALLBACK_FETCH_TIMEOUT_MS;

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  return String(value).trim().replace(/\/+$/, "");
}

function resolvePublicBaseUrl(override) {
  return normalizeBaseUrl(override || process.env.PUBLIC_BASE_URL || "");
}

function getPublicInputUrl(bookId, publicBaseUrl) {
  const base = normalizeBaseUrl(publicBaseUrl);
  if (!base) {
    throw new Error("PUBLIC_BASE_URL_MISSING");
  }
  return `${base}/jobs/${bookId}/input.jpg`;
}

function writeInputImage(bookId, buffer) {
  const dir = path.join(JOBS_DIR, bookId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "input.jpg");
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

function normalizeTimeoutMs(value, fallback = SEEDREAM_FETCH_TIMEOUT_MS) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function createTimeoutSignal(timeoutMs) {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal: undefined, cancel: () => {} };
  }
  if (!globalThis.AbortController) {
    return { signal: undefined, cancel: () => {} };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeoutId)
  };
}

async function fetchDataUrl(url, timeoutMs) {
  const finalTimeoutMs = normalizeTimeoutMs(timeoutMs);
  const { signal, cancel } = createTimeoutSignal(finalTimeoutMs);
  try {
    const res = await fetchFn(url, { signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`SEEDREAM_VIEW_FAILED: ${res.status} ${res.statusText} ${errText.substring(0, 200)}`);
    }
    const mimeType = res.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    const base64 = buf.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`SEEDREAM_FETCH_TIMEOUT: ${finalTimeoutMs}ms`);
    }
    throw error;
  } finally {
    cancel();
  }
}

function normalizeImageUrls(data) {
  return (data || []).map((item) => item?.url).filter(Boolean);
}

function getAgeBodyProfile(age) {
  if (age <= 2) {
    return {
      label: "toddler",
      bodyNotes: "very short height, big head-to-body ratio, short limbs, rounder body"
    };
  }
  if (age <= 4) {
    return {
      label: "preschooler",
      bodyNotes: "short height, slightly longer limbs, still rounded proportions"
    };
  }
  if (age <= 6) {
    return {
      label: "young child",
      bodyNotes: "medium height for a child, balanced proportions"
    };
  }
  if (age <= 8) {
    return {
      label: "older child",
      bodyNotes: "taller height, longer limbs, slimmer body proportions"
    };
  }
  return {
    label: "pre-teen child",
    bodyNotes: "taller height, longer limbs, leaner proportions"
  };
}

function buildAgeBodyPrompt(age) {
  if (!Number.isFinite(age) || age < 1 || age > 10) {
    return "";
  }
  const profile = getAgeBodyProfile(age);
  return [
    `BODY AGE TARGET: ${age} years old (${profile.label}).`,
    `BODY PROPORTIONS: ${profile.bodyNotes}.`,
    "Scale the body to the scene accordingly (height, limb length, torso size).",
    "Do NOT change the face or facial age appearance; keep facial identity locked."
  ].join("\n");
}

function buildAgeSceneTag(age) {
  if (!Number.isFinite(age) || age < 1 || age > 10) {
    return "";
  }
  const profile = getAgeBodyProfile(age);
  return `Child is ${age} years old (${profile.label}) with ${profile.bodyNotes}.`;
}

export async function generateSeedreamBookImages({
  photoBuffer,
  scenes,
  bookId,
  includeDataUrl = true,
  publicBaseUrl,
  requestId,
  age,
  byteplusTimeoutMs,
  imageFetchTimeoutMs
}) {
  const { prompt1, prompt2Base, model, size, templateHash } = extractSeedreamPrompts();
  const finalModel = DEFAULT_MODEL || model;
  if (!finalModel) {
    throw new Error("BYTEPLUS_MODEL_MISSING");
  }

  const finalSize = DEFAULT_SIZE || size || "2048x2048";
  const resolvedBaseUrl = resolvePublicBaseUrl(publicBaseUrl);
  const shouldIncludeDataUrl = includeDataUrl === true;

  // 1) Save input image and build public URL
  const inputPath = writeInputImage(bookId, photoBuffer);
  const inputUrl = getPublicInputUrl(bookId, resolvedBaseUrl);
  
  // Verify file exists and is accessible
  if (!fs.existsSync(inputPath)) {
    throw new Error(`SEEDREAM_INPUT_SAVE_FAILED: Failed to save input image to ${inputPath}`);
  }
  
  if (requestId) {
    console.log(`[${requestId}] SEEDREAM: Saved input image to ${inputPath}, public URL: ${inputUrl}`);
  } else {
    console.log(`[${bookId}] SEEDREAM: Saved input image to ${inputPath}, public URL: ${inputUrl}`);
  }

  // 2) Anchor generation
  const anchorRes = await generateSeedreamImages({
    model: finalModel,
    prompt: prompt1,
    image: [inputUrl],
    size: finalSize,
    maxImages: 1,
    timeoutMs: byteplusTimeoutMs,
    requestId
  });
  const anchorUrls = normalizeImageUrls(anchorRes.data);
  if (anchorUrls.length === 0) {
    safeUnlink(inputPath);
    throw new Error("SEEDREAM_ANCHOR_MISSING");
  }
  const anchorUrl = anchorUrls[0];

  // 3) Scenes generation
  const ageSceneTag = buildAgeSceneTag(age);
  const scenesLines = scenes.map((s, i) => {
    const text = String(s).trim();
    const baseLine = text.toLowerCase().startsWith("scene")
      ? text
      : `Scene${i + 1}: ${text}`;
    return ageSceneTag ? `${baseLine} (${ageSceneTag})` : baseLine;
  });
  const agePrompt = buildAgeBodyPrompt(age);
  const prompt2Parts = [prompt2Base.trim(), agePrompt].filter(Boolean);
  const scenesPrompt = `${prompt2Parts.join("\n\n")}\n\n${scenesLines.join("\n")}`;
  const scenesRes = await generateSeedreamImages({
    model: finalModel,
    prompt: scenesPrompt,
    image: [anchorUrl],
    size: finalSize,
    maxImages: scenes.length,
    timeoutMs: byteplusTimeoutMs,
    requestId
  });
  const sceneUrls = normalizeImageUrls(scenesRes.data);

  const anchorImage = { url: anchorUrl };
  const sceneImages = sceneUrls.map((url) => ({ url }));

  if (shouldIncludeDataUrl) {
    anchorImage.dataUrl = await fetchDataUrl(anchorUrl, imageFetchTimeoutMs);
    for (const img of sceneImages) {
      img.dataUrl = await fetchDataUrl(img.url, imageFetchTimeoutMs);
    }
  }

  // Don't delete input image immediately - BytePlus API may still be downloading it
  // File will be cleaned up later or can be kept for debugging
  // safeUnlink(inputPath);

  return {
    jobId: bookId,
    anchorImage,
    sceneImages,
    metadata: {
      workflowVersionHash: templateHash,
      model: finalModel,
      size: finalSize
    }
  };
}


