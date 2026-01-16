# ⚡ Быстрая настройка Cloudflare Tunnel

## Самый быстрый способ (для теста):

```bash
ssh root@162.120.18.86

# Установите cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Запустите туннель (временный, для теста)
cloudflared tunnel --url http://localhost:8787
```

Эта команда выведет HTTPS URL типа:
```
https://xxxx-xx-xx-xxx-xxx.xx.xx.cfargotunnel.com
```

Используйте этот URL в Lovable как `API_BASE_URL`.

---

## Для постоянного использования:

1. Зарегистрируйтесь на https://dash.cloudflare.com (бесплатно)
2. Следуйте инструкциям в `CLOUDFLARE_TUNNEL_SETUP.md`
3. Настройте туннель как сервис








