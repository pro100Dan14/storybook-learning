/**
 * Face Composite Service
 * 
 * Node.js wrapper for face_composite.py Python script.
 * Handles deterministic face replacement in generated page images.
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
const COMPOSITE_SCRIPT = path.join(REPO_ROOT, "tools", "face_composite.py");

const DEBUG_COMPOSITE = process.env.DEBUG_COMPOSITE === "true" || process.env.DEBUG_COMPOSITE === "1";
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";

/**
 * Extract the last JSON line from stdout (handles noisy output)
 * @param {string} stdout - Raw stdout
 * @returns {object} Parsed JSON
 */
function extractJsonFromStdout(stdout) {
  if (!stdout || typeof stdout !== "string") {
    throw new Error("COMPOSITE_PARSE_FAILED: Empty or invalid stdout");
  }

  const lines = stdout.split("\n").map(line => line.trim()).filter(line => line.length > 0);
  const jsonLines = lines.filter(line => line.startsWith("{") && line.endsWith("}"));

  if (jsonLines.length === 0) {
    throw new Error("COMPOSITE_PARSE_FAILED: No JSON object found in stdout");
  }

  const jsonLine = jsonLines[jsonLines.length - 1];

  try {
    return JSON.parse(jsonLine);
  } catch (parseError) {
    throw new Error(`COMPOSITE_PARSE_FAILED: Failed to parse JSON: ${parseError.message}`);
  }
}

/**
 * Composite hero head onto page image
 * @param {object} params
 * @param {string} params.heroHeadPath - Path to hero_head.png
 * @param {string} params.pageImagePath - Path to generated page image
 * @param {string} params.outputPath - Where to save composited result
 * @param {boolean} [params.includeHair=true] - Include hair in mask
 * @param {string} [params.requestId] - Request ID for logging
 * @returns {Promise<{ok: boolean, outputPath?: string, blendMethod?: string, error?: string}>}
 */
export async function compositeHeroHead({ heroHeadPath, pageImagePath, outputPath, includeHair = true, requestId }) {
  if (!fs.existsSync(COMPOSITE_SCRIPT)) {
    return {
      ok: false,
      error: "SCRIPT_NOT_FOUND",
      message: `Composite script not found: ${COMPOSITE_SCRIPT}`
    };
  }

  if (!fs.existsSync(heroHeadPath)) {
    return {
      ok: false,
      error: "HERO_HEAD_NOT_FOUND",
      message: `Hero head not found: ${heroHeadPath}`
    };
  }

  if (!fs.existsSync(pageImagePath)) {
    return {
      ok: false,
      error: "PAGE_IMAGE_NOT_FOUND",
      message: `Page image not found: ${pageImagePath}`
    };
  }

  const args = [
    COMPOSITE_SCRIPT,
    "--hero-head", path.resolve(heroHeadPath),
    "--page-image", path.resolve(pageImagePath),
    "--output", path.resolve(outputPath)
  ];

  if (!includeHair) {
    args.push("--no-hair");
  }

  if (DEBUG_COMPOSITE) {
    console.log(`[${requestId || "COMPOSITE"}] Running: ${PYTHON_BIN} ${args.join(" ")}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    if (stderr && DEBUG_COMPOSITE) {
      console.warn(`[${requestId || "COMPOSITE"}] Python stderr: ${stderr.substring(0, 500)}`);
    }

    const result = extractJsonFromStdout(stdout);

    if (DEBUG_COMPOSITE) {
      console.log(`[${requestId || "COMPOSITE"}] Result: ok=${result.ok}, blend=${result.blend_method || "unknown"}`);
    }

    return result;
  } catch (error) {
    // Handle subprocess errors
    if (error.code && typeof error.code === "number") {
      const stderr = error.stderr || "";
      
      // Try to parse JSON from stdout even if exit code is non-zero
      if (error.stdout) {
        try {
          const result = extractJsonFromStdout(error.stdout);
          return result;
        } catch {}
      }

      return {
        ok: false,
        error: "COMPOSITE_FAILED",
        message: `Python subprocess failed: ${error.message}`,
        stderr: stderr.substring(0, 500)
      };
    }

    // Parse errors
    if (error.message?.includes("COMPOSITE_PARSE_FAILED")) {
      return {
        ok: false,
        error: "COMPOSITE_PARSE_FAILED",
        message: error.message
      };
    }

    return {
      ok: false,
      error: "COMPOSITE_ERROR",
      message: `Composite failed: ${error.message}`
    };
  }
}

/**
 * Composite with retry logic
 * @param {object} params - Same as compositeHeroHead
 * @param {number} [maxAttempts=2] - Maximum attempts
 * @returns {Promise<{ok: boolean, outputPath?: string, attempts?: number, error?: string}>}
 */
export async function compositeWithRetry({ heroHeadPath, pageImagePath, outputPath, includeHair = true, requestId }, maxAttempts = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await compositeHeroHead({
      heroHeadPath,
      pageImagePath,
      outputPath,
      includeHair,
      requestId
    });

    if (result.ok) {
      return {
        ...result,
        attempts: attempt
      };
    }

    lastError = result.error;

    // Don't retry certain errors
    if (result.error === "SCRIPT_NOT_FOUND" || 
        result.error === "HERO_HEAD_NOT_FOUND" ||
        result.error === "NO_FACE_IN_HERO") {
      return result;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return {
    ok: false,
    error: lastError || "COMPOSITE_FAILED",
    message: `Composite failed after ${maxAttempts} attempts`,
    attempts: maxAttempts
  };
}

/**
 * Check if compositing is available
 * @returns {Promise<boolean>}
 */
export async function isCompositeAvailable() {
  try {
    const { stdout } = await execFileAsync(PYTHON_BIN, ["--version"], { timeout: 5000 });
    
    if (!fs.existsSync(COMPOSITE_SCRIPT)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

