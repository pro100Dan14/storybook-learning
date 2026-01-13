# ✅ Проверка работоспособности бекенда

## Шаг 1: Проверка статуса контейнера

```bash
docker compose ps
```

Должен показать контейнер `storybook-backend` со статусом `Up` (работает).

---

## Шаг 2: Просмотр логов

```bash
docker compose logs backend
```

Или в реальном времени:

```bash
docker compose logs -f backend
```

**Что искать:**
- ✅ Сервер запустился: `Server listening on port 8787`
- ✅ Нет критических ошибок
- ⚠️ Если видите `GEMINI_API_KEY missing` - проверьте .env файл

---

## Шаг 3: Проверка health endpoint (локально)

```bash
curl http://localhost:8787/health
```

**Должно вернуть:**
```json
{"ok":true,"requestId":"..."}
```

---

## Шаг 4: Проверка из браузера (снаружи)

Откройте в браузере:

```
http://162.120.18.86:8787/health
```

**Должно вернуть:**
```json
{"ok":true,"requestId":"..."}
```

Если не открывается:
- Проверьте firewall: `ufw allow 8787/tcp`
- Убедитесь, что порт слушается: `netstat -tuln | grep 8787`

---

## Шаг 5: Проверка API endpoint

```bash
curl http://localhost:8787/api/book -X POST
```

Должен вернуть ошибку про отсутствие данных (но это значит, что API работает!).

---

## Если что-то не работает

### Контейнер не запущен:
```bash
docker compose ps
docker compose logs backend
```

### Порт не открыт:
```bash
ufw allow 8787/tcp
ufw status
```

### Ошибка с GEMINI_API_KEY:
```bash
cat /opt/storybook-learning/.env
# Проверьте, что GEMINI_API_KEY указан правильно
```

### Перезапуск:
```bash
docker compose restart backend
```


