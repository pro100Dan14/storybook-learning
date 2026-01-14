# 🔍 Проверка переменных окружения

## Проверка что NODE_ENV установлен правильно

**На сервере выполните:**

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning

# Проверка 1: Что в docker-compose.yml
grep NODE_ENV docker-compose.yml

# Проверка 2: Что видит контейнер
docker compose exec backend printenv NODE_ENV

# Проверка 3: Логи при запуске
docker compose logs backend | grep -i "NODE_ENV\|mode\|production\|development"
```

**Должно показать `development`**, а не `production`.

---

## Если показывает production:

1. **Убедитесь что файл сохранен:**
```bash
cat docker-compose.yml | grep NODE_ENV
```

2. **Полностью перезапустите контейнер:**
```bash
docker compose down
docker compose up -d
```

3. **Проверьте снова:**
```bash
docker compose exec backend printenv NODE_ENV
```

---

## Если все еще не работает:

Возможно, где-то в коде жестко прописан production. Давайте проверим логи более детально.





