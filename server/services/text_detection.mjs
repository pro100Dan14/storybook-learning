/**
 * Text Detection Service
 * 
 * Node.js wrapper for text_detect.py Python script.
 * Used to verify that generated images don't contain unwanted text,
 * watermarks, signatures, or logos.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../");
const TEXT_DETECT_SCRIPT = path.join(REPO_ROOT, "tools", "text_detect.py");

const DEBUG_TEXT_DETECT = process.env.DEBUG_TEXT_DETECT === "true" || process.env.DEBUG_TEXT_DETECT === "1";
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const EAST_MODEL_PATH = process.env.EAST_MODEL_PATH || "";

/**
 * Extract JSON from stdout
 * @param {string} stdout - Raw stdout
 * @returns {object} Parsed JSON
 */
function extractJsonFromStdout(stdout) {
  if (!stdout || typeof stdout !== "string") {
    throw new Error("TEXT_DETECT_PARSE_FAILED: Empty or invalid stdout");
  }

  const lines = stdout.split("\n").map(line => line.trim()).filter(line => line.length > 0);
  const jsonLines = lines.filter(line => line.startsWith("{") && line.endsWith("}"));

  if (jsonLines.length === 0) {
    throw new Error("TEXT_DETECT_PARSE_FAILED: No JSON object found");
  }

  const jsonLine = jsonLines[jsonLines.length - 1];
  return JSON.parse(jsonLine);
}

/**
 * Detect text in an image
 * @param {object} params
 * @param {string} params.imagePath - Path to image file
 * @param {boolean} [params.verifyOcr=false] - Use OCR verification
 * @param {string} [params.requestId] - Request ID for logging
 * @returns {Promise<{ok: boolean, textDetected: boolean, regions?: Array, error?: string}>}
 */
export async function detectText({ imagePath, verifyOcr = false, requestId }) {
  if (!fs.existsSync(TEXT_DETECT_SCRIPT)) {
    // If script doesn't exist, return "no text detected" to not block pipeline
    console.warn(`[${requestId || "TEXT_DETECT"}] Script not found, skipping text detection`);
    return {
      ok: true,
      textDetected: false,
      skipped: true,
      reason: "Script not found"
    };
  }

  if (!fs.existsSync(imagePath)) {
    return {
      ok: false,
      error: "IMAGE_NOT_FOUND",
      message: `Image not found: ${imagePath}`
    };
  }

  const args = [
    TEXT_DETECT_SCRIPT,
    "--image", path.resolve(imagePath)
  ];

  if (EAST_MODEL_PATH && fs.existsSync(EAST_MODEL_PATH)) {
    args.push("--east-model", EAST_MODEL_PATH);
  }

  if (verifyOcr) {
    args.push("--verify-ocr");
  }

  if (DEBUG_TEXT_DETECT) {
    console.log(`[${requestId || "TEXT_DETECT"}] Running: ${PYTHON_BIN} ${args.join(" ")}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 5 * 1024 * 1024
    });

    if (stderr && DEBUG_TEXT_DETECT) {
      console.warn(`[${requestId || "TEXT_DETECT"}] Python stderr: ${stderr.substring(0, 300)}`);
    }

    const result = extractJsonFromStdout(stdout);

    if (DEBUG_TEXT_DETECT) {
      console.log(`[${requestId || "TEXT_DETECT"}] Result: textDetected=${result.text_detected}, watermark=${result.watermark_suspected}`);
    }

    return {
      ok: result.ok,
      textDetected: result.text_detected || false,
      watermarkSuspected: result.watermark_suspected || false,
      regions: result.text_regions || [],
      suspiciousCorners: result.suspicious_corners || [],
      detectionMethod: result.detection_method
    };
  } catch (error) {
    // If detection fails, return "no text" to not block pipeline
    console.warn(`[${requestId || "TEXT_DETECT"}] Detection failed: ${error.message?.substring(0, 100)}`);
    
    return {
      ok: true,
      textDetected: false,
      skipped: true,
      reason: error.message || "Detection failed"
    };
  }
}

/**
 * Check image for text and decide if regeneration is needed
 * @param {object} params
 * @param {string} params.imagePath - Path to image
 * @param {string} [params.requestId] - Request ID
 * @returns {Promise<{needsRegeneration: boolean, reason?: string}>}
 */
export async function checkForUnwantedText({ imagePath, requestId }) {
  const result = await detectText({ imagePath, verifyOcr: false, requestId });

  if (!result.ok || result.skipped) {
    // Can't check, assume OK
    return { needsRegeneration: false };
  }

  // Decide if regeneration is needed
  if (result.textDetected && result.regions && result.regions.length > 0) {
    // Only regenerate if we have confident detections
    const confidentRegions = result.regions.filter(r => r.confidence > 0.6);
    if (confidentRegions.length > 0) {
      return {
        needsRegeneration: true,
        reason: `Detected ${confidentRegions.length} text region(s)`
      };
    }
  }

  // Check for watermarks in corners
  if (result.watermarkSuspected && result.suspiciousCorners && result.suspiciousCorners.length > 0) {
    const highConfCorners = result.suspiciousCorners.filter(c => c.edge_density > 0.25);
    if (highConfCorners.length > 0) {
      return {
        needsRegeneration: true,
        reason: `Suspected watermark in: ${highConfCorners.map(c => c.location).join(", ")}`
      };
    }
  }

  return { needsRegeneration: false };
}

/**
 * Check if text detection is available
 * @returns {Promise<boolean>}
 */
export async function isTextDetectionAvailable() {
  if (!fs.existsSync(TEXT_DETECT_SCRIPT)) {
    return false;
  }

  try {
    await execFileAsync(PYTHON_BIN, ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}




