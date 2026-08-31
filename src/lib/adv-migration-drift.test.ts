/**
 * RED-TEAM: расхождение «код vs миграции».
 *
 * Правило проекта — «миграции ВРУЧНУЮ и ДО кода» (reference_backend_vercel_deploy_migrations).
 * Побочный эффект: четыре .sql лежат в drizzle/, но НЕ прописаны в
 * drizzle/meta/_journal.json. drizzle-kit migrate() читает ТОЛЬКО журнал, поэтому
 * на любой базе, собранной из репозитория (локальная разработка, VPS, DR-восстановление
 * схемы), этих колонок/таблиц не будет — а schema.ts их требует.
 *
 * Тесты ЗЕЛЁНЫЕ: фиксируют фактическое (сломанное) состояние.
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
// | ФАКТ: 4 миграции (0027_needs_review, 0028_lease_registered, 0029_construction_updates,
//   0030_match_profiles) не внесены в meta/_journal.json → migrate() их молча пропускает.
//   Схема остаётся без колонок, которые schema.ts перечисляет в КАЖДОМ select/insert
// | код: backend/drizzle/meta/_journal.json (28 записей на 32 файла) + src/db/connect.ts:35-37
test("АТАКА 4: 4 миграции есть файлами, но отсутствуют в _journal.json — migrate() их не применяет", () => {
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const tags = new Set(journal.entries.map((e) => e.tag));
  const files = readdirSync("./drizzle")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""));
  const orphans = files.filter((f) => !tags.has(f)).sort();
  assert.deepEqual(orphans, [
    "0027_needs_review",
    "0028_lease_registered",
    "0029_construction_updates",
    "0030_match_profiles",
  ]);
});

test("АТАКА 4a: после migrate() у objects нет колонок, которые требует schema.ts", async () => {
  const cols = await client.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'objects'",
  );
  const have = new Set(cols.rows.map((r) => r.column_name));
  // применённые миграции — есть
  assert.ok(have.has("coords_approx"));
  // осиротевшие — нет
  assert.equal(have.has("needs_review"), false);
  assert.equal(have.has("lease_registered"), false);
  assert.equal(have.has("construction_updates"), false);

  const tables = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  assert.equal(tables.rows.some((r) => r.table_name === "match_profiles"), false);
});

// АТАКА 4b [CRITICAL]: следствие — весь публичный каталог падает, а не деградирует.
// Drizzle перечисляет все колонки явно, поэтому ломается и чтение, и запись:
// GET /objects → 500, POST /objects → 500. То есть свежеподнятый по репозиторию
// инстанс API не отдаёт ни одного объекта.
test("АТАКА 4b: SELECT/INSERT по objects падает на схеме, собранной из drizzle/", async () => {
  await assert.rejects(
    () => db.select().from(schema.objects),
    (err: Error) => /needs_review|does not exist/.test(String((err as { cause?: Error }).cause?.message ?? err.message)),
  );
  await assert.rejects(
    () => db.insert(schema.objects).values({ rwNumber: "RW-L9999" }),
    (err: Error) => /does not exist/.test(String((err as { cause?: Error }).cause?.message ?? err.message)),
  );
  await assert.rejects(
    () => db.select().from(schema.matchProfiles),
    (err: Error) => /does not exist/.test(String((err as { cause?: Error }).cause?.message ?? err.message)),
  );
});
