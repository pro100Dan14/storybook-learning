# Model Bakeoff Instructions

## Quick Start

1. **Set your Replicate API token:**
   ```bash
   export REPLICATE_API_TOKEN=your_token_here
   ```

2. **Run bakeoff with a test photo:**
   ```bash
   node server/scripts/model-bakeoff.mjs \
     --photo server/fixtures/hero_photo_2.jpg \
     --output /tmp/bakeoff
   ```

3. **Or test a specific model:**
   ```bash
   node server/scripts/model-bakeoff.mjs \
     --photo server/fixtures/hero_photo_2.jpg \
     --output /tmp/bakeoff \
     --model instantid_artistic
   ```

## Available Models

- `instantid_artistic` - grandlineai/instant-id-artistic (recommended)
- `instantid` - zsxkib/instant-id
- `instantid_multicontrolnet` - tgohblio/instant-id-multicontrolnet
- `photomaker_style` - tencentarc/photomaker-style
- `photomaker` - tencentarc/photomaker

## Output

The script generates:
- Images: `{outputDir}/{model}/page_{1-4}.png`
- Report: `{outputDir}/report.json`

## Report Format

```json
{
  "timestamp": "2024-...",
  "photo": "path/to/photo.jpg",
  "scenes": [...],
  "models": {
    "instantid_artistic": {
      "model": "grandlineai/instant-id-artistic",
      "url": "https://...",
      "pages": [
        {
          "page": 1,
          "outputPath": "/tmp/bakeoff/instantid_artistic/page_1.png",
          "similarity": 0.45,
          "similarityAvailable": true,
          "pasteSuspicion": false,
          "params": {...},
          "success": true
        }
      ]
    }
  }
}
```

## Interpreting Results

1. **Similarity Score** (0.0-1.0): Higher = better identity preservation
   - Good: > 0.4
   - Excellent: > 0.5

2. **Paste Suspicion**: Should be `false` for all models
   - If `true`, model may be pasting photo faces

3. **Visual Quality**: Manually inspect images in output directory
   - Check for stylized illustrations (not photorealistic)
   - Check for consistent character appearance
   - Check for no pasted face artifacts

## Selecting the Best Model

After running bakeoff, compare:
- Average similarity scores across all pages
- Visual quality (no pasted faces, stylized output)
- Consistency (character looks same across pages)

**Recommended:** Start with `instantid_artistic` as it's designed for stylized output.

## Enabling the Selected Model

Once you've chosen a model, set the environment variable:

```bash
export ILLUSTRATION_MODEL=instantid_artistic
```

Then restart your server. The system will use the selected model for all new book generations.

## Troubleshooting

**Error: "REPLICATE_API_TOKEN required"**
- Set the environment variable before running

**Error: "Photo not found"**
- Use absolute path or path relative to project root

**Similarity scores are null**
- Install Python dependencies: `pip install opencv-python insightface numpy`
- Ensure `tools/face_id.py` exists and is executable

**Model fails to generate**
- Check Replicate API status
- Verify model slug is correct
- Check API token has sufficient credits

