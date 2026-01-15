/**
 * Model Router - Routes to different Replicate models based on feature flag
 * 
 * Supported models:
 * - instantid_artistic: grandlineai/instant-id-artistic
 * - instantid: zsxkib/instant-id
 * - instantid_multicontrolnet: tgohblio/instant-id-multicontrolnet
 * - photomaker_style: tencentarc/photomaker-style
 * - photomaker: tencentarc/photomaker
 * - legacy: Current default (fofr/instantid-sdxl or whatever INSTANTID_MODEL is set to)
 * 
 * Environment:
 *   ILLUSTRATION_MODEL - Model to use (default: "legacy")
 */

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN;

// Model configurations with parameter presets
const MODEL_CONFIGS = {
  instantid_artistic: {
    slug: "grandlineai/instant-id-artistic",
    url: "https://replicate.com/grandlineai/instant-id-artistic",
    inputMapper: (params) => ({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || "",
      width: params.width || 1024,
      height: params.height || 1024,
      seed: params.seed,
      face_image: `data:image/jpeg;base64,${params.identityBase64}`,
      identity_strength: params.identityStrength || 0.6, // Lower to avoid photo paste
      guidance_scale: params.guidanceScale || 6.0,
      num_inference_steps: params.numSteps || 35,
      style_strength: params.styleStrength || 0.8
    })
  },
  instantid: {
    slug: "zsxkib/instant-id",
    url: "https://replicate.com/zsxkib/instant-id",
    inputMapper: (params) => ({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || "",
      width: params.width || 1024,
      height: params.height || 1024,
      seed: params.seed,
      face_image: `data:image/jpeg;base64,${params.identityBase64}`,
      face_strength: params.identityStrength || 0.65,
      guidance_scale: params.guidanceScale || 6.5,
      num_inference_steps: params.numSteps || 30
    })
  },
  instantid_multicontrolnet: {
    slug: "tgohblio/instant-id-multicontrolnet",
    url: "https://replicate.com/tgohblio/instant-id-multicontrolnet",
    inputMapper: (params) => ({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || "",
      width: params.width || 1024,
      height: params.height || 1024,
      seed: params.seed,
      face_image: `data:image/jpeg;base64,${params.identityBase64}`,
      face_strength: params.identityStrength || 0.65,
      guidance_scale: params.guidanceScale || 6.0,
      num_inference_steps: params.numSteps || 35
    })
  },
  photomaker_style: {
    slug: "tencentarc/photomaker-style",
    url: "https://replicate.com/tencentarc/photomaker-style",
    inputMapper: (params) => ({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || "",
      width: params.width || 1024,
      height: params.height || 1024,
      seed: params.seed,
      input_image: `data:image/jpeg;base64,${params.identityBase64}`,
      input_images: [`data:image/jpeg;base64,${params.identityBase64}`],
      style_strength: params.styleStrength || 40, // 30-50 range as per docs
      num_outputs: 1,
      num_inference_steps: params.numSteps || 40,
      guidance_scale: params.guidanceScale || 5.0
    })
  },
  photomaker: {
    slug: "tencentarc/photomaker",
    url: "https://replicate.com/tencentarc/photomaker",
    inputMapper: (params) => ({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || "",
      width: params.width || 1024,
      height: params.height || 1024,
      seed: params.seed,
      input_image: `data:image/jpeg;base64,${params.identityBase64}`,
      input_images: [`data:image/jpeg;base64,${params.identityBase64}`],
      style_strength: params.styleStrength || 40,
      num_outputs: 1,
      num_inference_steps: params.numSteps || 40,
      guidance_scale: params.guidanceScale || 5.0
    })
  },
  legacy: {
    slug: process.env.INSTANTID_MODEL || "fofr/instantid-sdxl",
    url: null,
    inputMapper: (params) => ({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || "",
      width: params.width || 1024,
      height: params.height || 1024,
      seed: params.seed,
      face_image: `data:image/jpeg;base64,${params.identityBase64}`,
      face_strength: params.identityStrength || 0.85,
      guidance_scale: params.guidanceScale || 6.0,
      num_inference_steps: params.numSteps || 35,
      style_strength: params.styleStrength || 0.8
    })
  }
};

/**
 * Get selected model from environment
 */
