import fs from "fs";
import { readPhotoBase64, getPhotoMimeType, getPhotoSourceInfo } from "./utils/photo-reader.mjs";
import { processTypographyHTML } from "./utils/typography.mjs";

const SERVER_URL = "http://localhost:8787";
const RESPONSE_FILE = "/tmp/book_resp.json";
const OUTPUT_HTML = "/tmp/book.html";

console.log("=== Testing /api/book endpoint ===");
console.log(`Photo source: ${getPhotoSourceInfo()}`);

// Check health
console.log("1. Checking health endpoint...");
try {
  const healthRes = await fetch(`${SERVER_URL}/health`);
  if (!healthRes.ok) {
    console.error("❌ Server health check failed");
    process.exit(1);
  }
  console.log("✅ Server is healthy");
} catch (e) {
  console.error("❌ Server is not running at", SERVER_URL);
  console.error("   Start server with: cd server && npm run dev");
  process.exit(1);
}

// Read photo
let photoBase64;
let photoMimeType;
try {
  photoBase64 = readPhotoBase64();
  photoMimeType = getPhotoMimeType();
  console.log("✅ Photo file loaded");
} catch (e) {
  console.error(`❌ Failed to load photo: ${e.message}`);
  process.exit(1);
}

// Generate book
console.log("2. Generating 4-page book...");
const requestBody = {
  pages: 4,
  photoBase64: photoBase64,
  photoMimeType: photoMimeType,
};

let response;
try {
  const res = await fetch(`${SERVER_URL}/api/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ HTTP ${res.status}`);
    try {
      const errorJson = JSON.parse(errorText);
      console.error(JSON.stringify(errorJson, null, 2));
    } catch {
      console.error(errorText);
    }
    process.exit(1);
  }

  response = await res.json();
  fs.writeFileSync(RESPONSE_FILE, JSON.stringify(response, null, 2));
  console.log(`✅ Response saved to ${RESPONSE_FILE}`);
} catch (e) {
  console.error("❌ Request failed:", e.message);
  process.exit(1);
}

// Validate response structure
if (!response.ok) {
  console.error("❌ Response ok is not true");
  process.exit(1);
}
console.log("✅ Response ok is true");

if (!response.identity || typeof response.identity !== "object") {
  console.error("❌ Response missing 'identity' object");
  process.exit(1);
}
console.log("✅ Response has 'identity' object");

if (!response.identity_text || typeof response.identity_text !== "string") {
  console.error("❌ Response missing 'identity_text' string");
  process.exit(1);
}
console.log("✅ Response has 'identity_text' string");

if (!response.requestId || typeof response.requestId !== "string") {
  console.error("❌ Response missing 'requestId'");
  process.exit(1);
}
console.log("✅ Response has 'requestId':", response.requestId);

// Validate hero_reference (Step 2)
if (!response.hero_reference || typeof response.hero_reference !== "object") {
  console.error("❌ Response missing 'hero_reference' object");
  process.exit(1);
}
console.log("✅ Response has 'hero_reference' object");

if (!response.hero_reference.dataUrl || typeof response.hero_reference.dataUrl !== "string") {
  console.error("❌ Response missing 'hero_reference.dataUrl'");
  process.exit(1);
}
console.log("✅ Response has 'hero_reference.dataUrl'");

if (!response.hero_reference.dataUrl.startsWith("data:image/")) {
  console.error("❌ Hero reference dataUrl is not a valid data URL");
  process.exit(1);
}
console.log("✅ Hero reference dataUrl is valid");

// Validate response
const pagesCount = response.pages?.length || 0;
if (pagesCount !== 4) {
  console.error(`❌ Expected 4 pages, got ${pagesCount}`);
  process.exit(1);
}
console.log(`✅ Got ${pagesCount} pages`);

// Validate every page has pageText
for (let i = 0; i < pagesCount; i++) {
  if (!response.pages[i].pageText || typeof response.pages[i].pageText !== "string") {
    console.error(`❌ Page ${i + 1} missing pageText`);
    process.exit(1);
  }
}
console.log("✅ All pages have pageText");

// Validate images (can be null, but if exists must be data URL)
for (let i = 0; i < pagesCount; i++) {
  const page = response.pages[i];
  if (page.dataUrl) {
    if (typeof page.dataUrl !== "string" || !page.dataUrl.startsWith("data:image/")) {
      console.error(`❌ Page ${i + 1} dataUrl is not a valid data URL`);
      process.exit(1);
    }
  }
}
console.log("✅ All page images (if present) are valid data URLs");

// Check images
const pagesWithImages = response.pages.filter((p) => p.dataUrl).length;
const pagesWithoutImages = response.pages.filter((p) => !p.dataUrl).length;

console.log(`📊 Pages with images: ${pagesWithImages} of ${pagesCount}`);
if (pagesWithoutImages > 0) {
  console.log(`⚠️  Pages without images: ${pagesWithoutImages}`);
  response.pages.forEach((p) => {
    if (!p.dataUrl) {
      console.log(`   Page ${p.pageNumber}: ${p.error || "NO_IMAGE_RETURNED"}`);
    }
  });
}

// Generate HTML with book-style layout
console.log("3. Generating HTML...");
const identity = typeof response.identity === "object" ? JSON.stringify(response.identity, null, 2) : response.identity || "";
const name = response.name || "Детская книга";
const theme = response.theme || "";
const heroRef = response.hero_reference;

