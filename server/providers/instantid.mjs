/**
 * InstantID / IP-Adapter FaceID provider (SDXL) via Replicate (or compatible) API.
 *
 * This module is intentionally simple and defensive:
 * - If REPLICATE_API_TOKEN is missing, calls will throw and caller must fallback.
 * - Keeps request small and bounded retries at caller.
 * - Does not log prompts or images (PII safe).
 */

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
  height = 1024
}) {
  if (!isInstantIdAvailable()) {
    throw new Error("INSTANTID_UNAVAILABLE: Missing REPLICATE_API_TOKEN or model");
  }

  const input = {
    prompt,
    width,
    height,
    seed: seed ?? Math.floor(Math.random() * 10_000_000),
    // Model-specific inputs (commonly supported by instantid forks)
    face_image: `data:image/jpeg;base64,${identityBase64}`,
    face_strength: identityStrength,
    guidance_scale: 6.5,
    num_inference_steps: 28,
  };

  if (poseBase64) {
    input.control_image = `data:image/png;base64,${poseBase64}`;
    input.control_strength = 0.7;
  }

  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      version: INSTANTID_MODEL,
      input
    })
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
  while (status === "starting" || status === "processing") {
    await new Promise(r => setTimeout(r, 1500));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Token ${REPLICATE_API_TOKEN}` }
    });
    resultData = await poll.json();
    status = resultData.status;
    if (Date.now() - start > 120_000) {
      throw new Error("INSTANTID_TIMEOUT");
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
  const imgResp = await fetch(firstImage);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const mimeType = imgResp.headers.get("content-type") || "image/png";
  const base64 = buf.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return { mimeType, dataUrl, raw: resultData };
}


