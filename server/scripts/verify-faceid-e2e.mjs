#!/usr/bin/env node
// End-to-end FaceID verification script
// Runs in "no-cloud" mode using dummy providers - no Google credentials required

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');
const JOBS_DIR = path.join(SERVER_DIR, 'jobs');

const SERVER_URL = 'http://localhost:8787';
const MAX_STARTUP_WAIT_MS = 30000;
const POLL_INTERVAL_MS = 500;

let serverProcess = null;

function log(msg) {
  console.log(`[verify-faceid-e2e] ${msg}`);
}

function logError(msg) {
  console.error(`[verify-faceid-e2e] ❌ ${msg}`);
}

function logSuccess(msg) {
  console.log(`[verify-faceid-e2e] ✅ ${msg}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetch_json(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, text, json };
}

async function waitForServer() {
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_STARTUP_WAIT_MS) {
    try {
      const res = await fetch(`${SERVER_URL}/health`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok === true) {
          return true;
        }
      }
    } catch {}
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      FACE_ID_ENABLED: 'true',
      PYTHON_BIN: process.env.PYTHON_BIN || 'python3',
      PROVIDER_TEXT: 'dummy',
      PROVIDER_IMAGE: 'dummy',
      DEBUG_FACE_ID: 'true',
    };

    log('Starting server with:');
    log(`  FACE_ID_ENABLED=true`);
    log(`  PYTHON_BIN=${env.PYTHON_BIN}`);
    log(`  PROVIDER_TEXT=dummy`);
    log(`  PROVIDER_IMAGE=dummy`);

    serverProcess = spawn('node', ['index.js'], {
      cwd: SERVER_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      if (process.env.DEBUG_VERIFY) {
        process.stdout.write(`[server] ${data}`);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      if (process.env.DEBUG_VERIFY) {
        process.stderr.write(`[server] ${data}`);
      }
    });

    serverProcess.on('error', (err) => {
      reject(new Error(`Failed to start server: ${err.message}`));
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Give it a moment to start
    setTimeout(() => resolve(), 500);
  });
}

async function stopServer() {
  if (serverProcess) {
    log('Stopping server...');
    serverProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown with timeout
    const shutdownTimeout = new Promise(resolve => setTimeout(resolve, 3000));
    const shutdownPromise = new Promise(resolve => {
      if (serverProcess) {
        serverProcess.once('exit', () => resolve());
      } else {
        resolve();
      }
    });
    
    await Promise.race([shutdownPromise, shutdownTimeout]);
    serverProcess = null;
  }
}

function getNewestJobDir() {
  if (!fs.existsSync(JOBS_DIR)) return null;
  const dirs = fs.readdirSync(JOBS_DIR)
    .map(name => ({ name, path: path.join(JOBS_DIR, name) }))
    .filter(d => fs.statSync(d.path).isDirectory())
    .map(d => ({ ...d, mtime: fs.statSync(d.path).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return dirs.length > 0 ? dirs[0].path : null;
}

async function runVerification() {
  const results = {
    serverStart: false,
    healthCheck: false,
    identityEndpoint: false,
    bookGeneration: false,
    reportExists: false,
    identityGuardAvailable: false,
    faceIdFieldsPresent: false,
    allPagesHaveFaceId: false,
  };

  try {
    // 1) Start server
    log('Step 1: Starting server in no-cloud mode...');
    await startServer();
    results.serverStart = true;
    logSuccess('Server process started');

    // 2) Wait for health
    log('Step 2: Waiting for server health...');
    const healthy = await waitForServer();
    if (!healthy) {
      throw new Error('Server did not become healthy within timeout');
    }
    results.healthCheck = true;
    logSuccess('Server is healthy');

    // 3) Test /api/identity
    log('Step 3: Testing /api/identity...');
    const photoPath = path.join(SERVER_DIR, 'fixtures', 'hero_photo_2.jpg');
    if (!fs.existsSync(photoPath)) {
      throw new Error(`Test photo not found: ${photoPath}`);
    }
    const photoBase64 = fs.readFileSync(photoPath).toString('base64');
    
    const identityRes = await fetch_json(`${SERVER_URL}/api/identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: photoBase64, mimeType: 'image/jpeg' }),
    });

    if (!identityRes.ok) {
      throw new Error(`/api/identity returned ${identityRes.status}: ${identityRes.text}`);
    }
    results.identityEndpoint = true;
    logSuccess(`/api/identity returned 200`);

    // 4) Generate book
    log('Step 4: Generating book...');
    const bookRes = await fetch_json(`${SERVER_URL}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pages: 4,
        photoBase64,
        photoMimeType: 'image/jpeg',
      }),
    });

    if (!bookRes.ok || !bookRes.json?.ok) {
      throw new Error(`/api/book failed: ${bookRes.text}`);
    }
    results.bookGeneration = true;
    logSuccess(`Book generated: ${bookRes.json.bookId}`);

    // 5) Check report.json
    log('Step 5: Checking report.json...');
    const jobDir = getNewestJobDir();
    if (!jobDir) {
      throw new Error('No job directory found');
    }
    const reportPath = path.join(jobDir, 'report.json');
    if (!fs.existsSync(reportPath)) {
      throw new Error(`report.json not found in ${jobDir}`);
    }
    results.reportExists = true;
    logSuccess(`Report found: ${reportPath}`);

    // 6) Validate report fields
    log('Step 6: Validating report fields...');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    // Check identityGuardAvailable
    if (report.summary?.identityGuardAvailable === true) {
      results.identityGuardAvailable = true;
      logSuccess('identityGuardAvailable: true');
    } else {
      logError(`identityGuardAvailable: ${report.summary?.identityGuardAvailable} (expected true)`);
    }

    // Check faceId fields on pages
    const pages = report.pages || [];
    let allHaveFaceId = true;
    let faceIdFieldsOk = true;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const faceId = page.faceId;
      
      if (!faceId) {
        logError(`Page ${i + 1}: faceId is null/missing`);
        allHaveFaceId = false;
        continue;
      }

      // Check required fields
      const hasRef = typeof faceId.refSimilarity === 'number' || faceId.refSimilarity === null;
      const hasAnchor = typeof faceId.anchorSimilarity === 'number' || faceId.anchorSimilarity === null;
      const hasPrev = typeof faceId.prevSimilarity === 'number' || faceId.prevSimilarity === null;
      const hasStatus = typeof faceId.status === 'string';

      if (!hasRef || !hasAnchor || !hasPrev || !hasStatus) {
        logError(`Page ${i + 1}: faceId missing fields (ref=${hasRef}, anchor=${hasAnchor}, prev=${hasPrev}, status=${hasStatus})`);
        faceIdFieldsOk = false;
      } else {
        log(`  Page ${i + 1}: status=${faceId.status}, refSim=${faceId.refSimilarity?.toFixed(3) ?? 'null'}`);
      }

      // Check status is not "SKIPPED due to deps missing"
      if (faceId.status === 'SKIPPED' && page.error?.includes('deps missing')) {
        logError(`Page ${i + 1}: SKIPPED due to deps missing (FaceID not running)`);
        allHaveFaceId = false;
      }
    }

    results.faceIdFieldsPresent = faceIdFieldsOk;
    results.allPagesHaveFaceId = allHaveFaceId;

    if (faceIdFieldsOk) {
      logSuccess('All faceId fields present');
    }
    if (allHaveFaceId) {
      logSuccess('All pages have faceId data');
    }

  } catch (err) {
    logError(err.message);
  } finally {
    await stopServer();
  }

  // Summary
  console.log('\n=== Verification Summary ===');
  const allPass = Object.values(results).every(v => v === true);
  
  for (const [key, value] of Object.entries(results)) {
    console.log(`  ${value ? '✅' : '❌'} ${key}: ${value}`);
  }

  console.log('\n=== Final Verdict ===');
  if (allPass) {
    console.log('✅ PASS - FaceID end-to-end verification successful (no cloud credentials required)');
    process.exit(0);
  } else {
    console.log('❌ FAIL - Some checks did not pass');
    process.exit(1);
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  await stopServer();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await stopServer();
  process.exit(1);
});

runVerification();

