/**
 * Comfy Cloud API client
 *
 * Base: https://cloud.comfy.org
 * Auth: X-API-Key header
 *
 * NOTE: Do not log prompts or photo data (PII).
 */

import { setTimeout as sleep } from "timers/promises";

const BASE_URL = process.env.COMFY_CLOUD_BASE_URL || "https://cloud.comfy.org";
const API_KEY = process.env.COMFY_CLOUD_API_KEY;

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  // Lazy load for Node <18
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

function getAuthHeaders() {
  if (!API_KEY) {
    throw new Error("COMFY_CLOUD_API_KEY_MISSING");
  }
  return {
    "X-API-Key": API_KEY
  };
}

/**
 * Upload image to Comfy Cloud
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} mimeType
 * @returns {Promise<{name: string}>}
 */
export async function uploadImage(buffer, filename, mimeType = "image/jpeg") {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("UPLOAD_IMAGE_INVALID_BUFFER");
  }
  if (typeof FormData === "undefined" || typeof Blob === "undefined") {
    throw new Error("FORMDATA_UNAVAILABLE");
  }

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  form.append("image", blob, filename || "upload.jpg");

  const res = await fetchFn(`${BASE_URL}/api/upload/image`, {
    method: "POST",
    headers: {
      ...getAuthHeaders()
    },
    body: form
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`COMFY_UPLOAD_FAILED: ${res.status} ${res.statusText} ${errText.substring(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  const name = data.name || data.filename || data.file || data?.data?.name;
  if (!name) {
    throw new Error("COMFY_UPLOAD_NO_FILENAME");
  }

  return { name };
}

/**
 * Run workflow (prompt) in Comfy Cloud
 * @param {object} workflowJson
 * @returns {Promise<string>} prompt_id
 */
export async function runPrompt(workflowJson) {
  if (!workflowJson || typeof workflowJson !== "object") {
    throw new Error("COMFY_PROMPT_INVALID");
  }

  const res = await fetchFn(`${BASE_URL}/api/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify({ prompt: workflowJson })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`COMFY_PROMPT_FAILED: ${res.status} ${res.statusText} ${errText.substring(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  const promptId = data.prompt_id || data.promptId || data.id;
  if (!promptId) {
    throw new Error("COMFY_PROMPT_NO_ID");
  }
  return promptId;
}

/**
 * Fetch history status
 * @param {string} promptId
 * @returns {Promise<object>}
 */
export async function fetchHistory(promptId) {
  if (!promptId) {
    throw new Error("COMFY_HISTORY_NO_ID");
  }
  const res = await fetchFn(`${BASE_URL}/api/history_v2/${encodeURIComponent(promptId)}`, {
    headers: {
      ...getAuthHeaders()
    }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`COMFY_HISTORY_FAILED: ${res.status} ${res.statusText} ${errText.substring(0, 200)}`);
  }
  return res.json();
}

function getStatusInfo(history) {
  const status = history?.status || history?.data?.status || null;
  const statusStr =
    (typeof status === "string" ? status : null) ||
    status?.status_str ||
    status?.status ||
    status?.state ||
    history?.status_str ||
    history?.state ||
    null;
  const completed =
    status?.completed === true ||
    statusStr === "completed" ||
    statusStr === "success" ||
    statusStr === "succeeded" ||
    statusStr === "error" ||
    statusStr === "failed";
  const failed = statusStr === "error" || statusStr === "failed";
  return { statusStr, completed, failed };
}

/**
 * Poll history until done
 * @param {string} promptId
 * @param {number} timeoutMs
 * @param {number} intervalMs
 * @returns {Promise<object>} history JSON
 */
export async function pollUntilDone(promptId, timeoutMs = 180000, intervalMs = 2000) {
  const start = Date.now();
  let lastHistory = null;

  while (Date.now() - start < timeoutMs) {
    const history = await fetchHistory(promptId);
    lastHistory = history;

    const { completed, failed } = getStatusInfo(history);
    const hasOutputs =
      Boolean(history?.outputs) ||
      Boolean(history?.data?.outputs) ||
      Boolean(history?.history);

    if (completed || hasOutputs) {
      if (failed) {
        const statusStr = getStatusInfo(history).statusStr || "error";
        const errMsg = history?.error || history?.status?.message || history?.status?.error || "COMFY_RUN_FAILED";
        const error = new Error(`COMFY_RUN_FAILED: ${statusStr} ${errMsg}`);
        error.history = history;
        throw error;
      }
      return history;
    }

    await sleep(intervalMs);
  }

  const error = new Error("COMFY_RUN_TIMEOUT");
  error.history = lastHistory;
  throw error;
}

/**
 * Extract outputs from history JSON
 * @param {object} history
 * @param {object} nodeIds
 * @returns {{anchorFiles: Array, sceneFiles: Array}}
 */
export function extractOutputs(history, nodeIds = {}) {
  if (!history || typeof history !== "object") {
    throw new Error("COMFY_HISTORY_INVALID");
  }

  const outputs =
    history?.outputs ||
    history?.data?.outputs ||
    (history?.history
      ? history.history[Object.keys(history.history)[0]]?.outputs
      : null);

  if (!outputs) {
    throw new Error("COMFY_OUTPUTS_MISSING");
  }

  const anchorOutput = outputs[nodeIds.saveAnchorNodeId] || outputs[nodeIds.anchorNodeId];
  const scenesOutput = outputs[nodeIds.saveScenesNodeId] || outputs[nodeIds.scenesNodeId];

  const pickImages = (nodeOutput) => {
    if (!nodeOutput) return [];
    if (Array.isArray(nodeOutput.images)) return nodeOutput.images;
    if (Array.isArray(nodeOutput)) return nodeOutput;
    if (nodeOutput.image) return [nodeOutput.image];
    return [];
  };

  const anchorFiles = pickImages(anchorOutput);
  const sceneFiles = pickImages(scenesOutput);

  return { anchorFiles, sceneFiles };
}

/**
 * Build file URL for Comfy Cloud
 * @param {string} filename
 * @param {string} type
 * @returns {string}
 */
export function getFileUrl(filename, type = "output") {
  if (!filename) return "";
  const params = new URLSearchParams({
    filename,
    type
  });
  return `${BASE_URL}/api/view?${params.toString()}`;
}

export function getComfyBaseUrl() {
  return BASE_URL;
}


