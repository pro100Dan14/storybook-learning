# ⚡ Быстрый старт - Настройка деплоя

## Шаг 1: Подготовка сервера (5 минут)

### На сервере выполните:

```bash
# Скопируйте и запустите скрипт настройки
sudo bash scripts/setup-server.sh

# Или вручную:
sudo apt update
sudo apt install -y docker.io docker-compose git
sudo mkdir -p /opt/storybook-learning
sudo chown $USER:$USER /opt/storybook-learning
cd /opt/storybook-learning
git clone https://github.com/ВАШ-USERNAME/storybook-learning.git .

# Создайте .env файл
nano .env
# Добавьте: GEMINI_API_KEY=ваш_ключ
```

## Шаг 2: Настройка SSH ключа (3 минуты)

### На вашем компьютере:

```bash
# Создайте SSH ключ
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy

# Скопируйте на сервер
ssh-copy-id -i ~/.ssh/github_deploy.pub user@your-server.com

# Скопируйте приватный ключ (нужен для GitHub)
cat ~/.ssh/github_deploy
```

## Шаг 3: Настройка GitHub Secrets (2 минуты)

1. Откройте GitHub репозиторий → **Settings** → **Secrets and variables** → **Actions**
2. Добавьте секреты:

   - `SERVER_HOST` = IP или домен вашего сервера
   - `SERVER_USER` = пользователь SSH (например, `deploy` или `root`)
   - `SERVER_SSH_KEY` = приватный SSH ключ (весь файл, включая BEGIN/END)

## Шаг 4: Первый деплой (автоматически)

Просто сделайте push в main:

```bash
git add .
git commit -m "Настройка деплоя"
git push origin main
```

GitHub Actions автоматически задеплоит на сервер! 🚀

## ✅ Проверка

После деплоя проверьте:

```bash
# На сервере
docker-compose ps
curl http://localhost:8787/health
```

---

**Полная документация:** [GITHUB_DEPLOY.md](./GITHUB_DEPLOY.md)

