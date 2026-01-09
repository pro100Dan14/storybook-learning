# Provider Abstraction Layer

This document explains how to switch between different AI providers for text and image generation without modifying endpoint code.

## Overview

The provider abstraction layer allows you to swap AI providers (e.g., Gemini, OpenAI, Dummy) via environment variables. All endpoints (`/api/book`, `/api/image`, `/api/identity`, `/api/hero`) automatically use the selected providers.

## Environment Variables

### Provider Selection

- `PROVIDER_TEXT`: Text generation provider (`gemini` or `dummy`). Default: `gemini`
- `PROVIDER_IMAGE`: Image generation provider (`gemini` or `dummy`). Default: `gemini`

### Gemini-Specific Configuration

- `GEMINI_API_KEY`: Required for Gemini provider
- `GEMINI_TEXT_MODEL`: Text model name (default: `gemini-2.5-flash`)
- `GEMINI_IMAGE_MODEL`: Image model name (default: `gemini-2.5-flash-image`)

## Usage Examples

### Using Gemini (Default)

```bash
# No env vars needed - defaults to gemini
cd server
npm run dev
```

### Using Dummy Providers (Testing)

```bash
# Use dummy providers for deterministic testing
cd server
PROVIDER_TEXT=dummy PROVIDER_IMAGE=dummy npm run dev
```

### Mixed Configuration

```bash
# Use Gemini for images, dummy for text
cd server
PROVIDER_TEXT=dummy PROVIDER_IMAGE=gemini npm run dev
```

## Provider Contract

All providers implement a stable internal contract:

### Text Generation

```javascript
generateText({ prompt, images?, requestId }) -> { text, raw }
```

- `prompt`: String prompt
- `images`: Optional array of `{ base64, mimeType }` objects
- `requestId`: Request ID for logging
- Returns: `{ text: string, raw: any }`

### Image Generation

```javascript
generateImage({ prompt, images?, requestId }) -> { mimeType, dataUrl, raw }
```

- `prompt`: String prompt
- `images`: Optional array of `{ base64, mimeType }` objects
- `requestId`: Request ID for logging
- Returns: `{ mimeType: string, dataUrl: string, raw: any }`
- Throws: `NO_IMAGE_RETURNED` error if no image is returned (with `finishReason` and `safetyRatings` metadata)

## Available Providers

### Gemini Provider (`gemini`)

- **Text**: Uses `@google/genai` SDK with `gemini-2.5-flash` model
- **Image**: Uses `@google/genai` SDK with `gemini-2.5-flash-image` model
- **Requirements**: `GEMINI_API_KEY` environment variable

### Dummy Provider (`dummy`)

- **Text**: Returns deterministic JSON/text based on prompt hash
- **Image**: Returns a minimal 1x1 PNG (valid but minimal)
- **Use Case**: Testing, smoke tests, CI/CD without API costs
- **Requirements**: None

## Implementation Details

### File Structure

```
server/
  providers/
    index.mjs      # Provider factory/registry
    gemini.mjs     # Gemini implementation
    dummy.mjs      # Dummy implementation
  services/
    gen-text.mjs   # Unified text generation service
    gen-image.mjs  # Unified image generation service
```

### Adding a New Provider

1. Create `server/providers/your-provider.mjs`:
   ```javascript
   export class YourTextProvider {
     async generateText({ prompt, images = [], requestId }) {
       // Your implementation
       return { text: "...", raw: {...} };
     }
   }
   
   export class YourImageProvider {
     async generateImage({ prompt, images = [], requestId }) {
       // Your implementation
       return { mimeType: "...", dataUrl: "...", raw: {...} };
     }
   }
   ```

2. Update `server/providers/index.mjs` to register your provider:
   ```javascript
   import { YourTextProvider, YourImageProvider } from "./your-provider.mjs";
   
   if (PROVIDER_TEXT === "your-provider") {
     textProvider = new YourTextProvider();
   }
   ```

3. Update this README with provider-specific configuration.

## Testing

Run provider tests:

```bash
cd server
PROVIDER_TEXT=dummy PROVIDER_IMAGE=dummy npm run test:providers
```

This verifies:
- `/api/identity` returns deterministic dummy output
- `/api/image` returns deterministic dummy output
- `/api/book` completes and generates reports

## Backward Compatibility

- All existing endpoints (`/api/book`, `/api/image`, `/api/identity`, `/api/hero`) work unchanged
- All response formats remain identical
- Retry logic, delays, and logging are preserved
- Existing prompt building logic is unchanged

## Identity Check Skipped (Dev)

When using dummy providers or when identity guard dependencies are unavailable in dev mode, the system will:
- Show "Identity check skipped (dev)" in reports
- Not treat missing identity checks as errors
- Continue book generation successfully

This is intentional for development and testing workflows.

