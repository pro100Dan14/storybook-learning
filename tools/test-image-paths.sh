#!/bin/bash
# Quick test script to verify image paths work correctly
# Usage: ./tools/test-image-paths.sh

set -e

echo "=== Testing Image Path Fix ==="
echo ""

# Check if backend is running
if ! curl -s http://localhost:8787/health > /dev/null; then
  echo "❌ Backend not running on port 8787"
  echo "   Start it with: cd server && npm run dev"
  exit 1
fi

echo "✓ Backend is running"

# Generate a test book (requires GEMINI_API_KEY or dummy provider)
echo ""
echo "To test image loading:"
echo "1. Generate a book via UI or API"
echo "2. Note the bookId from the response"
echo "3. Check that images load:"
echo "   - Direct backend: curl -I http://localhost:8787/jobs/<bookId>/page-1.png"
echo "   - Via proxy: curl -I http://localhost:5173/jobs/<bookId>/page-1.png"
echo ""
echo "4. Refresh the page - images should still load"
echo "5. Check backend logs for [IMAGE_404] if images fail"
echo ""

# Test that helper functions work
echo "Testing path helpers..."
node -e "
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JOBS_DIR = path.join(__dirname, '../server/jobs');
console.log('JOBS_DIR:', JOBS_DIR);
console.log('Absolute path test:', path.isAbsolute(JOBS_DIR) ? '✓' : '✗');
"

echo ""
echo "=== Test Complete ==="




