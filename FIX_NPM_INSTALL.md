# 🔧 Исправление ошибки npm install

## Проблема
Ошибка при установке зависимостей npm в Docker.

## Решение 1: Использовать npm install вместо npm ci

Измените Dockerfile:

```dockerfile
# Замените эту строку:
RUN npm ci --only=production && npm cache clean --force

# На эту:
RUN npm install --only=production && npm cache clean --force
```

## Решение 2: Установить с --legacy-peer-deps

Если проблема с конфликтами версий:

```dockerfile
RUN npm install --only=production --legacy-peer-deps && npm cache clean --force
```

## Решение 3: Обновить package-lock.json

Возможно package-lock.json устарел. Пересоздайте его:

```bash
cd server
rm package-lock.json
npm install
git add package-lock.json
git commit -m "Update package-lock.json"
git push
```

Затем на сервере:
```bash
git pull
docker compose up -d --build
```





