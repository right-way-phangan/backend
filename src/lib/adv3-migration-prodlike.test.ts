/**
 * RED-TEAM РАУНД 3 — атаки на миграции, которые НЕ прошли.
 *
 * Раунд 2 закрыл дрейф снапшота добавлением 0032_schema_sync + meta-снапшота, но
 * проверял это на ЧИСТОЙ базе и на уровне таблиц. Здесь проверено то, что
 * реально ломается у людей: последовательность «прод» (часть миграций применена
 * руками, мимо __drizzle_migrations), полнота схемы на уровне КОЛОНОК и цепочка
 * prevId, от которой drizzle-kit считает следующий диф.
 *
 * Все три атаки провалились — раздел держится. Тесты остаются как регрессионный
 * гейт: они падают, если кто-то добавит колонку в schema.ts без миграции или
 * сгенерирует снапшот мимо цепочки.
 *   npx tsx --test src/lib/adv3-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { getTableName, is, Table } from "drizzle-orm";
import * as schema from "../db/schema";

const FOLDER = "./drizzle";

/** Имена колонок, объявленных в schema.ts, по таблицам. */
function declaredColumns(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const v of Object.values(schema)) {
    if (!is(v as never, Table)) continue;
    const cols = (v as unknown as Record<symbol, Record<string, { name: string }>>)[
      Symbol.for("drizzle:Columns")
    ];
    out.set(getTableName(v as never), new Set(Object.values(cols ?? {}).map((c) => c.name)));
  }
  return out;
}

// АТАКА 70 [CRITICAL, НЕ ПРОШЛА]: migrate() на «прод-подобной» базе
// | ГИПОТЕЗА: 4 миграции применялись к Neon ВРУЧНУЮ, поэтому их нет в
//   __drizzle_migrations; после того как раунд 1 внёс их в журнал, migrate()
//   на старте API попытается выполнить их снова → «already exists» → падение
// | ФАКТ: не воспроизводится. Все четыре написаны идемпотентно (ADD COLUMN IF
//   NOT EXISTS / CREATE TABLE IF NOT EXISTS / DO $$ duplicate_object), а
//   0027_contact_messages — единственная неидемпотентная из этой группы — в
//   журнале была изначально, то есть на проде применена самим migrate()
// | код: backend/drizzle/0027_needs_review.sql … 0030_match_profiles.sql
test("АТАКА 70: migrate() поверх вручную применённых миграций проходит", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "rw-mig-"));
  cpSync(FOLDER, tmp, { recursive: true });
  const j = JSON.parse(readFileSync(join(tmp, "meta/_journal.json"), "utf8")) as {
    entries: Array<{ idx: number }>;
  };
  // журнал, каким он был до фикса раунда 1 — до 0027_contact_messages включительно
  j.entries = j.entries.filter((e) => e.idx <= 27);
  writeFileSync(join(tmp, "meta/_journal.json"), JSON.stringify(j));

  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db as never, { migrationsFolder: tmp });
  // ... а эти четыре применяли руками
  for (const f of [
    "0027_needs_review.sql",
    "0028_lease_registered.sql",
    "0029_construction_updates.sql",
    "0030_match_profiles.sql",
  ]) {
    for (const stmt of readFileSync(join(FOLDER, f), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.exec(stmt);
    }
  }

  // старт API на такой базе
  await migrate(db as never, { migrationsFolder: FOLDER });
  const applied = await client.query<{ hash: string }>(
    "select hash from drizzle.__drizzle_migrations",
  );
  assert.equal(applied.rows.length, 33);
  await client.close();
});

// АТАКА 70a [CRITICAL, НЕ ПРОШЛА]: колонка из schema.ts без миграции
// | ГИПОТЕЗА: раунд 2 сверял снапшот со schema.ts только по ТАБЛИЦАМ и трём
//   колонкам — где-то ещё осталась колонка, которую запрос требует, а миграция
//   не создаёт (это ровно тот класс отказа: GET/POST /objects = 500)
// | ФАКТ: после migrate() с нуля в базе есть все колонки всех таблиц schema.ts
// | код: backend/drizzle/ + backend/src/db/schema.ts
test("АТАКА 70a: после migrate() в базе есть все колонки schema.ts", async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db as never, { migrationsFolder: FOLDER });
  const rows = await client.query<{ table_name: string; column_name: string }>(
    "select table_name, column_name from information_schema.columns where table_schema='public'",
  );
  const have = new Set(rows.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing: string[] = [];
  for (const [t, cols] of declaredColumns()) {
    for (const c of cols) if (!have.has(`${t}.${c}`)) missing.push(`${t}.${c}`);
  }
  assert.deepEqual(missing, []);
  await client.close();
});

// АТАКА 70b [HIGH, НЕ ПРОШЛА]: расхождение снапшота со schema.ts по колонкам
// | ГИПОТЕЗА: 0032_snapshot.json собран вручную и разошёлся со schema.ts —
//   следующий `db:generate` снова выдаст DDL на существующие объекты
// | ФАКТ: расхождений нет ни в одну сторону; цепочка prevId 0027 → 0032 цела,
//   то есть генератор возьмёт именно этот снапшот за базу
// | код: backend/drizzle/meta/0032_snapshot.json
test("АТАКА 70b: снапшот 0032 совпадает со schema.ts по колонкам и держит цепочку prevId", () => {
  const snap = JSON.parse(readFileSync(join(FOLDER, "meta/0032_snapshot.json"), "utf8")) as {
    prevId: string;
    tables: Record<string, { columns: Record<string, unknown> }>;
  };
  const inSnap = new Map(
    Object.entries(snap.tables).map(([k, t]) => [
      k.replace(/^public\./, ""),
      new Set(Object.keys(t.columns)),
    ]),
  );
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [t, cols] of declaredColumns()) {
    const s = inSnap.get(t) ?? new Set<string>();
    for (const c of cols) if (!s.has(c)) missing.push(`${t}.${c}`);
    for (const c of s) if (!cols.has(c)) extra.push(`${t}.${c}`);
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);

  const prev = JSON.parse(readFileSync(join(FOLDER, "meta/0027_snapshot.json"), "utf8")) as {
    id: string;
  };
  assert.equal(snap.prevId, prev.id);
});
