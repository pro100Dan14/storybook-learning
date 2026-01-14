// Report generator for MVP identity checks
import fs from 'fs';
import path from 'path';

/**
 * Generate JSON report for book identity check
 */
export function generateJSONReport({ bookId, heroReference, pages, identityResults, threshold, mode }) {
  // Compute FaceID summary stats if faceId objects are present
  const hasFaceId = identityResults.some(r => !!r?.faceId);

  let minRefSimilarity = null;
  let minAnchorSimilarity = null;
  let minPrevSimilarity = null;
  let anchorUpdatesCount = 0;
  let worstPageByRef = null;

  let totalIdentityPass = 0;
  let totalIdentityFail = 0;
  let totalIdentitySkipped = 0;

  if (hasFaceId) {
    for (let i = 0; i < identityResults.length; i++) {
      const r = identityResults[i];
      const faceId = r?.faceId;
      if (!faceId) continue;

      if (faceId.status === 'PASS') totalIdentityPass++;
      else if (faceId.status === 'FAIL') totalIdentityFail++;
      else if (faceId.status === 'SKIPPED') totalIdentitySkipped++;

      if (faceId.anchorUpdated) anchorUpdatesCount++;

      const ref = faceId.refSimilarity;
      if (typeof ref === 'number') {
        minRefSimilarity = minRefSimilarity === null ? ref : Math.min(minRefSimilarity, ref);
        if (!worstPageByRef || ref < worstPageByRef.value) {
          worstPageByRef = {
            pageNumber: pages[i]?.pageNumber || (i + 1),
            value: ref
          };
        }
      }

      if (i >= 1 && typeof faceId.anchorSimilarity === 'number') {
        const a = faceId.anchorSimilarity;
        minAnchorSimilarity = minAnchorSimilarity === null ? a : Math.min(minAnchorSimilarity, a);
      }

      if (i >= 1 && typeof faceId.prevSimilarity === 'number') {
        const p = faceId.prevSimilarity;
        minPrevSimilarity = minPrevSimilarity === null ? p : Math.min(minPrevSimilarity, p);
      }
    }
  } else {
    // Backward-compatible counts for legacy identityResults
    totalIdentityPass = identityResults.filter(r => r?.similar).length;
    totalIdentityFail = identityResults.filter(r => r && !r.similar && !r.skipped).length;
    totalIdentitySkipped = identityResults.filter(r => r?.skipped).length;
  }
  
  const report = {
    bookId,
    timestamp: new Date().toISOString(),
    mode,
    threshold,
    hero: {
      path: heroReference?.path || null,
      mimeType: heroReference?.mimeType || null
    },
    pages: pages.map((page, index) => {
      const result = identityResults[index];
      const pageNum = page.pageNumber || index + 1;
      const pageObj = {
        pageNumber: pageNum,
        // Original field
        pageText: page.pageText || null,
        // Lovable compatibility: "text" alias
        text: page.pageText || null,
        hasImage: !!page.dataUrl,
        dataUrl: page.dataUrl || null,
        // Lovable compatibility: "imageUrl" for carousel (relative path to saved file)
        imageUrl: page.dataUrl ? `page_${pageNum}.png` : null,
        similarity: result?.score || null,
        passed: result?.similar || false,
        error: result?.error || null
      };
      
      // Add faceId object if present
      if (result?.faceId) {
        pageObj.faceId = {
          refSimilarity: result.faceId.refSimilarity,
          anchorSimilarity: result.faceId.anchorSimilarity,
          prevSimilarity: result.faceId.prevSimilarity,
          anchorUpdated: result.faceId.anchorUpdated,
          thresholds: result.faceId.thresholds,
          status: result.faceId.status,
          ...(result.faceId.failureReason ? { failureReason: result.faceId.failureReason } : {})
        };
      } else {
        pageObj.faceId = null;
      }
      
      return pageObj;
    }),
    summary: {
      totalPages: pages.length,
      pagesWithImages: pages.filter(p => p.dataUrl).length,
      pagesPassed: identityResults.filter(r => r?.similar).length,
      pagesFailed: identityResults.filter(r => r && !r.similar).length,
      allPassed: identityResults.every(r => !r || r.similar),
      identityGuardAvailable: identityResults.some(r => r && !r.skipped),
      // Add FaceID-specific summary fields
      ...(hasFaceId ? {
        minRefSimilarity,
        minAnchorSimilarity,
        minPrevSimilarity,
        totalIdentityPass,
        totalIdentityFail,
        totalIdentitySkipped,
        anchorUpdatesCount,
        worstPageByRef
      } : {})
    }
  };
  
  return JSON.stringify(report, null, 2);
}

/**
 * Generate HTML report for book identity check
 */
