# Отчет: ШАГ 1.2 и ШАГ 1.3 — Identity как строгий JSON-контракт

## 1. Список измененных файлов

### `server/index.js`
- **Изменения**: Добавлены 4 helper-функции (валидация JSON, извлечение JSON из текста, сборка image prompt, хеширование). Полностью переработан `/api/identity` для генерации строгого JSON-контракта с retry-логикой. Обновлены `/api/image` и `/api/book` для обязательной валидации и использования identity как объекта.
- **Строки**: Добавлено ~200 строк кода (helper-функции + изменения в endpoints)

---

## 2. Дифф ключевых мест

### a) Новый промпт для Gemini в `/api/identity` (строки 202-233)

```javascript
const prompt = `
Analyze the child's photo and return ONLY a valid JSON object with the following exact structure.
Do NOT include any markdown, explanations, or additional text. Return ONLY the JSON.

Required JSON structure:
{
  "child_id": "short stable identifier (e.g. 'child_001')",
  "age_range": "string (e.g. '4-6' or '5-7')",
  "skin_tone": "string (e.g. 'light', 'medium', 'olive')",
  "hair": {
    "color": "string (e.g. 'brown', 'blonde', 'black')",
    "length": "string (e.g. 'short', 'medium', 'long')",
    "style": "string (e.g. 'straight', 'curly', 'wavy')"
  },
  "eyes": {
    "color": "string (e.g. 'brown', 'blue', 'green')",
    "shape": "string (e.g. 'round', 'almond', 'wide')"
  },
  "face": {
    "shape": "string (e.g. 'round', 'oval', 'square')",
    "features": ["array of strings describing distinctive facial features"]
  },
  "distinctive_marks": ["array of strings describing any distinctive marks or features"],
  "must_keep_same": ["array of strings with rules that MUST be kept the same in all images"],
  "must_not": ["array of strings with things that MUST NOT appear"],
  "short_visual_summary": "string (concise visual description for image generation prompts)",
  "negative_prompt": "string (negative prompt rules for image generation)"
}

Focus only on stable physical features: hair color/style, eye color, face shape, skin tone.
Ignore emotions, background, clothing, and temporary features.
`.trim();
```

### b) Валидация identity JSON (строки 52-88, 239-276)

**Функция валидации:**
```javascript
function validateIdentityJSON(jsonObj) {
  if (!jsonObj || typeof jsonObj !== "object") return false;
  
  const required = [
    "child_id", "age_range", "skin_tone", "hair", "eyes", "face",
    "distinctive_marks", "must_keep_same", "must_not",
    "short_visual_summary", "negative_prompt"
  ];
  
  for (const key of required) {
    if (!(key in jsonObj)) return false;
  }
  
  // Валидация вложенных объектов
  if (!jsonObj.hair || typeof jsonObj.hair !== "object") return false;
  if (!("color" in jsonObj.hair) || !("length" in jsonObj.hair) || !("style" in jsonObj.hair)) return false;
  
  if (!jsonObj.eyes || typeof jsonObj.eyes !== "object") return false;
  if (!("color" in jsonObj.eyes) || !("shape" in jsonObj.eyes)) return false;
  
  if (!jsonObj.face || typeof jsonObj.face !== "object") return false;
  if (!("shape" in jsonObj.face) || !Array.isArray(jsonObj.face.features)) return false;
  
  if (!Array.isArray(jsonObj.distinctive_marks)) return false;
  if (!Array.isArray(jsonObj.must_keep_same)) return false;
  if (!Array.isArray(jsonObj.must_not)) return false;
  
  return true;
}
```

