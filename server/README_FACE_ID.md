# FaceID Identity Conditioning

FaceID ensures consistent face appearance across all 4 generated page images using InsightFace embeddings, without requiring any training.

## Overview

When `FACE_ID_ENABLED=true`, the system:
1. Validates that the input photo contains a detectable face
2. Extracts a face embedding from the reference photo using InsightFace
3. After each page image is generated, checks similarity between reference and generated face
4. Retries generation (up to `FACE_ID_MAX_ATTEMPTS`) if similarity is below threshold
5. Fails book generation with `ok: false` if similarity cannot be achieved after retries

## Feature Flag

**Default: DISABLED** - FaceID is off by default and must be explicitly enabled.

```bash
FACE_ID_ENABLED=true
```

## Environment Variables

```bash
# Enable FaceID feature
FACE_ID_ENABLED=true

# Similarity threshold (0.0 to 1.0, higher = stricter)
# Default: 0.32 (conservative, allows some variation)
FACE_ID_THRESHOLD=0.32

# Maximum regeneration attempts per page when similarity is low
# Default: 2
FACE_ID_MAX_ATTEMPTS=2

# Debug logging (logs similarity scores, no secrets, no embeddings)
DEBUG_FACE_ID=true

# Python executable path (default: python3)
# Set PYTHON_BIN=python3 if your system python differs.
PYTHON_BIN=python3
```

## Python Dependencies

The FaceID system uses a Python script (`tools/face_id.py`) that requires:

```bash
pip install opencv-python insightface numpy
```

**Note:** InsightFace will automatically download model weights on first run.

## Installation

1. Install Python dependencies:
   ```bash
   pip install opencv-python insightface numpy
   ```

2. Verify Python script works:
   ```bash
   python3 tools/face_id.py --help
   ```

3. Enable FaceID in backend:
   ```bash
   export FACE_ID_ENABLED=true
   export FACE_ID_THRESHOLD=0.32
   export FACE_ID_MAX_ATTEMPTS=2
   ```

## How It Works

### 1. Input Photo Validation

When a book generation request is received:
- If `FACE_ID_ENABLED=true`, validates that input photo has a detectable face
- Returns HTTP 400 `NO_FACE_DETECTED` if no face found
- If disabled, skips validation (backward compatible)

### 2. Face Embedding Extraction

After hero photo is saved to `server/jobs/:bookId/hero.jpg`:
- Extracts face embedding using InsightFace
- Saves embedding to `server/jobs/:bookId/face_ref.json`
- Embedding is only stored in job folder, not globally

### 3. Page Image Generation with Similarity Check

For each of the 4 pages:
1. Generate page image using Gemini API (same as before)
2. Save image to `server/jobs/:bookId/page-X.png`
3. Check similarity between `hero.jpg` and `page-X.png`
4. If similarity >= threshold: continue to next page
5. If similarity < threshold and attempts < maxAttempts: delete image, retry generation
6. If similarity < threshold after all retries: fail book generation with `ok: false`

### 4. Error Handling

- **NO_FACE_DETECTED**: Input photo has no detectable face → HTTP 400
- **FACE_ID_EXTRACTION_FAILED**: Failed to extract embedding → HTTP 500
- **FACE_ID_SIMILARITY_FAILED**: Similarity below threshold after retries → HTTP 500, `ok: false`

## Report JSON Structure

When FaceID is enabled, `report.json` includes:

```json
{
  "faceId": {
    "enabled": true,
    "threshold": 0.32,
    "maxAttempts": 2
  },
  "pages": [
    {
      "pageNumber": 1,
      "faceId": {
        "attemptCount": 1,
        "similarity": 0.45,
        "passed": true,
        "faceDetected": true
      }
    }
  ]
}
```

When FaceID is disabled, `faceId` fields are `null` or omitted.

## Debugging

### Enable Debug Logs

```bash
DEBUG_FACE_ID=true npm run dev
```

Debug logs include:
- Similarity scores for each page
- Retry attempts and reasons
- Face detection results
- **No secrets, no embeddings, no raw images**

### Check Face Detection

Test face detection on a photo:
```bash
python3 tools/face_id.py --extract-only \
  --reference server/jobs/<bookId>/hero.jpg \
  --output server/jobs/<bookId>/face_ref.json
```

### Check Similarity

Test similarity between two images:
```bash
python3 tools/face_id.py \
  --reference server/jobs/<bookId>/hero.jpg \
  --candidate server/jobs/<bookId>/page-1.png
```

## Safety Notes

