# 🔍 Диагностика CORS проблемы

## Проверка на сервере

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning

# 1. Проверьте что код обновлен
grep -A 10 "corsOptions" server/index.js

# 2. Проверьте логи при запуске
docker compose logs backend | head -30

# 3. Проверьте что контейнер перезапущен
docker compose ps

# 4. Проверьте реальный ответ с заголовками
curl -I -X OPTIONS http://162.120.18.86:8787/api/book \
  -H "Origin: https://test.lovableproject.com" \
  -H "Access-Control-Request-Method: POST"
```

**Что должно быть в ответе:**
- `Access-Control-Allow-Origin: https://test.lovableproject.com`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Allow-Credentials: true`

---

## Если заголовки не появляются

Возможно нужно более простая настройка или проблема в другом месте.





