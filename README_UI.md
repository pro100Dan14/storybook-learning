# Book Generator UI

## Quick Start

### Option 1: Run everything from root (recommended)

```bash
# Install dependencies (first time only)
npm install
cd server && npm install
cd ../web && npm install

# Run both server and web UI
npm run dev
```

This starts:
- Backend API server on http://localhost:8787
- Web UI on http://localhost:5173 (proxies /api and /jobs to backend)

### Option 2: Run separately

Terminal 1 (Backend):
```bash
cd server
npm run dev
```

Terminal 2 (Web UI):
```bash
cd web
npm run dev
```

## Usage

1. Open http://localhost:5173 in your browser
2. Fill in the form:
   - Character name (default: "Герой")
   - Theme (default: "волшебный лес")
   - Number of pages (default: 8)
   - Upload a photo
3. Click "Generate Book"
4. You'll be redirected to the book report page where the generated book is displayed in an iframe

## Architecture

- **Backend** (`server/`): Express API server with `/api/book` endpoint and `/jobs/:bookId/*` static file serving
- **Frontend** (`web/`): React + Vite SPA with:
  - Home page (`/`): Form to generate a book
  - Book view page (`/book/:bookId`): Displays the generated report in an iframe

## API Endpoints

- `POST /api/book` - Generate a book (requires: name, theme, pages, photoBase64, photoMimeType)
- `GET /jobs/:bookId/report.html` - Serve the HTML report
- `GET /jobs/:bookId/report.json` - Serve the JSON report
- `GET /jobs/:bookId/hero.jpg` - Serve the hero image
