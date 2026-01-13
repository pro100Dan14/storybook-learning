#!/bin/bash

# Скрипт для ручного деплоя на сервер
# Использование: ./scripts/deploy.sh

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Начинаем деплой...${NC}"

# Проверяем наличие переменных окружения
if [ -z "$SERVER_HOST" ] || [ -z "$SERVER_USER" ]; then
    echo -e "${RED}❌ Ошибка: SERVER_HOST и SERVER_USER должны быть установлены${NC}"
    echo "Пример:"
    echo "export SERVER_HOST=your-server.com"
    echo "export SERVER_USER=deploy"
    echo "export DEPLOY_PATH=/opt/storybook-learning"
    exit 1
fi

DEPLOY_PATH="${DEPLOY_PATH:-/opt/storybook-learning}"
SSH_KEY="${SSH_KEY:-~/.ssh/id_rsa}"
SSH_PORT="${SSH_PORT:-22}"

echo -e "${YELLOW}📋 Параметры деплоя:${NC}"
echo "  Сервер: $SERVER_USER@$SERVER_HOST"
echo "  Путь: $DEPLOY_PATH"
echo "  SSH ключ: $SSH_KEY"
echo ""

# Копируем файлы на сервер
echo -e "${GREEN}📤 Копирование файлов на сервер...${NC}"
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
    -e "ssh -p $SSH_PORT -i $SSH_KEY" \
    ./ $SERVER_USER@$SERVER_HOST:$DEPLOY_PATH/

# Выполняем команды на сервере
echo -e "${GREEN}🔧 Выполнение команд на сервере...${NC}"
ssh -p $SSH_PORT -i $SSH_KEY $SERVER_USER@$SERVER_HOST << 'ENDSSH'
set -e
cd $DEPLOY_PATH

# Если используется Docker
if [ -f docker-compose.yml ]; then
    echo "🐳 Обновление через Docker..."
    
    # Останавливаем старые контейнеры
    docker-compose down || true
    
    # Пересобираем
    docker-compose build --no-cache
    
    # Запускаем
    docker-compose up -d
    
    # Ждем запуска
    sleep 5
    
    # Проверяем health
    curl -f http://localhost:8787/health || echo "⚠️ Health check failed"
    
    echo "✅ Docker деплой завершен"
else
    echo "📦 Обновление через npm..."
    
    # Устанавливаем зависимости
    if [ -f package.json ]; then
        npm install --production
    fi
    
    if [ -d server ] && [ -f server/package.json ]; then
        cd server
        npm install --production
        cd ..
    fi
    
    # Перезапускаем через PM2
    if command -v pm2 &> /dev/null; then
        pm2 restart storybook-backend || pm2 start server/index.js --name storybook-backend
        pm2 save
    fi
    
    echo "✅ Node.js деплой завершен"
fi

echo "🎉 Деплой успешно завершен!"
ENDSSH

echo -e "${GREEN}✅ Деплой завершен!${NC}"


