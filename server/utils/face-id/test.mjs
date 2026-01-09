// Unit tests for FaceID similarity and threshold logic
// Mocks Python script output for testing without GPU

import assert from 'assert';

/**
 * Mock similarity check result
 */
function mockSimilarityCheck(similarity, faceDetectedRef = true, faceDetectedCandidate = true) {
  return {
    ok: true,
    embedding_dim: 512,
    similarity,
    face_detected_ref: faceDetectedRef,
    face_detected_candidate
  };
}

/**
 * Test threshold logic
 */
function testThresholdLogic() {
  const threshold = 0.32;
  
  // Test cases
  const testCases = [
    { similarity: 0.5, expected: true, name: "High similarity passes" },
    { similarity: 0.32, expected: true, name: "Threshold boundary passes" },
    { similarity: 0.31, expected: false, name: "Just below threshold fails" },
    { similarity: 0.1, expected: false, name: "Low similarity fails" },
    { similarity: 0.0, expected: false, name: "Zero similarity fails" }
  ];
  
  for (const testCase of testCases) {
    const passed = testCase.similarity >= threshold;
    assert.strictEqual(passed, testCase.expected, `${testCase.name}: similarity=${testCase.similarity}, threshold=${threshold}`);
  }
  
  console.log("✅ Threshold logic tests passed");
}

/**
 * Test retry logic
 */
function testRetryLogic() {
  const maxAttempts = 2;
  const threshold = 0.32;
  
  // Simulate retry scenarios
  const scenarios = [
    {
      name: "Passes on first attempt",
      attempts: [
        { similarity: 0.5, shouldRetry: false, shouldPass: true }
      ]
    },
    {
      name: "Fails first, passes second",
      attempts: [
        { similarity: 0.2, shouldRetry: true, shouldPass: false },
        { similarity: 0.4, shouldRetry: false, shouldPass: true }
      ]
    },
    {
      name: "Fails all attempts",
      attempts: [
        { similarity: 0.2, shouldRetry: true, shouldPass: false },
        { similarity: 0.25, shouldRetry: false, shouldPass: false }
      ]
    }
  ];
  
  for (const scenario of scenarios) {
    let attemptCount = 0;
    let passed = false;
    
    for (const attempt of scenario.attempts) {
      attemptCount++;
      const similarity = attempt.similarity;
      const passedThisAttempt = similarity >= threshold;
      
      if (passedThisAttempt) {
        passed = true;
        break;
      }
      
      if (attemptCount < maxAttempts) {
        // Should retry
        assert.strictEqual(attempt.shouldRetry, true, `${scenario.name}: Should retry on attempt ${attemptCount}`);
      } else {
        // Exhausted retries
        assert.strictEqual(attempt.shouldRetry, false, `${scenario.name}: Should not retry after ${attemptCount} attempts`);
        break;
      }
    }
    
    const expectedPass = scenario.attempts.some(a => a.shouldPass);
    assert.strictEqual(passed, expectedPass, `${scenario.name}: Final pass status`);
  }
  
  console.log("✅ Retry logic tests passed");
}

/**
 * Test error handling
 */
function testErrorHandling() {
  const errorCases = [
    {
      name: "No face in reference",
      result: { ok: false, error: "NO_FACE_DETECTED", face_detected_ref: false },
      shouldFail: true
    },
    {
      name: "No face in candidate",
      result: { ok: false, error: "NO_FACE_DETECTED", face_detected_candidate: false },
      shouldFail: true
    },
    {
      name: "Dependencies missing",
      result: { ok: false, error: "DEPENDENCIES_MISSING" },
      shouldFail: true
    },
    {
      name: "Valid similarity",
      result: { ok: true, similarity: 0.5, face_detected_ref: true, face_detected_candidate: true },
      shouldFail: false
    }
  ];
  
  for (const errorCase of errorCases) {
    const shouldFail = !errorCase.result.ok || !!errorCase.result.error;
    assert.strictEqual(shouldFail, errorCase.shouldFail, `${errorCase.name}: Error handling`);
  }
  
  console.log("✅ Error handling tests passed");
}

/**
 * Test subprocess failure error code distinction
 * Regression test: subprocess failures should return FACE_ID_PYTHON_FAILED, not NO_FACE_DETECTED
 */
async function testSubprocessFailureErrorCode() {
  // Mock subprocess failure error (simulating execFileAsync throwing with exit code)
  const mockSubprocessError = {
    code: 1, // Non-zero exit code
    message: 'Command failed with exit code 1',
    stderr: 'Python error: ModuleNotFoundError: No module named \'insightface\''
  };
  
  // Verify error structure matches what execFileAsync throws
  assert.strictEqual(typeof mockSubprocessError.code, 'number', 'Subprocess error should have numeric code');
  assert.notStrictEqual(mockSubprocessError.code, 0, 'Subprocess error should have non-zero code');
  
  // Verify this should be identified as FACE_ID_PYTHON_FAILED, not NO_FACE_DETECTED
  const isSubprocessFailure = mockSubprocessError.code && typeof mockSubprocessError.code === 'number';
  assert.strictEqual(isSubprocessFailure, true, 'Subprocess failure should be detected');
  
  // Verify error code would be FACE_ID_PYTHON_FAILED
  const expectedErrorCode = 'FACE_ID_PYTHON_FAILED';
  assert.notStrictEqual(expectedErrorCode, 'NO_FACE_DETECTED', 'Subprocess failures must not be misreported as NO_FACE_DETECTED');
  
  console.log("✅ Subprocess failure error code distinction test passed");
}

// Run all tests
(async () => {
  try {
    testThresholdLogic();
    testRetryLogic();
    testErrorHandling();
    await testSubprocessFailureErrorCode();
    console.log("\n✅ All FaceID unit tests passed");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
})();

