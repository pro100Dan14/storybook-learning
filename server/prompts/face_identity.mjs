// Immutable face identity block - MUST be inserted verbatim into every page prompt
// The hero.jpg face is a "stamp" that must be copied exactly onto every page

export const FACE_IDENTITY_BLOCK = `
=== FACE COPY INSTRUCTION (MANDATORY) ===
The hero.jpg reference contains the character's face in cartoon style.
This face is a FIXED ASSET - do not modify it.

ON EVERY PAGE:
1. Take the exact face from hero.jpg
2. Place it on the character's body in the scene
3. Do not redraw, reinterpret, or stylize the face differently
4. The face is like a "sticker" - same on every page

The cartoon face style (Pixar/DreamWorks quality) comes ONLY from hero.jpg.
The rest of the image (body, clothes, background) is Russian fairy tale style.
`.trim();

export const FACE_IDENTITY_PROHIBITIONS = `
=== FACE PROHIBITIONS (NEVER VIOLATE) ===
- NEVER redraw the face - copy it from hero.jpg
- NEVER change face proportions between pages
- NEVER create a new cartoon interpretation of the face
- NEVER make the face look different from hero.jpg
- The face must be PIXEL-PERFECT consistent with hero.jpg
`.trim();



