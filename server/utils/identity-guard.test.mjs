import assert from 'assert';
import { computeFaceIdCrossPageResults } from './identity-guard.mjs';
import { generateJSONReport } from './report-generator.mjs';

function mockSimilarityFnFactory(map) {
  return async (a, b) => {
    const key = `${a}::${b}`;
    if (!(key in map)) {
      return { ok: false, error: 'FACE_ID_PARSE_FAILED' };
    }
    const v = map[key];
    if (v === 'NO_FACE_DETECTED') {
      return { ok: true, similarity: 0, face_detected_candidate: false };
    }
    if (v === 'FACE_ID_PYTHON_FAILED') {
      const err = new Error('FACE_ID_PYTHON_FAILED: mock');
      err.code = 'FACE_ID_PYTHON_FAILED';
      throw err;
    }
    if (v === 'FACE_ID_PARSE_FAILED') {
      throw new Error('FACE_ID_PARSE_FAILED: mock');
    }
    return { ok: true, similarity: v, face_detected_candidate: true };
  };
}

async function testRefBelowThresholdFails() {
  const thresholds = { ref: 0.32, anchor: 0.30, prev: 0.28 };
  const referenceId = 'ref';
  const pageIds = ['p1', 'p2'];

  const sim = mockSimilarityFnFactory({
    'ref::p1': 0.40,
    'ref::p2': 0.20,
    'p1::p2': 0.40
  });

  const res = await computeFaceIdCrossPageResults({ referenceId, pageIds, thresholds, similarityFn: sim });
  assert.strictEqual(res[0].status, 'PASS');
  assert.strictEqual(res[1].status, 'FAIL');
  assert.strictEqual(res[1].failureReason, 'REF_BELOW_THRESHOLD');
}

async function testAnchorBelowThresholdFails() {
  const thresholds = { ref: 0.32, anchor: 0.30, prev: 0.28 };
  const referenceId = 'ref';
  const pageIds = ['p1', 'p2'];

  const sim = mockSimilarityFnFactory({
    'ref::p1': 0.40,
    'ref::p2': 0.40,
    'p1::p2': 0.25 // anchor similarity below 0.30
  });

  const res = await computeFaceIdCrossPageResults({ referenceId, pageIds, thresholds, similarityFn: sim });
  assert.strictEqual(res[1].status, 'FAIL');
  assert.strictEqual(res[1].failureReason, 'ANCHOR_BELOW_THRESHOLD');
}

async function testPrevBelowThresholdFails() {
  const thresholds = { ref: 0.32, anchor: 0.30, prev: 0.28 };
  const referenceId = 'ref';
  const pageIds = ['p1', 'p2', 'p3'];

  const sim = mockSimilarityFnFactory({
    'ref::p1': 0.40,
    'ref::p2': 0.40,
    'ref::p3': 0.40,
    'p1::p2': 0.40,
    'p2::p3': 0.25, // prev similarity below 0.28
    'p1::p3': 0.40
  });

  const res = await computeFaceIdCrossPageResults({ referenceId, pageIds, thresholds, similarityFn: sim });
  assert.strictEqual(res[2].status, 'FAIL');
  assert.strictEqual(res[2].failureReason, 'PREV_BELOW_THRESHOLD');
}

async function testAnchorUpdatesWhenRefImproves() {
  const thresholds = { ref: 0.32, anchor: 0.30, prev: 0.28 };
  const referenceId = 'ref';
  const pageIds = ['p1', 'p2', 'p3'];

  const sim = mockSimilarityFnFactory({
    'ref::p1': 0.33,
    'ref::p2': 0.45, // better ref -> anchor update
    'ref::p3': 0.40,
    'p1::p2': 0.40,
    'p2::p3': 0.40,
    'p1::p3': 0.40
  });

  const res = await computeFaceIdCrossPageResults({ referenceId, pageIds, thresholds, similarityFn: sim });
  assert.strictEqual(res[0].anchorUpdated, false);
  assert.strictEqual(res[1].anchorUpdated, true);
  assert.strictEqual(res[2].anchorUpdated, false);
}

async function testSkippedWhenMissingPageId() {
  const thresholds = { ref: 0.32, anchor: 0.30, prev: 0.28 };
  const referenceId = 'ref';
  const pageIds = [null, 'p2'];
  const sim = mockSimilarityFnFactory({ 'ref::p2': 0.40 });

  const res = await computeFaceIdCrossPageResults({ referenceId, pageIds, thresholds, similarityFn: sim });
  assert.strictEqual(res[0].status, 'SKIPPED');
  assert.strictEqual(res[1].status, 'FAIL'); // page2 has no anchor/prev, so it will FAIL due to anchor/prev missing? Actually i=1 requires anchor/prev
  assert.strictEqual(res[1].failureReason, 'ANCHOR_BELOW_THRESHOLD');
}

async function testReportFieldsPresent() {
  const thresholds = { ref: 0.32, anchor: 0.30, prev: 0.28 };
  const faceId = [
    { refSimilarity: 0.40, anchorSimilarity: null, prevSimilarity: null, anchorUpdated: false, thresholds, status: 'PASS' },
    { refSimilarity: 0.35, anchorSimilarity: 0.33, prevSimilarity: 0.31, anchorUpdated: false, thresholds, status: 'PASS' },
    { refSimilarity: 0.34, anchorSimilarity: 0.32, prevSimilarity: 0.30, anchorUpdated: true, thresholds, status: 'PASS' },
    { refSimilarity: 0.33, anchorSimilarity: 0.31, prevSimilarity: 0.29, anchorUpdated: false, thresholds, status: 'PASS' }
  ];

  const identityResults = faceId.map((f) => ({
    similar: f.status === 'PASS',
    score: f.refSimilarity,
    threshold: thresholds.ref,
    skipped: f.status === 'SKIPPED',
    error: f.failureReason || null,
    faceId: f
  }));

  const pages = [1, 2, 3, 4].map((n) => ({ pageNumber: n, pageText: 'x', dataUrl: 'data:image/png;base64,AA==' }));
  const heroReference = { path: '/tmp/hero.jpg', mimeType: 'image/jpeg' };

  const report = JSON.parse(generateJSONReport({ bookId: 'b', heroReference, pages, identityResults, threshold: 0.32, mode: 'dev' }));
  assert.ok(report.pages[0].faceId);
  assert.strictEqual(typeof report.summary.minRefSimilarity, 'number');
  assert.strictEqual(typeof report.summary.anchorUpdatesCount, 'number');
  assert.ok(report.summary.worstPageByRef);
}

console.log('Running identity-guard cross-page policy tests...');

await testRefBelowThresholdFails();
await testAnchorBelowThresholdFails();
await testPrevBelowThresholdFails();
await testAnchorUpdatesWhenRefImproves();
await testSkippedWhenMissingPageId();
await testReportFieldsPresent();

console.log('✅ All identity-guard cross-page policy tests passed');