- **Embeddings are NOT persisted globally** - only stored in job folder (`server/jobs/:bookId/face_ref.json`)
- **Job folders are cleaned up** - embeddings are deleted when job is cleaned up
- **No training required** - uses pre-trained InsightFace model
- **No secrets in logs** - debug logs never include embeddings or raw images

## API Contract

FaceID does **NOT** change API contracts:
- `POST /api/book` input/output shape unchanged
- When disabled (default), behavior is identical to before
- When enabled, may return `ok: false` with `FACE_ID_SIMILARITY_FAILED` error if similarity cannot be achieved

## Troubleshooting

### "DEPENDENCIES_MISSING" error
- Install Python dependencies: `pip install opencv-python insightface numpy`
- Verify Python 3 is available: `python3 --version`

### "NO_FACE_DETECTED" error
- Ensure input photo has a clear, front-facing face
- Check photo quality (minimum 256x256 pixels)
- Try a different photo

### Low similarity scores
- Lower threshold: `FACE_ID_THRESHOLD=0.25` (more permissive)
- Increase retries: `FACE_ID_MAX_ATTEMPTS=3`
- Check that reference photo has good face visibility

### Python script fails
- Check Python version: `python3 --version` (requires 3.7+)
- Verify dependencies: `python3 -c "import cv2, insightface, numpy; print('OK')"`
- Check file permissions on `tools/face_id.py`

## Testing

Run unit tests (no GPU required):
```bash
node server/utils/face-id/test.mjs
```

## Evaluation Harness

The FaceID evaluation harness allows you to test FaceID similarity checks on a batch of fixture images.

### Setup

1. Create fixture directories:
   ```bash
   mkdir -p tools/faceid_fixtures/good
   mkdir -p tools/faceid_fixtures/bad
   ```

2. Add test images:
   - `good/` - Images of the same person as reference (should pass)
   - `bad/` - Images of different person or no face (should fail)
   - See `tools/faceid_fixtures/README.md` for details

3. Run evaluation:
   ```bash
   npm run faceid:eval -- --ref tools/faceid_fixtures/reference.jpg
   ```

### Command Options

```bash
# Basic usage
node tools/faceid-eval.mjs --ref <reference_image>

# With custom threshold
node tools/faceid-eval.mjs --ref <reference_image> --threshold 0.35

# Output to specific directory
node tools/faceid-eval.mjs --ref <reference_image> --out ./my-reports

# CSV only
node tools/faceid-eval.mjs --ref <reference_image> --format csv

# Strict mode (exit code 1 if expectations violated)
node tools/faceid-eval.mjs --ref <reference_image> --strict
```

### Threshold Tuning

- **Default: 0.32** - Conservative, allows some variation
- **0.25-0.30** - More permissive (good for different angles/expressions)
- **0.35-0.40** - Stricter (requires very similar faces)
- **0.40+** - Very strict (may fail on same person with different lighting)

Start with default (0.32) and adjust based on your fixture results.

### Output

Reports are saved to `tools/faceid_reports/<timestamp>/`:
- `report.json` - Full results with config and summary
- `report.csv` - Tabular data for spreadsheet analysis

### Strict Mode

Use `--strict` to ensure:
- All `good/` fixtures pass (same person)
- All `bad/` fixtures fail (different person or no face)

Exit code is non-zero if expectations are violated.

### Test Suite

Run automated tests (no fixtures required):
```bash
npm run test:faceid:eval
```

This validates the evaluator behavior using mocks.

Test with mock data:
```bash
# Mock similarity check
python3 -c "
import json
result = {'ok': True, 'similarity': 0.45, 'face_detected_ref': True, 'face_detected_candidate': True}
print(json.dumps(result))
"
```

## API Usage Examples

### macOS-ready examples (copy/paste)

Final commands:

1. Restart server:
```bash
cd /Users/alexsvirkin/storybook-learning/server && npm run dev
```

2. Multipart upload (replace path):
```bash
curl -X POST http://localhost:8787/api/book \
  -F "photo=@/Users/yourname/Desktop/photo.jpg" \
  -F "name=Герой" \
  -F "theme=волшебный лес" \
  -F "pages=4" \
  | jq '.pages[] | {pageNumber, hasImage, dataUrl: (.dataUrl | .[0:50])}'
```

3. JSON base64 upload (replace path):
```bash
PHOTO_B64=$(base64 -i /Users/yourname/Desktop/photo.jpg | tr -d '\n') && \
curl -X POST http://localhost:8787/api/book \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg b64 "$PHOTO_B64" '{name: "Герой", theme: "волшебный лес", pages: 4, photoBase64: $b64, photoMimeType: "image/jpeg"}')" \
  | jq '.pages[] | {pageNumber, hasImage, dataUrl: (.dataUrl | .[0:50])}'
```

