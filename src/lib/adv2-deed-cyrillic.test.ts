/**
 * RED-TEAM РАУНД 2: кириллическое название документа в правилах публикации.
 *
 * БЫЛО: REDACT_DEED и оба правила HARD_CONFIDENTIAL начинались с
 * `\b(chanote|чанот[а-я]*|title\s*deed)\b`. В JS `\b` считается по ASCII:
 * ни перед «ч», ни после «т» границы слова НЕ возникает (обе стороны —
 * не-ASCII-словесные символы), поэтому кириллическая альтернатива была мёртвой
 * веткой во всех трёх регулярках сразу: «Чанот № 13681» проходил насквозь и в
 * канал, и в БД. Словарь при этом знал одно слово — «Титул», «Nor Sor 3 Kor»,
 * «NS3K» не ловились вообще.
 *
 * ИСПРАВЛЕНО 2026-08-31: `\b` заменён явными lookaround по букве любой
 * письменности (`LETTER`), слово документа вынесено в `DEED_WORD` (capturing —
 * при редакции слово остаётся, вырезается только номер), индикатор номера — в
 * `DEED_INDICATOR`. Словарь расширен: `титул*`, `nor sor 3 (kor)`, `ns3k`.
 *
 * Цена вопроса зафиксирована в шапке publishable.ts и в CLAUDE.md: номер
 * документа публично раскрывает участок в LandsMaps до выхода на Land Office.
 *
 * Тесты стерегут фикс.
 *   npx tsx --test src/lib/adv2-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RealEstateObject } from "./domain";
import { redactConfidential, toPublishable, type PublishOk, type PublishBlocked } from "./publishable";
import { createObject } from "./write";

const base = (over: Partial<RealEstateObject> = {}): RealEstateObject =>
  ({
    id: 1,
    rwNumber: "RW-L0042",
    titleEn: "Участок в Шри Тану",
    type: "Land",
    status: "Active",
    district: "Sri Thanu",
    priceThb: 6_000_000,
    coverImage: "https://cdn.example/r2/aerial.jpg",
    gallery: ["https://cdn.example/r2/aerial.jpg"],
    ...over,
  }) as RealEstateObject;

// АТАКА 20 [CRITICAL]: «Чанот № 13681» редактируется наравне с латиницей
// | ИНВАРИАНТ: у RU и EN одинаковый результат — слово документа остаётся,
//   номер вырезан, в warnings есть запись о редакции
// | код: backend/src/lib/publishable.ts:167,174-182
test("АТАКА 20: русский «Чанот № 13681» редактируется так же, как латинский", () => {
  const w: string[] = [];
  assert.equal(
    redactConfidential("Чанот № 13681, дорога до участка есть.", w),
    "Чанот, дорога до участка есть.",
  );
  assert.deepEqual(w, ["из описания убран номер документа (чанот)"]);
  // латинский эквивалент — тот же результат
  assert.equal(
    redactConfidential("Chanote no. 13681, road access."),
    "Chanote, road access.",
  );
});

// АТАКА 20a [CRITICAL]: пост в канал уходит без номера, а fail-closed рубеж жив
// | ИНВАРИАНТ: RU-описание чистится ровно как EN; если номер дожил до сборки
//   поста в структурном поле (тайтл), объект блокируется, а не публикуется
// | код: backend/src/lib/publishable.ts:206-220
test("АТАКА 20a: RU-пост уходит без номера чанота, а в тайтле — блокируется", () => {
  const r = toPublishable(base({ descriptionManualRu: "Чанот № 13681. Ровный участок." }), {
    channel: "telegram",
    lang: "ru",
  });
  assert.equal(r.ok, true);
  assert.doesNotMatch((r as PublishOk).object.description!, /13681/);
  assert.equal((r as PublishOk).object.description, "Чанот. Ровный участок.");

  // тот же объект по-английски — номер вычищен из описания
  const en = toPublishable(base({ descriptionManualEn: "Chanote no. 13681. Flat plot." }), {
    channel: "telegram",
  });
  assert.equal(en.ok, true);
  assert.doesNotMatch((en as PublishOk).object.description!, /13681/);

  // структурное поле редакции не проходит — работает fail-closed рубеж
  const inTitle = toPublishable(
    base({ titleEn: "Чанот № 13681, Sri Thanu", descriptionManualRu: "Ровный участок." }),
    { channel: "telegram", lang: "ru" },
  );
  assert.equal(inTitle.ok, false);
  assert.match((inTitle as PublishBlocked).reasons.join(" "), /номер документа/);
});

// АТАКА 20b [CRITICAL]: тем же путём номер НЕ попадает в БАЗУ на записи
// | ИНВАРИАНТ: descriptionRaw сохраняется без номера документа — ради этого
//   redactConfidential и поставили на write-path (descriptionRaw уходит
//   в публичный payload /objects)
// | код: backend/src/lib/write.ts (createObject → redactConfidential)
test("АТАКА 20b: descriptionRaw пишется в БД без русского номера чанота", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("../db/schema");
  delete process.env.ANTHROPIC_API_KEY;

  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Parameters<typeof createObject>[0];
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  try {
    await createObject(db, {
      type: "Land",
      district: "Sri Thanu",
      description: "Собственник: чанот № 13681, продаёт срочно.",
    });
    const [row] = await db.select().from(schema.objects);
    assert.doesNotMatch(row.descriptionRaw!, /13681/);
    // слово документа остаётся — режется только номер
    assert.match(row.descriptionRaw!, /чанот/i);
  } finally {
    await client.close();
  }
});

// АТАКА 20c [HIGH]: словарь покрывает типовые названия тайских документов
// | ИНВАРИАНТ: «Титул», «Nor Sor 3 Kor», «NS3K» редактируются наравне с «Чанот» —
//   правило заявлено как fail-closed на номера документов, а не на одно слово
// | код: backend/src/lib/publishable.ts:174
test("АТАКА 20c: другие названия документов покрыты словарём", () => {
  const expected: Array<[string, string]> = [
    ["Титул № 13681", "Титул"],
    ["Nor Sor 3 Kor no. 13681", "Nor Sor 3 Kor"],
    ["NS3K № 13681", "NS3K"],
    ["Nor Sor 3 no. 13681", "Nor Sor 3"],
  ];
  for (const [src, want] of expected) {
    assert.equal(redactConfidential(src), want, src);
  }
});
