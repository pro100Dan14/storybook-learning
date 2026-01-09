# FaceID Evaluation Fixtures

This directory contains test images for FaceID evaluation. **These files are local only and should NOT be committed to the repository.**

## Directory Structure

```
faceid_fixtures/
├── good/          # Images that SHOULD pass similarity check (same person as reference)
└── bad/           # Images that SHOULD fail similarity check (different person or no face)
```

## Naming Rules

- Files must have extensions: `.jpg`, `.jpeg`, `.png`, or `.webp`
- Use descriptive names: `child-1-front.jpg`, `child-1-side.jpg`, `different-person.jpg`
- Avoid spaces in filenames (use hyphens or underscores)

## Minimum Set

For basic evaluation, include at least:

### `good/` folder (2-3 images recommended):
- `same-person-front.jpg` - Same person, front-facing, clear face
- `same-person-side.jpg` - Same person, side angle (if available)
- `same-person-smile.jpg` - Same person, different expression

### `bad/` folder (2-3 images recommended):
- `different-person.jpg` - Different person, clear face
- `no-face.jpg` - Image with no detectable face (landscape, object, etc.)
- `low-quality.jpg` - Blurry or low-resolution image (if available)

## Usage

1. Place your reference image somewhere accessible (e.g., `tools/faceid_fixtures/reference.jpg`)
2. Place test images in `good/` and `bad/` folders
3. Run evaluation:
   ```bash
   node tools/faceid-eval.mjs --ref tools/faceid_fixtures/reference.jpg
   ```

## Privacy Note

**DO NOT commit real photos of children or any personal images to the repository.** These fixtures are for local testing only. Use test images or synthetic data.




