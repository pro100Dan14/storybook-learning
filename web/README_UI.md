# Book Generator UI

## Overview

The UI provides a clean, user-friendly interface for generating and viewing personalized children's books. It features a default "success" view that hides technical details, with an optional debug mode for developers.

## Features

### Default View (User-Friendly)

- **Clean Book Display**: Pages are shown as beautiful book cards with text and images
- **Success-First**: Books with images are treated as successfully generated, regardless of identity check status
- **Neutral Status**: In development mode, identity check failures are shown as "Identity check skipped (dev)" rather than errors
- **No Scary Errors**: FAIL rows and 0.000 similarity scores are hidden from the default view

### Debug Mode

Toggle "Debug Mode" to see:
- Similarity scores table for all pages
- Raw HTML report in an iframe
- Detailed identity check status
- Link to open report in a new tab

## Usage

### Starting the Application

From the repository root:

```bash
npm run dev
```

This starts:
- Backend API server on http://localhost:8787
- Web UI on http://localhost:5173 (proxies `/api` and `/jobs` to backend)

### Generating a Book

1. Open http://localhost:5173 in your browser
2. Fill in the form:
   - Character name (default: "Герой")
   - Theme (default: "волшебный лес")
   - Number of pages (default: 8)
   - Upload a photo
3. Click "Generate Book"
4. You'll be redirected to the book view page

### Viewing a Book

The book view displays:
- **Status Badge**: Shows generation success/partial/error status
- **Identity Status**: Shows "Identity check skipped (dev)" if checks are unavailable, or identity check results in debug mode
- **Book Pages**: Each page shows:
  - Page number
  - Page text (serif font, book-like styling)
  - Page image (if available)
  - Placeholder message if image is missing

### Debug Mode

Click the "Debug Mode" checkbox to:
- View similarity scores for each page
- See raw HTML report
- Inspect identity check details

## Status Indicators

### Generation Status

- ✅ **SUCCESS**: All pages have images
- ⚠️ **PARTIAL**: Some pages missing images
- ❌ **ERROR**: No pages or generation failed

### Identity Check Status

- **Skipped (dev)**: Identity guard dependencies unavailable or checks skipped in development mode
- **Passed**: All pages passed identity check (shown in debug mode only)
- **Partial**: Some pages failed identity check (shown in debug mode only)

## Architecture

- **Backend** (`server/`): Express API server with `/api/book` endpoint and `/jobs/:bookId/*` static file serving
- **Frontend** (`web/`): React + Vite SPA with:
  - Home page (`/`): Form to generate a book
  - Book view page (`/book/:bookId`): Displays the generated book

## API Endpoints

- `POST /api/book` - Generate a book (requires: name, theme, pages, photoBase64, photoMimeType)
- `GET /jobs/:bookId/report.html` - Serve the HTML report
- `GET /jobs/:bookId/report.json` - Serve the JSON report (includes pageText and dataUrl)
- `GET /jobs/:bookId/hero.jpg` - Serve the hero image

## Development Notes

### Identity Check Behavior

- **Development Mode**: Identity checks may be skipped if TensorFlow dependencies are unavailable. This is shown as "Identity check skipped (dev)" - not an error.
- **Production Mode**: Identity checks are required and will fail if dependencies are missing.

### Report Structure

The `report.json` includes:
- `pages[]`: Array with `pageNumber`, `pageText`, `hasImage`, `dataUrl`, `similarity`, `passed`, `error`
- `summary`: Includes `identityGuardAvailable` flag and page counts
- `mode`: "dev" or "prod"