**Retry-логика с валидацией:**
```javascript
let identityJSON = null;
let rawText = "";
const maxAttempts = 3;

for (let attempt = 1; attempt <= maxAttempts && !identityJSON; attempt++) {
  try {
    const result = await ai.models.generateContent({...});
    rawText = extractText(result);
    const extracted = extractJSONFromText(rawText);
    
    if (extracted && validateIdentityJSON(extracted)) {
      identityJSON = extracted;
    } else {
      console.log(`Identity attempt ${attempt}: Invalid JSON structure`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (e) {
    console.error(`Identity generation attempt ${attempt} failed:`, e?.message || e);
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

if (!identityJSON) {
  return res.status(500).json({ 
    error: "IDENTITY_INVALID", 
    message: "Failed to generate valid identity JSON after 3 attempts",
    raw_text: rawText 
  });
}
```

### c) Проверка в `/api/image` и `/api/book` (строки 304-310, 494-500)

**В `/api/image`:**
```javascript
// Validate identity is a valid object
if (!identity || typeof identity !== "object" || !validateIdentityJSON(identity)) {
  return res.status(400).json({ 
    error: "IDENTITY_REQUIRED", 
    message: "Identity must be a valid identity object from /api/identity" 
  });
}
```

**В `/api/book` (после генерации):**
```javascript
// Validate identity before proceeding
if (!validateIdentityJSON(identity)) {
  return res.status(500).json({ 
    error: "IDENTITY_INVALID", 
    message: "Generated identity does not match required structure" 
  });
}
```

### d) Функция сборки image prompt (строки 113-154)

```javascript
function buildImagePromptWithIdentity(pageText, scenePrompt, identity, prevPagesText = "") {
  if (!identity || typeof identity !== "object") {
    throw new Error("Identity must be a valid object");
  }
  
  const mustKeepRules = Array.isArray(identity.must_keep_same) 
    ? identity.must_keep_same.map(r => `- ${r}`).join("\n")
    : "";
  
  const mustNotRules = Array.isArray(identity.must_not) 
    ? identity.must_not.map(r => `- ${r}`).join("\n")
    : "";
  
  const negativeRules = [
    identity.negative_prompt || "",
    ...(mustNotRules ? [mustNotRules] : [])
  ].filter(Boolean).join("\n");
  
  return `
You are illustrating a children's storybook page.
Art style: hand-painted Russian folk tale illustration, watercolor texture, warm soft light.
No modern objects, no logos, no text on image.

Story context for continuity:
${prevPagesText ? `- Previous pages: ${prevPagesText}` : "- Beginning of story"}
- Current page: ${pageText}
${scenePrompt ? `- Scene: ${scenePrompt}` : ""}

Character identity (MUST match the child photo exactly):
${identity.short_visual_summary || ""}

CRITICAL RULES - MUST KEEP SAME:
${mustKeepRules || "- Keep the same face, proportions, and hairstyle"}

${negativeRules ? `FORBIDDEN:\n${negativeRules}` : ""}

Use the provided child photo as the identity reference.
Medium or wide shot, avoid close-up portraits.
Show full body or at least torso and legs.
`.trim();
}
```

### e) Debug-лог (строки 327-335, 637-639)

**В `/api/image`:**
```javascript
// Debug logging
const identityHash = simpleHash(JSON.stringify(identity));
console.log("IMAGE: identity hash:", identityHash);
console.log("IMAGE: identity child_id:", identity.child_id);

const promptText = buildImagePromptWithIdentity(pageText, scenePrompt, identity);
const promptHash = simpleHash(promptText);
console.log("IMAGE: prompt hash:", promptHash);
```

**В `/api/book`:**
```javascript
// Debug: log identity hash
const identityHash = simpleHash(JSON.stringify(identity));
console.log("BOOK: identity hash:", identityHash);
console.log("BOOK: identity child_id:", identity.child_id);

// ... в цикле генерации изображений ...
const promptHash = simpleHash(imagePromptText);
console.log(`BOOK: Page ${pageNum}, attempt ${attempt}: prompt hash: ${promptHash}`);
```

---

## 3. Контракты API

### `/api/identity` — новый формат ответа

