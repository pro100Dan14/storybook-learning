# BytePlus Seedream Setup

## Required Environment Variables

Create `.env` in the project root:

```env
BYTEPLUS_API_KEY=your_byteplus_api_key_here
BYTEPLUS_BASE_URL=https://ark.ap-southeast.bytepluses.com
BYTEPLUS_MODEL=seedream-4-0-250828
BYTEPLUS_SIZE=1024x1024
PUBLIC_BASE_URL=https://api.projectt988.com
DISABLE_LEGACY_IMAGE=true
```

## Gemini (Required for text + scene descriptions)

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_TEXT_MODEL=gemini-2.5-flash
PROVIDER_TEXT=gemini
```

## Notes

- `PUBLIC_BASE_URL` must be publicly reachable so BytePlus can fetch the input image.
- The server saves the input photo to `/jobs/<jobId>/input.jpg` and exposes it via `/jobs/<jobId>/input.jpg`.


