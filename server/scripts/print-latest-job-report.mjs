#!/usr/bin/env node
/**
 * Print the newest job report path and preview its contents
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, "..");
const JOBS_DIR = path.join(SERVER_DIR, "jobs");

// Check if jobs directory exists
if (!fs.existsSync(JOBS_DIR)) {
  console.error(`Error: Jobs directory does not exist: ${JOBS_DIR}`);
  process.exit(1);
}

// Read all entries in jobs directory
let entries;
try {
  entries = fs.readdirSync(JOBS_DIR, { withFileTypes: true });
} catch (error) {
  console.error(`Error: Failed to read jobs directory: ${error.message}`);
  process.exit(1);
}

// Filter to only directories
const jobDirs = entries
  .filter(entry => entry.isDirectory())
  .map(entry => {
    const dirPath = path.join(JOBS_DIR, entry.name);
    const stats = fs.statSync(dirPath);
    return {
      name: entry.name,
      path: dirPath,
      mtime: stats.mtimeMs
    };
  });

if (jobDirs.length === 0) {
  console.error(`Error: No job directories found in ${JOBS_DIR}`);
  process.exit(1);
}

// Sort by mtime (newest first)
jobDirs.sort((a, b) => b.mtime - a.mtime);
const newestJob = jobDirs[0];

// Print absolute path of newest job directory
console.log(`Newest job directory: ${newestJob.path}`);

const reportJsonPath = path.join(newestJob.path, "report.json");
console.log(`Report JSON path: ${reportJsonPath}`);

// Check if report.json exists
if (fs.existsSync(reportJsonPath)) {
  try {
    const content = fs.readFileSync(reportJsonPath, "utf8");
    const lines = content.split("\n");
    
    console.log("\n--- First 120 lines ---");
    const firstLines = lines.slice(0, 120);
    console.log(firstLines.join("\n"));
    
    console.log("\n--- Last 80 lines ---");
    const lastLines = lines.slice(-80);
    console.log(lastLines.join("\n"));
  } catch (error) {
    console.error(`Error: Failed to read report.json: ${error.message}`);
    process.exit(1);
  }
} else {
  console.log("\nReport JSON does not exist in this job directory.");
  console.log("\nFiles in job directory:");
  try {
    const files = fs.readdirSync(newestJob.path);
    files.forEach(file => {
      console.log(`  ${file}`);
    });
  } catch (error) {
    console.error(`Error: Failed to list files: ${error.message}`);
    process.exit(1);
  }
}