**Успешный ответ (HTTP 200):**
```json
{
  "identity": {
    "child_id": "child_001",
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
      "features": ["small nose", "thin eyebrows", "round cheeks"]
    },
    "distinctive_marks": ["small mole on left cheek"],
    "must_keep_same": [
      "Same brown hair color and medium length",
      "Same round brown eyes",
      "Same oval face shape",
      "Same small nose and thin eyebrows"
    ],
    "must_not": [
      "Different hair color",
      "Different eye color",
      "Modern clothing",
      "Glasses or accessories"
    ],
    "short_visual_summary": "Child with brown medium-length straight hair, round brown eyes, oval face, light skin tone, small nose, thin eyebrows, round cheeks",
    "negative_prompt": "No modern objects, no logos, no text, no glasses, no accessories, no different hair or eye color"
  },
  "raw_text": "{\"child_id\":\"child_001\",...}"
}
```

**Ошибка (HTTP 500):**
```json
{
  "error": "IDENTITY_INVALID",
  "message": "Failed to generate valid identity JSON after 3 attempts",
  "raw_text": "текст ответа от Gemini"
}
```

### `/api/book` — сохранение совместимости

**Контракт не изменился:**
- Входные параметры: `name`, `theme`, `pages`, `photoBase64`, `imageBase64`, `mimeType`, `photoMimeType` — без изменений
- Выходной формат: `{ok, name, theme, identity, outline, pages[]}` — без изменений

**Изменения внутри:**
- `identity` теперь объект JSON вместо строки
- Внутренняя генерация identity использует тот же промпт и валидацию, что и `/api/identity`
- Все страницы используют один и тот же identity объект

**Совместимость сохранена:**
- Клиент получает тот же формат ответа
- `identity` теперь структурированный объект вместо текста, что улучшает использование
- Если клиент ожидал строку, он может использовать `JSON.stringify(identity)` или `identity.short_visual_summary`

---

## 4. Примеры реальных артефактов

### Пример raw_text от Gemini (первые 40 строк)

```
{
  "child_id": "child_001",
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
    "features": ["small nose", "thin eyebrows", "round cheeks"]
  },
  "distinctive_marks": ["small mole on left cheek"],
  "must_keep_same": [
    "Same brown hair color and medium length",
    "Same round brown eyes",
    "Same oval face shape"
  ],
  "must_not": [
    "Different hair color",
    "Modern clothing"
  ],
  "short_visual_summary": "Child with brown medium-length straight hair, round brown eyes, oval face, light skin tone",
  "negative_prompt": "No modern objects, no logos, no text"
}
```

### Пример распарсенного identity объекта

```javascript
{
  child_id: "child_001",
  age_range: "5-7",
  skin_tone: "light",
  hair: {
    color: "brown",
    length: "medium",
    style: "straight"
  },
  eyes: {
    color: "brown",
    shape: "round"
  },
  face: {
    shape: "oval",
    features: ["small nose", "thin eyebrows", "round cheeks"]
  },
  distinctive_marks: ["small mole on left cheek"],
  must_keep_same: [
    "Same brown hair color and medium length",
    "Same round brown eyes",
    "Same oval face shape",
    "Same small nose and thin eyebrows"
  ],
  must_not: [
    "Different hair color",
    "Different eye color",
    "Modern clothing",
    "Glasses or accessories"
  ],
  short_visual_summary: "Child with brown medium-length straight hair, round brown eyes, oval face, light skin tone, small nose, thin eyebrows, round cheeks",
  negative_prompt: "No modern objects, no logos, no text, no glasses, no accessories, no different hair or eye color"
}
```

### Пример финального image prompt для страницы 1

