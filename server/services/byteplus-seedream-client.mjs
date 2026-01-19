/**
 * BytePlus ModelArk Seedream client
 *
 * Docs (ModelArk):
 * POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations
 * Auth: Authorization: Bearer <API_KEY>
 */

const BASE_URL = process.env.BYTEPLUS_BASE_URL || "https://ark.ap-southeast.bytepluses.com";
const API_KEY = process.env.BYTEPLUS_API_KEY || "";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.BYTEPLUS_TIMEOUT_MS || "", 10);
const FALLBACK_TIMEOUT_MS = 180000;
const BYTEPLUS_TIMEOUT_MS = Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0
  ? DEFAULT_TIMEOUT_MS
  : FALLBACK_TIMEOUT_MS;

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

function getAuthHeaders() {
  if (!API_KEY) {
    throw new Error("BYTEPLUS_API_KEY_MISSING");
  }
  return {
    "Authorization": `Bearer ${API_KEY}`
  };
}

function normalizeTimeoutMs(value, fallback = BYTEPLUS_TIMEOUT_MS) {
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

/**
 * Generate images via Seedream model
 * @param {object} params
 * @returns {Promise<{model: string, data: Array, usage?: object}>}
 */
export async function generateSeedreamImages({
  model,
  prompt,
  image,
  size,
  maxImages,
  sequential = "auto",
  responseFormat = "url",
  stream = false,
  watermark = false,
  timeoutMs,
  requestId
}) {
  if (!model) throw new Error("BYTEPLUS_MODEL_MISSING");
  if (!prompt) throw new Error("BYTEPLUS_PROMPT_MISSING");

  const body = {
    model,
    prompt,
    size,
    stream,
    response_format: responseFormat,
    sequential_image_generation: sequential
  };

  const normalizedMaxImages = Number.isFinite(Number(maxImages)) ? Number(maxImages) : null;
  if (normalizedMaxImages) {
    body.sequential_image_generation_options = { max_images: normalizedMaxImages };
  }

  if (image) {
    body.image = Array.isArray(image) ? image : [image];
  }
  if (typeof watermark === "boolean") {
    body.watermark = watermark;
  }

  const finalTimeoutMs = normalizeTimeoutMs(timeoutMs);
  const { signal, cancel } = createTimeoutSignal(finalTimeoutMs);
  let res;

  try {
    if (requestId) {
      console.log(`[${requestId}] BYTEPLUS: model=${model} size=${size} maxImages=${normalizedMaxImages || "n/a"}`);
    }
    res = await fetchFn(`${BASE_URL}/api/v3/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`BYTEPLUS_TIMEOUT: ${finalTimeoutMs}ms`);
    }
    throw error;
  } finally {
    cancel();
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`BYTEPLUS_GENERATION_FAILED: ${res.status} ${res.statusText} ${errText.substring(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!Array.isArray(data?.data)) {
    throw new Error("BYTEPLUS_RESPONSE_INVALID");
  }

  return data;
}

export function getByteplusBaseUrl() {
  return BASE_URL;
}


