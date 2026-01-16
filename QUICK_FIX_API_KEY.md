# ⚡ Быстрое исправление API ключа

## Выполните на сервере:

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning
nano .env
```

### Проверьте/добавьте строку:
```
GEMINI_API_KEY=ваш_ключ_здесь
```

**Без пробелов, без кавычек!**

### Сохраните:
- `Ctrl + X`
- `Y`
- `Enter`

### Перезапустите:
```bash
docker compose restart backend
```

### Проверьте логи:
```bash
docker compose logs backend | tail -20
```

Должно быть: `Using PROVIDER_TEXT=gemini` без ошибок.

---

## Если нет ключа:

1. Откройте: https://aistudio.google.com/apikey
2. Создайте новый ключ
3. Скопируйте его
4. Добавьте в .env файл как показано выше

---

## Готово!

Попробуйте снова через Lovable.








