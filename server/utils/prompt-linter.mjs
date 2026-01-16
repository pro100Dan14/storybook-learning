/**
 * Prompt Linter
 * 
 * Detects style contradictions and problematic patterns in prompts
 * to prevent silent prompt drift and ensure consistent generation.
 */

const STYLE_CONTRADICTIONS = [
  {
    name: "3D_vs_2D",
    patterns: [
      { positive: /\b(3D|Pixar|Disney|DreamWorks|CGI|render|3-dimensional)\b/i },
      { negative: /\b(2D|gouache|watercolor|ink|flat|illustration|painting|drawing)\b/i }
    ],
    severity: "error"
  },
  {
    name: "photoreal_vs_illustration",
    patterns: [
      { positive: /\b(photoreal|realistic|DSLR|camera|photo|photograph|real skin)\b/i },
      { negative: /\b(illustration|storybook|drawing|painting|stylized|artistic)\b/i }
    ],
    severity: "error"
  },
  {
    name: "anime_vs_traditional",
    patterns: [
      { positive: /\b(anime|manga|kawaii|chibi|japanese animation)\b/i },
      { negative: /\b(Russian folk|traditional|classical|European|storybook)\b/i }
    ],
    severity: "warning"
  },
  {
    name: "avoid_contradiction",
    patterns: [
      { positive: /\b(avoid|not|no|never|forbid|prohibit)\s+(Pixar|3D|photoreal|anime)\b/i },
      { negative: /\b(Pixar|3D|photoreal|anime)\b/i }
    ],
    severity: "warning",
    message: "Avoid mentioning styles you don't want - it can confuse the model"
  }
];

const PROBLEMATIC_PATTERNS = [
  {
    name: "pasted_face_mention",
    pattern: /\b(paste|cutout|collage|composite|merge|blend|overlay)\s+(face|photo|image)\b/i,
    severity: "error",
    message: "Mentions compositing/pasting which should not be in final prompts"
  },
  {
    name: "mixed_style_descriptors",
    pattern: /\b(realistic|photoreal).*?(illustration|drawing|painting)\b/i,
    severity: "error",
    message: "Mixes realistic and illustration descriptors"
  }
];

/**
 * Lint a prompt for style contradictions
 * @param {string} prompt - The prompt to lint
 * @returns {{valid: boolean, errors: Array, warnings: Array}}
 */
export function lintPrompt(prompt) {
  if (!prompt || typeof prompt !== "string") {
    return {
      valid: false,
      errors: [{ rule: "invalid_input", message: "Prompt must be a non-empty string" }],
      warnings: []
    };
  }

  const errors = [];
  const warnings = [];
  const promptLower = prompt.toLowerCase();

  // Check for style contradictions
  for (const contradiction of STYLE_CONTRADICTIONS) {
    const positiveMatch = contradiction.patterns[0].positive.test(prompt);
    const negativeMatch = contradiction.patterns[1].negative.test(prompt);

    if (positiveMatch && negativeMatch) {
      const issue = {
        rule: contradiction.name,
        message: contradiction.message || 
          `Style contradiction: prompt contains both "${contradiction.patterns[0].positive.source}" and "${contradiction.patterns[1].negative.source}"`,
        severity: contradiction.severity
      };

      if (contradiction.severity === "error") {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  // Check for problematic patterns
  for (const pattern of PROBLEMATIC_PATTERNS) {
    if (pattern.pattern.test(prompt)) {
      const issue = {
        rule: pattern.name,
        message: pattern.message || `Problematic pattern detected: ${pattern.name}`,
        severity: pattern.severity
      };

      if (pattern.severity === "error") {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate that prompt does not mention photo compositing
 * @param {string} prompt - The prompt to validate
 * @returns {{valid: boolean, message?: string}}
 */
export function validateNoPhotoCompositing(prompt) {
  const compositingKeywords = [
    /\b(paste|cutout|collage|composite|merge|blend|overlay|insert|place)\s+(face|photo|image|picture)\b/i,
    /\b(real\s+photo|actual\s+photo|original\s+photo|source\s+photo)\b/i,
    /\b(photo\s+face|photograph\s+face|real\s+face)\b/i
  ];

  for (const pattern of compositingKeywords) {
    if (pattern.test(prompt)) {
      return {
        valid: false,
        message: `Prompt mentions photo compositing: "${pattern.source}"`
      };
    }
  }

  return { valid: true };
}

/**
 * Assert prompt is valid (throws if invalid)
 * @param {string} prompt - The prompt to validate
 * @throws {Error} If prompt has errors
 */
export function assertPromptValid(prompt) {
  const lintResult = lintPrompt(prompt);
  const compositingCheck = validateNoPhotoCompositing(prompt);

  if (!compositingCheck.valid) {
    throw new Error(`Prompt validation failed: ${compositingCheck.message}`);
  }

  if (!lintResult.valid) {
    const errorMessages = lintResult.errors.map(e => e.message).join("; ");
    throw new Error(`Prompt validation failed: ${errorMessages}`);
  }

  if (lintResult.warnings.length > 0) {
    console.warn("Prompt warnings:", lintResult.warnings.map(w => w.message).join("; "));
  }
}




