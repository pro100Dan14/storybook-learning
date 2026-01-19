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

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://api.projectt988.com";
const DEFAULT_MODEL = process.env.BYTEPLUS_MODEL || "";
const DEFAULT_SIZE = process.env.BYTEPLUS_SIZE || null;

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

function ensurePublicBaseUrl() {
  return PUBLIC_BASE_URL.replace(/\/+$/, "");
}

function getPublicInputUrl(bookId) {
  const base = ensurePublicBaseUrl();
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

async function fetchDataUrl(url) {
  const res = await fetchFn(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`SEEDREAM_VIEW_FAILED: ${res.status} ${res.statusText} ${errText.substring(0, 200)}`);
  }
  const mimeType = res.headers.get("content-type") || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  const base64 = buf.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

function normalizeImageUrls(data) {
  return (data || []).map((item) => item?.url).filter(Boolean);
}

export async function generateSeedreamBookImages({
  photoBuffer,
  scenes,
  bookId,
  includeDataUrl = true
}) {
  const { prompt1, prompt2Base, model, size, templateHash } = extractSeedreamPrompts();
  const finalModel = DEFAULT_MODEL || model;
  if (!finalModel) {
    throw new Error("BYTEPLUS_MODEL_MISSING");
  }

  const finalSize = DEFAULT_SIZE || size || "2048x2048";

  // 1) Save input image and build public URL
  const inputPath = writeInputImage(bookId, photoBuffer);
  const inputUrl = getPublicInputUrl(bookId);
  
  // Verify file exists and is accessible
  if (!fs.existsSync(inputPath)) {
    throw new Error(`SEEDREAM_INPUT_SAVE_FAILED: Failed to save input image to ${inputPath}`);
  }
  
  console.log(`[${bookId}] SEEDREAM: Saved input image to ${inputPath}, public URL: ${inputUrl}`);

  // 2) Anchor generation
  const anchorRes = await generateSeedreamImages({
    model: finalModel,
    prompt: prompt1,
    image: [inputUrl],
    size: finalSize,
    maxImages: 1
  });
  const anchorUrls = normalizeImageUrls(anchorRes.data);
  if (anchorUrls.length === 0) {
    safeUnlink(inputPath);
    throw new Error("SEEDREAM_ANCHOR_MISSING");
  }
  const anchorUrl = anchorUrls[0];

  // 3) Scenes generation
  const scenesLines = scenes.map((s, i) => {
    const text = String(s).trim();
    return text.toLowerCase().startsWith("scene")
      ? text
      : `Scene${i + 1}: ${text}`;
  });
  const scenesPrompt = `${prompt2Base.trimEnd()}\n\n${scenesLines.join("\n")}`;
  const scenesRes = await generateSeedreamImages({
    model: finalModel,
    prompt: scenesPrompt,
    image: [anchorUrl],
    size: finalSize,
    maxImages: scenes.length
  });
  const sceneUrls = normalizeImageUrls(scenesRes.data);

  const anchorImage = { url: anchorUrl };
  const sceneImages = sceneUrls.map((url) => ({ url }));

  if (includeDataUrl) {
    anchorImage.dataUrl = await fetchDataUrl(anchorUrl);
    for (const img of sceneImages) {
      img.dataUrl = await fetchDataUrl(img.url);
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


