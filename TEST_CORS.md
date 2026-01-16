# 🧪 Тестирование CORS

## Проверка на сервере

После применения изменений, проверьте:

```bash
ssh root@162.120.18.86

# 1. Проверьте OPTIONS запрос (preflight)
curl -v -X OPTIONS http://162.120.18.86:8787/api/book \
  -H "Origin: https://test.lovableproject.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"

# Должно вернуть:
# < HTTP/1.1 200 OK
# < Access-Control-Allow-Origin: https://test.lovableproject.com
# < Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# < Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
# < Access-Control-Allow-Credentials: true

# 2. Проверьте обычный POST запрос
curl -v -X POST http://162.120.18.86:8787/health \
  -H "Origin: https://test.lovableproject.com"

# Должно вернуть заголовки CORS
```

---

## Если все еще не работает

Возможно проблема в том, что:
1. Nginx или другой proxy блокирует заголовки
2. Браузер кэширует старые ответы
3. Нужно очистить кэш браузера на мобильном устройстве