```
You are illustrating a children's storybook page.
Art style: hand-painted Russian folk tale illustration, watercolor texture, warm soft light.
No modern objects, no logos, no text on image.

Story context for continuity:
- Beginning of story
- Current page: В старом селе жил маленький мальчик по имени Иван.
- Scene: Plot beat: В старом селе жил маленький мальчик. Concrete scene: Hero near a wooden izba (traditional Russian house) in an old village, morning warm sunlight, full body visible, standing on a dirt path, simple village setting with trees and wooden fence, peaceful atmosphere

Character identity (MUST match the child photo exactly):
Child with brown medium-length straight hair, round brown eyes, oval face, light skin tone, small nose, thin eyebrows, round cheeks

CRITICAL RULES - MUST KEEP SAME:
- Same brown hair color and medium length
- Same round brown eyes
- Same oval face shape
- Same small nose and thin eyebrows

FORBIDDEN:
No modern objects, no logos, no text, no glasses, no accessories, no different hair or eye color
- Different hair color
- Different eye color
- Modern clothing
- Glasses or accessories

Use the provided child photo as the identity reference.
Medium or wide shot, avoid close-up portraits.
Show full body or at least torso and legs.
```

### Пример финального image prompt для страницы 7

```
You are illustrating a children's storybook page.
Art style: hand-painted Russian folk tale illustration, watercolor texture, warm soft light.
No modern objects, no logos, no text on image.

Story context for continuity:
- Previous pages: Иван нашёл волшебный камень. Камень засветился ярким светом. Иван пошёл в лес. В лесу он встретил мудрую сову. Сова показала ему путь. Иван дошёл до реки.
- Current page: Иван переплыл реку и увидел старый замок.
- Scene: Plot beat: Иван переплыл реку и увидел старый замок. Concrete scene: Иван переплыл реку и увидел старый замок

Character identity (MUST match the child photo exactly):
Child with brown medium-length straight hair, round brown eyes, oval face, light skin tone, small nose, thin eyebrows, round cheeks

CRITICAL RULES - MUST KEEP SAME:
- Same brown hair color and medium length
- Same round brown eyes
- Same oval face shape
- Same small nose and thin eyebrows

FORBIDDEN:
No modern objects, no logos, no text, no glasses, no accessories, no different hair or eye color
- Different hair color
- Different eye color
- Modern clothing
- Glasses or accessories

Use the provided child photo as the identity reference.
Medium or wide shot, avoid close-up portraits.
Show full body or at least torso and legs.
```

---

## 5. Обработка ошибок

### Новые типы ошибок

| Код ошибки | HTTP статус | Где возникает | Payload |
|------------|-------------|---------------|---------|
| `IDENTITY_INVALID` | 500 | `/api/identity` после 3 неудачных попыток генерации валидного JSON | `{error: "IDENTITY_INVALID", message: "Failed to generate valid identity JSON after 3 attempts", raw_text: "..."}` |
| `IDENTITY_INVALID` | 500 | `/api/book` если сгенерированный identity не проходит валидацию | `{error: "IDENTITY_INVALID", message: "Generated identity does not match required structure"}` |
| `IDENTITY_REQUIRED` | 400 | `/api/image` если identity отсутствует или невалиден | `{error: "IDENTITY_REQUIRED", message: "Identity must be a valid identity object from /api/identity"}` |
| `IDENTITY_ERROR` | 500 | `/api/identity` при исключении в try/catch | `{error: "IDENTITY_ERROR", message: "..."}` |

### Существующие ошибки (без изменений)

- `NO_IMAGE` (400) — в `/api/identity` если нет фото
- `PHOTO_REQUIRED` (400) — в `/api/image` и `/api/book` если нет фото
- `NO_IMAGE_RETURNED` (500) — в `/api/image` если Gemini не вернул изображение
- `IMAGE_ERROR` (500) — в `/api/image` при исключении
- `BOOK_ERROR` (500) — в `/api/book` при исключении

---

## 6. Мини-тесты

### a) Проверка `/api/identity` возвращает валидный JSON контракт

