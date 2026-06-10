# Деплой backend на VPS (cut-over с amoCRM)

Поднимает Postgres + API + Caddy (авто-TLS) одной командой. Сайт остаётся на Vercel и ходит в этот API. Решение/контекст — [план запуска](../Right%20Way%20—%20план%20запуска.md), memory `project_crm_migration_own_db`.

## 0. Что нужно
- VPS (Oracle Cloud Always Free — $0, регион Сингапур; либо Hetzner CAX11 ~$4.5/мес). Ubuntu + Docker + docker compose.
- Домен под API: A-запись `api.rightwaygroup.co` → IP сервера (до первого старта — Caddy выпустит сертификат).
- Сильный `API_TOKEN` (например `openssl rand -hex 32`) — общий для API, web и бота.

## 1. Поднять стек
```bash
# на VPS, в каталоге backend/
cp .env.vps.example .env.vps      # заполнить POSTGRES_PASSWORD, API_TOKEN, API_DOMAIN, AMOCRM_*
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build
curl https://api.rightwaygroup.co/health      # {"ok":true,"driver":"postgres"}
```
API на старте сам применяет миграции (`drizzle/`) — отдельный шаг не нужен.

## 2. Залить данные из amoCRM (в контейнере api)
```bash
DC="docker compose -f docker-compose.vps.yml --env-file .env.vps"
$DC exec api npm run migrate:amocrm -- --dry  # сухой прогон: что загрузится / отсеется
$DC exec api npm run migrate:amocrm           # объекты → ~141 шт + ~60 off-plan юнитов в project_units
$DC exec api npm run migrate:leads -- --dry --tag=website   # проверить срез RW
$DC exec api npm run migrate:leads -- --tag=website         # ТОЛЬКО лиды Right Way (не legacy Circle!)
```
> ⚠️ **Объекты.** Миграция применяет cut-over-фильтр (`lib/cutover.ts`): из ~203 элементов каталога грузятся **только реальные листинги (~141)**. Off-plan unit-подкарточки `RW-P####-N` (~60 шт) откладываются под будущую таблицу `project_units`; тест/sentinel-карточки (`ZZTEST-*`, «DELETE ME») отбрасываются. Сухой прогон печатает точную раскладку. Стрэй-карточку можно добить вручную: `migrate:amocrm -- --exclude=1412995,1412997`.
> ⚠️ **Лиды.** Аккаунт amoCRM унаследован от Circle: из ~415 лидов лишь ~6 — Right Way. Всегда `--tag=website` (или `--since=YYYY-MM-DD`), иначе затащите 409 чужих лидов.

## 3. Переключить сайт (Vercel) и бота
Vercel → Environment Variables (Production), затем redeploy:
```
OBJECTS_API_URL    = https://api.rightwaygroup.co
OBJECTS_API_TOKEN  = <тот же API_TOKEN>
AUTH_SECRET        = <openssl rand -hex 32>   # включает сессии /admin/* вместо Basic Auth
```
Создать логин(ы) команды в контейнере api (без поштучных лицензий):

```bash
$DC exec api npm run create-user -- vladimir@rightwaygroup.co '<пароль>' admin
```

Бот (на VPS/где запущен) — те же `OBJECTS_API_URL` + `OBJECTS_API_TOKEN` в env, перезапустить. Бот переключается на свою БД (create/read/edit/list); фото объектов по-прежнему в Drive, лидов — Telegram-пинг сохраняется.

## 4. Проверка cut-over
- Сайт `/listings` отдаёт объекты из своей БД (не amoCRM).
- Форма заявки → лид в `/admin/crm`.
- Бот: `/my`, `/find`, `/edit`, создание объекта → своя БД.
- **Только после проверки** на реальном трафике — отключать подписку amoCRM.

## 5. Бэкапы и обслуживание
- `rclone config` (remote `gdrive`), затем cron: `0 3 * * * cd /opt/rightway/backend && ./scripts/backup.sh` (см. `scripts/backup.sh` — nightly pg_dump → Drive, хранение 30 дней).
- Обновление: `git pull && docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build` (миграции применятся на старте).
- Хардненинг: firewall (открыть только 80/443/22), fail2ban, обновления.

## Бот на VPS (опционально, если переносим с MacBook)
Python-бот (`bot/`) можно гонять на том же VPS через systemd:
```
# /etc/systemd/system/rw-intake-bot.service
[Service]
WorkingDirectory=/opt/rightway/bot
Environment=OBJECTS_API_URL=https://api.rightwaygroup.co
Environment=OBJECTS_API_TOKEN=<API_TOKEN>
EnvironmentFile=/opt/rightway/bot/.env
ExecStart=/opt/rightway/bot/venv/bin/python3 intake_bot.py
Restart=always
```

## Локальная разработка (без VPS)
```bash
npm install
npm run load:local        # PGlite в ./.pgdata: миграции + объекты из amoCRM + сид CRM
npm run api:local         # API на PGlite (http://localhost:8787)
# сайт: cd ../web && OBJECTS_API_URL=http://localhost:8787 npm run dev
```
