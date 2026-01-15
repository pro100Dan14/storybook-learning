# Replicate v3 Pipeline Fixes

## Problem Summary

The Replicate InstantID pipeline was producing inconsistent results:
- Sometimes drawn/stylized faces (correct)
- Sometimes pasted real photo faces (incorrect)
- Mixed styles causing visual inconsistency

## Root Causes

1. **Prompt contradictions**: Old prompts mixed "avoid Pixar" with "3D render" instructions
2. **Parameter instability**: Guidance scale too high, seed strategy non-deterministic
3. **No validation**: Prompts weren't checked for style contradictions
4. **Pipeline mixing**: Potential fallback to photo compositing (v2 behavior)

## Solutions Implemented

### 1. New Prompt Templates (SHORT VERSION)

**Location**: `server/prompts/illustration/`
- `replicate_page_v3.txt` - Short positive prompt (single paragraph, no blocks)
- `replicate_negative_v3.txt` - Short negative prompt (comma-separated)

**Key changes**:
- **SHORT format**: Single paragraph, no complex blocks (prevents model confusion)
- Single coherent style: "Russian folk storybook illustration"
- NO mentions of Pixar/3D/Disney (removed all contradictions)
- Explicit instruction: "DRAWN in the same illustration style (NOT a real photo)"
- Character locks (hair, outfit) consistent across all pages
- Simplified to avoid model misinterpreting long instructions

### 2. Prompt Linter

**Location**: `server/utils/prompt-linter.mjs`

Detects:
- Style contradictions (3D vs 2D, photoreal vs illustration)
- Photo compositing mentions
- Problematic patterns

**Usage**:
```javascript
import { assertPromptValid, lintPrompt } from "../utils/prompt-linter.mjs";

// Throws if invalid
assertPromptValid(prompt);

// Returns validation result
const result = lintPrompt(prompt);
```

### 3. Updated Replicate Parameters

**File**: `server/providers/instantid.mjs`

**Changes**:
- `guidance_scale`: 6.0 (was 6.5) - lower to avoid face distortion
- `num_inference_steps`: 35 (was 28) - more steps for quality
- `identity_strength`: 0.75-0.9 range (was fixed 0.85) - adaptive
- `seed`: Deterministic per page: `base_seed + page_index * 101 + attempt`
- `negative_prompt`: Now passed to Replicate API

**Environment variables**:
```bash
INSTANTID_GUIDANCE_SCALE=5.5-6.0
INSTANTID_NUM_STEPS=35
INSTANTID_INITIAL_STRENGTH=0.6  # CRITICAL: Lower to avoid photo paste
INSTANTID_STYLE_STRENGTH=0.8     # Higher for more stylization
```

### 4. Pipeline Mode Enforcement

**File**: `server/services/illustration_pipeline_v3.mjs`

**Changes**:
- Single pipeline mode: `"replicate_v3"` enforced for entire book
- NO fallback to photo compositing
- NO mixing with v2 pipeline
- All pages use same pipeline

### 5. No Photo Compositing Guarantee

**Verification**:
- v3 pipeline does NOT import `face_composite.mjs`
- Prompts validated to not mention compositing
- Only identity reference sent to Replicate (no additional photo inputs)

## Testing

**Test file**: `server/services/illustration_pipeline_v3.test.mjs`

Run tests:
```bash
node server/services/illustration_pipeline_v3.test.mjs
```

Tests verify:
- ✅ Prompt linting detects contradictions
- ✅ Photo compositing validation works
- ✅ Generated prompts are valid
- ✅ No compositing mentioned in prompts
- ✅ Character locks consistent across pages

## Usage

### Environment Setup

```bash
# Required
REPLICATE_API_TOKEN=r8_your_token
INSTANTID_MODEL=zsxkib/instant-id
ILLUSTRATION_PIPELINE=auto  # or "sdxl_instantid"

# Optional (recommended defaults)
INSTANTID_GUIDANCE_SCALE=6.0
INSTANTID_NUM_STEPS=35
INSTANTID_INITIAL_STRENGTH=0.75
V3_SIMILARITY_THRESHOLD=0.4
V3_MAX_PAGE_RETRIES=2
```

### Code Usage

The pipeline is automatically used when:
- `ILLUSTRATION_PIPELINE=auto` and `REPLICATE_API_TOKEN` is set
- OR `ILLUSTRATION_PIPELINE=sdxl_instantid`

No code changes needed - it's integrated into `/api/book` endpoint.

## Parameter Recommendations

### For Consistent Faces (Without Photo Paste)
- `identity_strength`: 0.6-0.75 (CRITICAL: start at 0.6, max 0.75 to avoid photo paste)
- `guidance_scale`: 5.5-6.0 (lower = more stable faces, higher = more style)
- `num_steps`: 30-40 (more = better quality, slower)
- `style_strength`: 0.8 (higher = more stylized, less photo-like)

### For Style Consistency
- `style_strength`: 0.7-0.8 (if model supports it)
- Use negative prompt (always)
- Ensure prompt has NO style contradictions

## Golden Run Script

To track improvements over time:

```bash
# Generate test book
curl -X POST http://localhost:8787/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestHero",
    "theme": "forest",
    "photoBase64": "...",
    "pages": 4
  }' > golden_run_$(date +%Y%m%d).json

# Compare outputs
# - Check similarity scores
# - Verify no photo paste artifacts
# - Check style consistency
```

## What Changed

### Files Created
- `server/prompts/illustration/replicate_page_v3.txt`
- `server/prompts/illustration/replicate_negative_v3.txt`
- `server/prompts/replicate_v3.mjs`
- `server/utils/prompt-linter.mjs`
- `server/services/illustration_pipeline_v3.test.mjs`
- `server/REPLICATE_V3_FIXES.md` (this file)

### Files Modified
- `server/providers/instantid.mjs` - Updated parameters, added negative prompt
- `server/services/illustration_pipeline_v3.mjs` - New prompts, validation, mode enforcement

### Files NOT Changed (v2 pipeline)
- `server/services/illustration_pipeline_v2.mjs` - Still uses compositing (separate pipeline)
- `server/services/face_composite.mjs` - Only used by v2

## Breaking Changes

**None** - All changes are backward compatible:
- Existing API endpoints unchanged
- Response format unchanged
- v2 pipeline still works (if enabled)
- Fallback to Gemini still works if Replicate unavailable

## Next Steps

1. **Monitor results**: Check generated books for style consistency
2. **Calibrate thresholds**: Adjust `V3_SIMILARITY_THRESHOLD` based on results
3. **Tune parameters**: Fine-tune `identity_strength` and `guidance_scale` per use case
4. **Golden runs**: Establish baseline and track improvements

## Troubleshooting

### Still seeing pasted faces?
- **CRITICAL**: Lower `INSTANTID_INITIAL_STRENGTH` to 0.6 (default is now 0.6)
- Check logs for "Negative prompt enabled" message (should see it)
- Verify `INSTANTID_STYLE_STRENGTH` is set to 0.8 (higher = more stylized)
- Lower `INSTANTID_GUIDANCE_SCALE` to 5.5 if faces still look photo-like
- Check that prompt contains "HAND-DRAWN ILLUSTRATION" instructions
- Verify model supports `negative_prompt` parameter (some models don't)

### Inconsistent styles?
- Verify prompt linting passes (check logs)
- Ensure same `base_seed` used for all pages
- Check that pipeline mode is `replicate_v3` (not mixing with v2)

### Low similarity scores?
- Increase `identity_strength` gradually (max 0.9)
- Check that hero reference photo is clear
- Verify Replicate model supports InstantID properly

