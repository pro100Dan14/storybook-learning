# ✅ Исправление Dockerfile - Выполните на сервере

## Вариант 1: Скопировать Dockerfile.bin (быстро)

**На сервере выполните:**

```bash
cd /opt/storybook-learning/server
cp Dockerfile.bin Dockerfile
cd /opt/storybook-learning
docker compose up -d
```

---

## Вариант 2: Получить обновленный файл из GitHub

**На вашем компьютере** сначала закоммитьте новый Dockerfile:

```bash
git add server/Dockerfile
git commit -m "Add Dockerfile for deployment"
git push
```

**Затем на сервере обновите код:**

```bash
cd /opt/storybook-learning
git pull
docker compose up -d
```

---

## После запуска проверьте:

```bash
docker compose ps
docker compose logs backend
curl http://localhost:8787/health
```








