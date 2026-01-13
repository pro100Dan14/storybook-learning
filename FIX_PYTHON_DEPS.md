# 🔧 Исправление ошибки установки Python зависимостей

## Проблема
`opencv-python` требует компиляцию и дополнительные системные библиотеки.

## Решение 1: Упрощенный Dockerfile (без FaceID)

Если FaceID не нужен (по умолчанию отключена), можно упростить Dockerfile:

**На сервере создайте упрощенный Dockerfile:**

```bash
cd /opt/storybook-learning/server
cat > Dockerfile.simple << 'EOF'
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN mkdir -p /app/jobs && chmod 755 /app/jobs

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "index.js"]
EOF

cp Dockerfile.simple Dockerfile
cd /opt/storybook-learning
docker compose up -d --build
```

---

## Решение 2: Использовать обновленный Dockerfile

Я обновил Dockerfile - он теперь устанавливает системные зависимости для компиляции.

**На сервере обновите файл или скопируйте:**

```bash
cd /opt/storybook-learning
git pull  # если обновили на GitHub
# или вручную скопируйте обновленный Dockerfile
docker compose up -d --build
```

---

## Решение 3: Установить зависимости отдельно (если ошибка продолжается)

Если все еще не работает, можно установить зависимости после сборки:

```bash
# Запустите контейнер без Python зависимостей
# Затем войдите в контейнер и установите вручную
docker compose exec backend bash
apt-get update
apt-get install -y python3-pip python3-dev build-essential
pip3 install opencv-python-headless insightface numpy
exit
```

---

## Проверка после исправления

```bash
docker compose ps
docker compose logs backend
curl http://localhost:8787/health
```

FaceID отключен по умолчанию, поэтому проект должен работать без Python зависимостей!


