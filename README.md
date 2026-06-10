# Right Way — backend (своя БД + API)

Замена amoCRM. Фаза A — своя БД объектов (заменяет каталог 9077). Дальше — API и своя CRM (Фаза B). Решение и roadmap: [план запуска](../Right%20Way%20—%20план%20запуска.md) (Этап 0), memory `project_crm_migration_own_db`.

**Стек:** Postgres + Drizzle ORM (`drizzle-orm` / `drizzle-kit`) + `postgres` (postgres-js) + `tsx`. Сайт на Vercel остаётся на месте и ходит в API на VPS (БД слушает только localhost, в интернет не выставлена).

## Структура

- `src/db/schema.ts` — схема, зеркало `web/src/types/object.ts`. `objects` + `object_photos` + `object_docs` + `project_units`.
- `src/db/client.ts` — Drizzle-клиент (читает `DATABASE_URL`).
- `src/lib/amocrm-source.ts` — адаптер чтения каталога 9077 (порт `mapper.ts` + `projects/parse.ts`).
- `src/scripts/migrate-from-amocrm.ts` — одноразовая (повторяемая) миграция amoCRM → Postgres.
- `drizzle/` — сгенерированные SQL-миграции (после `npm run db:generate`).

## Запуск (локально / на VPS)

```bash
cd backend
cp .env.example .env          # заполнить AMOCRM_TOKEN (из корневого .env проекта)
npm install

# Postgres: на VPS или локально через Docker (когда установлен Docker):
docker compose up -d db
# либо локальный Homebrew Postgres — тогда поправить DATABASE_URL

npm run db:generate           # SQL-миграции из схемы (работает без живой БД)
npm run db:migrate            # применить к БД
npm run migrate:amocrm -- --dry   # прогон без записи: отчёт + образец строки
npm run migrate:amocrm        # залить ~60 объектов из каталога 9077
```

## Идемпотентность

`migrate:amocrm` делает upsert по `rw_number` и переписывает дочерние `object_photos` / `object_docs`. Можно гонять повторно в период параллельной работы (amoCRM ещё в проде) — БД будет догоняться под текущее состояние каталога.

## Что дальше (по плану)

- API на VPS (read/write) → сайт `getPublicObjects`/`getObjectByRwNumber` и `/admin/new` + Telegram-бот переключаются на него.
- Конфиденциальность: `object_docs.visibility = 'confidential'` для прайсов/комиссий застройщика — на уровне схемы/прав, без «удалять blob руками».
- Фаза B: `contacts` / `leads` / `pipelines` / `tasks` / `users`, auth (Auth.js), UI-канбан, миграция лидов, cut-over.
