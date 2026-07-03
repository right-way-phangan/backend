# Деплой backend

**Прод сегодня: Vercel + Neon** (`rightway-api.vercel.app`). Секции про VPS/Docker — **план Б (НЕ активен)**: `api.rightwaygroup.co` не поднят (NXDOMAIN). Контекст — memory `project_crm_migration_own_db`, `reference_backend_vercel_deploy_migrations`.

## Прод (Vercel + Neon) — как деплоится на самом деле

1. **Vercel деплоит ЗАКОММИЧЕННЫЙ бандл `api/index.js`** (buildCommand в vercel.json нет). Изменил исходники → обязан пересобрать и закоммитить бандл:

   ```bash
   npm run build && git add api/index.js && git commit && git push
   ```

   CI-страж (`.github/workflows/ci.yml`) валит PR/пуш, если бандл отстал от исходников (аудит 07-03: прод молча отставал на 5 коммитов).
2. **🔴 Миграции — ВРУЧНУЮ и ДО кода** (иначе каталог падает):

   ```bash
   npm run db:migrate        # DATABASE_URL из .env (Neon)
   ```

   Миграции ведёт одна сессия (коллизия номеров — перегенерацией). Скилы `backend-db`, `admin-feature`.
3. Проверка: `curl https://rightway-api.vercel.app/health` → `{"ok":true,"driver":"postgres"}`.

Env прода (Vercel → Environment Variables): `DATABASE_URL` (Neon), `API_TOKEN`; на стороне web — `OBJECTS_API_URL`, `OBJECTS_API_TOKEN`, `AUTH_SECRET`.

Пользователи админки: `npm run create-user -- <email> '<пароль>' admin` (локально с прод-`DATABASE_URL`).

## Локальная разработка (без сети)

```bash
npm install
npm run load:local        # PGlite в ./.pgdata: миграции + сид
npm run api:local         # API на PGlite (http://localhost:8787)
# сайт: cd ../web && OBJECTS_API_URL=http://localhost:8787 npm run dev
npm run typecheck && npm test
```

---

## План Б: self-host на VPS (НЕ активен — знание для DR)

Поднимает Postgres + API + Caddy (авто-TLS) одной командой; сайт остаётся на Vercel и ходит в этот API. Нужно: VPS с Docker (Hetzner уже есть — `ssh rw-vps`), A-запись `api.rightwaygroup.co` → IP, сильный `API_TOKEN`.

```bash
# на VPS, в каталоге backend/
cp .env.vps.example .env.vps      # POSTGRES_PASSWORD, API_TOKEN, API_DOMAIN
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build
curl https://api.rightwaygroup.co/health
```
API на старте сам применяет миграции. Данные — восстановить из ночного дампа ops-репо (`pg_restore`), НЕ из amoCRM-миграции.

Переключение сайта: Vercel env `OBJECTS_API_URL=https://api.rightwaygroup.co` + redeploy. Бэкапы: `scripts/backup.sh` (pg_dump → Drive/rclone). Хардненинг: firewall 80/443/22, fail2ban.

## Историческое (амоCRM cut-over, завершён 2026-06-10)

Одноразовые команды миграции из amoCRM (`migrate:amocrm`, `migrate:leads`, cut-over-фильтр `lib/cutover.ts`, воронка «Разбор (legacy)») — выполнены; описание в git-истории этого файла. amoCRM read-only до отключения; **новые объекты/лиды — только своя БД**. intake-бот ОТКЛЮЧЁН 2026-07-02 (объекты через `/admin/new`).
