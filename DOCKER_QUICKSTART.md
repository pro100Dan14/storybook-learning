# 🚀 Быстрый старт с Docker

## Минимальные шаги для развертывания

### 1. Клонируйте репозиторий

```bash
git clone https://github.com/alexsvk7/storybook-learning.git
cd storybook-learning
```

### 2. Создайте .env файл

```bash
cp .env.example .env
# Отредактируйте .env и добавьте ваш GEMINI_API_KEY
nano .env
```

**Минимум что нужно:**
```bash
GEMINI_API_KEY=ваш_ключ_здесь
```

### 3. Запустите контейнер

```bash
docker-compose up -d
```

### 4. Проверьте работу

```bash
curl http://localhost:8787/health
```

Должен вернуть: `{"ok":true,"requestId":"..."}`

## Готово! 🎉

API доступен на `http://localhost:8787`

## Полезные команды

```bash
# Просмотр логов
docker-compose logs -f backend

# Остановка
docker-compose stop

# Перезапуск
docker-compose restart backend

# Остановка и удаление
docker-compose down
```

## Подробная документация

См. [DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md) для полной документации.

