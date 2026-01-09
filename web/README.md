# Web UI

Minimal React + Vite frontend for the Book Generator.

## Development

1. Install dependencies:
   ```bash
   cd web
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

The UI will be available at http://localhost:5173

## Running with Backend

From the repo root, run both server and web concurrently:

```bash
npm run dev
```

This will start:
- Backend server on http://localhost:8787
- Web UI on http://localhost:5173 (proxies /api and /jobs to backend)


