# Illustration Pipeline v2

## Overview

Pipeline v2 addresses the fundamental limitation of Gemini's image generation: **it cannot pixel-perfect copy faces from reference images**. Instead of relying on prompts alone, v2 uses a "generate then composite" approach:

1. Generate character assets (hero_head, hero_fullbody_ref) once per book
2. Generate page scenes with unified style prompts
3. **Deterministically composite** hero_head onto each page using landmark alignment
4. Validate identity with InsightFace (higher thresholds because we paste exact face)
5. Retry/regenerate if validation fails

## Root Cause Analysis

**Why prompt-only approach fails:**
- Gemini interprets "copy exact face" as a guideline, not literal instruction
- Each generation produces a different face interpretation
- Style conflict in v1: Pixar face + Bilibin scene + "AVOID Pixar" = confusion

**Solution:**
- Unified 3D animated style for entire image (no conflict)
- Russian folk as CONTENT (costumes, architecture) not STYLE
- Deterministic face compositing using OpenCV + InsightFace landmarks

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `ILLUSTRATION_V2_ENABLED` | `false` | Master switch for v2 pipeline |
| `CHARACTER_ASSETS_ENABLED` | `false` | Enable character asset generation |
| `FACE_COMPOSITE_ENABLED` | `false` | Enable face compositing post-processing |
| `SEND_ORIGINAL_PHOTO_TO_PAGE` | `false` | Send original photo to page generation (may trigger safety filters) |
| `SEND_ORIGINAL_PHOTO_TO_FULLBODY` | `true` | Send original photo when generating fullbody reference |

## Environment Variables

```bash
# V2 Pipeline
ILLUSTRATION_V2_ENABLED=true
CHARACTER_ASSETS_ENABLED=true
FACE_COMPOSITE_ENABLED=true

# Thresholds (higher for v2 because we composite exact face)
V2_SIMILARITY_THRESHOLD=0.45
V2_MAX_PAGE_RETRIES=2

# FaceID (existing)
FACE_ID_ENABLED=true
FACE_ID_THRESHOLD=0.32
FACE_ID_REF_THRESHOLD=0.32
FACE_ID_ANCHOR_THRESHOLD=0.30
FACE_ID_PREV_THRESHOLD=0.28

# Python
PYTHON_BIN=python3
EAST_MODEL_PATH=  # Optional: path to EAST text detection model

# Debug
DEBUG_COMPOSITE=false
DEBUG_TEXT_DETECT=false
```

## New Files Created

### Services
- `server/services/illustration_pipeline_v2.mjs` - Main v2 orchestrator
- `server/services/character_assets.mjs` - Hero head + fullbody generation
- `server/services/face_composite.mjs` - Node.js wrapper for compositing
- `server/services/scene_brief.mjs` - Detailed scene descriptions
- `server/services/text_detection.mjs` - Node.js wrapper for text detection

### Prompts
- `server/prompts/storytelling_v2.mjs` - Fixed prompts without style conflict

### Python Tools
- `tools/face_composite.py` - Face detection + landmark alignment + blending
- `tools/text_detect.py` - Text/watermark detection

### Tests
- `server/services/illustration_pipeline_v2.test.mjs` - Unit tests
- `server/scripts/golden_illustrations.mjs` - E2E golden run

### Documentation
- `server/PIPELINE_V1_ARCHITECTURE.md` - Current system documentation
- `server/README_PIPELINE_V2.md` - This file

## Running Tests

### Unit Tests

```bash
cd server
node --test services/illustration_pipeline_v2.test.mjs
```

### Golden Run (E2E)

```bash
# With test photo
node server/scripts/golden_illustrations.mjs --photo server/fixtures/hero_photo_2.jpg

# With options
node server/scripts/golden_illustrations.mjs \
  --photo server/fixtures/hero_photo_2.jpg \
  --pages 4 \
  --age-group 4-6 \
  --output-dir ./golden_output

# V1 comparison (uses existing pipeline)
node server/scripts/golden_illustrations.mjs --photo server/fixtures/hero_photo_2.jpg --v1
```

Output:
```
golden_output/
  <book-id>/
    hero_head.png
    hero_fullbody_ref.jpg
    page_1_raw.png
    page_1.png (composited)
    page_2_raw.png
    page_2.png
    ...
    golden_report.json
    golden_report.html
```

## Recommended Initial Thresholds

Based on the compositing approach:

| Metric | V1 Threshold | V2 Threshold | Rationale |
|--------|--------------|--------------|-----------|
| Reference similarity | 0.32 | 0.45 | V2 pastes exact face, should be much higher |
| Anchor similarity | 0.30 | 0.40 | Same face pasted on each page |
| Previous similarity | 0.28 | 0.35 | Consecutive pages should match well |

**Calibration Process:**
1. Run golden test with several photos
2. Record similarity scores for:
   - hero_head vs composited page (should be 0.5+)
   - hero_head vs raw generated page (typically 0.2-0.4)
3. Set threshold between these distributions

## API Contract

**No changes to existing API.**

V2 is behind feature flags and falls back to v1 if anything fails. The `/api/book` response structure remains identical.

Optional debug fields (when enabled):
- `v2Pipeline: boolean` - Whether v2 was used
- `compositedPages: number[]` - Page numbers that were composited
- `rawSimilarities: object[]` - Similarity before compositing

## Rollback

Instant rollback by setting:
```bash
ILLUSTRATION_V2_ENABLED=false
```

All requests will use v1 pipeline.

## File Size Compliance

All files are under 1500 LOC:
- `illustration_pipeline_v2.mjs`: ~350 lines
- `character_assets.mjs`: ~220 lines
- `face_composite.mjs`: ~150 lines
- `storytelling_v2.mjs`: ~300 lines
- `scene_brief.mjs`: ~200 lines
- `face_composite.py`: ~350 lines
- `text_detect.py`: ~300 lines

## Dependencies

### Python (for compositing and FaceID)
```
opencv-python>=4.5.0
numpy>=1.20.0
insightface>=0.7.0
```

Optional:
```
pytesseract  # For OCR text verification
```

### Node.js
No new dependencies. Uses existing:
- `@google/genai` - Gemini API
- Standard Node.js modules

## Observability

Structured logs include:
- `[requestId] V2_PIPELINE: Starting for book {bookId}`
- `[requestId] HERO_HEAD: SUCCESS (attempt N, Nms)`
- `[requestId] PAGE_V2_N: Generating scene...`
- `[requestId] PAGE_V2_N: Composite successful (method: seamless_clone)`

Never logged:
- Raw child photo data
- Full prompt text (only hashes)
- Personal information

