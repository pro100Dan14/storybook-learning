# Docker Deployment Guide

Это руководство по развертыванию бэкенда Storybook Learning с помощью Docker и Docker Compose.

## Требования

- Docker 20.10+
- Docker Compose 2.0+
- Минимум 2GB свободной RAM
- Минимум 5GB свободного места на диске

## Быстрый старт

### 1. Подготовка файлов

Создайте файл с переменными окружения на сервере:

```bash
# Создайте .env файл в корне проекта
cat > .env << 'EOF'
# Обязательные переменные
GEMINI_API_KEY=your_gemini_api_key_here

# Опциональные переменные
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
PROVIDER_TEXT=gemini
PROVIDER_IMAGE=gemini

# Google Cloud (если используете ADC вместо API ключа)
# GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-sa.json

# FaceID (опционально)
FACE_ID_ENABLED=false
FACE_ID_THRESHOLD=0.32
FACE_ID_MAX_ATTEMPTS=2

# Identity
IDENTITY_SIMILARITY_THRESHOLD=0.62

# Debug
DEBUG_BOOK=0
DEBUG_FACE_ID=false
EOF
```

### 2. Подготовка Google Cloud credentials (если используете ADC)

Если вы используете Application Default Credentials вместо API ключа:

```bash
# Скопируйте ваш gcp-sa.json в server/
cp /path/to/your/gcp-sa.json ./server/gcp-sa.json
```

**Важно:** Файл `gcp-sa.json` не должен попадать в git репозиторий!

### 3. Запуск контейнера

```bash
# Соберите и запустите контейнер
docker-compose up -d

# Проверьте логи
docker-compose logs -f backend

# Проверьте статус
docker-compose ps
```

### 4. Проверка работоспособности

```bash
# Health check
curl http://localhost:8787/health

# Должен вернуть: {"ok":true,"requestId":"..."}
```

## Управление контейнером

### Остановка

```bash
docker-compose stop
```

### Запуск

```bash
docker-compose start
```

### Перезапуск

```bash
docker-compose restart backend
```

### Просмотр логов

```bash
# Все логи
docker-compose logs -f backend

# Последние 100 строк
docker-compose logs --tail=100 backend
```

### Остановка и удаление

```bash
docker-compose down

# С удалением volumes (удалит jobs/)
docker-compose down -v
```

## Обновление

```bash
# Остановите контейнер
docker-compose down

# Получите последние изменения из git
git pull

# Пересоберите образ
docker-compose build --no-cache

# Запустите заново
docker-compose up -d
```

## Переменные окружения

### Обязательные

- `GEMINI_API_KEY` - API ключ Google Gemini (или используйте `GOOGLE_APPLICATION_CREDENTIALS`)

### Опциональные

#### Gemini Configuration
- `GEMINI_TEXT_MODEL` - Модель для генерации текста (по умолчанию: `gemini-2.5-flash`)
- `GEMINI_IMAGE_MODEL` - Модель для генерации изображений (по умолчанию: `gemini-2.5-flash-image`)
- `PROVIDER_TEXT` - Провайдер для текста (по умолчанию: `gemini`)
- `PROVIDER_IMAGE` - Провайдер для изображений (по умолчанию: `gemini`)

#### Google Cloud
- `GOOGLE_APPLICATION_CREDENTIALS` - Путь к файлу сервисного аккаунта (по умолчанию: `/app/gcp-sa.json`)

#### FaceID
- `FACE_ID_ENABLED` - Включить FaceID (по умолчанию: `false`)
- `FACE_ID_THRESHOLD` - Порог схожести лиц (по умолчанию: `0.32`)
- `FACE_ID_MAX_ATTEMPTS` - Максимум попыток регенерации (по умолчанию: `2`)
- `PYTHON_BIN` - Путь к Python (по умолчанию: `python3`)

#### Identity
- `IDENTITY_SIMILARITY_THRESHOLD` - Порог схожести для identity check (по умолчанию: `0.62`)

#### Debug
- `DEBUG_BOOK` - Включить детальное логирование (по умолчанию: `0`)
- `DEBUG_FACE_ID` - Включить логирование FaceID (по умолчанию: `false`)

## Volumes

### `./server/jobs:/app/jobs`

Директория для хранения сгенерированных книг и отчетов. Создается автоматически при первом запуске.

**Важно:** Содержимое этой директории сохраняется между перезапусками контейнера.

## Порты

- `8787` - HTTP API сервер

## Troubleshooting

### Контейнер не запускается

```bash
# Проверьте логи
docker-compose logs backend

# Проверьте, что порт 8787 свободен
netstat -tuln | grep 8787
```

### Ошибка "GEMINI_API_KEY missing"

Убедитесь, что переменная окружения установлена:

```bash
# Проверьте в .env файле
cat .env | grep GEMINI_API_KEY

# Или установите напрямую
export GEMINI_API_KEY=your_key_here
docker-compose up -d
```

### Ошибка "Could not load the default credentials"

Если используете ADC:

1. Убедитесь, что файл `gcp-sa.json` существует в `./server/`
2. Проверьте права доступа: `chmod 644 ./server/gcp-sa.json`
3. Проверьте, что файл монтируется в контейнер: `docker-compose exec backend ls -la /app/gcp-sa.json`

### Проблемы с Python зависимостями

Если FaceID не работает:

```bash
# Войдите в контейнер
docker-compose exec backend bash

# Проверьте Python
python3 --version

# Проверьте зависимости
pip3 list | grep -E "(opencv|insightface|numpy)"
```

### Просмотр логов в реальном времени

```bash
docker-compose logs -f --tail=50 backend
```

## Production рекомендации

1. **Используйте reverse proxy** (nginx, traefik) перед контейнером
2. **Настройте SSL/TLS** для HTTPS
3. **Ограничьте ресурсы** в docker-compose.yml:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2'
         memory: 4G
   ```
4. **Настройте логирование** в отдельный файл или систему
5. **Регулярно обновляйте** образы Docker
6. **Используйте secrets** для хранения API ключей (Docker Secrets или внешние системы)

## Мониторинг

### Health check

```bash
# Проверка здоровья
curl http://localhost:8787/health

# Debug endpoint
curl http://localhost:8787/debug/adc
curl http://localhost:8787/debug/book
```

### Метрики

Контейнер автоматически проверяет здоровье каждые 30 секунд через HEALTHCHECK.

## Поддержка

При возникновении проблем:
1. Проверьте логи: `docker-compose logs backend`
2. Проверьте статус: `docker-compose ps`
3. Проверьте переменные окружения: `docker-compose exec backend env | grep -E "(GEMINI|GOOGLE|FACE)"`

