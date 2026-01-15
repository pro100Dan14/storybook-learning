#!/usr/bin/env node
/**
 * Model Bakeoff Script
 * 
 * Tests multiple Replicate models for identity preservation + stylized storybook output.
 * 
 * Usage:
 *   node server/scripts/model-bakeoff.mjs --photo <path> --scenes <json>
 * 
 * Environment:
 *   REPLICATE_API_TOKEN - Required
 *   ILLUSTRATION_MODEL - Model to test (default: all)
 * 
 * Output:
 *   - Images: /tmp/bakeoff/{model}/{page}.png
 *   - Report: /tmp/bakeoff/report.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../");

// Models to test
const MODELS = {
  instantid_artistic: {
    slug: "grandlineai/instant-id-artistic",
    url: "https://replicate.com/grandlineai/instant-id-artistic",
    params: {
      identity_strength: 0.6,
      guidance_scale: 6.0,
      num_inference_steps: 35,
      style_strength: 0.8
    }
  },
  instantid: {
    slug: "zsxkib/instant-id",
    url: "https://replicate.com/zsxkib/instant-id",
    params: {
      face_strength: 0.65,
      guidance_scale: 6.5,
      num_inference_steps: 30
    }
  },
  instantid_multicontrolnet: {
    slug: "tgohblio/instant-id-multicontrolnet",
    url: "https://replicate.com/tgohblio/instant-id-multicontrolnet",
    params: {
      face_strength: 0.65,
      guidance_scale: 6.0,
      num_inference_steps: 35
    }
  },
  photomaker_style: {
    slug: "tencentarc/photomaker-style",
    url: "https://replicate.com/tencentarc/photomaker-style",
    params: {
      style_strength: 40, // 30-50 range as per docs
      num_outputs: 1,
      num_inference_steps: 40,
      guidance_scale: 5.0
    }
  },
  photomaker: {
    slug: "tencentarc/photomaker",
    url: "https://replicate.com/tencentarc/photomaker",
    params: {
      style_strength: 40,
      num_outputs: 1,
      num_inference_steps: 40,
      guidance_scale: 5.0
    }
  }
};

// Default scene prompts (4 fixed scenes)
const DEFAULT_SCENES = [
  {
    page: 1,
    prompt: "Russian folk fairy tale illustration: hero at home in izba (изба), traditional Russian wooden house with carved window frames, warm domestic atmosphere, safe and welcoming, ink and gouache style, 2D illustration"
  },
  {
    page: 2,
    prompt: "Russian folk fairy tale illustration: hero discovering a glowing mushroom (светящийся гриб) in a magical forest clearing with birch trees, gentle wonder, no fear, ink and gouache style, 2D illustration"
  },
  {
    page: 3,
    prompt: "Russian folk fairy tale illustration: hero crossing a small brook (ручеек) on stepping stones, meeting a kind fox, gentle adventure, no danger, ink and gouache style, 2D illustration"
  },
  {
    page: 4,
    prompt: "Russian folk fairy tale illustration: hero back home in izba (изба), warm interior with samovar steam (пар от самовара), warm light, magic keepsake, cozy and joyful, ink and gouache style, 2D illustration"
  }
];

const NEGATIVE_PROMPT = "photorealistic, photo, collage, pasted face, cutout, sticker, realistic skin pores, DSLR, watermark, signature, logo, caption, letters, text, 3D render, Pixar, DreamWorks";

/**
 * Load photo and convert to base64
 */
function loadPhoto(photoPath) {
  if (!fs.existsSync(photoPath)) {
    throw new Error(`Photo not found: ${photoPath}`);
  }
  const buffer = fs.readFileSync(photoPath);
  return buffer.toString("base64");
}

/**
 * Call Replicate API
 */
