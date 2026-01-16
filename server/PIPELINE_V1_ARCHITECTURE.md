# Current Pipeline v1 Architecture (Baseline Audit)

## Overview

This document describes the current illustration pipeline for children's storybook generation.

## Flow

```
┌─────────────────┐
│  Child Photo    │
│  (upload)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│  Identity       │      │  Hero Reference │
│  Extraction     │      │  Generation     │
│  (text model)   │      │  (image model)  │
└────────┬────────┘      └────────┬────────┘
         │                        │
         │                        ▼
         │               ┌─────────────────┐
         │               │  hero.jpg       │
         │               │  (face asset)   │
         │               └────────┬────────┘
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────┐
│  Page Generation (per page)              │
│  - prompt + hero.jpg as reference        │
│  - Request Gemini to "copy exact face"   │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  InsightFace Identity Check             │
│  (post-generation, detection only)       │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  Response: 4 page images + metadata      │
└─────────────────────────────────────────┘
```

## Key Components

### 1. Photo Upload/Storage
- **Entry**: `POST /api/book` in `server/index.js`
- **Format**: multipart/form-data or JSON base64
- **Storage**: `server/jobs/<bookId>/hero.jpg`
- **Module**: `server/utils/hero-reference.mjs`

### 2. Hero Reference Generation
- **Prompt**: `server/prompts/storytelling.mjs::buildHeroReferencePrompt()`
- **Service**: `server/services/hero-generation.mjs`
- **Model**: `gemini-2.5-flash-image`
- **Style**: "Pixar/DreamWorks quality, modern 3D cartoon"

### 3. Page Generation
- **Prompt**: `server/prompts/storytelling.mjs::buildImagePromptWithIdentity()`
- **Called from**: `server/index.js` book endpoint loop
- **Input images**: hero.jpg as reference

### 4. InsightFace Identity Checks
- **Python**: `tools/face_id.py` (InsightFace cosine similarity)
- **Node wrapper**: `server/utils/face-id/index.mjs`
- **Policy**: `server/utils/identity-guard.mjs::checkIdentityForPages()`
- **Thresholds**:
  - `FACE_ID_REF_THRESHOLD`: 0.32
  - `FACE_ID_ANCHOR_THRESHOLD`: 0.30
  - `FACE_ID_PREV_THRESHOLD`: 0.28

## Gemini API Structure

```javascript
const parts = [
  { text: prompt },
  { inlineData: { mimeType, data: base64 } }
];
const contents = [{ role: "user", parts }];

await ai.models.generateContent({
  model: "gemini-2.5-flash-image",
  contents,
  config: { responseModalities: ["IMAGE"] }
});
```

## IDENTIFIED PROBLEMS

### 1. Prompt-Only Identity Does Not Work
Gemini does NOT do pixel-perfect copying. The instruction "copy exact face from hero.jpg" is interpreted as a suggestion, not a literal command. Each generation produces a different face interpretation.

### 2. Style Conflict in Page Prompts
Current page prompt has contradictions:
- **Layer 1 (face)**: "modern 3D cartoon (Pixar/DreamWorks quality)"
- **Layer 2 (scene)**: "Russian folk fairy tale (Bilibin, Vasnetsov)"
- **Negative**: "AVOID Pixar/DreamWorks" ← directly contradicts face requirement!

### 3. InsightFace Only Detects Problems
The FaceID checker runs AFTER generation and only reports similarity scores. It does not enforce identity or trigger regeneration with compositing.

### 4. Low Thresholds
Current thresholds (0.32/0.30/0.28) are very low because we accept that faces won't match well. With proper compositing, we should expect 0.45+ similarity.

## SOLUTION: Pipeline v2

1. **Fix Style Conflict**: Unified 3D animated style for entire page, Russian folk as CONTENT (costumes, architecture, settings)

2. **Character Assets**: Generate once per book:
   - `hero_head.png`: Close-up face+hair, transparent background
   - `hero_fullbody_ref.jpg`: Full body with locked outfit

3. **Deterministic Compositing**: After generating scene:
   - Detect face landmarks in generated page
   - Detect face landmarks in hero_head
   - Compute affine transform
   - Warp and blend hero_head onto page

4. **Validation Loop**: After compositing, verify similarity >= 0.45, retry if needed

## Files to Modify/Create (Pipeline v2)

### New Files
- `server/services/illustration_pipeline_v2.mjs` - Main v2 pipeline
- `server/services/character_assets.mjs` - Asset generation
- `server/services/face_composite.mjs` - Face compositing logic
- `server/services/scene_brief.mjs` - Scene description builder
- `server/prompts/storytelling_v2.mjs` - Fixed prompts without style conflict
- `server/scripts/golden_illustrations.mjs` - Test script

### Modified Files
- `server/index.js` - Add feature flag routing to v2
- `server/utils/identity-guard.mjs` - Higher thresholds for v2

### Feature Flags
- `ILLUSTRATION_V2_ENABLED=false`
- `CHARACTER_ASSETS_ENABLED=false`
- `SEND_ORIGINAL_PHOTO_TO_PAGE=false`




