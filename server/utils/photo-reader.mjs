// Helper module for reading photo files
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default photo path (relative to server directory)
const DEFAULT_PHOTO_PATH = path.join(__dirname, "../fixtures/hero_photo_2.jpg");

// Fallback to base64 file for backward compatibility
const FALLBACK_BASE64_PATH = "/tmp/child_base64.txt";

/**
 * Reads a photo file and returns base64 encoded string
 * Supports:
 * - Command line argument: --photo <path>
 * - Environment variable: PHOTO=<path>
 * - Default: fixtures/hero_photo_2.jpg
 * - Fallback: /tmp/child_base64.txt (base64 string file)
 */
export function getPhotoPath() {
  // Check command line arguments
  const args = process.argv.slice(2);
  const photoArgIndex = args.indexOf("--photo");
  if (photoArgIndex !== -1 && args[photoArgIndex + 1]) {
    const photoPath = args[photoArgIndex + 1];
    if (path.isAbsolute(photoPath)) {
      return photoPath;
    }
    // Relative to server directory
    return path.join(__dirname, "..", photoPath);
  }
  
  // Check environment variable
  if (process.env.PHOTO) {
    const photoPath = process.env.PHOTO;
    if (path.isAbsolute(photoPath)) {
      return photoPath;
    }
    // Relative to server directory
    return path.join(__dirname, "..", photoPath);
  }
  
  // Default
  return DEFAULT_PHOTO_PATH;
}

/**
 * Reads photo file and returns base64 string
 */
export function readPhotoBase64() {
  const photoPath = getPhotoPath();
  
  if (!fs.existsSync(photoPath)) {
    // Fallback to base64 file for backward compatibility
    if (fs.existsSync(FALLBACK_BASE64_PATH)) {
      console.log(`⚠️  Photo file not found: ${photoPath}, using fallback: ${FALLBACK_BASE64_PATH}`);
      return fs.readFileSync(FALLBACK_BASE64_PATH, "utf8").trim();
    }
    throw new Error(`Photo file not found: ${photoPath} and fallback not available`);
  }
  
  // Check if it's a base64 text file (backward compatibility)
  const ext = path.extname(photoPath).toLowerCase();
  if (ext === ".txt") {
    return fs.readFileSync(photoPath, "utf8").trim();
  }
  
  // Read image file and convert to base64
  const imageBuffer = fs.readFileSync(photoPath);
  const base64 = imageBuffer.toString("base64");
  return base64;
}

/**
 * Gets mime type based on file extension
 */
export function getPhotoMimeType() {
  const photoPath = getPhotoPath();
  const ext = path.extname(photoPath).toLowerCase();
  
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg"; // default
  }
}

/**
 * Gets photo source info for logging (without full path)
 */
export function getPhotoSourceInfo() {
  const photoPath = getPhotoPath();
  const basename = path.basename(photoPath);
  
  // Check how it was specified
  const args = process.argv.slice(2);
  const photoArgIndex = args.indexOf("--photo");
  if (photoArgIndex !== -1) {
    return `--photo ${basename}`;
  }
  
  if (process.env.PHOTO) {
    return `PHOTO=${basename}`;
  }
  
  return `default (${basename})`;
}



