#!/usr/bin/env node
/**
 * Local smoke test for Comfy Cloud workflow
 * - Uploads a local photo
 * - Runs workflow
 * - Prints 1 anchor + N scene URLs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateComfyImages } from "../services/comfy-generation.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../");

const DEFAULT_PHOTO = path.join(REPO_ROOT, "server", "fixtures", "hero_photo_2.jpg");

async function main() {
  if (!process.env.COMFY_CLOUD_API_KEY) {
    console.error("COMFY_CLOUD_API_KEY is required");
    process.exit(1);
  }
  const photoPath = process.argv[2] || DEFAULT_PHOTO;
  const scenes = [
    "Child at home, warm cozy room, gentle light.",
    "Child explores a friendly magical forest path, soft sunlight.",
    "Child returns home smiling, holding a small glowing keepsake."
  ];

  if (!fs.existsSync(photoPath)) {
    console.error(`Photo not found: ${photoPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(photoPath);
  const result = await generateComfyImages({
    photoBuffer: buffer,
    photoFilename: path.basename(photoPath),
    photoMimeType: "image/jpeg",
    scenes,
    bookId: "local-test",
    seedBase: "local-test",
    includeDataUrl: false
  });

  if (!result.anchorImage?.url || result.sceneImages.length < 3) {
    console.error("Failed: expected 1 anchor + 3 scene URLs");
    process.exit(1);
  }

  console.log("Anchor URL:", result.anchorImage.url);
  result.sceneImages.forEach((img, idx) => {
    console.log(`Scene ${idx + 1} URL:`, img.url);
  });
  console.log("OK");
}

main().catch((e) => {
  console.error("Error:", e?.message || e);
  process.exit(1);
});


