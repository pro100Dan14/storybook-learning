#!/bin/bash
set -e

SERVER_URL="http://localhost:8787"
PHOTO_FILE="/tmp/child_base64.txt"
RESPONSE_FILE="/tmp/book_resp.json"
OUTPUT_HTML="/tmp/book.html"

echo "=== Testing /api/book endpoint ==="

# Check health
echo "1. Checking health endpoint..."
if ! curl -sf "${SERVER_URL}/health" > /dev/null; then
  echo "❌ Server is not running at ${SERVER_URL}"
  exit 1
fi
echo "✅ Server is healthy"

# Check photo file
if [ ! -f "${PHOTO_FILE}" ]; then
  echo "❌ Photo file not found: ${PHOTO_FILE}"
  exit 1
fi
echo "✅ Photo file exists"

# Read photo
PHOTO_BASE64=$(cat "${PHOTO_FILE}")

# Create request body file
REQUEST_BODY=$(mktemp)
echo -n "${PHOTO_BASE64}" | jq -Rs '{pages: 8, photoBase64: ., photoMimeType: "image/jpeg"}' > "${REQUEST_BODY}"

# Generate book
echo "2. Generating 8-page book..."
HTTP_CODE=$(curl -s -o "${RESPONSE_FILE}" -w "%{http_code}" -X POST "${SERVER_URL}/api/book" \
  -H "Content-Type: application/json" \
  -d @"${REQUEST_BODY}")

RESPONSE=$(cat "${RESPONSE_FILE}")

if [ "${HTTP_CODE}" != "200" ]; then
  echo "❌ HTTP ${HTTP_CODE}"
  echo "${RESPONSE}" | jq . 2>/dev/null || echo "${RESPONSE}"
  exit 1
fi

echo "✅ Response saved to ${RESPONSE_FILE}"

# Validate response
PAGES_COUNT=$(echo "${RESPONSE}" | jq '.pages | length' 2>/dev/null || echo "0")

if [ "${PAGES_COUNT}" != "8" ]; then
  echo "❌ Expected 8 pages, got ${PAGES_COUNT}"
  echo "${RESPONSE}" | jq . 2>/dev/null || echo "${RESPONSE}"
  exit 1
fi

echo "✅ Got ${PAGES_COUNT} pages"

# Check each page has dataUrl
MISSING_URLS=0
for i in {0..7}; do
  HAS_URL=$(echo "${RESPONSE}" | jq -r ".pages[${i}].dataUrl // empty" 2>/dev/null || echo "")
  if [ -z "${HAS_URL}" ]; then
    echo "❌ Page $((i+1)) missing dataUrl"
    MISSING_URLS=$((MISSING_URLS + 1))
  fi
done

if [ "${MISSING_URLS}" -gt 0 ]; then
  echo "❌ ${MISSING_URLS} pages missing dataUrl"
  exit 1
fi

echo "✅ All pages have dataUrl"

# Generate HTML
echo "3. Generating HTML..."
cat > "${OUTPUT_HTML}" << 'HTML_HEAD'
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Детская книга</title>
  <style>
    body {
      font-family: Georgia, serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .page {
      background: white;
      margin: 20px 0;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .page-number {
      font-size: 12px;
      color: #999;
      margin-bottom: 10px;
    }
    .page-text {
      font-size: 18px;
      line-height: 1.6;
      margin-bottom: 20px;
      color: #333;
    }
    .page-image {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      display: block;
      margin: 0 auto;
    }
    .error {
      color: red;
      font-style: italic;
    }
  </style>
</head>
<body>
HTML_HEAD

IDENTITY=$(echo "${RESPONSE}" | jq -r '.identity // ""' 2>/dev/null || echo "")
NAME=$(echo "${RESPONSE}" | jq -r '.name // ""' 2>/dev/null || echo "")
THEME=$(echo "${RESPONSE}" | jq -r '.theme // ""' 2>/dev/null || echo "")

echo "<h1>${NAME}</h1>" >> "${OUTPUT_HTML}"
echo "<p><strong>Место:</strong> ${THEME}</p>" >> "${OUTPUT_HTML}"
echo "<details><summary>Канонический образ героя</summary><pre>${IDENTITY}</pre></details>" >> "${OUTPUT_HTML}"

for i in {0..7}; do
  PAGE_NUM=$((i+1))
  PAGE_TEXT=$(echo "${RESPONSE}" | jq -r ".pages[${i}].pageText // \"\"" 2>/dev/null || echo "")
  DATA_URL=$(echo "${RESPONSE}" | jq -r ".pages[${i}].dataUrl // \"\"" 2>/dev/null || echo "")
  ERROR=$(echo "${RESPONSE}" | jq -r ".pages[${i}].error // \"\"" 2>/dev/null || echo "")
  
  echo "<div class=\"page\">" >> "${OUTPUT_HTML}"
  echo "<div class=\"page-number\">Страница ${PAGE_NUM}</div>" >> "${OUTPUT_HTML}"
  echo "<div class=\"page-text\">${PAGE_TEXT}</div>" >> "${OUTPUT_HTML}"
  
  if [ -n "${ERROR}" ]; then
    echo "<div class=\"error\">Ошибка: ${ERROR}</div>" >> "${OUTPUT_HTML}"
  elif [ -n "${DATA_URL}" ]; then
    echo "<img src=\"${DATA_URL}\" alt=\"Страница ${PAGE_NUM}\" class=\"page-image\" />" >> "${OUTPUT_HTML}"
  fi
  
  echo "</div>" >> "${OUTPUT_HTML}"
done

echo "</body></html>" >> "${OUTPUT_HTML}"

echo "✅ HTML generated: ${OUTPUT_HTML}"
echo ""
echo "=== Test completed successfully ==="
echo "Response: ${RESPONSE_FILE}"
echo "HTML: ${OUTPUT_HTML}"

