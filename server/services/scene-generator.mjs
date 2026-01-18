/**
 * Scene generator using Gemini text model
 * Returns storyText + scenes array and raw text for UI
 */

import { generateTextUnified } from "./gen-text.mjs";
import { normalizeScenes } from "./scene-utils.mjs";
import { extractJSONFromText } from "../utils/validation.mjs";

const DEFAULT_SCENE_COUNT = 3;

function buildScenesPrompt({ name, theme, count, scenarioText }) {
  const safeName = name ? `Имя героя: ${name}.` : "";
  const safeTheme = theme ? `Тема: ${theme}.` : "";
  const safeScenario = scenarioText ? `Сценарий от клиента:\n${scenarioText}` : "";

  return `
Сгенерируй текст для детской книги и описания иллюстраций.
Формат ответа: строго JSON.

Обязательные поля:
- storyText: связный текст из ${count} абзацев (по одному на сцену)
- scenes: массив из ${count} коротких описаний сцен

Пример:
{
  "storyText": "Абзац 1...\n\nАбзац 2...\n\nАбзац 3...",
  "scenes": ["Scene1: ...","Scene2: ...","Scene3: ..."]
}

Требования:
- Без опасности и пугающих событий
- Без современных предметов, логотипов, текста
- Никаких ссылок на фото
- Тёплый, мягкий, сказочный тон

${safeName}
${safeTheme}
${safeScenario}
`.trim();
}

export async function generateScenesFromGemini({
  name,
  theme,
  scenarioText,
  count = DEFAULT_SCENE_COUNT,
  requestId
}) {
  const prompt = buildScenesPrompt({ name, theme, count, scenarioText });

  const result = await generateTextUnified({
    prompt,
    images: [],
    requestId
  });

  const rawText = result?.text || "";
  let scenes = [];
  let storyText = "";

  const parsed = extractJSONFromText(rawText);
  if (parsed && Array.isArray(parsed.scenes)) {
    scenes = parsed.scenes.map((s) => String(s).trim()).filter(Boolean);
    if (typeof parsed.storyText === "string") {
      storyText = parsed.storyText.trim();
    }
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

  if (!storyText) {
    storyText = rawText;
  }

  return {
    scenes: scenes.slice(0, count),
    scenesText: rawText,
    storyText
  };
}


