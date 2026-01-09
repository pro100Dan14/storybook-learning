// Hero reference handling - per-book hero reference images
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures per-book hero reference exists and returns its base64 data
 * @param {string} bookId - Unique book identifier
 * @param {string} heroPath - Path to the book's hero.jpg file (e.g., jobs/<book_id>/hero.jpg)
 * @returns {object} { base64, mimeType, path }
 */
export function ensureHeroReference({ bookId, heroPath }) {
  if (!bookId) {
    throw new Error("bookId is required");
  }
  
  if (!heroPath) {
    throw new Error("heroPath is required");
  }
  
  if (!fs.existsSync(heroPath)) {
    throw new Error(`Hero reference not found for book ${bookId} at ${heroPath}. Hero must be selected and saved before use.`);
  }
  
  const imageBuffer = fs.readFileSync(heroPath);
  const base64 = imageBuffer.toString("base64");
  
  // Determine mime type from file extension
  const ext = path.extname(heroPath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
  
  return {
    base64,
    mimeType,
    path: heroPath,
    bookId
  };
}

/**
 * Saves hero reference for a book
 * @param {string} bookId - Unique book identifier
 * @param {string} jobsDir - Base directory for jobs (e.g., server/jobs)
 * @param {Buffer|string} imageData - Image buffer or base64 string
 * @param {string} mimeType - MIME type of the image
 * @returns {string} Path to saved hero file
 */
export function saveHeroReference({ bookId, jobsDir, imageData, mimeType }) {
  if (!bookId) {
    throw new Error("bookId is required");
  }
  
  const bookDir = path.join(jobsDir, bookId);
  
  // Ensure book directory exists
  if (!fs.existsSync(bookDir)) {
    fs.mkdirSync(bookDir, { recursive: true });
  }
  
  const heroPath = path.join(bookDir, "hero.jpg");
  
  // Convert imageData to buffer if needed
  let buffer;
  if (Buffer.isBuffer(imageData)) {
    buffer = imageData;
  } else if (typeof imageData === 'string') {
    // Handle data URL or plain base64
    const cleanBase64 = imageData.includes('base64,') 
      ? imageData.split('base64,')[1] 
      : imageData;
    buffer = Buffer.from(cleanBase64, 'base64');
  } else {
    throw new Error("imageData must be Buffer or base64 string");
  }
  
  // Save as JPEG (normalize)
  fs.writeFileSync(heroPath, buffer);
  
  return heroPath;
}

