# 🔧 Исправление "docker-compose: command not found"

## Проблема
В новых версиях Docker, `docker-compose` может быть недоступен, но встроен как плагин.

## Решение

### Вариант 1: Использовать новую команду (пробел вместо дефиса)

Попробуйте:

```bash
docker compose up -d
```

(Обратите внимание: `docker compose` с пробелом, не дефис!)

---

### Вариант 2: Установить docker-compose отдельно

Если первый вариант не сработал:

```bash
# Устанавливаем docker-compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Делаем исполняемым
chmod +x /usr/local/bin/docker-compose

# Проверяем
docker-compose --version
```

---

### Вариант 3: Установить через pip (если есть Python)

```bash
apt install -y python3-pip
pip3 install docker-compose
```

---

## После установки

Попробуйте снова:

```bash
docker compose up -d
# или
docker-compose up -d
```

---

## Если Docker не установлен вообще

```bash
# Установка Docker
apt update
apt install -y docker.io
systemctl start docker
systemctl enable docker

# Затем установите docker-compose по варианту 2 выше
```








