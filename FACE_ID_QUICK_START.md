# FaceID Quick Start Guide

## How to Run Locally

### 1. Install Python Dependencies

```bash
pip install opencv-python insightface numpy
```

### 2. Start Backend with FaceID Enabled

```bash
cd server
export FACE_ID_ENABLED=true
export FACE_ID_THRESHOLD=0.32
export FACE_ID_MAX_ATTEMPTS=2
export DEBUG_FACE_ID=true  # Optional: for detailed logs
npm run dev
```

Backend runs on `http://localhost:8787`

### 3. Start UI (Optional)

```bash
cd web
npm run dev
```

UI runs on `http://localhost:5173` (proxies to backend)

## Verification Checklist

### Test 1: FaceID Disabled (Default Behavior)

```bash
# Ensure FaceID is disabled
unset FACE_ID_ENABLED

# Generate a book
curl -X POST http://localhost:8787/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Алекс",
    "theme": "волшебный лес",
    "photoBase64": "<base64_photo>",
    "ageGroup": "4-6"
  }'

# Expected: HTTP 200, ok: true
# Check report.json: faceId should be null
```

### Test 2: FaceID Enabled - Valid Photo

```bash
# Enable FaceID
export FACE_ID_ENABLED=true

# Generate a book with clear face photo
curl -X POST http://localhost:8787/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Алекс",
    "theme": "волшебный лес",
    "photoBase64": "<base64_photo_with_face>",
    "ageGroup": "4-6"
  }'

# Expected: HTTP 200, ok: true
# Check report.json:
# - faceId.enabled: true
# - pages[].faceId.similarity: >= 0.32
# - pages[].faceId.passed: true
```

### Test 3: FaceID Enabled - No Face Detected

```bash
# Enable FaceID
export FACE_ID_ENABLED=true

# Generate with photo that has no face
curl -X POST http://localhost:8787/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Алекс",
    "theme": "волшебный лес",
    "photoBase64": "<base64_photo_no_face>",
    "ageGroup": "4-6"
  }'

# Expected: HTTP 400
# Response: { "ok": false, "error": "NO_FACE_DETECTED", "message": "Face not detected..." }
```

### Test 4: Check Report JSON

```bash
# After successful generation, get bookId from response
BOOK_ID="<book_id_from_response>"

# Check report.json
curl http://localhost:8787/jobs/$BOOK_ID/report.json | jq '.faceId'

# Expected output (if FaceID enabled):
# {
#   "enabled": true,
#   "threshold": 0.32,
#   "maxAttempts": 2
# }

# Check page FaceID results
curl http://localhost:8787/jobs/$BOOK_ID/report.json | jq '.pages[0].faceId'

# Expected output (if FaceID enabled):
# {
#   "attemptCount": 1,
#   "similarity": 0.45,
#   "passed": true,
#   "faceDetected": true
# }
```

### Test 5: Python Script Directly

```bash
# Test face detection
python3 tools/face_id.py --extract-only \
  --reference server/jobs/<bookId>/hero.jpg \
  --output /tmp/test_face_ref.json

# Expected: JSON with ok: true, embedding array

# Test similarity (after generating a page)
python3 tools/face_id.py \
  --reference server/jobs/<bookId>/hero.jpg \
  --candidate server/jobs/<bookId>/page-1.png

# Expected: JSON with ok: true, similarity: 0.0-1.0
```

## Expected Outputs

### Success Response (FaceID Enabled)

```json
{
  "ok": true,
  "bookId": "uuid-here",
  "pages": [...],
  "warnings": []
}
```

### Failure Response - No Face Detected

```json
{
  "ok": false,
  "error": "NO_FACE_DETECTED",
  "message": "Face not detected in the input photo. Please upload a photo with a clear face.",
  "requestId": "...",
  "bookId": "..."
}
```

### Failure Response - Similarity Too Low

```json
{
  "ok": false,
  "error": "BOOK_GENERATION_FAILED",
  "message": "1 page(s) failed to generate",
  "errors": [
    {
      "page": 1,
      "error": "FACE_ID_SIMILARITY_FAILED: similarity=0.25, threshold=0.32 after 2 attempts",
      "code": "FACE_ID_SIMILARITY_FAILED"
    }
  ],
  "requestId": "...",
  "bookId": "..."
}
```

## Debugging

### Check Backend Logs

With `DEBUG_FACE_ID=true`, logs include:
```
[FACE_ID] Extracting embedding from server/jobs/.../hero.jpg
[FACE_ID] Extraction result: ok=true, face_detected=true
[FACE_ID] Checking similarity: ref=..., candidate=...
[FACE_ID] Similarity result: ok=true, similarity=0.45, passed=true
```

### Common Issues

1. **Python dependencies missing**
   - Error: `DEPENDENCIES_MISSING`
   - Fix: `pip install opencv-python insightface numpy`

2. **No face detected**
   - Error: `NO_FACE_DETECTED`
   - Fix: Use photo with clear, front-facing face

3. **Low similarity**
   - Warning: Similarity below threshold
   - Fix: Lower threshold or increase maxAttempts

## Notes

- FaceID is **opt-in** - disabled by default
- When disabled, API behavior is identical to before
- Embeddings are stored only in job folders, not globally
- No breaking API changes




