/**
 * Scene generator using Gemini text model
 * Returns scenes array and raw text for UI
 */

import { generateTextUnified } from "./gen-text.mjs";
import { normalizeScenes } from "./comfy-workflow.mjs";
import { extractJSONFromText } from "../utils/validation.mjs";

const DEFAULT_SCENE_COUNT = 3;

function buildScenesPrompt({ name, theme, count }) {
  const safeName = name ? `Имя героя: ${name}.` : "";
  const safeTheme = theme ? `Тема: ${theme}.` : "";

  return `
Сгенерируй ${count} коротких описаний сцен для детской книги на русском.
Формат ответа: строго JSON.

Пример:
{"scenes":["Scene1: ...","Scene2: ...","Scene3: ..."]}

Требования:
- Без опасности и пугающих событий
- Без современных предметов, логотипов, текста
- Никаких ссылок на фото
- Тёплый, мягкий, сказочный тон

${safeName}
${safeTheme}
`.trim();
}

export async function generateScenesFromGemini({
  name,
  theme,
  count = DEFAULT_SCENE_COUNT,
  requestId
}) {
  const prompt = buildScenesPrompt({ name, theme, count });

  const result = await generateTextUnified({
    prompt,
    images: [],
    requestId
  });

  const rawText = result?.text || "";
  let scenes = [];

  const parsed = extractJSONFromText(rawText);
  if (parsed && Array.isArray(parsed.scenes)) {
    scenes = parsed.scenes.map((s) => String(s).trim()).filter(Boolean);
  } else {
    scenes = normalizeScenes(rawText);
  }

  // Fill missing scenes by repeating last
  while (scenes.length > 0 && scenes.length < count) {
    scenes.push(scenes[scenes.length - 1]);
  }

  if (scenes.length === 0) {
    throw new Error("SCENE_GENERATION_FAILED");
  }

  return {
    scenes: scenes.slice(0, count),
    scenesText: rawText
  };
}


