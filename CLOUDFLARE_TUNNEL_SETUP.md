# 🔐 Настройка Cloudflare Tunnel для HTTPS

## Проблема
Lovable работает по HTTPS, а бекенд по HTTP. Браузеры блокируют HTTP запросы с HTTPS страниц.

## Решение: Cloudflare Tunnel

Cloudflare Tunnel создает безопасное HTTPS соединение к вашему HTTP бекенду.

---

## Шаг 1: Установка cloudflared на сервере

```bash
ssh root@162.120.18.86

# Для Ubuntu/Debian
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
dpkg -i cloudflared.deb

# Или для других систем
# wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
# chmod +x cloudflared-linux-amd64
# mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
```

---

## Шаг 2: Авторизация в Cloudflare

```bash
cloudflared tunnel login
```

Откроется браузер, нужно авторизоваться в Cloudflare.

---

## Шаг 3: Создание туннеля

```bash
# Создайте туннель
cloudflared tunnel create storybook-backend

# Это создаст директорию ~/.cloudflared/ с конфигурацией
```

---

## Шаг 4: Настройка конфигурации

```bash
nano ~/.cloudflared/config.yml
```

Добавьте:

```yaml
tunnel: <tunnel-id-из-предыдущей-команды>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: storybook-backend.yourdomain.com
    service: http://localhost:8787
  - service: http_status:404
```

**Если у вас нет домена**, можно использовать бесплатный домен Cloudflare:

```yaml
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - service: http://localhost:8787
```

Это создаст URL типа: `https://<random-id>.cfargotunnel.com`

---

## Шаг 5: Запуск туннеля

```bash
# Тестовый запуск
cloudflared tunnel run storybook-backend

# Или как сервис
cloudflared service install
systemctl start cloudflared
systemctl enable cloudflared
```

---

## Шаг 6: Обновление URL в Lovable

После запуска туннеля, обновите `API_BASE_URL` в Lovable на HTTPS URL из туннеля.

---

## Альтернатива: Быстрый тест без домена

Если нужно быстро протестировать:

```bash
cloudflared tunnel --url http://localhost:8787
```

Это создаст временный HTTPS URL, который можно использовать для теста.








