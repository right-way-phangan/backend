/**
 * RED-TEAM РАУНД 2: мина, оставленная фиксом журнала миграций.
 *
 * БЫЛО: раунд 1 нашёл, что 4 миграции лежали файлами мимо meta/_journal.json,
 * и дописал их в журнал — но НЕ создал под них снапшоты в drizzle/meta/.
 * drizzle-kit генерирует следующую миграцию как диф «schema.ts минус ПОСЛЕДНИЙ
 * найденный снапшот», а последним был 0027_snapshot.json, в котором ни
 * match_profiles, ни needs_review/lease_registered/construction_updates нет.
 * Значит следующий же `npm run db:generate` выдавал бы миграцию, повторно
 * создающую уже созданное, без IF NOT EXISTS → migrate() на старте API падал
 * бы с «already exists».
 *
 * ИСПРАВЛЕНО 2026-08-31: добавлены идемпотентная миграция
 * drizzle/0032_schema_sync.sql (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
 * EXISTS / DO $$ … duplicate_object) и снапшот meta/0032_snapshot.json,
 * описывающий схему целиком. Дрейф устранён: снапшот, от которого считается
 * следующий диф, знает обо всех применённых объектах.
 *
 * Тесты стерегут фикс; 17c остаётся ХАРАКТЕРИЗУЮЩИМ (легаси-сдвиг номеров).
 *   npx tsx --test src/lib/adv2-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { getTableName, is, Table } from "drizzle-orm";
import * as schema from "../db/schema";

let client: PGlite;
let db: ReturnType<typeof drizzle>;

const journal = () =>
  JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };

const snapshotIdxs = () =>
  readdirSync("./drizzle/meta")
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .map((f) => parseInt(f.slice(0, 4), 10));

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

after(async () => {
  await client.close();
});

// АТАКА 17 [HIGH]: снапшот, от которого drizzle-kit считает следующий диф, есть
// | ИНВАРИАНТ: последняя запись журнала имеет свой meta/<idx>_snapshot.json —
//   именно он берётся генератором за базу. Осиротевшие снапшоты в середине
//   истории (28-31) безвредны: генератор смотрит только на максимум
// | код: backend/drizzle/meta/_journal.json + backend/drizzle/meta/0032_snapshot.json
test("АТАКА 17: у последней записи журнала есть снапшот", () => {
  const entries = journal().entries;
  const last = entries[entries.length - 1];
  const snaps = snapshotIdxs();
  assert.equal(snaps.includes(last.idx), true, `нет meta/${last.idx}_snapshot.json`);
  assert.equal(
    Math.max(...snaps),
    last.idx,
    "максимальный снапшот должен совпадать с последней записью журнала",
  );
});

// АТАКА 17a [HIGH]: базовый снапшот описывает схему целиком
// | ИНВАРИАНТ: снапшот-максимум содержит все таблицы schema.ts и все колонки,
//   которые раньше были «невидимы» генератору. Расхождение здесь = будущий
//   `db:generate` снова выдаст DDL на уже существующие объекты
// | код: backend/drizzle/meta/0032_snapshot.json
test("АТАКА 17a: базовый снапшот знает обо всех таблицах schema.ts", () => {
  const idx = Math.max(...snapshotIdxs());
  const snap = JSON.parse(
    readFileSync(`./drizzle/meta/${String(idx).padStart(4, "0")}_snapshot.json`, "utf8"),
  ) as { tables: Record<string, { columns: Record<string, unknown> }> };
  const inSnap = new Set(Object.keys(snap.tables).map((k) => k.replace(/^public\./, "")));

  const declared = Object.values(schema)
    // `is(v, Table)` сужает к общему Table, а значения schema — конкретные
    // PgTableWithColumns: предикат к ним не присваивается, поэтому фильтруем
    // без сужения и приводим уже на использовании.
    .filter((v) => is(v, Table))
    .map((t) => getTableName(t as Table));
  const missing = declared.filter((t) => !inSnap.has(t));
  assert.deepEqual(missing, [], "таблицы schema.ts, которых нет в снапшоте");

  // колонки, ради которых и был дрейф
  const cols = snap.tables["public.objects"].columns;
  for (const c of ["needs_review", "lease_registered", "construction_updates"]) {
    assert.equal(c in cols, true, `снапшот не знает про objects.${c}`);
  }
});

// АТАКА 17b [CRITICAL]: миграция, закрывшая дрейф, идемпотентна
// | ИНВАРИАНТ: 0032_schema_sync.sql выполняется повторно на уже мигрированной
//   БД без ошибки. Именно это отличает её от того DDL, что раньше генерировал
//   drizzle-kit (CREATE TABLE / ADD COLUMN без IF NOT EXISTS → «already exists»
//   → applyMigrations() валит старт API, src/api/app.ts)
// | код: backend/drizzle/0032_schema_sync.sql
test("АТАКА 17b: 0032_schema_sync.sql применяется повторно без ошибок", async () => {
  const sql = readFileSync("./drizzle/0032_schema_sync.sql", "utf8");
  const stmts = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(stmts.length >= 4, "миграция не должна быть пустой");
  for (const stmt of stmts) {
    await client.exec(stmt); // бросит, если DDL не идемпотентен
  }
  // контроль: неидемпотентный вариант того же DDL по-прежнему падает —
  // тест ловит именно IF NOT EXISTS, а не «pglite всё прощает»
  await assert.rejects(
    () => client.exec(`ALTER TABLE "objects" ADD COLUMN "needs_review" boolean DEFAULT false;`),
    /already exists/i,
  );
});

// АТАКА 17c [MEDIUM]: НЕ ЗАКРЫТО (легаси) — коллизия 0027_contact_messages /
// 0027_needs_review оставила сдвиг «префикс файла ≠ idx журнала»
// | ОЖИДАЕТСЯ: префикс файла миграции = его idx (инвариант drizzle-kit)
// | ФАКТ: записи 28-31 сдвинуты на единицу и такими и останутся — переименование
//   файлов сломало бы уже применённые хэши в проде. Хвост журнала выровнен
//   (32 = 0032_schema_sync), поэтому новые снапшоты снова именуются корректно
// | код: backend/drizzle/meta/_journal.json
test("АТАКА 17c: легаси-сдвиг номеров зафиксирован, хвост журнала выровнен", () => {
  const entries = journal().entries;
  const mismatched = entries
    .filter((e) => parseInt(e.tag.slice(0, 4), 10) !== e.idx)
    .map((e) => `${e.idx}:${e.tag}`);
  assert.deepEqual(mismatched, [
    "28:0027_needs_review",
    "29:0028_lease_registered",
    "30:0029_construction_updates",
    "31:0030_match_profiles",
  ]);
  const last = entries[entries.length - 1];
  assert.equal(parseInt(last.tag.slice(0, 4), 10), last.idx, "хвост журнала должен быть выровнен");
});
