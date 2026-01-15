/**
 * InstantID / IP-Adapter FaceID provider (SDXL) via Replicate (or compatible) API.
 *
 * This module is intentionally simple and defensive:
 * - If REPLICATE_API_TOKEN is missing, calls will throw and caller must fallback.
 * - Keeps request small and bounded retries at caller.
 * - Does not log prompts or images (PII safe).
 */

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  // Lazy load for Node <18
  fetchFn = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN;
const INSTANTID_MODEL = process.env.INSTANTID_MODEL || "fofr/instantid-sdxl"; // example model slug

/**
 * Check availability
 */
export function isInstantIdAvailable() {
  return Boolean(REPLICATE_API_TOKEN && INSTANTID_MODEL);
}

/**
 * Call Replicate to generate image with InstantID/IP-Adapter FaceID
 * @param {object} params
 * @param {string} params.prompt - Text prompt
 * @param {string} params.identityBase64 - Child photo base64 (identity reference)
 * @param {string} [params.poseBase64] - Optional pose image (ControlNet/OpenPose)
 * @param {number} [params.seed]
 * @param {number} [params.identityStrength=0.85]
 * @param {number} [params.width=1024]
 * @param {number} [params.height=1024]
 * @returns {Promise<{mimeType: string, dataUrl: string, raw: any}>}
 */
export async function generateInstantIdImage({
  prompt,
  identityBase64,
  poseBase64 = null,
  seed = undefined,
  identityStrength = 0.85,
  width = 1024,
  height = 1024,
  negativePrompt = null
}) {
  if (!isInstantIdAvailable()) {
    throw new Error("INSTANTID_UNAVAILABLE: Missing REPLICATE_API_TOKEN or model");
  }

  // Stable parameters for consistent storybook style
  // Lower guidance to avoid over-stylization that breaks faces
  const guidanceScale = parseFloat(process.env.INSTANTID_GUIDANCE_SCALE || "6.0");
  const numSteps = parseInt(process.env.INSTANTID_NUM_STEPS || "35", 10);
  
  // Ensure seed is provided (deterministic per page)
  const finalSeed = seed ?? Math.floor(Math.random() * 10_000_000);
  
  const input = {
    prompt,
    width,
    height,
    seed: finalSeed,
    // Model-specific inputs (commonly supported by instantid forks)
    face_image: `data:image/jpeg;base64,${identityBase64}`,
    face_strength: identityStrength, // 0.7-0.9 range for balance
    guidance_scale: guidanceScale, // 5-7 range to avoid face distortion
    num_inference_steps: numSteps, // 28-40 for quality
    // Style strength (if model supports it) - keep illustration style strong
    // Higher = more stylized, less photo-like
    style_strength: parseFloat(process.env.INSTANTID_STYLE_STRENGTH || "0.8"),
  };

  // Add negative prompt if provided
  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
    console.log(`[InstantID] Negative prompt enabled (${negativePrompt.length} chars)`);
  } else {
    console.warn(`[InstantID] WARNING: No negative prompt provided! This may cause photo-like faces.`);
  }

  if (poseBase64) {
    input.control_image = `data:image/png;base64,${poseBase64}`;
    input.control_strength = 0.7;
  }

  // Replicate API: use 'model' for owner/model format, 'version' for sha256 hash
  const isVersionHash = INSTANTID_MODEL.length === 64 && /^[a-f0-9]+$/.test(INSTANTID_MODEL);
  const requestBody = isVersionHash 
    ? { version: INSTANTID_MODEL, input }
    : { model: INSTANTID_MODEL, input };

  console.log(`[InstantID] Starting generation with model: ${INSTANTID_MODEL}`);
  
  const response = await fetchFn("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`INSTANTID_REQUEST_FAILED: ${response.status} ${response.statusText} ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  // Poll result
  const predictionId = data.id;

  let status = data.status;
  let resultData = data;
  const start = Date.now();
  console.log(`[InstantID] Prediction ${predictionId} started, status: ${status}`);
  
  while (status === "starting" || status === "processing") {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetchFn(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Token ${REPLICATE_API_TOKEN}` }
    });
    resultData = await poll.json();
    status = resultData.status;
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[InstantID] Prediction ${predictionId} status: ${status} (${elapsed}s)`);
    if (Date.now() - start > 180_000) { // 3 minutes timeout
      throw new Error("INSTANTID_TIMEOUT: Generation took more than 3 minutes");
    }
  }

  if (status !== "succeeded") {
    const err = resultData.error || JSON.stringify(resultData).substring(0, 200);
    throw new Error(`INSTANTID_FAILED: ${err}`);
  }

  const output = resultData.output;
  const firstImage = Array.isArray(output) ? output[0] : null;
  if (!firstImage || typeof firstImage !== "string") {
    throw new Error("INSTANTID_NO_IMAGE");
  }

  // Replicate returns URL; fetch and convert to base64
  const imgResp = await fetchFn(firstImage);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const mimeType = imgResp.headers.get("content-type") || "image/png";
  const base64 = buf.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return { mimeType, dataUrl, raw: resultData };
}


