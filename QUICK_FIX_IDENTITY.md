# ⚡ Быстрое исправление Identity Guard

## Проблема
Identity Guard требует `@tensorflow-models/face-landmarks-detection`, но его нет.

---

## Решение: Установить пакет

### Вариант 1: Установить в запущенном контейнере (быстро)

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning
docker compose exec backend npm install @tensorflow-models/face-landmarks-detection
docker compose restart backend
```

---

### Вариант 2: Пересобрать контейнер (правильно)

Я добавил пакет в `package.json`. Теперь нужно:

1. **Обновить код на сервере:**
```bash
ssh root@162.120.18.86
cd /opt/storybook-learning
git pull  # если закоммитили изменения
# или вручную обновить package.json
```

2. **Пересобрать контейнер:**
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

### Вариант 3: Временно отключить проверку (обходной путь)

Если не нужна проверка identity, переключите в dev режим:

```bash
nano /opt/storybook-learning/docker-compose.yml
```

Измените:
```yaml
environment:
  - NODE_ENV=development  # вместо production
```

Перезапустите:
```bash
docker compose restart backend
```

---

## Рекомендация

**Быстро:** Вариант 1 (установить в контейнере)  
**Правильно:** Вариант 2 (пересобрать контейнер)  
**Временно:** Вариант 3 (отключить проверку)





