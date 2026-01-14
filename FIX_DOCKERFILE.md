# 🔧 Исправление: Dockerfile не найден

## Проблема
`docker-compose.yml` ищет `Dockerfile` в директории `server/`, но его там нет (есть только `Dockerfile.bin`).

## Решение

### Вариант 1: Скопировать Dockerfile.bin в Dockerfile

**На сервере выполните:**

```bash
cd /opt/storybook-learning/server
cp Dockerfile.bin Dockerfile
```

Затем вернитесь в корень и запустите снова:

```bash
cd /opt/storybook-learning
docker compose up -d
```

---

### Вариант 2: Изменить docker-compose.yml

Если хотите использовать Dockerfile.bin напрямую, измените `docker-compose.yml`:

```yaml
dockerfile: Dockerfile.bin
```

Но проще использовать вариант 1.

---

## После исправления

Запустите снова:

```bash
cd /opt/storybook-learning
docker compose up -d
docker compose ps
docker compose logs backend
```