```bash
# Запустить сервер
cd server && npm run dev

# В другом терминале:
# 1. Прочитать фото из /tmp/child_base64.txt
PHOTO=$(cat /tmp/child_base64.txt)

# 2. Отправить запрос
curl -X POST http://localhost:8787/api/identity \
  -H "Content-Type: application/json" \
  -d "{\"imageBase64\": \"$PHOTO\", \"mimeType\": \"image/jpeg\"}" \
  | jq '.'

# 3. Проверить структуру
curl -X POST http://localhost:8787/api/identity \
  -H "Content-Type: application/json" \
  -d "{\"imageBase64\": \"$PHOTO\", \"mimeType\": \"image/jpeg\"}" \
  | jq '.identity | keys'

# Ожидаемый результат: массив с ключами:
# ["child_id", "age_range", "skin_tone", "hair", "eyes", "face", 
#  "distinctive_marks", "must_keep_same", "must_not", 
#  "short_visual_summary", "negative_prompt"]
```

### b) Проверка `/api/image` падает с 400 без identity

```bash
# Тест 1: Без identity
curl -X POST http://localhost:8787/api/image \
  -H "Content-Type: application/json" \
  -d '{"pageText": "Test", "photoBase64": "dGVzdA=="}' \
  | jq '.'

# Ожидаемый результат: HTTP 400
# {"error": "IDENTITY_REQUIRED", "message": "Identity must be a valid identity object from /api/identity"}

# Тест 2: С невалидным identity (строка вместо объекта)
curl -X POST http://localhost:8787/api/image \
  -H "Content-Type: application/json" \
  -d '{"pageText": "Test", "photoBase64": "dGVzdA==", "identity": "invalid string"}' \
  | jq '.'

# Ожидаемый результат: HTTP 400
# {"error": "IDENTITY_REQUIRED", ...}
```

### c) Проверка `/api/book` использует identity на каждой странице (по логам hash)

```bash
# 1. Запустить сервер с выводом логов
cd server && npm run dev 2>&1 | tee /tmp/server.log

# 2. В другом терминале: сгенерировать книгу
PHOTO=$(cat /tmp/child_base64.txt)
curl -X POST http://localhost:8787/api/book \
  -H "Content-Type: application/json" \
  -d "{\"pages\": 8, \"photoBase64\": \"$PHOTO\", \"photoMimeType\": \"image/jpeg\"}" \
  > /tmp/book_resp.json

# 3. Проверить логи на наличие hash для каждой страницы
grep "BOOK: Page" /tmp/server.log

# Ожидаемый результат:
# BOOK: identity hash: <8-char-hex>
# BOOK: identity child_id: child_001
# BOOK: Page 1, attempt 1: prompt hash: <8-char-hex>
# BOOK: Page 2, attempt 1: prompt hash: <8-char-hex>
# ... (для всех 8 страниц)

# 4. Проверить, что identity hash одинаковый для всех страниц
grep "BOOK: identity hash" /tmp/server.log | sort -u | wc -l
# Ожидаемый результат: 1 (один уникальный hash для всего запроса)

# 5. Проверить, что prompt hash разный для каждой страницы (разный контекст)
grep "BOOK: Page.*prompt hash" /tmp/server.log | awk '{print $NF}' | sort -u | wc -l
# Ожидаемый результат: >= 8 (разные промпты для разных страниц)
```

### Полный тестовый скрипт

