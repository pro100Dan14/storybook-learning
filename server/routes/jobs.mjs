/**
 * Job Artifacts Routes
 * Serve reports and hero images for completed books
 */

import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.dirname(__dirname);

const router = Router();

// UUID v4 validation pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate bookId format
 */
function validateBookId(bookId) {
  return UUID_PATTERN.test(bookId);
}

/**
 * GET /jobs/:bookId/report.html
 * Serve HTML report for a book
 */
router.get("/:bookId/report.html", (req, res) => {
  const { bookId } = req.params;
  
  if (!validateBookId(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }
  
  const filePath = path.join(serverDir, "jobs", bookId, "report.html");
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Report not found" });
  }
  
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.sendFile(filePath);
});

/**
 * GET /jobs/:bookId/report.json
 * Serve JSON report for a book
 */
router.get("/:bookId/report.json", (req, res) => {
  const { bookId } = req.params;
  
  if (!validateBookId(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }
  
  const filePath = path.join(serverDir, "jobs", bookId, "report.json");
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Report JSON not found" });
  }
  
  res.setHeader("Content-Type", "application/json");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.sendFile(filePath);
});

/**
 * GET /jobs/:bookId/hero.jpg
 * Serve hero image for a book
 */
router.get("/:bookId/hero.jpg", (req, res) => {
  const { bookId } = req.params;
  
  if (!validateBookId(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }
  
  const filePath = path.join(serverDir, "jobs", bookId, "hero.jpg");
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Hero image not found" });
  }
  
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.sendFile(filePath);
});

/**
 * GET /jobs/:bookId/input.jpg
 * Serve input image (for external model fetch)
 */
router.get("/:bookId/input.jpg", (req, res) => {
  const { bookId } = req.params;

  if (!validateBookId(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }

  const filePath = path.join(serverDir, "jobs", bookId, "input.jpg");

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Input image not found" });
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.sendFile(filePath);
});

/**
 * GET /jobs/:bookId/page_:pageNum.png
 * Serve page illustration for Lovable carousel
 */
router.get("/:bookId/page_:pageNum.png", (req, res) => {
  const { bookId, pageNum } = req.params;
  
  if (!validateBookId(bookId)) {
    return res.status(400).json({ error: "INVALID_BOOK_ID", message: "bookId must be a valid UUID" });
  }
  
  // Validate pageNum is a number
  const pageNumber = parseInt(pageNum, 10);
  if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > 100) {
    return res.status(400).json({ error: "INVALID_PAGE_NUM", message: "pageNum must be a number 1-100" });
  }
  
  const filePath = path.join(serverDir, "jobs", bookId, `page_${pageNumber}.png`);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "NOT_FOUND", message: `Page ${pageNumber} image not found` });
  }
  
  res.setHeader("Content-Type", "image/png");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24h
  res.sendFile(filePath);
});

export default router;




