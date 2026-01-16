# 🧪 Тестирование CORS для Lovable

## Проверка на сервере

После применения изменений:

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning

# Проверьте OPTIONS запрос с lovable.app origin
curl -v -X OPTIONS http://localhost:8787/api/book \
  -H "Origin: https://example.lovable.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  2>&1 | grep -i "access-control"

# Должны появиться:
# Access-Control-Allow-Origin: https://example.lovable.app
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With
# Access-Control-Allow-Credentials: true
```








