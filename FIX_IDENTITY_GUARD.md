# 🔧 Исправление ошибки Identity Guard

## Проблема
```
Identity guard unavailable in production. Install @tensorflow/tfjs-node and @tensorflow-models/face-landmarks-detection.
```

В production режиме Identity Guard требует TensorFlow зависимости.

---

## Решение 1: Установить зависимости (рекомендуется)

Зависимости уже есть в `package.json`, но нужно установить недостающую:

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning

# Войдите в контейнер и установите
docker compose exec backend npm install @tensorflow-models/face-landmarks-detection

# Или пересоберите контейнер
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Решение 2: Отключить Identity Guard (быстро)

Если не нужна проверка identity, можно временно переключить в dev режим:

**На сервере обновите docker-compose.yml:**

```bash
nano /opt/storybook-learning/docker-compose.yml
```

**Измените:**
```yaml
environment:
  - NODE_ENV=development  # вместо production
```

**Перезапустите:**
```bash
docker compose restart backend
```

В dev режиме Identity Guard будет пропущен без ошибки.

---

## Решение 3: Добавить пакет в Dockerfile

Если хотите, чтобы пакет всегда устанавливался, нужно добавить в `server/package.json`:

```json
"dependencies": {
  "@tensorflow/tfjs-node": "^4.15.0",
  "@tensorflow-models/face-landmarks-detection": "^2.1.1"
}
```

Затем пересобрать контейнер.

---

## Проверка после исправления

```bash
docker compose logs backend | grep -i "identity\|tensorflow"
```

Должно быть без ошибок про "unavailable in production".

---

## Рекомендация

**Быстрое решение:** Используйте Решение 2 (переключить в dev режим) - это отключит проверку identity, но книга будет генерироваться.

**Правильное решение:** Установите зависимости (Решение 1) - тогда identity guard будет работать.





