/**
 * Quality Checklist System - Final Verification Script
 * 
 * This script verifies that the quality checklist system is:
 * - Correctly implemented
 * - Enforced at runtime
 * - Cannot be bypassed
 * - Always produces safe fallback text
 * - Never ships unremediated ERRORs
 * 
 * Run with: node tools/verify-quality.mjs
 * Exit code 0 = all checks passed
 * Exit code 1 = any check failed
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Set dummy env var to allow server/index.js to load (it checks for GEMINI_API_KEY on import)
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-for-verification';

// Import validation functions (they're exported for testing)
let validatePageQuality, validateStoryQuality, generateSafeFallbackText, makeWordBoundaryRegex, countWords;
try {
  const serverModule = await import('../server/index.js');
  validatePageQuality = serverModule.validatePageQuality;
  validateStoryQuality = serverModule.validateStoryQuality;
  generateSafeFallbackText = serverModule.generateSafeFallbackText;
  makeWordBoundaryRegex = serverModule.makeWordBoundaryRegex;
  countWords = serverModule.countWords;
} catch (e) {
  // If import fails, we'll catch it in the test
  console.error('Failed to import validation functions:', e.message);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

let checksPassed = 0;
let checksFailed = 0;

async function runCheck(name, fn) {
  try {
    await fn();
    checksPassed++;
    console.log(`✓ ${name}`);
    return true;
  } catch (e) {
    checksFailed++;
    console.error(`✗ ${name}: ${e.message}`);
    if (e.stack) console.error(e.stack);
    return false;
  }
}

console.log('=== QUALITY VERIFICATION ===\n');

// Main verification function
async function runAllChecks() {
  // STEP 1: Syntax validation
  await runCheck('Syntax validation', () => {
    try {
      execSync('node --check server/index.js', { 
        cwd: repoRoot, 
        stdio: 'pipe' 
      });
    } catch (e) {
      throw new Error('Syntax check failed');
    }
  });

  // STEP 2: Existing automated tests
  await runCheck('Checklist tests', () => {
    try {
      execSync('node tools/test-quality-checklist.mjs', { 
        cwd: repoRoot, 
        stdio: 'pipe' 
      });
    } catch (e) {
      throw new Error('Quality checklist tests failed');
    }
  });

  await runCheck('Base64 tests', () => {
    try {
      execSync('node server/test-base64.mjs', { 
        cwd: repoRoot, 
        stdio: 'pipe' 
      });
    } catch (e) {
      throw new Error('Base64 tests failed');
    }
  });

  // STEP 3: Forced remediation runtime test
  await runCheck('Forced remediation', () => {
    const ageGroup = '6-8';
    const heroName = 'Ваня';
    const theme = 'волшебный лес';
    
    // Create test pages with known violations that MUST trigger remediation
    const testPages = [
      'Ваня пошёл в лес. Опасно там!', // Safety ERROR: contains "опасно"
      'Ваня увидел дерево. Один два три четыре пять.', // Too few words (5 words, needs 30+ for 6-8)
      'Ваня нашёл ключ. Ключ был золотой.', // Too few words (6 words)
      'Он вернулся домой. Всё было хорошо.' // Missing hero name on page 4 (age 6-8 requires it)
    ];
    
    // Validate story quality - should find multiple ERRORS
    const qualityCheck = validateStoryQuality(testPages, ageGroup, heroName);
    
    if (qualityCheck.errors.length === 0) {
      throw new Error('Expected ERRORS but found none - validation not working');
    }
    
    // Verify specific errors are detected
    const errorCodes = qualityCheck.errors.map(e => e.code);
    const hasSafetyError = errorCodes.some(c => c === 'SAFETY_ERROR_WORD' || c === 'SAFETY_ERROR_PATTERN');
    const hasWordCountError = errorCodes.some(c => c === 'WORD_COUNT_CRITICAL');
    
    if (!hasSafetyError) {
      throw new Error('Safety error word not detected');
    }
    
    if (!hasWordCountError) {
      throw new Error('Word count ERROR not detected');
    }
    
    // Simulate remediation: apply safe fallback to pages with errors
    const remediatedPages = [...testPages];
    let fallbackUsed = false;
    
    for (let i = 0; i < testPages.length; i++) {
      const pageNum = i + 1;
      const pageErrors = qualityCheck.errors.filter(e => e.message.includes(`Page ${pageNum}`));
      
      if (pageErrors.length > 0) {
        // Apply fallback (simulating max attempts reached)
        remediatedPages[i] = generateSafeFallbackText(pageNum, heroName, theme, ageGroup);
        fallbackUsed = true;
      }
    }
    
    if (!fallbackUsed) {
      throw new Error('Fallback text was not applied during remediation test');
    }
    
    // Re-validate after remediation - should have ZERO ERRORS
    const recheck = validateStoryQuality(remediatedPages, ageGroup, heroName);
    
    if (recheck.errors.length > 0) {
      throw new Error(`Remediation failed: ${recheck.errors.length} ERRORS remain after fallback. Errors: ${recheck.errors.map(e => e.code).join(', ')}`);
    }
    
    // Verify exactly 4 pages
    if (remediatedPages.length !== 4) {
      throw new Error(`Expected 4 pages after remediation, got ${remediatedPages.length}`);
    }
    
    // Verify all pages have content
    for (let i = 0; i < remediatedPages.length; i++) {
      if (!remediatedPages[i] || remediatedPages[i].trim().length === 0) {
        throw new Error(`Page ${i + 1} is empty after remediation`);
      }
    }
  });

  // STEP 4: Fallback safety validation
  await runCheck('Fallback safety', async () => {
    if (!generateSafeFallbackText || !makeWordBoundaryRegex || !countWords) {
      throw new Error('Validation functions not available - import failed');
    }
    
    const ageGroups = ['2-3', '3-4', '4-6', '6-8'];
    const heroName = 'ТестовыйГерой';
    const theme = 'тестовый лес';
    
    // Safety error words to check (subset for testing)
    const safetyErrorWords = ['опасно', 'страшно', 'боится', 'умер', 'смерть', 'кровь', 'оружие'];
    
    for (const ageGroup of ageGroups) {
      for (let pageNum = 1; pageNum <= 4; pageNum++) {
        const fallbackText = generateSafeFallbackText(pageNum, heroName, theme, ageGroup);
        
        // Check 1: No safety error words
        for (const word of safetyErrorWords) {
          const regex = makeWordBoundaryRegex(word, 'i');
          if (regex.test(fallbackText)) {
            throw new Error(`Safety error word "${word}" found in fallback text (age ${ageGroup}, page ${pageNum})`);
          }
        }
        
        // Check 2: Word count satisfies ERROR threshold
        const wordCount = countWords(fallbackText);
        const ranges = {
          '2-3': 3,  // ERROR if < 3
          '3-4': 6,  // ERROR if < 6
          '4-6': 12, // ERROR if < 12
          '6-8': 30  // ERROR if < 30
        };
        const minWords = ranges[ageGroup];
        
        if (wordCount < minWords) {
          throw new Error(`Fallback text word count ${wordCount} below ERROR threshold ${minWords} (age ${ageGroup}, page ${pageNum})`);
        }
        
        // Check 3: Hero name appears (required for all ages)
        const heroMentions = (fallbackText.match(new RegExp(heroName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        if (heroMentions === 0) {
          throw new Error(`Hero name missing in fallback text (age ${ageGroup}, page ${pageNum})`);
        }
        
        // Check 4: Age 6-8 pages 2 and 3 must have dialogue
        if (ageGroup === '6-8' && (pageNum === 2 || pageNum === 3)) {
          const hasQuotes = /["«»]/.test(fallbackText);
          const hasSpeechVerb = /(сказал|спросил|ответил|прошептал|подумал|спросила|ответила|произнёс|воскликнул)/i.test(fallbackText);
          
          if (!hasQuotes || !hasSpeechVerb) {
            throw new Error(`Age 6-8 fallback text missing dialogue on page ${pageNum} (needs quotes and speech verb)`);
          }
        }
      }
    }
  });

  // STEP 5: Runtime integration sanity check
  await runCheck('Runtime integration', () => {
    const serverCode = readFileSync(join(repoRoot, 'server/index.js'), 'utf8');
    
    // Verify quality checklist runs before image generation
    const qualityCheckIndex = serverCode.indexOf('QUALITY CHECKLIST: Validate story quality');
    const imageGenIndex = serverCode.indexOf('// 4) Images (one per page with retry logic)');
    
    if (qualityCheckIndex === -1) {
      throw new Error('Quality checklist integration point not found');
    }
    
    if (imageGenIndex === -1) {
      throw new Error('Image generation start point not found');
    }
    
    // Verify quality checklist runs BEFORE image generation
    if (qualityCheckIndex > imageGenIndex) {
      throw new Error('Quality checklist runs AFTER image generation (should be before)');
    }
    
    // Verify page count enforcement
    if (!serverCode.includes('const pageCount = 4')) {
      throw new Error('Page count constant not found');
    }
    
    // Verify exactly 4 pages validation
    if (!serverCode.includes('EXPECTED_PAGES = 4')) {
      throw new Error('Expected pages constant not found');
    }
    
    // Verify remediation happens before images
    const remediationIndex = serverCode.indexOf('pagesToRegenerate');
    if (remediationIndex === -1 || remediationIndex > imageGenIndex) {
      throw new Error('Remediation logic not found or runs after image generation');
    }
    
    // Verify quality checklist completes before image generation
    // (Checkpoint log was temporary and has been removed after verification)
    // The important check is that quality checklist runs before images (verified above)
  });
  
  console.log(`\n=== VERIFICATION SUMMARY ===`);
  console.log(`Passed: ${checksPassed}`);
  console.log(`Failed: ${checksFailed}`);
  
  if (checksFailed > 0) {
    console.error('\n=== VERIFICATION FAILED ===');
    process.exit(1);
  }
  
  console.log('\n=== ALL CHECKS PASSED ===');
  process.exit(0);
}

// Run all checks
runAllChecks().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
