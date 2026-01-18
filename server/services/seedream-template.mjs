/**
 * Seedream template loader
 * Extracts prompt1 (anchor) and prompt2 base (scenes)
 */

import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../");

const TEMPLATE_PATH = path.join(REPO_ROOT, "api_bytedance_seedream4");
const TEMPLATE_FALLBACK = path.join(REPO_ROOT, "api_bytedance_seedream4.json");

let cachedTemplate = null;
let cachedHash = null;

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function findNodesByClassType(workflow, classType) {
  return Object.entries(workflow)
    .filter(([, node]) => node?.class_type === classType)
    .map(([id, node]) => ({ id, node }));
}

export function getSeedreamTemplate() {
  if (!cachedTemplate) {
    const templatePath = fs.existsSync(TEMPLATE_PATH)
      ? TEMPLATE_PATH
      : TEMPLATE_FALLBACK;
    if (!fs.existsSync(templatePath)) {
      throw new Error("SEEDREAM_TEMPLATE_NOT_FOUND");
    }
    const raw = fs.readFileSync(templatePath, "utf8");
    cachedTemplate = JSON.parse(raw);
    cachedHash = sha256(raw);
  }

  return { template: deepClone(cachedTemplate), templateHash: cachedHash };
}

export function extractSeedreamPrompts() {
  const { template, templateHash } = getSeedreamTemplate();
  const seedreamNodes = findNodesByClassType(template, "ByteDanceSeedreamNode");
  if (seedreamNodes.length < 2) {
    throw new Error("SEEDREAM_NODES_NOT_FOUND");
  }

  const anchorNode = seedreamNodes.find((n) => Number(n.node?.inputs?.max_images) === 1);
  const scenesNode = seedreamNodes.find((n) => Number(n.node?.inputs?.max_images) !== 1);

  if (!anchorNode || !scenesNode) {
    throw new Error("SEEDREAM_ANCHOR_OR_SCENES_NOT_FOUND");
  }

  const prompt1 = anchorNode.node?.inputs?.prompt || "";
  const prompt2Base = scenesNode.node?.inputs?.prompt || "";

  const model = anchorNode.node?.inputs?.model || scenesNode.node?.inputs?.model || "";
  const width = anchorNode.node?.inputs?.width || scenesNode.node?.inputs?.width || null;
  const height = anchorNode.node?.inputs?.height || scenesNode.node?.inputs?.height || null;
  const sizePreset = anchorNode.node?.inputs?.size_preset || scenesNode.node?.inputs?.size_preset || null;

  let size = null;
  if (width && height) {
    size = `${width}x${height}`;
  } else if (typeof sizePreset === "string" && sizePreset.includes("2048x2048")) {
    size = "2048x2048";
  } else if (typeof sizePreset === "string" && sizePreset.includes("2K")) {
    size = "2K";
  }

  return {
    prompt1,
    prompt2Base,
    model,
    size,
    templateHash
  };
}

export function computeSeedBase(seedBase, bookId) {
  const parts = [];
  if (seedBase !== undefined && seedBase !== null && `${seedBase}`.length > 0) {
    parts.push(String(seedBase));
  }
  if (bookId) {
    parts.push(String(bookId));
  }
  const source = (parts.length > 0 ? parts.join("|") : randomUUID()).toString();
  const hash = createHash("sha256").update(source).digest();
  const seed = hash.readUInt32BE(0);
  return seed % 2147483648;
}

