/**
 * RED-TEAM: расхождение «код vs миграции».
 *
 * Правило проекта — «миграции ВРУЧНУЮ и ДО кода» (reference_backend_vercel_deploy_migrations).
 * Побочный эффект: четыре .sql лежали в drizzle/, но НЕ были прописаны в
 * drizzle/meta/_journal.json, а migrate() читает ТОЛЬКО журнал — на любой базе,
 * собранной из репозитория (локальная разработка, VPS, DR-восстановление схемы),
 * этих колонок/таблиц не оказывалось, хотя schema.ts требует их в каждом запросе.
 *
 * ИСПРАВЛЕНО 2026-08-31: все четыре внесены в журнал, а 0027/0029 приведены к
 * идемпотентному виду (ADD COLUMN IF NOT EXISTS) — на проде, где их применяли
 * руками, повторный прогон migrate() не падает.
 *
 * Тесты стерегут инвариант: миграционная папка описывает боевую схему целиком.
 *   npx tsx --test src/lib/adv-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";

let client: PGlite;
let db: ReturnType<typeof drizzle>;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

after(async () => {
  await client.close();
});

// АТАКА 4 [CRITICAL]: собрать БД строго из drizzle/ (как делает applyMigrations()
// при каждом старте API вне Vercel — src/api/app.ts:88-92) и обратиться к каталогу
// | ОЖИДАЕТСЯ: миграционная папка полностью описывает боевую схему; после migrate()
//   API работает — это и есть путь DR-восстановления и деплоя на VPS
// | БЫЛО: 4 миграции (0027_needs_review, 0028_lease_registered, 0029_construction_updates,
//   0030_match_profiles) не были внесены в meta/_journal.json → migrate() их молча
//   пропускал, и схема оставалась без колонок из каждого select/insert
// | ИСПРАВЛЕНО 2026-08-31 | код: backend/drizzle/meta/_journal.json + src/db/connect.ts:35-37
test("АТАКА 4: каждый .sql из drizzle/ прописан в _journal.json", () => {
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const tags = new Set(journal.entries.map((e) => e.tag));
  const files = readdirSync("./drizzle")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""));
  const orphans = files.filter((f) => !tags.has(f)).sort();
  // Ни одного файла мимо журнала: иначе миграция невидима для migrate().
  assert.deepEqual(orphans, []);
});

test("АТАКА 4a: после migrate() у objects есть все колонки, которые требует schema.ts", async () => {
  const cols = await client.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'objects'",
  );
  const have = new Set(cols.rows.map((r) => r.column_name));
  assert.ok(have.has("coords_approx"));
  // бывшие осиротевшие — теперь на месте
  assert.ok(have.has("needs_review"));
  assert.ok(have.has("lease_registered"));
  assert.ok(have.has("construction_updates"));

  const tables = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  assert.ok(tables.rows.some((r) => r.table_name === "match_profiles"));
});

// АТАКА 4b [CRITICAL]: следствие — весь публичный каталог падал, а не деградировал:
// drizzle перечисляет все колонки явно, поэтому ломались и чтение, и запись
// (GET /objects → 500, POST /objects → 500), то есть свежеподнятый по репозиторию
// инстанс API не отдавал ни одного объекта. Теперь путь DR-восстановления рабочий.
test("АТАКА 4b: SELECT/INSERT по objects работают на схеме, собранной из drizzle/", async () => {
  assert.deepEqual(await db.select().from(schema.objects), []);
  await db.insert(schema.objects).values({ rwNumber: "RW-L9999" });
  assert.equal((await db.select().from(schema.objects)).length, 1);
  assert.deepEqual(await db.select().from(schema.matchProfiles), []);
});