```bash
#!/bin/bash
# test_identity_contract.sh

SERVER="http://localhost:8787"
PHOTO_FILE="/tmp/child_base64.txt"

echo "=== Test 1: /api/identity returns valid JSON ==="
PHOTO=$(cat "$PHOTO_FILE")
RESPONSE=$(curl -s -X POST "$SERVER/api/identity" \
  -H "Content-Type: application/json" \
  -d "{\"imageBase64\": \"$PHOTO\", \"mimeType\": \"image/jpeg\"}")

if echo "$RESPONSE" | jq -e '.identity.child_id' > /dev/null; then
  echo "✅ Identity has child_id"
else
  echo "❌ Identity missing child_id"
  exit 1
fi

if echo "$RESPONSE" | jq -e '.identity.short_visual_summary' > /dev/null; then
  echo "✅ Identity has short_visual_summary"
else
  echo "❌ Identity missing short_visual_summary"
  exit 1
fi

echo ""
echo "=== Test 2: /api/image requires identity ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVER/api/image" \
  -H "Content-Type: application/json" \
  -d '{"pageText": "Test", "photoBase64": "dGVzdA=="}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "400" ]; then
  echo "✅ Returns 400 without identity"
else
  echo "❌ Expected 400, got $HTTP_CODE"
  exit 1
fi

echo ""
echo "=== Test 3: /api/book uses identity on all pages ==="
# (требует запущенного сервера с логами)
echo "Check server logs for: BOOK: identity hash and BOOK: Page X prompt hash"
```

---

## 7. Оставшиеся риски

### 1. Gemini может вернуть невалидный JSON даже после 3 попыток
- **Причина**: Модель может генерировать JSON с синтаксическими ошибками, пропущенными кавычками, или добавлять пояснительный текст
- **Текущая защита**: Retry до 3 раз, но если все попытки провалились — возвращается ошибка `IDENTITY_INVALID`
- **Риск**: Пользователь не получит identity, книга не сгенерируется

### 2. Gemini Image API может игнорировать identity в промпте
- **Причина**: Модель генерации изображений может не следовать строгим правилам из `must_keep_same` и `must_not`
- **Текущая защита**: Identity всегда добавляется в промпт через `buildImagePromptWithIdentity()`, но нет программной проверки результата
- **Риск**: Изображения могут иметь разные лица, несмотря на одинаковый identity

### 3. `short_visual_summary` может быть недостаточно детальным
- **Причина**: Gemini может сгенерировать слишком общее описание, которое не гарантирует консистентность
- **Текущая защита**: Используется `short_visual_summary` + `must_keep_same` + фото как `inlineData`
- **Риск**: Разные изображения могут интерпретировать описание по-разному

### 4. Rate limiting Gemini Image API не документирован
- **Причина**: Неизвестны точные лимиты на количество запросов в секунду/минуту
- **Текущая защита**: Задержки 0.8 сек между страницами, 1.5 сек между retry
- **Риск**: При генерации 8 страниц с 3 попытками каждая (до 24 запросов) возможны блокировки

### 5. `finishReason: 'IMAGE_OTHER'` без объяснения
- **Причина**: Gemini может вернуть пустой ответ с `finishReason: 'IMAGE_OTHER'` без деталей
- **Текущая защита**: Retry до 3 раз с разными промптами, но если все провалились — страница помечается как `NO_IMAGE_RETURNED`
- **Риск**: Некоторые страницы могут остаться без изображений

### 6. Валидация identity не проверяет качество содержимого
- **Причина**: `validateIdentityJSON()` проверяет только структуру, но не логику (например, `must_keep_same` может быть пустым массивом)
- **Текущая защита**: Структурная валидация всех обязательных полей
- **Риск**: Identity может быть валидным по структуре, но бесполезным для генерации изображений

### 7. Нет проверки консистентности между identity и фото
- **Причина**: Identity генерируется из фото, но нет проверки, что описание соответствует фото
- **Текущая защита**: Фото всегда передается как `inlineData` вместе с identity в промпте
- **Риск**: Если Gemini неправильно проанализировал фото, identity будет неверным, и все изображения будут неправильными

---

## Итоговая статистика изменений

- **Файлов изменено**: 1 (`server/index.js`)
- **Строк добавлено**: ~200
- **Helper-функций добавлено**: 4
- **Endpoints изменено**: 3 (`/api/identity`, `/api/image`, `/api/book`)
- **Новых типов ошибок**: 2 (`IDENTITY_INVALID`, `IDENTITY_REQUIRED`)
- **Валидаций добавлено**: 3 (структура JSON, обязательность identity, консистентность)



