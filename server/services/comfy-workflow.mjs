/**
 * Comfy workflow builder for ByteDance Seedream (Comfy Cloud)
 *
 * Requirements:
 * - Prompt #1 (anchor) remains unchanged from template
 * - Prompt #2 base is taken from template (scenes node)
 * - Prompt #2 final = templateBase + renderScenes(scenes)
 */

import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../");
const WORKFLOW_TEMPLATE_PATH = path.join(REPO_ROOT, "api_bytedance_seedream4.json");

// Prompt #2 base comes from template (scenes node). We append scenes to it.

let cachedTemplate = null;
let cachedHash = null;

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function getWorkflowTemplate() {
  if (!cachedTemplate) {
    if (!fs.existsSync(WORKFLOW_TEMPLATE_PATH)) {
      throw new Error(`WORKFLOW_TEMPLATE_NOT_FOUND: ${WORKFLOW_TEMPLATE_PATH}`);
    }
    const raw = fs.readFileSync(WORKFLOW_TEMPLATE_PATH, "utf8");
    cachedTemplate = JSON.parse(raw);
    cachedHash = sha256(raw);
  }
  return {
    template: cachedTemplate,
    templateHash: cachedHash
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function findNodesByClassType(workflow, classType) {
  return Object.entries(workflow)
    .filter(([, node]) => node?.class_type === classType)
    .map(([id, node]) => ({ id, node }));
}

function computeSeedBase(seedBase, bookId) {
  const parts = [];
  if (seedBase !== undefined && seedBase !== null && `${seedBase}`.length > 0) {
    parts.push(String(seedBase));
  }
  if (bookId) {
    parts.push(String(bookId));
  }
  const source = (parts.length > 0 ? parts.join("|") : randomUUID()).toString();
  const hash = createHash("sha256").update(source).digest();
  // Use first 4 bytes as uint32
  const seed = hash.readUInt32BE(0);
  // Constrain to 2^31
  return seed % 2147483648;
}

export function computeSeeds({ seedBase, bookId }) {
  const seedAnchor = computeSeedBase(seedBase, bookId);
  const seedScenes = (seedAnchor + 1) % 2147483648;
  return { seedAnchor, seedScenes };
}

export function normalizeScenes(input) {
  if (!input) return [];

  // If it's already an array
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // Try JSON array
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => String(s).trim()).filter(Boolean);
        }
      } catch {
        // fall through
      }
    }

    // Split by newlines or pipe/semicolon
    let parts = trimmed.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 1) {
      parts = trimmed.split(/[|;]/).map((s) => s.trim()).filter(Boolean);
    }
    if (parts.length === 1) {
      // Split into sentences if still one
      parts = trimmed.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    }
    return parts;
  }

  return [];
}

export function renderScenes(scenes) {
  return scenes
    .map((scene, idx) => `Scene${idx + 1}: ${scene}`)
    .join("\n");
}

function resolveSeedreamNodes(workflow) {
  const seedreamNodes = findNodesByClassType(workflow, "ByteDanceSeedreamNode");
  if (seedreamNodes.length < 2) {
    throw new Error("SEEDREAM_NODES_NOT_FOUND");
  }

  const anchorNode = seedreamNodes.find((n) => Number(n.node?.inputs?.max_images) === 1);
  const scenesNode = seedreamNodes.find((n) => Number(n.node?.inputs?.max_images) !== 1);

  if (!anchorNode || !scenesNode) {
    throw new Error("SEEDREAM_ANCHOR_OR_SCENES_NOT_FOUND");
  }

  return {
    anchorNodeId: anchorNode.id,
    scenesNodeId: scenesNode.id
  };
}

function resolveSaveImageNode(workflow, sourceNodeId) {
  const saveNodes = findNodesByClassType(workflow, "SaveImage");
  for (const { id, node } of saveNodes) {
    const imagesInput = node?.inputs?.images;
    if (Array.isArray(imagesInput) && imagesInput[0] === sourceNodeId) {
      return id;
    }
  }
  return null;
}

/**
 * Build workflow by injecting:
 * - LoadImage.inputs.image
 * - scenes prompt + max_images
 * - seeds
 */
export function buildWorkflow({
  imageFilename,
  scenes,
  seedBase,
  bookId,
  seedsOverride = null
}) {
  const { template, templateHash } = getWorkflowTemplate();
  const workflow = deepClone(template);

  const loadNodes = findNodesByClassType(workflow, "LoadImage");
  if (loadNodes.length === 0) {
    throw new Error("LOADIMAGE_NODE_NOT_FOUND");
  }
  // Use first LoadImage node
  loadNodes[0].node.inputs.image = imageFilename;

  const { anchorNodeId, scenesNodeId } = resolveSeedreamNodes(workflow);

  const anchorNode = workflow[anchorNodeId];
  const scenesNode = workflow[scenesNodeId];

  const normalizedScenes = normalizeScenes(scenes);
  if (normalizedScenes.length === 0) {
    throw new Error("SCENES_EMPTY");
  }

  const scenesCount = normalizedScenes.length;
  const prompt2Base = scenesNode?.inputs?.prompt || "";
  if (!prompt2Base) {
    throw new Error("SCENES_PROMPT_BASE_MISSING");
  }
  const prompt2 = `${prompt2Base.trimEnd()}\n\n${renderScenes(normalizedScenes)}`;

  // Prompt #1 (anchor) remains unchanged
  // Prompt #2 (scenes) is template base + scenes text
  scenesNode.inputs.prompt = prompt2;
  scenesNode.inputs.max_images = scenesCount;

  const seeds = seedsOverride || computeSeeds({ seedBase, bookId });
  anchorNode.inputs.seed = seeds.seedAnchor;
  scenesNode.inputs.seed = seeds.seedScenes;

  const saveAnchorNodeId = resolveSaveImageNode(workflow, anchorNodeId);
  const saveScenesNodeId = resolveSaveImageNode(workflow, scenesNodeId);

  return {
    workflow,
    nodeIds: {
      loadNodeId: loadNodes[0].id,
      anchorNodeId,
      scenesNodeId,
      saveAnchorNodeId,
      saveScenesNodeId
    },
    seeds,
    scenesCount,
    workflowVersionHash: templateHash
  };
}


