#!/bin/bash

# Скрипт для первоначальной настройки сервера
# Использование: скопируйте на сервер и запустите

set -e

DEPLOY_PATH="${1:-/opt/storybook-learning}"
REPO_URL="${2:-https://github.com/alexsvk7/storybook-learning.git}"

echo "🚀 Настройка сервера для Storybook Learning"
echo "Путь установки: $DEPLOY_PATH"
echo ""

# Проверяем права root/sudo
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Этот скрипт требует sudo права"
    echo "Запустите: sudo bash $0"
    exit 1
fi

# Устанавливаем зависимости
echo "📦 Установка зависимостей..."
if command -v apt-get &> /dev/null; then
    # Ubuntu/Debian
    apt-get update
    apt-get install -y docker.io docker-compose git curl
elif command -v yum &> /dev/null; then
    # CentOS/RHEL
    yum install -y docker docker-compose git curl
    systemctl start docker
    systemctl enable docker
else
    echo "❌ Неподдерживаемая система. Установите Docker, Docker Compose и Git вручную."
    exit 1
fi

# Запускаем Docker
echo "🐳 Запуск Docker..."
systemctl start docker || true
systemctl enable docker || true

# Создаем пользователя для деплоя (опционально)
read -p "Создать отдельного пользователя для деплоя? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    DEPLOY_USER="deploy"
    if id "$DEPLOY_USER" &>/dev/null; then
        echo "Пользователь $DEPLOY_USER уже существует"
    else
        useradd -m -s /bin/bash $DEPLOY_USER
        usermod -aG docker $DEPLOY_USER
        echo "✅ Пользователь $DEPLOY_USER создан и добавлен в группу docker"
    fi
else
    DEPLOY_USER=$SUDO_USER
    usermod -aG docker $DEPLOY_USER
    echo "✅ Пользователь $DEPLOY_USER добавлен в группу docker"
fi

# Создаем директорию проекта
echo "📁 Создание директории проекта..."
mkdir -p $DEPLOY_PATH
chown $DEPLOY_USER:$DEPLOY_USER $DEPLOY_PATH

# Клонируем репозиторий
echo "📥 Клонирование репозитория..."
if [ -d "$DEPLOY_PATH/.git" ]; then
    echo "Репозиторий уже существует, пропускаем клонирование"
else
    sudo -u $DEPLOY_USER git clone $REPO_URL $DEPLOY_PATH
fi

# Создаем .env файл
echo "⚙️  Настройка .env файла..."
if [ -f "$DEPLOY_PATH/.env" ]; then
    echo "⚠️  .env файл уже существует, пропускаем"
else
    sudo -u $DEPLOY_USER cat > $DEPLOY_PATH/.env << 'EOF'
# Обязательные переменные
GEMINI_API_KEY=your_gemini_api_key_here

# Опциональные переменные
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
PROVIDER_TEXT=gemini
PROVIDER_IMAGE=gemini

# FaceID (опционально)
FACE_ID_ENABLED=false
FACE_ID_THRESHOLD=0.32
FACE_ID_MAX_ATTEMPTS=2

# Identity
IDENTITY_SIMILARITY_THRESHOLD=0.62

# Debug
DEBUG_BOOK=0
DEBUG_FACE_ID=false
EOF
    chmod 600 $DEPLOY_PATH/.env
    echo "✅ .env файл создан. НЕ ЗАБУДЬТЕ ОБНОВИТЬ GEMINI_API_KEY!"
fi

echo ""
echo "✅ Настройка сервера завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Отредактируйте .env файл: sudo nano $DEPLOY_PATH/.env"
echo "2. Добавьте ваш GEMINI_API_KEY"
echo "3. Настройте SSH ключ для GitHub Actions (см. GITHUB_DEPLOY.md)"
echo "4. Настройте GitHub Secrets (см. GITHUB_DEPLOY.md)"
echo ""
echo "Для первого запуска вручную:"
echo "  cd $DEPLOY_PATH"
echo "  docker-compose up -d"
echo ""