let html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: Georgia, "Times New Roman", serif;
      background: #e5e5e5;
      margin: 0;
      padding: 20px;
      line-height: 1.8;
      color: #1a1a1a;
    }
    
    .book-container {
      max-width: 210mm;
      margin: 0 auto;
      background: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .header {
      background: #f8f8f8;
      padding: 30px 40px;
      border-bottom: 2px solid #ddd;
    }
    
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: normal;
      color: #2c2c2c;
    }
    
    .header p {
      margin: 5px 0;
      color: #666;
      font-size: 14px;
    }
    
    .hero-reference {
      background: #f0f8f0;
      padding: 25px;
      text-align: center;
      border-bottom: 2px solid #ddd;
    }
    
    .hero-reference h2 {
      margin: 0 0 15px 0;
      font-size: 16px;
      color: #2d5016;
      font-weight: normal;
    }
    
    .hero-reference img {
      max-width: 250px;
      height: auto;
      border: 1px solid #4a7c59;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    .hero-reference p {
      margin: 10px 0 0 0;
      font-size: 12px;
      color: #555;
    }
    
    section.page {
      page-break-after: always;
      min-height: 297mm;
      padding: 35mm 30mm;
      background: white;
      position: relative;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      margin-bottom: 20px;
    }
    
    section.page:last-child {
      page-break-after: auto;
    }
    
    div.page-inner {
      max-width: 100%;
      height: 100%;
    }
    
    .page-title {
      font-size: 20px;
      font-weight: normal;
      margin: 0 0 25px 0;
      color: #2c2c2c;
      line-height: 1.4;
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
    }
    
    .page-content {
      font-size: 16px;
      line-height: 1.9;
      margin: 0 0 25px 0;
      text-align: justify;
      color: #1a1a1a;
    }
    
    .page-content p {
      margin: 0 0 18px 0;
      text-indent: 1.5em;
    }
    
    .page-content p:first-child {
      text-indent: 0;
    }
    
    .page-image {
      max-width: 100%;
      height: auto;
      margin: 25px 0;
      display: block;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border: 1px solid #ddd;
    }
    
    .page-footer {
      position: absolute;
      bottom: 25mm;
      left: 30mm;
      right: 30mm;
      text-align: center;
      font-size: 12px;
      color: #888;
      border-top: 1px solid #eee;
      padding-top: 10px;
    }
    
    .error {
      color: #c62828;
      font-style: italic;
      padding: 15px;
      background: #ffebee;
      border-left: 4px solid #c62828;
      margin: 20px 0;
    }
    
    details {
      margin-top: 15px;
    }
    
    details summary {
      cursor: pointer;
      color: #555;
      font-size: 13px;
    }
    
    pre {
      white-space: pre-wrap;
      font-size: 12px;
      background: #f5f5f5;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
      }
      
      .book-container {
        box-shadow: none;
        max-width: 100%;
      }
      
      section.page {
        margin-bottom: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="book-container">
    <div class="header">
      <h1>${processTypographyHTML(name)}</h1>
      ${theme ? `<p><strong>Место:</strong> ${processTypographyHTML(theme)}</p>` : ""}
      <details>
        <summary>Канонический образ героя</summary>
        <pre>${identity}</pre>
      </details>
    </div>
    ${heroRef ? `
    <div class="hero-reference">
      <h2>Главный образ героя</h2>
      <img src="${heroRef.dataUrl}" alt="Hero Reference" />
      <p><small>Этот образ используется как эталон для всех страниц</small></p>
    </div>
    ` : ""}
`;

response.pages.forEach((page, index) => {
  const pageText = page.pageText || "";
  const processedText = processTypographyHTML(pageText);
  
  // Split text into title and content (if structured)
  const lines = processedText.split("\n").filter(l => l.trim());
  const title = lines[0] || "";
  const content = lines.slice(1).join("\n\n") || processedText;
  
  html += `    <section class="page">
      <div class="page-inner">
        ${title ? `<h2 class="page-title">${title}</h2>` : ""}
        <div class="page-content">
          ${content.split("\n\n").map(p => `<p>${p.replace(/\n/g, " ")}</p>`).join("")}
        </div>
`;

  if (page.error) {
    html += `        <div class="error">⚠️ Ошибка генерации изображения: ${page.error}</div>\n`;
  } else if (page.dataUrl) {
    html += `        <img src="${page.dataUrl}" alt="Страница ${page.pageNumber}" class="page-image" />\n`;
  }

  html += `        <div class="page-footer">
          Страница ${page.pageNumber}
        </div>
      </div>
    </section>
`;
});

html += `  </div>
</body>
</html>`;

fs.writeFileSync(OUTPUT_HTML, html);
console.log(`✅ HTML generated: ${OUTPUT_HTML}`);

// Also write Step 2 HTML
const OUTPUT_HTML_STEP2 = "/tmp/book_step2.html";
fs.writeFileSync(OUTPUT_HTML_STEP2, html);
console.log(`✅ Step 2 HTML generated: ${OUTPUT_HTML_STEP2}`);

console.log("");
console.log("=== Test completed ===");
console.log(`Photo used: ${getPhotoSourceInfo()}`);
console.log(`Success: ${pagesWithImages}/${pagesCount} images`);
console.log(`Response: ${RESPONSE_FILE}`);
console.log(`HTML: ${OUTPUT_HTML}`);
