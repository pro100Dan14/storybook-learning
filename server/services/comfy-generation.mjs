/**
 * Comfy Cloud image generation (anchor + scenes)
 */

import {
  uploadImage,
  runPrompt,
  pollUntilDone,
  extractOutputs,
  getFileUrl
} from "./comfy-cloud-client.mjs";
import { buildWorkflow, computeSeeds } from "./comfy-workflow.mjs";

function normalizeFileEntry(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    return { filename: entry, type: "output" };
  }
  if (entry.filename) {
    return {
      filename: entry.filename,
      type: entry.type || "output",
      subfolder: entry.subfolder || ""
    };
  }
  return null;
}

async function runWorkflowOnce({
  imageFilename,
  scenes,
  seedBase,
  bookId,
  seedsOverride,
  timeoutMs
}) {
  const {
    workflow,
    nodeIds,
    seeds,
    scenesCount,
    workflowVersionHash
  } = buildWorkflow({
    imageFilename,
    scenes,
    seedBase,
    bookId,
    seedsOverride
  });

  const promptId = await runPrompt(workflow);
  const history = await pollUntilDone(promptId, timeoutMs);

  const { anchorFiles, sceneFiles } = extractOutputs(history, nodeIds);
  const anchor = normalizeFileEntry(anchorFiles?.[0]);
  const scenesNormalized = (sceneFiles || []).map(normalizeFileEntry).filter(Boolean);

  if (!anchor || scenesNormalized.length < scenesCount) {
    const error = new Error("COMFY_OUTPUTS_INCOMPLETE");
    error.details = { anchor, scenesCount: scenesNormalized.length, seeds };
    throw error;
  }

  return {
    promptId,
    anchor,
    scenes: scenesNormalized.slice(0, scenesCount),
    seeds,
    workflowVersionHash
  };
}

/**
 * Generate anchor + scene images using Comfy Cloud
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function generateComfyImages({
  photoBuffer,
  photoFilename,
  photoMimeType,
  scenes,
  seedBase,
  bookId,
  timeoutMs = 180000
}) {
  // 1) Upload image
  const upload = await uploadImage(
    photoBuffer,
    photoFilename || "photo.jpg",
    photoMimeType || "image/jpeg"
  );

  // 2) Run workflow
  let result = null;
  const seeds = computeSeeds({ seedBase, bookId });
  try {
    result = await runWorkflowOnce({
      imageFilename: upload.name,
      scenes,
      seedBase,
      bookId,
      seedsOverride: seeds,
      timeoutMs
    });
  } catch (err) {
    const shouldRetry =
      err?.message?.includes("COMFY_RUN_FAILED") ||
      err?.message?.includes("COMFY_OUTPUTS_INCOMPLETE") ||
      err?.message?.includes("COMFY_RUN_TIMEOUT");

    if (!shouldRetry) {
      throw err;
    }

    // Retry once with different seedScenes if fail_on_partial caused error
    const retrySeeds = seeds
      ? { seedAnchor: seeds.seedAnchor, seedScenes: seeds.seedScenes + 999 }
      : null;

    if (retrySeeds) {
      result = await runWorkflowOnce({
        imageFilename: upload.name,
        scenes,
        seedBase,
        bookId,
        seedsOverride: retrySeeds,
        timeoutMs
      });
    } else {
      // If we don't have seed info, still retry once with seedBase+999 for scenes
      result = await runWorkflowOnce({
        imageFilename: upload.name,
        scenes,
        seedBase: seedBase ? `${seedBase}-retry` : "retry",
        bookId,
        timeoutMs
      });
    }
  }

  const anchorImage = {
    filename: result.anchor.filename,
    url: getFileUrl(result.anchor.filename, result.anchor.type || "output")
  };
  const sceneImages = result.scenes.map((img) => ({
    filename: img.filename,
    url: getFileUrl(img.filename, img.type || "output")
  }));

  return {
    jobId: result.promptId,
    anchorImage,
    sceneImages,
    metadata: {
      seeds: result.seeds,
      workflowVersionHash: result.workflowVersionHash
    }
  };
}


