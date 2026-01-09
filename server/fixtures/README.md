# Test Fixtures

This directory contains test assets for the storybook generation system.

## Photo Files

- `hero_photo_2.jpg` - Default test photo for hero reference generation
- Additional test photos can be added here

## Usage

Test scripts support photo selection via:
- Command line: `node test-hero.mjs --photo fixtures/hero_photo_2.jpg`
- Environment variable: `PHOTO=fixtures/hero_photo_2.jpg node test-hero.mjs`
- Default: Uses `fixtures/hero_photo_2.jpg` if neither is specified