async function callReplicate(modelSlug, input, apiToken) {
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelSlug,
      input
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Replicate API error: ${response.status} ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const predictionId = data.id;
  let status = data.status;
  let resultData = data;

  // Poll for result
  const start = Date.now();
  while (status === "starting" || status === "processing") {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Token ${apiToken}` }
    });
    resultData = await poll.json();
    status = resultData.status;
    if (Date.now() - start > 180_000) {
      throw new Error("Timeout: Generation took more than 3 minutes");
    }
  }

  if (status !== "succeeded") {
    throw new Error(`Generation failed: ${resultData.error || JSON.stringify(resultData).substring(0, 200)}`);
  }

  return resultData.output;
}

/**
 * Generate image with model
 */
async function generateWithModel(modelKey, modelConfig, scene, photoBase64, apiToken) {
  const { slug, params } = modelConfig;
  
  // Build input based on model type
  const input = {
    prompt: scene.prompt,
    negative_prompt: NEGATIVE_PROMPT,
    width: 1024,
    height: 1024,
    seed: 42, // Deterministic for comparison
    ...params
  };

  // Model-specific input fields
  if (modelKey.startsWith("instantid")) {
    input.face_image = `data:image/jpeg;base64,${photoBase64}`;
    if (modelKey === "instantid_artistic") {
      input.identity_strength = params.identity_strength;
    } else {
      input.face_strength = params.face_strength || params.identity_strength;
    }
  } else if (modelKey.startsWith("photomaker")) {
    input.input_image = `data:image/jpeg;base64,${photoBase64}`;
    // PhotoMaker may need multiple images, but we'll use single for bakeoff
    input.input_images = [`data:image/jpeg;base64,${photoBase64}`];
  }

  console.log(`[${modelKey}] Generating page ${scene.page}...`);
  const output = await callReplicate(slug, input, apiToken);
  
  // Output is usually an array of URLs
  const imageUrl = Array.isArray(output) ? output[0] : output;
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("No image URL in output");
  }

  // Download image
  const imgResp = await fetch(imageUrl);
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  
  return {
    buffer,
    mimeType: imgResp.headers.get("content-type") || "image/png",
    params: input
  };
}

/**
 * Compute InsightFace similarity (if available)
 */
async function computeSimilarity(referencePath, generatedPath) {
  const faceIdScript = path.join(REPO_ROOT, "tools", "face_id.py");
  if (!fs.existsSync(faceIdScript)) {
    return { available: false, score: null };
  }

  const pythonBin = process.env.PYTHON_BIN || "python3";
  try {
    const { stdout } = await execFileAsync(pythonBin, [
      faceIdScript,
      "--reference", referencePath,
      "--compare", generatedPath,
      "--json"
    ], { timeout: 30000 });

    const lines = stdout.split("\n").filter(l => l.trim().startsWith("{"));
    if (lines.length === 0) {
      return { available: false, score: null };
    }

    const result = JSON.parse(lines[lines.length - 1]);
    return {
      available: true,
      score: result.similarity || null,
      faceDetected: result.face_detected || false
    };
  } catch (error) {
    return { available: false, score: null, error: error.message };
  }
}

/**
 * Heuristic: detect photoreal/collage suspicion
 * Simple check: compare face region characteristics to surrounding illustration
 */
function detectPhotoPasteSuspicion(imagePath) {
  // This is a placeholder - in production, you'd use OpenCV to:
  // 1. Detect face region
  // 2. Compute texture variance in face vs surrounding
  // 3. Check edge mismatch
  // 4. Flag if face region has very different noise characteristics
  
  // For now, return a simple flag
  return {
    suspicious: false, // Would be computed from image analysis
    reason: "analysis_not_implemented",
    confidence: 0.5
  };
}

/**
 * Run bakeoff for all models
 */
async function runBakeoff(photoPath, scenes, outputDir, apiToken, selectedModel = null) {
  const photoBase64 = loadPhoto(photoPath);
  const referencePath = photoPath;
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const modelsToTest = selectedModel 
    ? { [selectedModel]: MODELS[selectedModel] }
    : MODELS;

  const results = {
    timestamp: new Date().toISOString(),
    photo: photoPath,
    scenes: scenes.map(s => ({ page: s.page, prompt: s.prompt })),
    models: {}
  };

  for (const [modelKey, modelConfig] of Object.entries(modelsToTest)) {
    if (!modelConfig) {
      console.warn(`[SKIP] Model ${modelKey} not found`);
      continue;
    }

    console.log(`\n[${modelKey}] Testing model: ${modelConfig.slug}`);
    const modelDir = path.join(outputDir, modelKey);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    const modelResults = {
      model: modelConfig.slug,
      url: modelConfig.url,
      pages: []
    };

    for (const scene of scenes) {
      try {
        const { buffer, mimeType, params } = await generateWithModel(
          modelKey,
          modelConfig,
          scene,
          photoBase64,
          apiToken
        );

        const outputPath = path.join(modelDir, `page_${scene.page}.png`);
        fs.writeFileSync(outputPath, buffer);

        // Compute similarity
        const similarity = await computeSimilarity(referencePath, outputPath);

        // Detect photo paste suspicion
        const pasteCheck = detectPhotoPasteSuspicion(outputPath);

        modelResults.pages.push({
          page: scene.prompt,
          outputPath,
          similarity: similarity.score,
          similarityAvailable: similarity.available,
          pasteSuspicion: pasteCheck.suspicious,
          pasteReason: pasteCheck.reason,
          params,
          success: true
        });

        console.log(`[${modelKey}] Page ${scene.page}: similarity=${similarity.score?.toFixed(3) || "N/A"}`);
      } catch (error) {
        console.error(`[${modelKey}] Page ${scene.page} failed:`, error.message);
        modelResults.pages.push({
          page: scene.page,
          error: error.message,
          success: false
        });
      }
    }

    results.models[modelKey] = modelResults;
  }

  // Save report
  const reportPath = path.join(outputDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n[REPORT] Saved to: ${reportPath}`);

  return results;
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  let photoPath = null;
  let scenes = DEFAULT_SCENES;
  let outputDir = "/tmp/bakeoff";
  let selectedModel = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--photo" && args[i + 1]) {
      photoPath = args[i + 1];
      i++;
    } else if (args[i] === "--scenes" && args[i + 1]) {
      scenes = JSON.parse(fs.readFileSync(args[i + 1], "utf8"));
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === "--model" && args[i + 1]) {
      selectedModel = args[i + 1];
      i++;
    }
  }

  if (!photoPath) {
    console.error("Usage: node model-bakeoff.mjs --photo <path> [--scenes <json>] [--output <dir>] [--model <key>]");
    console.error("\nAvailable models:");
    Object.keys(MODELS).forEach(key => {
      console.error(`  - ${key}: ${MODELS[key].slug}`);
    });
    process.exit(1);
  }

  const apiToken = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_TOKEN;
  if (!apiToken) {
    console.error("Error: REPLICATE_API_TOKEN environment variable required");
    process.exit(1);
  }

  console.log(`[BAKEOFF] Starting bakeoff with photo: ${photoPath}`);
  console.log(`[BAKEOFF] Output directory: ${outputDir}`);
  console.log(`[BAKEOFF] Scenes: ${scenes.length}`);

  try {
    const results = await runBakeoff(photoPath, scenes, outputDir, apiToken, selectedModel);
    
    // Print summary
    console.log("\n[SUMMARY]");
    for (const [modelKey, modelResult] of Object.entries(results.models)) {
      const avgSimilarity = modelResult.pages
        .filter(p => p.success && p.similarity !== null)
        .reduce((sum, p) => sum + p.similarity, 0) / modelResult.pages.filter(p => p.success && p.similarity !== null).length;
      
      const successCount = modelResult.pages.filter(p => p.success).length;
      console.log(`  ${modelKey}: ${successCount}/${modelResult.pages.length} pages, avg similarity: ${avgSimilarity?.toFixed(3) || "N/A"}`);
    }
  } catch (error) {
    console.error("[ERROR]", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runBakeoff, MODELS };

