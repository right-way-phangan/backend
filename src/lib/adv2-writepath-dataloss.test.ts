/**
 * RED-TEAM РАУНД 2: редакция на пути записи теряла данные НЕОБРАТИМО.
 *
 * БЫЛО: redactConfidential выбрасывала целиком строку, в которой сработал
 * CONTACT_LINE_RE. Внутри него телефон был описан как «цифра + 7 любых символов
 * из [цифры/пробел/дефис/скобки/точка] + цифра» — под это подходила цена
 * участка с пробелами («8 500 000 THB»), номер кадастрового листа, диапазон
 * цен, любой длинный ID. Пока это был только гейт публикации, потеря была
 * косметической (пост собирается заново из БД), но после фикса раунда 1 та же
 * функция стоит на createObject, а descriptionRaw — «богатый блок бота
 * дословно». Строки исчезали ИЗ БАЗЫ, и на 201 Created никто не замечал.
 *
 * ИСПРАВЛЕНО 2026-08-31: CONTACT_LINE_RE заменён массивом CONTACT_PATTERNS,
 * найденный контакт ЗАМЕНЯЕТСЯ на пустую строку вместо вырезания всей строки.
 * Телефон требует `+` либо 9+ цифр подряд, плюс эвристика MONEY_NEAR: строка
 * с денежным маркером и без явного «+телефона» — это цена, её не трогают.
 *
 * 31c остаётся ХАРАКТЕРИЗУЮЩИМ: warnings из write-path по-прежнему не доезжают
 * до вызывающего.
 *   npx tsx --test src/lib/adv2-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createObject } from "./write";
import { redactConfidential } from "./publishable";

delete process.env.ANTHROPIC_API_KEY;

let client: PGlite;
let db: AnyPgDatabase;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

after(async () => {
  await client.close();
});

// АТАКА 31 [CRITICAL]: цена в батах с пробелами больше не читается как телефон
// | ИНВАРИАНТ: цена — главный факт объявления, строка с ней остаётся целиком и
//   без предупреждений; настоящий телефон при этом по-прежнему вырезается, и
//   только он, а не вся строка вокруг
// | код: backend/src/lib/publishable.ts:137-160 (CONTACT_PATTERNS, MONEY_NEAR)
test("АТАКА 31: строка с семизначной ценой не вырезается как телефон", () => {
  const w: string[] = [];
  const src = ["Участок ровный.", "Цена: 8 500 000 THB, торг уместен.", "Аренда: 25 000 THB/мес."];
  assert.deepEqual(redactConfidential(src.join("\n"), w).split("\n"), src);
  assert.deepEqual(w, []);

  // контроль: телефон режется, остальная часть строки остаётся
  const w2: string[] = [];
  assert.equal(redactConfidential("Звоните +66 84 362 7784", w2).trim(), "Звоните");
  assert.deepEqual(w2, ["из описания скрыт контакт/телефон"]);
  const w3: string[] = [];
  assert.equal(redactConfidential("Телефон 0843627784", w3).trim(), "Телефон");
  assert.deepEqual(w3, ["из описания скрыт контакт/телефон"]);
});

// АТАКА 31a [CRITICAL]: в БД описание доезжает целиком
// | ИНВАРИАНТ: путь записи хранит присланный текст; редакция режет только
//   конфиденциальное. Цена и номер кадастрового листа — не контакты
// | код: backend/src/lib/write.ts (createObject → redactConfidential)
test("АТАКА 31a: createObject кладёт в БД описание вместе со строкой цены", async () => {
  const lines = [
    "Участок в Шри Тану, ровный, дорога есть.",
    "Цена: 8 500 000 THB, торг уместен.",
    "Кадастровый лист 4239-11-2233-45.",
    "Электричество на границе участка.",
  ];
  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    description: lines.join("\n"),
  });
  const [row] = await db
    .select()
    .from(schema.objects)
    .where(eq(schema.objects.rwNumber, rwNumber));
  for (const ln of lines) assert.match(row.descriptionRaw!, new RegExp(ln.slice(0, 20)));
  assert.match(row.descriptionRaw!, /8 500 000/);
  assert.match(row.descriptionRaw!, /4239-11-2233-45/);
});

// АТАКА 31b [HIGH]: «богатый блок бота дословно» приезжает в базу без потерь
// | ИНВАРИАНТ: блок сохраняется как есть — так задокументировано в write.ts;
//   строки с ценой и площадью не прореживаются
// | код: backend/src/lib/write.ts (ветка descriptionRaw)
test("АТАКА 31b: пре-собранный блок бота доезжает в базу целиком", async () => {
  const botBlock = ["🏝 RW-L | Sri Thanu", "💰 6 800 000 THB", "📐 1600 m²", "🚗 Асфальт до участка"];
  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    descriptionRaw: botBlock.join("\n"),
  });
  const [row] = await db
    .select()
    .from(schema.objects)
    .where(eq(schema.objects.rwNumber, rwNumber));
  assert.deepEqual(row.descriptionRaw!.split("\n"), botBlock);
});

// АТАКА 31c [MEDIUM]: НЕ ЗАКРЫТО — редакция по-прежнему тихая
// | ОЖИДАЕТСЯ: CreateObjectResult сообщает, что из описания что-то вырезано
//   (по образцу rejectedPhotos — там это сделано)
// | ФАКТ: второй аргумент redactConfidential не передаётся, предупреждения
//   выбрасываются. Цена данных упала (цена/ID больше не теряются), но реальная
//   утечка — телефон, комиссия — вырезается молча
// | код: backend/src/lib/write.ts (redactConfidential без сбора warnings)
test("АТАКА 31c: вызывающий не узнаёт, что из описания вырезан контакт", async () => {
  const res = await createObject(db, {
    type: "Land",
    district: "Haad Yao",
    description: "Цена: 9 200 000 THB.\nСобственник Somchai +66 84 362 7784.\nВид на море.",
  });
  // про отброшенные ФОТО вызывающему сообщают, про вырезанное из ОПИСАНИЯ — нет
  assert.deepEqual(Object.keys(res).sort(), ["id", "rejectedPhotos", "rwNumber", "url"]);
  assert.equal("warnings" in res, false);

  const [row] = await db
    .select()
    .from(schema.objects)
    .where(eq(schema.objects.rwNumber, res.rwNumber));
  assert.match(row.descriptionRaw!, /9 200 000/); // цена сохранена
  assert.doesNotMatch(row.descriptionRaw!, /84 362 7784/); // телефон вырезан — молча
});
