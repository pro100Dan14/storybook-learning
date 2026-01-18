/**
 * BytePlus ModelArk Seedream client
 *
 * Docs (ModelArk):
 * POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations
 * Auth: Authorization: Bearer <API_KEY>
 */

const BASE_URL = process.env.BYTEPLUS_BASE_URL || "https://ark.ap-southeast.bytepluses.com";
const API_KEY = process.env.BYTEPLUS_API_KEY || "";

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
  watermark = false
}) {
  if (!model) throw new Error("BYTEPLUS_MODEL_MISSING");
  if (!prompt) throw new Error("BYTEPLUS_PROMPT_MISSING");

  const body = {
    model,
    prompt,
    size,
    stream,
    response_format: responseFormat,
    sequential_image_generation: sequential,
    sequential_image_generation_options: { max_images: maxImages }
  };

  if (image) {
    body.image = image;
  }
  if (typeof watermark === "boolean") {
    body.watermark = watermark;
  }

  const res = await fetchFn(`${BASE_URL}/api/v3/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders()
    },
    body: JSON.stringify(body)
  });

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


