# External UI Integration Guide

This document explains how to connect an external UI (e.g., Lovable) to the backend API.

## Overview

The backend is **UI-agnostic**: any frontend can consume the API. Lovable UI is a consumer, not an owner of this backend. API contracts are stable and must not change without coordination.

## Backend Exposure

The backend must be exposed via an **HTTPS tunnel** for external UI access:

- **Development**: Use tools like `ngrok`, `cloudflare tunnel`, or similar
- **Production**: Deploy to a cloud service with HTTPS support

Example with ngrok:
```bash
# Start backend
cd server
npm run dev

# In another terminal, expose via HTTPS
ngrok http 8787
# Use the HTTPS URL (e.g., https://abc123.ngrok.io) as API_BASE_URL
```

## UI Configuration

The external UI should set the `API_BASE_URL` environment variable to the backend URL:

```bash
# In UI environment
API_BASE_URL=https://your-backend-url.com
```

## API Endpoints

All endpoints support `GET`, `POST`, and `OPTIONS` methods with `Content-Type` headers.

### Health Check
```
GET /health
Response: { ok: true }
```
Used by UI to verify backend connectivity.

### Backend Configuration
```
GET /api/config
Response: {
  backendVersion: "1.0.0",
  environment: "development" | "production",
  pageCount: 4,
  imageStyle: "russian-folktale"
}
```
Used by UI for connection diagnostics. Returns no secrets.

### Image Generation (BytePlus Seedream)
```
POST /api/generate-images
Content-Type: multipart/form-data
Fields:
  - photo: file (jpeg/png/webp)
  - scenes: JSON array or string
  - bookId (optional)
  - seedBase (optional)
Response: {
  ok: true,
  jobId: string,
  anchorImage: { url, filename },
  sceneImages: [{ url, filename }, ...],
  metadata: { workflowVersionHash, model, size }
}
```
Generates 1 anchor face image + N scene images using BytePlus Seedream model.

### Storybook Generation (Legacy)
```
POST /api/book
```
Legacy endpoint for full book generation (may require Gemini keys).

### Book Reports
```
GET /jobs/:bookId/report.json
GET /jobs/:bookId/report.html
```
Get generation reports for a completed book.

## CORS Configuration

The backend allows requests from:
- `https://*.lovable.app` (Lovable preview domains)
- `http://localhost:*` and `https://localhost:*` (local development)
- `http://127.0.0.1:*` and `https://127.0.0.1:*` (local development)

All other origins are rejected.

## Quality & Safety

- All stories are exactly 4 pages (canonical structure enforced)
- Age-based quality validation with automatic remediation
- Safe fallback text if generation fails quality checks
- No unremediated ERROR-level violations can ship

## Testing Connectivity

From the UI, test backend connectivity:

```bash
# Health check
curl https://your-backend-url.com/health
# Expected: { "ok": true }

# Config check
curl https://your-backend-url.com/api/config
# Expected: { "backendVersion": "1.0.0", "environment": "...", "pageCount": 4, "imageStyle": "russian-folktale" }
```

## Notes

- Backend runs on port `8787` by default
- All API contracts are stable and documented
- No breaking changes to API endpoints without coordination
- Backend is stateless (except for job storage in `server/jobs/`)




