# Comfy Cloud Setup

## Required Environment Variables

Create `.env` in the project root (or export in the shell):

```env
COMFY_CLOUD_API_KEY=your_comfy_cloud_api_key_here
COMFY_CLOUD_BASE_URL=https://cloud.comfy.org
```

## Optional Variables

```env
# If still using legacy Gemini endpoints (optional)
GEMINI_API_KEY=your_gemini_api_key_here
```

## Notes

- `COMFY_CLOUD_API_KEY` is required on the server. Never expose it to the client.
- The server will refuse to start if the key is missing.
- Prompt strings and photos are not logged.

## Run Local Smoke Test

```bash
cd server
node scripts/run-comfy-cloud.mjs
```


