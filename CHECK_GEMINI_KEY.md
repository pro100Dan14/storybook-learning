# 🔑 Проверка API ключа Gemini

## Диагностика

**На сервере:**

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning

# 1. Проверьте .env файл
cat .env | grep GEMINI_API_KEY

# 2. Проверьте что видит контейнер
docker compose exec backend printenv GEMINI_API_KEY

# 3. Проверьте логи бекенда (ищите ошибки про API key)
docker compose logs backend | grep -i "gemini\|api.*key\|invalid"

# 4. Проверьте последние логи
docker compose logs backend | tail -50
```

---

## Если ключ не виден в контейнере

Проверьте docker-compose.yml:
```bash
grep GEMINI_API_KEY docker-compose.yml
```

Должно быть:
```yaml
- GEMINI_API_KEY=${GEMINI_API_KEY:-}
```

---

## Если ключ есть но не работает

1. Получите новый ключ: https://aistudio.google.com/apikey
2. Обновите .env файл
3. Перезапустите контейнер:
```bash
docker compose restart backend
```