export function generateHTMLReport({ bookId, heroReference, pages, identityResults, threshold, mode }) {
  const passedCount = identityResults.filter(r => r?.similar).length;
  const failedCount = identityResults.filter(r => r && !r.similar).length;
  const totalPages = pages.length;
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Book Identity Report - ${bookId}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header h1 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .metadata {
      color: #666;
      font-size: 14px;
    }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    .summary-table th,
    .summary-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    .summary-table th {
      background: #f8f8f8;
      font-weight: 600;
      color: #333;
    }
    .status-pass {
      color: #22c55e;
      font-weight: 600;
    }
    .status-fail {
      color: #ef4444;
      font-weight: 600;
    }
    .hero-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .hero-section h2 {
      margin-top: 0;
      color: #333;
    }
    .hero-image {
      max-width: 300px;
      border-radius: 8px;
      border: 2px solid #ddd;
    }
    .pages-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .pages-section h2 {
      margin-top: 0;
      color: #333;
    }
    .page-item {
      margin-bottom: 30px;
      padding: 20px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      background: #fafafa;
    }
    .page-item.passed {
      border-color: #22c55e;
      background: #f0fdf4;
    }
    .page-item.failed {
      border-color: #ef4444;
      background: #fef2f2;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .page-title {
      font-weight: 600;
      color: #333;
    }
    .page-image {
      max-width: 100%;
      border-radius: 8px;
      margin-top: 10px;
    }
    .page-text {
      margin-top: 10px;
      color: #666;
      font-size: 14px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Book Identity Report</h1>
    <div class="metadata">
      <strong>Book ID:</strong> ${bookId}<br>
      <strong>Mode:</strong> ${mode}<br>
      <strong>Threshold:</strong> ${threshold}<br>
      <strong>Generated:</strong> ${new Date().toISOString()}
    </div>
  </div>
  
  <div class="summary">
    <h2>Summary</h2>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Page</th>
          <th>Has Image</th>
          <th>Similarity Score</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
`;

  pages.forEach((page, index) => {
    const result = identityResults[index];
    const hasImage = !!page.dataUrl;
    const passed = result?.similar || false;
    const score = result?.score !== undefined ? result.score.toFixed(3) : 'N/A';
    const status = hasImage ? (passed ? 'PASS' : 'FAIL') : 'NO_IMAGE';
    
    html += `        <tr>
          <td>${page.pageNumber || index + 1}</td>
          <td>${hasImage ? 'Yes' : 'No'}</td>
          <td>${score}</td>
          <td class="status-${passed ? 'pass' : 'fail'}">${status}</td>
        </tr>
`;
  });

  html += `      </tbody>
    </table>
    <p style="margin-top: 15px;">
      <strong>Total:</strong> ${totalPages} pages | 
      <strong>Passed:</strong> <span class="status-pass">${passedCount}</span> | 
      <strong>Failed:</strong> <span class="status-fail">${failedCount}</span>
    </p>
  </div>
  
  <div class="hero-section">
    <h2>Hero Reference</h2>
`;

  if (heroReference?.base64) {
    const heroDataUrl = `data:${heroReference.mimeType || 'image/jpeg'};base64,${heroReference.base64}`;
    html += `    <img src="${heroDataUrl}" alt="Hero Reference" class="hero-image" />
    <p><small>Path: ${heroReference.path || 'N/A'}</small></p>
`;
  } else {
    html += `    <p>Hero reference not available</p>
`;
  }

  html += `  </div>
  
  <div class="pages-section">
    <h2>Generated Pages</h2>
`;

  pages.forEach((page, index) => {
    const result = identityResults[index];
    const passed = result?.similar || false;
    const score = result?.score !== undefined ? result.score.toFixed(3) : 'N/A';
    const statusClass = page.dataUrl ? (passed ? 'passed' : 'failed') : '';
    
    html += `    <div class="page-item ${statusClass}">
      <div class="page-header">
        <span class="page-title">Page ${page.pageNumber || index + 1}</span>
        <span class="status-${passed ? 'pass' : 'fail'}">
          ${page.dataUrl ? (passed ? 'PASS' : 'FAIL') : 'NO_IMAGE'} 
          ${result?.score !== undefined ? `(${score})` : ''}
        </span>
      </div>
`;

    if (page.dataUrl) {
      html += `      <img src="${page.dataUrl}" alt="Page ${page.pageNumber || index + 1}" class="page-image" />
`;
    } else {
      html += `      <p>No image generated</p>
`;
    }

    if (page.pageText) {
      html += `      <div class="page-text">${page.pageText}</div>
`;
    }

    html += `    </div>
`;
  });

  html += `  </div>
</body>
</html>`;

  return html;
}

/**
 * Save reports to book directory
 * Also saves page images as separate files (page_1.png, page_2.png, etc.) for Lovable compatibility
 */
export function saveReports({ bookDir, bookId, heroReference, pages, identityResults, threshold, mode }) {
  const jsonReport = generateJSONReport({ bookId, heroReference, pages, identityResults, threshold, mode });
  const htmlReport = generateHTMLReport({ bookId, heroReference, pages, identityResults, threshold, mode });
  
  const jsonPath = path.join(bookDir, 'report.json');
  const htmlPath = path.join(bookDir, 'report.html');
  
  fs.writeFileSync(jsonPath, jsonReport, 'utf8');
  fs.writeFileSync(htmlPath, htmlReport, 'utf8');
  
  // Save page images as separate files for Lovable carousel compatibility
  pages.forEach((page, index) => {
    if (page.dataUrl) {
      const pageNum = page.pageNumber || index + 1;
      const imagePath = path.join(bookDir, `page_${pageNum}.png`);
      
      try {
        // Extract base64 data from dataUrl
        const base64Match = page.dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (base64Match && base64Match[1]) {
          const imageBuffer = Buffer.from(base64Match[1], 'base64');
          fs.writeFileSync(imagePath, imageBuffer);
        }
      } catch (err) {
        console.error(`[report-generator] Failed to save page_${pageNum}.png:`, err.message);
      }
    }
  });
  
  return { jsonPath, htmlPath };
}

