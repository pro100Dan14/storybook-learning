// Immutable face identity block - MUST be inserted verbatim into every page prompt
// DO NOT modify this block per page. DO NOT override it with page-specific descriptions.

export const FACE_IDENTITY_BLOCK = `
FACE IDENTITY LOCK (IMMUTABLE - APPLIES TO ALL PAGES):
- Use the exact same face from hero.jpg on every single page.
- Do not change face shape, eye spacing, nose shape, lips shape, age, or ethnicity across pages.
- Do not introduce a new face on any page.
- Match the hero reference image exactly for face and hair.
- The child photo is ONLY for confirmation, not to reinvent the face.
`.trim();

export const FACE_IDENTITY_PROHIBITIONS = `
HARD PROHIBITIONS (NEVER OVERRIDE):
- Do not change face shape, eye spacing, nose, lips, age, ethnicity across pages.
- Do not introduce a new face on any page.
- Use the same face as in hero.jpg on every page.
`.trim();