4. Sanity check:
```bash
curl -s http://localhost:8787/health | jq '.ok'
```

Notes:
- Multipart field name must be exactly `"photo"`.
- Allowed photo mime types: `image/jpeg`, `image/png`, `image/webp`.
- JSON `photoBase64` must be a real image payload (e.g. `"AA=="` is rejected).
- **Pages parameter**: Multipart form fields are sent as strings. The backend parses and clamps the `pages` value to 1-8. If parsing fails or value is missing, defaults to 4.

## Debug Run

To enable detailed logging for book generation requests, set `DEBUG_BOOK=1`:

```bash
# Start server with debug logging
export DEBUG_BOOK=1
export GOOGLE_APPLICATION_CREDENTIALS=/Users/alexsvirkin/storybook-learning/server/gcp-sa.json
cd /Users/alexsvirkin/storybook-learning/server && npm run dev
```

Then make a request and check server logs for:
- Request parsing (content-type, pages parameter, photo source)
- Per-page image generation status (hasImage, dataUrl length, errors)
- Gemini API authentication mode (api-key vs adc-token)
- Response status codes

Example debug request:

```bash
curl -X POST http://localhost:8787/api/book \
  -F "photo=@/Users/alexsvirkin/Desktop/IMAGE 2026-01-07 18:58:39.jpg" \
  -F "name=Герой" \
  -F "theme=волшебный лес" \
  -F "pages=2" \
  | jq '{pagesCount: (.pages | length), pages: [.pages[] | {pageNumber, hasImage, dataUrlLen: (.dataUrl | length // 0), error}]}'
```

To disable debug logging:
```bash
unset DEBUG_BOOK
```

## Debug Endpoints

### GET /debug/book

Returns configuration information for book generation:

```bash
curl -s http://localhost:8787/debug/book | jq .
```

Response includes:
- `DEBUG_BOOK`: Whether debug logging is enabled
- `providerText`, `providerImage`: Active providers
- `geminiTextModel`, `geminiImageModel`: Model names
- `hasGeminiApiKey`: Boolean (no key value)
- `hasGoogleApplicationCredentials`: Boolean (no path value)

## No-Cloud Verification

You can run FaceID end-to-end verification **without any Google Cloud credentials** by using dummy providers.

### Quick Start (No Credentials Required)

```bash
# From repo root
npm -C server run verify:faceid:e2e
```

This script:
1. Starts the server with `PROVIDER_TEXT=dummy PROVIDER_IMAGE=dummy FACE_ID_ENABLED=true`
2. Verifies `/health` returns 200 with `{"ok":true}`
3. Verifies `/api/identity` returns 200
4. Generates a book and validates `report.json` contains FaceID fields
5. Shuts down the server cleanly

**Expected behavior:** In dummy mode, generated images are minimal 1x1 PNGs without faces, so pages may show `status=FAIL` with `null` similarities. This is expected—the verification confirms that FaceID wiring and report field population work correctly.

### Manual Local Mode

Start server manually without Google credentials:

```bash
FACE_ID_ENABLED=true \
PYTHON_BIN=python3 \
PROVIDER_TEXT=dummy \
PROVIDER_IMAGE=dummy \
npm run dev
```

Test endpoints:
```bash
# Health check
curl http://localhost:8787/health

# Identity extraction (returns dummy JSON)
curl -X POST http://localhost:8787/api/identity \
  -H "Content-Type: application/json" \
  -d '{"photoBase64":"...", "photoMimeType":"image/jpeg"}'
```

### Environment Variables for No-Cloud Mode

| Variable | Value | Description |
|----------|-------|-------------|
| `PROVIDER_TEXT` | `dummy` | Use dummy text provider (no Gemini) |
| `PROVIDER_IMAGE` | `dummy` | Use dummy image provider (no Gemini) |
| `FACE_ID_ENABLED` | `true` | Enable FaceID checks |
| `PYTHON_BIN` | `python3` | Python executable path |
| `DEBUG_FACE_ID` | `true` | (Optional) Enable debug logs |

### What Dummy Providers Return

- **Text**: Deterministic JSON responses based on prompt hash
- **Images**: Valid 1x1 PNG (minimal placeholder)

This mode is for **verification only** - generated content is not meaningful but validates the full pipeline works.

**Environment variables used:**
- `FACE_ID_ENABLED=true` - Enable FaceID checks
- `PYTHON_BIN=python3` - Python executable path
- `PROVIDER_TEXT=dummy` - Use dummy text provider (no Google credentials)
- `PROVIDER_IMAGE=dummy` - Use dummy image provider (no Google credentials)

