# 🔧 Исправление конфликта зависимостей

## Проблема
Конфликт версий между `@tensorflow/tfjs-node@4.15.0` и `@tensorflow-models/face-landmarks-detection`.

---

## Решение: Установка с --legacy-peer-deps

```bash
ssh root@162.120.18.86
cd /opt/storybook-learning
docker compose exec backend npm install @tensorflow-models/face-landmarks-detection --legacy-peer-deps
docker compose restart backend
```

---

## Альтернатива: Обновить версии TensorFlow

Если первый вариант не сработает, можно обновить @tensorflow/tfjs-node до версии, совместимой с face-landmarks-detection.

---

## После установки

Проверьте логи:
```bash
docker compose logs backend | tail -30
```

Ошибка "Identity guard unavailable" должна исчезнуть.








