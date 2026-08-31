/**
 * RED-TEAM РАУНД 2: PATCH /objects/:rw обходил все фиксы, поставленные на
 * createObject.
 *
 * БЫЛО: updateObject() клал значение в колонку как есть. Ни redactConfidential,
 * ни positiveOrUndefined, ни валидация статуса, ни sanitizeConstructionUpdates
 * на этом пути не вызывались. PATCH используют бот `/edit`, инлайн-редактор
 * карточки и /admin — то есть это не экзотика, а второй по частоте путь записи.
 *
 * ИСПРАВЛЕНО 2026-08-31: в updateObject добавлены `MONEY_FIELDS` (проходят
 * positiveOrUndefined, явный null очищает), `TEXT_FIELDS` (descriptionRaw +
 * оба ручных описания проходят redactConfidential), белый список
 * `OBJECT_STATUSES` для status (значение вне списка не пишется вовсе) и вызов
 * sanitizeConstructionUpdates для массива.
 *
 * Тесты стерегут фикс; 21a/23a/24 остаются ХАРАКТЕРИЗУЮЩИМИ — см. комментарии.
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
import { createObject, updateObject } from "./write";

delete process.env.ANTHROPIC_API_KEY; // вет-гейт фото сетевой, выключаем

let client: PGlite;
let db: AnyPgDatabase;

const rowOf = async (rw: string) =>
  (await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rw)))[0];

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

after(async () => {
  await client.close();
});

// АТАКА 21 [HIGH]: положительность денежных полей проверяется на КАЖДОМ пути
// | ИНВАРИАНТ: PATCH не возвращает отрицательную цену в базу — фикс
//   «−9 500 000 THB публиковался как цена» закрыт на обоих путях записи.
//   Явный null по-прежнему очищает поле, валидное значение пишется
// | код: backend/src/lib/write.ts:706-716
test("АТАКА 21: PATCH не пишет отрицательную цену", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    priceThb: -9_500_000,
  });
  // на создании — отсечено (фикс раунда 1)
  assert.equal((await rowOf(rwNumber)).priceThb, null);

  const res = await updateObject(db, rwNumber, {
    priceThb: -9_500_000,
    bedrooms: -3,
    leaseTermYears: -30,
  });
  assert.deepEqual(res, { rwNumber });
  const afterPatch = await rowOf(rwNumber);
  assert.equal(afterPatch.priceThb, null);
  assert.equal(afterPatch.bedrooms, null);
  assert.equal(afterPatch.leaseTermYears, null);

  // валидное значение пишется, явный null очищает
  await updateObject(db, rwNumber, { priceThb: 7_000_000 });
  assert.equal((await rowOf(rwNumber)).priceThb, 7_000_000);
  await updateObject(db, rwNumber, { priceThb: null });
  assert.equal((await rowOf(rwNumber)).priceThb, null);
});

// АТАКА 21a [HIGH]: НЕ ЗАКРЫТО — на СОЗДАНИИ проверку прошли не все поля
// | ОЖИДАЕТСЯ: все денежные/счётные поля проверяются одинаково на обоих путях
// | ФАКТ: createObject по-прежнему пишет отрицательные rentPerRaiMonth,
//   leasePrepayment, unitsTotal, netYieldPct (rentPerRaiMonth — цена аренды
//   земли, витрина /leasehold). На PATCH первые два уже прикрыты MONEY_FIELDS,
//   а unitsAvailable/buildYear в MONEY_FIELDS не попали и пишутся сырыми
// | код: backend/src/lib/write.ts:706-710 (MONEY_FIELDS) и createObject
test("АТАКА 21a: отрицательные rentPerRaiMonth/leasePrepayment проходят на создании", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    rentPerRaiMonth: -25_000,
    leasePrepayment: -1_000_000,
    unitsTotal: -5,
    netYieldPct: -12,
  });
  const row = await rowOf(rwNumber);
  assert.equal(row.rentPerRaiMonth, -25_000);
  assert.equal(row.leasePrepayment, -1_000_000);
  assert.equal(row.unitsTotal, -5);
  assert.equal(row.netYieldPct, -12);

  // PATCH те же два поля уже отбивает
  await updateObject(db, rwNumber, { rentPerRaiMonth: -25_000, leasePrepayment: -1_000_000 });
  const patched = await rowOf(rwNumber);
  assert.equal(patched.rentPerRaiMonth, null);
  assert.equal(patched.leasePrepayment, null);

  // ...а unitsAvailable/buildYear на PATCH всё ещё без проверки
  const unit = await createObject(db, { type: "Project", district: "Ban Tai" });
  await updateObject(db, unit.rwNumber, { unitsAvailable: -5, buildYear: -1 });
  const u = await rowOf(unit.rwNumber);
  assert.equal(u.unitsAvailable, -5);
  assert.equal(u.buildYear, -1);
});

// АТАКА 22 [CRITICAL]: redactConfidential стоит и на PATCH
// | ИНВАРИАНТ: descriptionRaw уходит в публичный payload /objects, поэтому
//   телефон, комиссия и номер чанота вырезаются на обоих путях записи;
//   законный текст при этом сохраняется целиком
// | код: backend/src/lib/write.ts:711,718-721
test("АТАКА 22: PATCH descriptionRaw вырезает телефон, комиссию и номер чанота", async () => {
  const { rwNumber } = await createObject(db, { type: "Land", district: "Sri Thanu" });
  const leak = "Собственник Somchai +66 84 362 7784. Commission: 5%. Chanote no. 13681.";
  await updateObject(db, rwNumber, { descriptionRaw: leak });
  const saved = (await rowOf(rwNumber)).descriptionRaw!;
  assert.doesNotMatch(saved, /84 362 7784|\+66/);
  assert.doesNotMatch(saved, /5\s*%/);
  assert.doesNotMatch(saved, /13681/);
  assert.match(saved, /Somchai/); // остальное описание не потеряно

  // законное описание не трогается
  await updateObject(db, rwNumber, { descriptionRaw: "Ровный участок 2 rai, дорога есть." });
  assert.equal((await rowOf(rwNumber)).descriptionRaw, "Ровный участок 2 rai, дорога есть.");
});

// АТАКА 22a [HIGH]: ручные описания — то, что сайт показывает напрямую —
// тоже проходят редакцию
// | ИНВАРИАНТ: обещание шапки redactConfidential («и при публикации, и при
//   записи») выполняется для всех трёх текстовых полей, а не только для
//   descriptionRaw; мессенджер-ник вырезается вместе с названием мессенджера
// | код: backend/src/lib/write.ts:711; publishable.ts:146-157
test("АТАКА 22a: ручные описания пишутся с редакцией", async () => {
  const { rwNumber } = await createObject(db, { type: "Land", district: "Sri Thanu" });
  const leak = "Owner Somchai, LINE ID: somchai88. Our commission 5%.";
  await updateObject(db, rwNumber, { descriptionManualEn: leak, descriptionManualRu: leak });
  const row = await rowOf(rwNumber);
  for (const field of [row.descriptionManualEn!, row.descriptionManualRu!]) {
    assert.doesNotMatch(field, /somchai88/i);
    assert.doesNotMatch(field, /LINE/);
    assert.doesNotMatch(field, /commission/i);
    assert.match(field, /Owner Somchai/);
  }
});

// АТАКА 23 [HIGH]: sanitizeConstructionUpdates снова на пути PATCH
// | ИНВАРИАНТ: массив чистится — не-http ссылки и не-объекты отбрасываются,
//   javascript:-ссылка не попадает в jsonb, который рендерит
//   /projects/[slug]/construction. Запись без фото (текстовая веха) остаётся:
//   требование обязательного фото молча теряло её целиком
// | код: backend/src/lib/write.ts:757-767, :368-392
test("АТАКА 23: массив constructionUpdates чистится санитайзером", async () => {
  const { rwNumber } = await createObject(db, { type: "Project", district: "Ban Tai" });
  await updateObject(db, rwNumber, {
    constructionUpdates: [
      { date: "", photos: ["javascript:alert(1)"] }, // ни фото, ни даты, ни заметки
      { note: "нет фото вообще", photos: [] }, // текстовая веха — законна
      "не объект вовсе",
    ],
  });
  const saved = (await rowOf(rwNumber)).constructionUpdates as Array<Record<string, unknown>>;
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], { date: "", note: "нет фото вообще", photos: [] });
  assert.doesNotMatch(JSON.stringify(saved), /javascript:/);
});

// АТАКА 23b [MEDIUM]: очистка журнала стройки — только по явному пустому массиву
// | ИНВАРИАНТ: `[]` = осознанная очистка (null); массив, из которого не осталось
//   ни одной валидной записи, поле НЕ трогает — иначе одна кривая запись
//   стирала бы весь накопленный журнал при 200 OK
// | код: backend/src/lib/write.ts:761-766
test("АТАКА 23b: мусорный массив не стирает журнал, пустой — стирает", async () => {
  const { rwNumber } = await createObject(db, { type: "Project", district: "Ban Tai" });
  const good = [{ date: "2026-08-01", note: "фундамент", photos: ["https://cdn.example/a.jpg"] }];
  await updateObject(db, rwNumber, { constructionUpdates: good });
  assert.equal((await rowOf(rwNumber)).constructionUpdates!.length, 1);

  await updateObject(db, rwNumber, { constructionUpdates: [{}, "мусор"] });
  assert.equal(
    (await rowOf(rwNumber)).constructionUpdates!.length,
    1,
    "мусорный ввод не должен стирать журнал",
  );

  await updateObject(db, rwNumber, { constructionUpdates: [] });
  assert.equal((await rowOf(rwNumber)).constructionUpdates, null);
});

// АТАКА 23a [MEDIUM]: НЕ ЗАКРЫТО — videoUrls/floorplanUrls/priceStages/timeline/team
// | ОЖИДАЕТСЯ: массив валидируется так же, как строка (parseUrls отбрасывает
//   не-http строки)
// | ФАКТ: строка «javascript:...» отбрасывается, а тот же элемент в массиве —
//   сохраняется; форма ввода по-прежнему определяет уровень защиты. Санитайзер
//   получил только constructionUpdates (АТАКА 23)
// | код: backend/src/lib/write.ts:745-752
test("АТАКА 23a: массив videoUrls принимается без parseUrls", async () => {
  const { rwNumber } = await createObject(db, { type: "Project", district: "Ban Tai" });
  await updateObject(db, rwNumber, { videoUrls: "javascript:alert(1)\nnot a url" });
  assert.equal((await rowOf(rwNumber)).videoUrls, null);

  await updateObject(db, rwNumber, { videoUrls: ["javascript:alert(1)", "not a url"] });
  assert.deepEqual((await rowOf(rwNumber)).videoUrls, ["javascript:alert(1)", "not a url"]);
});

// АТАКА 24 [MEDIUM]: НЕ ЗАКРЫТО — PATCH locationUrl без разрешимых координат
// оставляет СТАРЫЕ lat/lng: карточка ссылается на один участок, пин на другом
// | ОЖИДАЕТСЯ: смена ссылки на карту либо переносит пин, либо очищает его
// | ФАКТ: ссылка сменилась, координаты прежние, ответ 200 OK. Любой
//   не-картографический URL (и любой сетевой сбой) молча оставляет пин от
//   предыдущего объекта
// | код: backend/src/lib/write.ts:782-788
test("АТАКА 24: смена ссылки на карту оставляет координаты прошлого участка", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    locationUrl: "https://maps.google.com/?q=9.7500,100.0100",
  });
  assert.equal((await rowOf(rwNumber)).lat, 9.75);

  // новая ссылка на совершенно другой участок, координаты в ней не распознаются
  await updateObject(db, rwNumber, {
    locationUrl: "https://www.example-agency.com/plots/ban-tai-42",
  });
  const row = await rowOf(rwNumber);
  assert.equal(row.locationUrl, "https://www.example-agency.com/plots/ban-tai-42");
  assert.equal(row.lat, 9.75); // пин остался от старой ссылки
  assert.equal(row.lng, 100.01);
});

// АТАКА 24a [MEDIUM]: status валидируется по белому списку
// | ИНВАРИАНТ: статус — управляющее поле (Active определяет и публикацию, и
//   попадание в каталог). Значение вне OBJECT_STATUSES не пишется ВООБЩЕ:
//   опечатка «active» больше не выводит объект из каталога. Значение из списка
//   пишется как обычно
// | код: backend/src/lib/write.ts:157, :722-728
test("АТАКА 24a: PATCH не пишет статус вне белого списка", async () => {
  const { rwNumber } = await createObject(db, { type: "Land", district: "Sri Thanu" });
  assert.equal((await rowOf(rwNumber)).status, "Active");

  await updateObject(db, rwNumber, { status: "active" });
  assert.equal((await rowOf(rwNumber)).status, "Active");
  await updateObject(db, rwNumber, { status: "чтоугодно" });
  assert.equal((await rowOf(rwNumber)).status, "Active");

  // законный переход проходит
  await updateObject(db, rwNumber, { status: "Sold" });
  assert.equal((await rowOf(rwNumber)).status, "Sold");
});
