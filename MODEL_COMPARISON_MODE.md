# Режим сравнения моделей (Model Comparison Mode)

## Описание

Режим сравнения моделей позволяет генерировать каждую страницу книги с помощью **разной модели**, чтобы визуально сравнить результаты и выбрать лучшую модель.

## Как включить

Установите переменную окружения:

```bash
export MODEL_COMPARISON_MODE=true
```

Или в `.env` файле:

```env
MODEL_COMPARISON_MODE=true
```

## Как это работает

Когда `MODEL_COMPARISON_MODE=true`, каждая страница книги генерируется разной моделью:

- **Страница 1**: `instantid_artistic` (grandlineai/instant-id-artistic)
- **Страница 2**: `instantid` (zsxkib/instant-id)
- **Страница 3**: `instantid_multicontrolnet` (tgohblio/instant-id-multicontrolnet)
- **Страница 4**: `photomaker_style` (tencentarc/photomaker-style)

## Результат в API

Каждая страница в ответе API будет содержать поле `modelUsed`:

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "modelUsed": "instantid_artistic",
      "dataUrl": "data:image/png;base64,...",
      "similarity": 0.45,
      "hasImage": true
    },
    {
      "pageNumber": 2,
      "modelUsed": "instantid",
      "dataUrl": "data:image/png;base64,...",
      "similarity": 0.42,
      "hasImage": true
    },
    {
      "pageNumber": 3,
      "modelUsed": "instantid_multicontrolnet",
      "dataUrl": "data:image/png;base64,...",
      "similarity": 0.38,
      "hasImage": true
    },
    {
      "pageNumber": 4,
      "modelUsed": "photomaker_style",
      "dataUrl": "data:image/png;base64,...",
      "similarity": 0.40,
      "hasImage": true
    }
  ]
}
```

## Использование на фронтенде

На фронтенде вы можете:

1. **Отобразить информацию о модели** под каждой страницей:
   ```jsx
   <div className="page">
     <img src={page.dataUrl} alt={`Page ${page.pageNumber}`} />
     <div className="model-info">
       Model: {page.modelUsed}
       {page.similarity && (
         <span>Similarity: {page.similarity.toFixed(2)}</span>
       )}
     </div>
   </div>
   ```

2. **Позволить пользователю выбрать лучшую модель**:
   ```jsx
   <button onClick={() => selectBestModel(page.modelUsed)}>
     Выбрать эту модель
   </button>
   ```

3. **Сохранить выбор** и использовать выбранную модель для будущих генераций

## После выбора лучшей модели

1. **Отключите режим сравнения**:
   ```bash
   export MODEL_COMPARISON_MODE=false
   ```

2. **Установите выбранную модель**:
   ```bash
   export ILLUSTRATION_MODEL=instantid_artistic  # или другая выбранная модель
   ```

3. **Перезапустите сервер**

Теперь все страницы будут генерироваться выбранной моделью.

## Доступные модели

- `instantid_artistic` - grandlineai/instant-id-artistic (рекомендуется для стилизованного вывода)
- `instantid` - zsxkib/instant-id
- `instantid_multicontrolnet` - tgohblio/instant-id-multicontrolnet
- `photomaker_style` - tencentarc/photomaker-style
- `photomaker` - tencentarc/photomaker
- `legacy` - старая модель по умолчанию

## Критерии выбора

При сравнении моделей обращайте внимание на:

1. **Similarity score** (выше = лучше сохранение идентичности)
   - Хорошо: > 0.4
   - Отлично: > 0.5

2. **Визуальное качество**:
   - Нет артефактов "вставленного лица"
   - Стилизованный, не фотореалистичный стиль
   - Консистентность между страницами

3. **Скорость генерации** (может отличаться между моделями)

4. **Стоимость** (разные модели могут иметь разную стоимость на Replicate)

## Пример использования

```bash
# 1. Включить режим сравнения
export MODEL_COMPARISON_MODE=true

# 2. Сгенерировать книгу через API
curl -X POST http://localhost:8787/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Тест",
    "theme": "лес",
    "pages": 4,
    "photoBase64": "..."
  }'

# 3. Посмотреть результаты в report.json
# Каждая страница будет иметь поле modelUsed

# 4. Выбрать лучшую модель и установить её
export MODEL_COMPARISON_MODE=false
export ILLUSTRATION_MODEL=instantid_artistic
```

## Примечания

- Режим сравнения работает только для книг с 4 страницами (по умолчанию)
- Если страниц больше 4, дополнительные страницы будут использовать последнюю модель из списка
- Если страниц меньше 4, будут использованы только первые N моделей
- В режиме сравнения каждая модель использует свои оптимальные параметры (из `getModelDefaults`)

