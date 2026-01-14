#!/usr/bin/env node
/**
 * Golden Illustrations Test Script
 * 
 * End-to-end test for Illustration Pipeline v2.
 * Generates a complete set of illustrations for a test book and outputs
 * detailed metrics for quality analysis.
 * 
 * Usage:
 *   node server/scripts/golden_illustrations.mjs --photo path/to/test_photo.jpg
 *   node server/scripts/golden_illustrations.mjs --photo path/to/test_photo.jpg --pages 4 --age-group 4-6
 * 
 * Options:
 *   --photo         Path to test child photo (required)
 *   --pages         Number of pages to generate (default: 4)
 *   --age-group     Age group: 2-3, 3-4, 4-6, 6-8 (default: 4-6)
 *   --output-dir    Output directory (default: ./golden_test_output)
 *   --v1            Use v1 pipeline instead of v2
 *   --no-composite  Disable face compositing (v2 only)
 * 
 * Output:
 *   - golden_test_output/
 *     - book_id/
 *       - hero_head.png
 *       - hero_fullbody_ref.jpg
 *       - page_1_raw.png, page_1.png
 *       - page_2_raw.png, page_2.png
 *       - ...
 *       - report.json (similarity scores, metrics)
 *       - report.html (visual comparison)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.dirname(__dirname);
const REPO_ROOT = path.dirname(SERVER_DIR);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    photo: null,
    pages: 4,
    ageGroup: "4-6",
    outputDir: "./golden_test_output",
    useV1: false,
    noComposite: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--photo" && args[i + 1]) {
      options.photo = args[++i];
    } else if (arg === "--pages" && args[i + 1]) {
      options.pages = parseInt(args[++i], 10);
    } else if (arg === "--age-group" && args[i + 1]) {
      options.ageGroup = args[++i];
    } else if (arg === "--output-dir" && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === "--v1") {
      options.useV1 = true;
    } else if (arg === "--no-composite") {
      options.noComposite = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Golden Illustrations Test Script

Usage:
  node server/scripts/golden_illustrations.mjs --photo path/to/test_photo.jpg [options]

Options:
  --photo         Path to test child photo (required)
  --pages         Number of pages to generate (default: 4)
  --age-group     Age group: 2-3, 3-4, 4-6, 6-8 (default: 4-6)
  --output-dir    Output directory (default: ./golden_test_output)
  --v1            Use v1 pipeline instead of v2
  --no-composite  Disable face compositing (v2 only)
  --help, -h      Show this help message

Example:
  node server/scripts/golden_illustrations.mjs --photo fixtures/hero_photo_2.jpg --pages 4
`);
      process.exit(0);
    }
  }

  return options;
}

// Load photo and convert to base64
function loadPhoto(photoPath) {
  const absolutePath = path.isAbsolute(photoPath) 
    ? photoPath 
    : path.resolve(process.cwd(), photoPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Photo not found: ${absolutePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(absolutePath);
  const base64 = buffer.toString("base64");
  
  // Detect MIME type from extension
  const ext = path.extname(photoPath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" 
    : ext === ".webp" ? "image/webp" 
    : "image/jpeg";

  return { base64, mimeType, path: absolutePath };
}

// Generate mock identity (in real usage, this comes from /api/identity)
function generateMockIdentity() {
  return {
    child_id: "golden_test",
    age_range: "4-6",
    skin_tone: "light",
    hair: {
      color: "brown",
      length: "medium",
      style: "wavy"
    },
    eyes: {
      color: "brown",
      shape: "round"
    },
    face: {
      shape: "round",
      features: ["small nose", "full cheeks"]
    },
    distinctive_marks: [],
    must_keep_same: [
      "Brown wavy hair",
      "Round face shape",
      "Brown round eyes"
    ],
    must_not: [
      "Change hair color",
      "Change eye color",
      "Add glasses"
    ],
    short_visual_summary: "4-year-old child with brown wavy hair, round face, brown eyes, light skin",
    negative_prompt: "no text, no logos, no modern objects"
  };
}

// Generate mock page contents
function generateMockPageContents(pages, heroName = "Маша") {
  const beats = [
    `${heroName} находится в тёплой избе. Солнечный свет льётся через окно.`,
    `${heroName} замечает в лесу что-то волшебное - светящийся гриб.`,
    `${heroName} осторожно идёт по лесной тропинке, встречает доброго зайца.`,
    `${heroName} возвращается домой с волшебным подарком. Всё хорошо.`
  ];

  const texts = [
    `В маленькой избе на краю леса жила ${heroName}. Каждое утро солнце заглядывало в окно и будило её.`,
    `Однажды ${heroName} вышла погулять и увидела в траве необычный гриб. Он тихонько светился.`,
    `${heroName} пошла по тропинке глубже в лес. Там она встретила пушистого зайца. "Здравствуй!" - сказал заяц.`,
    `Вечером ${heroName} вернулась домой. В её кармане лежало перо жар-птицы - подарок от волшебного леса.`
  ];

  return Array.from({ length: Math.min(pages, 4) }, (_, i) => ({
    pageText: texts[i] || texts[0],
    beat: beats[i] || beats[0]
  }));
}

// Main function
async function main() {
  const options = parseArgs();

  if (!options.photo) {
    console.error("Error: --photo is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Golden Illustrations Test");
  console.log("=".repeat(60));
  console.log(`Photo: ${options.photo}`);
  console.log(`Pages: ${options.pages}`);
  console.log(`Age Group: ${options.ageGroup}`);
  console.log(`Pipeline: ${options.useV1 ? "v1" : "v2"}`);
  console.log(`Composite: ${options.noComposite ? "disabled" : "enabled"}`);
  console.log("=".repeat(60));

  // Load photo
  console.log("\n[1/5] Loading photo...");
  const photo = loadPhoto(options.photo);
  console.log(`  Photo loaded: ${photo.path} (${Math.round(photo.base64.length / 1024)} KB)`);

  // Generate mock data
  const identity = generateMockIdentity();
  const pageContents = generateMockPageContents(options.pages);
  const bookId = randomUUID();
  const bookDir = path.join(options.outputDir, bookId);

  // Create output directory
  fs.mkdirSync(bookDir, { recursive: true });
  console.log(`  Output directory: ${bookDir}`);

  // Set environment variables for test
  if (options.noComposite) {
    process.env.FACE_COMPOSITE_ENABLED = "false";
  } else {
    process.env.FACE_COMPOSITE_ENABLED = "true";
  }
  process.env.ILLUSTRATION_V2_ENABLED = options.useV1 ? "false" : "true";
  process.env.CHARACTER_ASSETS_ENABLED = options.useV1 ? "false" : "true";

  const startTime = Date.now();
  const metrics = {
    bookId,
    startTime: new Date().toISOString(),
    options,
    stages: {}
  };

  try {
    if (options.useV1) {
      // V1 Pipeline (existing)
      console.log("\n[2/5] Running V1 pipeline (existing)...");
      console.log("  V1 pipeline test not implemented in this script.");
      console.log("  Use the main /api/book endpoint for v1 testing.");
      metrics.pipeline = "v1";
      metrics.stages.v1 = { skipped: true, reason: "Use /api/book endpoint" };
    } else {
      // V2 Pipeline
      console.log("\n[2/5] Creating character assets...");
      
      const { createCharacterAssets } = await import("../services/character_assets.mjs");
      
      const assetsStart = Date.now();
      const assetsResult = await createCharacterAssets({
        bookId,
        bookDir,
        identity,
        photoBase64: photo.base64,
        photoMimeType: photo.mimeType,
        requestId: "golden_test"
      });
      const assetsTime = Date.now() - assetsStart;
      
      metrics.stages.characterAssets = {
        success: assetsResult.success,
        timeMs: assetsTime,
        error: assetsResult.error
      };

      if (!assetsResult.success) {
        console.error(`  Character assets failed: ${assetsResult.error}`);
        throw new Error(`Character assets failed: ${assetsResult.error}`);
      }

      console.log(`  Hero head: ${assetsResult.assets.heroHead.path}`);
      console.log(`  Full body ref: ${assetsResult.assets.heroFullBody.path}`);
      console.log(`  Outfit: ${assetsResult.assets.outfitDescription.substring(0, 50)}...`);
      console.log(`  Time: ${assetsTime}ms`);

      // Generate pages
      console.log("\n[3/5] Generating pages...");
      
      const { generateAllPagesV2 } = await import("../services/illustration_pipeline_v2.mjs");
      
      const pagesStart = Date.now();
      const pagesResult = await generateAllPagesV2({
        bookId,
        bookDir,
        pageContents,
        identity,
        assets: assetsResult.assets,
        ageGroup: options.ageGroup,
        requestId: "golden_test"
      });
      const pagesTime = Date.now() - pagesStart;

      metrics.stages.pageGeneration = {
        success: pagesResult.success,
        timeMs: pagesTime,
        stats: pagesResult.stats,
        warnings: pagesResult.warnings
      };

      console.log(`  Generated: ${pagesResult.stats.successful}/${pagesResult.stats.total} pages`);
      console.log(`  Time: ${pagesTime}ms`);
      
      if (pagesResult.warnings.length > 0) {
        console.log(`  Warnings: ${pagesResult.warnings.map(w => w.code).join(", ")}`);
      }

      // Identity check
      console.log("\n[4/5] Running identity checks...");
      
      let identityResults = [];
      try {
        const { checkSimilarity } = await import("../utils/face-id/index.mjs");
        
        for (const page of pagesResult.pages) {
          if (!page.compositedPath || !fs.existsSync(page.compositedPath)) {
            identityResults.push({ page: page.pageNumber, skipped: true });
            continue;
          }
          
          const simResult = await checkSimilarity(
            assetsResult.assets.heroHead.path,
            page.compositedPath
          );
          
          identityResults.push({
            page: page.pageNumber,
            similarity: simResult.similarity,
            passed: simResult.ok && simResult.similarity >= 0.45
          });
          
          console.log(`  Page ${page.pageNumber}: similarity=${(simResult.similarity || 0).toFixed(3)}`);
        }
      } catch (e) {
        console.log(`  Identity check unavailable: ${e.message?.substring(0, 50)}`);
        identityResults = pagesResult.pages.map(p => ({ 
          page: p.pageNumber, 
          skipped: true,
          reason: "FaceID unavailable"
        }));
      }

      metrics.stages.identityCheck = {
        results: identityResults,
        threshold: 0.45
      };

      // Save metrics
      metrics.pipeline = "v2";
      metrics.pages = pagesResult.pages.map(p => ({
        pageNumber: p.pageNumber,
        hasImage: p.hasImage,
        error: p.error,
        compositedPath: p.compositedPath,
        rawPath: p.rawPath,
        blendMethod: p.blendMethod
      }));
    }

    const totalTime = Date.now() - startTime;
    metrics.totalTimeMs = totalTime;
    metrics.endTime = new Date().toISOString();

    // Save report
    console.log("\n[5/5] Saving report...");
    
    const reportPath = path.join(bookDir, "golden_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));
    console.log(`  Report saved: ${reportPath}`);

    // Generate HTML report
    const htmlReport = generateHtmlReport(metrics, bookDir);
    const htmlPath = path.join(bookDir, "golden_report.html");
    fs.writeFileSync(htmlPath, htmlReport);
    console.log(`  HTML report: ${htmlPath}`);

    console.log("\n" + "=".repeat(60));
    console.log("Golden test completed successfully!");
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Output: ${bookDir}`);
    console.log("=".repeat(60));

  } catch (error) {
    console.error("\nGolden test failed:", error.message);
    metrics.error = error.message;
    metrics.totalTimeMs = Date.now() - startTime;
    
    const reportPath = path.join(bookDir, "golden_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));
    
    process.exit(1);
  }
}

// Generate HTML report
function generateHtmlReport(metrics, bookDir) {
  const pages = metrics.pages || [];
  
  const pageImagesHtml = pages.map(p => {
    const rawExists = p.rawPath && fs.existsSync(p.rawPath);
    const compExists = p.compositedPath && fs.existsSync(p.compositedPath);
    
    return `
      <div class="page-card">
        <h3>Page ${p.pageNumber}</h3>
        <div class="images">
          ${rawExists ? `<div class="image"><img src="page_${p.pageNumber}_raw.png" alt="Raw"><span>Raw</span></div>` : ""}
          ${compExists ? `<div class="image"><img src="page_${p.pageNumber}.png" alt="Composited"><span>Composited</span></div>` : ""}
        </div>
        <div class="meta">
          <p>Blend: ${p.blendMethod || "N/A"}</p>
          <p>Error: ${p.error || "None"}</p>
        </div>
      </div>
    `;
  }).join("\n");

  const identityResultsHtml = (metrics.stages?.identityCheck?.results || []).map(r => {
    const status = r.skipped ? "⚪ Skipped" : r.passed ? "✅ Passed" : "❌ Failed";
    return `<tr>
      <td>Page ${r.page}</td>
      <td>${r.similarity !== undefined ? r.similarity.toFixed(3) : "N/A"}</td>
      <td>${status}</td>
    </tr>`;
  }).join("\n");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Golden Illustrations Report - ${metrics.bookId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary table { border-collapse: collapse; }
    .summary td, .summary th { padding: 8px 16px; text-align: left; border-bottom: 1px solid #eee; }
    .assets { display: flex; gap: 20px; margin-bottom: 20px; }
    .asset { background: white; padding: 15px; border-radius: 8px; text-align: center; }
    .asset img { max-width: 200px; max-height: 200px; border: 1px solid #ddd; }
    .pages { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .page-card { background: white; padding: 15px; border-radius: 8px; }
    .page-card h3 { margin-top: 0; }
    .images { display: flex; gap: 10px; }
    .image { text-align: center; }
    .image img { max-width: 140px; border: 1px solid #ddd; }
    .image span { display: block; font-size: 12px; color: #666; }
    .meta { font-size: 12px; color: #666; margin-top: 10px; }
    .identity { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; }
    .identity table { width: 100%; border-collapse: collapse; }
    .identity th, .identity td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
  </style>
</head>
<body>
  <h1>Golden Illustrations Report</h1>
  
  <div class="summary">
    <h2>Summary</h2>
    <table>
      <tr><td>Book ID</td><td><code>${metrics.bookId}</code></td></tr>
      <tr><td>Pipeline</td><td>${metrics.pipeline || "unknown"}</td></tr>
      <tr><td>Total Time</td><td>${metrics.totalTimeMs}ms</td></tr>
      <tr><td>Pages Generated</td><td>${metrics.stages?.pageGeneration?.stats?.successful || 0} / ${metrics.stages?.pageGeneration?.stats?.total || 0}</td></tr>
      <tr><td>Start Time</td><td>${metrics.startTime}</td></tr>
    </table>
  </div>

  <h2>Character Assets</h2>
  <div class="assets">
    <div class="asset">
      <img src="hero_head.png" alt="Hero Head" onerror="this.style.display='none'">
      <p>Hero Head</p>
    </div>
    <div class="asset">
      <img src="hero_fullbody_ref.jpg" alt="Full Body Reference" onerror="this.style.display='none'">
      <p>Full Body Reference</p>
    </div>
  </div>

  <h2>Generated Pages</h2>
  <div class="pages">
    ${pageImagesHtml || "<p>No pages generated</p>"}
  </div>

  <div class="identity">
    <h2>Identity Check Results</h2>
    <p>Threshold: ${metrics.stages?.identityCheck?.threshold || 0.45}</p>
    <table>
      <thead>
        <tr><th>Page</th><th>Similarity</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${identityResultsHtml || "<tr><td colspan='3'>No results</td></tr>"}
      </tbody>
    </table>
  </div>

  <div class="summary" style="margin-top: 20px;">
    <h2>Raw Metrics</h2>
    <pre>${JSON.stringify(metrics, null, 2)}</pre>
  </div>
</body>
</html>
  `;
}

// Run
main().catch(console.error);

