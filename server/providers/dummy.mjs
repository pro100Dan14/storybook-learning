// Dummy provider for testing
// Returns deterministic outputs based on prompt hash

// Simple hash function for deterministic outputs
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export class DummyTextProvider {
  async generateText({ prompt, images = [], requestId }) {
    // Deterministic text based on prompt hash
    const hash = simpleHash(prompt);
    const seed = hash % 1000;

    // Return deterministic JSON-like text for identity prompts
    if (prompt.includes("JSON") || prompt.includes("identity")) {
      const text = `{
  "child_id": "dummy_${seed}",
  "age_range": "5-7",
  "skin_tone": "light",
  "hair": {
    "color": "brown",
    "length": "medium",
    "style": "straight"
  },
  "eyes": {
    "color": "brown",
    "shape": "round"
  },
  "face": {
    "shape": "oval",
    "features": ["small nose", "round cheeks"]
  },
  "distinctive_marks": [],
  "must_keep_same": ["Keep the same face", "Keep the same hair color", "Keep the same eye color"],
  "must_not": ["Do not change hair color", "Do not change eye color"],
  "short_visual_summary": "A child with brown hair and brown eyes, light skin tone, medium-length straight hair, oval face shape with small nose and round cheeks.",
  "negative_prompt": "No modern objects, no logos, no text"
}`;
      return { text, raw: { provider: "dummy", seed } };
    }

    // Return deterministic story text
    if (prompt.includes("сказк") || prompt.includes("story")) {
      const texts = [
        "Жил-был герой в волшебном лесу.",
        "Однажды герой отправился в путь.",
        "Герой встретил доброго волшебника.",
        "Волшебник дал герою волшебный подарок.",
      ];
      const text = texts[seed % texts.length];
      return { text, raw: { provider: "dummy", seed } };
    }

    // Default deterministic text
    const text = `Dummy text response for prompt hash ${hash}`;
    return { text, raw: { provider: "dummy", seed: hash } };
  }
}

export class DummyImageProvider {
  async generateImage({ prompt, images = [], requestId }) {
    // Generate a deterministic 1x1 PNG (transparent pixel)
    // In real tests, you might want a more visible placeholder
    const hash = simpleHash(prompt);
    const seed = hash % 1000;

    // Create a minimal 1x1 PNG in base64
    // This is a valid PNG: 89 50 4E 47 0D 0A 1A 0A ... (PNG header + minimal IHDR + IEND)
    const minimalPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // For testing, we'll return a deterministic but valid PNG
    // In practice, you might want a more visible test image
    const mimeType = "image/png";
    const dataUrl = `data:${mimeType};base64,${minimalPngBase64}`;

    return {
      mimeType,
      dataUrl,
      raw: { provider: "dummy", seed, promptHash: hash },
    };
  }
}