export function getSelectedModel() {
  const modelKey = (process.env.ILLUSTRATION_MODEL || "legacy").toLowerCase();
  if (MODEL_CONFIGS[modelKey]) {
    return modelKey;
  }
  console.warn(`[ModelRouter] Unknown model "${modelKey}", falling back to "legacy"`);
  return "legacy";
}

/**
 * Check if model is available
 */
export function isModelAvailable(modelKey = null) {
  if (!REPLICATE_API_TOKEN) {
    return false;
  }
  const selected = modelKey || getSelectedModel();
  return Boolean(MODEL_CONFIGS[selected]);
}

/**
 * Generate image with selected model
 * @param {object} params
 * @param {string} params.prompt - Text prompt
 * @param {string} params.identityBase64 - Child photo base64
 * @param {string} [params.negativePrompt] - Negative prompt
 * @param {number} [params.seed] - Seed
 * @param {number} [params.identityStrength] - Identity strength (model-specific)
 * @param {number} [params.width] - Width (default: 1024)
 * @param {number} [params.height] - Height (default: 1024)
 * @param {number} [params.guidanceScale] - Guidance scale (model-specific)
 * @param {number} [params.numSteps] - Number of steps (model-specific)
 * @param {number} [params.styleStrength] - Style strength (model-specific)
 * @returns {Promise<{mimeType: string, dataUrl: string, raw: any, model: string}>}
 */
export async function generateImageWithModel({
  prompt,
  identityBase64,
  negativePrompt = null,
  seed = undefined,
  identityStrength = undefined,
  width = 1024,
  height = 1024,
  guidanceScale = undefined,
  numSteps = undefined,
  styleStrength = undefined
}) {
  if (!isModelAvailable()) {
    throw new Error("MODEL_UNAVAILABLE: Missing REPLICATE_API_TOKEN");
  }

  const modelKey = getSelectedModel();
  const config = MODEL_CONFIGS[modelKey];

  // Build input using model-specific mapper
  const input = config.inputMapper({
    prompt,
    identityBase64,
    negativePrompt,
    seed: seed ?? Math.floor(Math.random() * 10_000_000),
    identityStrength,
    width,
    height,
    guidanceScale,
    numSteps,
    styleStrength
  });

  console.log(`[ModelRouter] Using model: ${modelKey} (${config.slug})`);

  // Call Replicate API
  const response = await fetchFn("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.slug,
      input
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`MODEL_REQUEST_FAILED: ${response.status} ${response.statusText} ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const predictionId = data.id;
  let status = data.status;
  let resultData = data;
  const start = Date.now();

  // Poll for result
  while (status === "starting" || status === "processing") {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetchFn(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Token ${REPLICATE_API_TOKEN}` }
    });
    resultData = await poll.json();
    status = resultData.status;
    if (Date.now() - start > 180_000) {
      throw new Error("MODEL_TIMEOUT: Generation took more than 3 minutes");
    }
  }

  if (status !== "succeeded") {
    const err = resultData.error || JSON.stringify(resultData).substring(0, 200);
    throw new Error(`MODEL_FAILED: ${err}`);
  }

  const output = resultData.output;
  const firstImage = Array.isArray(output) ? output[0] : null;
  if (!firstImage || typeof firstImage !== "string") {
    throw new Error("MODEL_NO_IMAGE");
  }

  // Download and convert to base64
  const imgResp = await fetchFn(firstImage);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const mimeType = imgResp.headers.get("content-type") || "image/png";
  const base64 = buf.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return {
    mimeType,
    dataUrl,
    raw: resultData,
    model: modelKey
  };
}

/**
 * Get model-specific default parameters
 */
export function getModelDefaults(modelKey = null) {
  const selected = modelKey || getSelectedModel();
  const config = MODEL_CONFIGS[selected];
  
  if (selected === "instantid_artistic") {
    return {
      identityStrength: 0.6,
      guidanceScale: 6.0,
      numSteps: 35,
      styleStrength: 0.8
    };
  } else if (selected === "photomaker_style" || selected === "photomaker") {
    return {
      styleStrength: 40,
      numSteps: 40,
      guidanceScale: 5.0
    };
  } else if (selected.startsWith("instantid")) {
    return {
      identityStrength: 0.65,
      guidanceScale: 6.0,
      numSteps: 30
    };
  }
  
  // Legacy defaults
  return {
    identityStrength: 0.85,
    guidanceScale: 6.0,
    numSteps: 35,
    styleStrength: 0.8
  };
}

export { MODEL_CONFIGS };

