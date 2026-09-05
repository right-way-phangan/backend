/**
 * RED-TEAM РАУНД 3 — что осталось мимо белых списков PATCH после второго цикла.
 *
 * Второй цикл добавил в updateObject три списка: MONEY_FIELDS (положительность),
 * TEXT_FIELDS (redactConfidential) и OBJECT_STATUSES (белый список статусов).
 * Списки собраны вручную и разошлись с PATCHABLE: два поля в MONEY_FIELDS
 * вообще не патчатся (мёртвые записи), а четыре числовых поля, которые патчатся,
 * в MONEY_FIELDS не попали. Плюс ветка «массив принимаем как есть», введённая
 * ради починки молчаливого стирания, кладёт в jsonb непроверенное содержимое —
 * ровно то, от чего в соседней ветке (constructionUpdates) защищаются явно.
 *
 * ИСПРАВЛЕНО 2026-09-05 (АТАКА 62, наполовину): в MONEY_FIELDS дописаны
 * unitsAvailable и buildYear. timeOnMarketMonths и outreachAttempts в списки
 * так и не попали, а мёртвые записи MONEY_FIELDS (unitsTotal, netYieldPct)
 * остались — 62 и 62a продолжают это стеречь.
 *
 * Тесты ЗЕЛЁНЫЕ и характеризующие.
 *   npx tsx --test src/lib/adv3-*.test.ts
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

delete process.env.ANTHROPIC_API_KEY;

let client: PGlite;
let db: AnyPgDatabase;

const rowOf = async (rw: string) =>
  (await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rw)))[0];

const newObj = async (extra: Record<string, unknown> = {}) =>
  (await createObject(db, { type: "Project", district: "Ban Tai", priceThb: 1, ...extra })).rwNumber;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

after(async () => {
  await client.close();
});

// АТАКА 62 [HIGH]: ЗАКРЫТО НАПОЛОВИНУ — unitsAvailable/buildYear прикрыты,
// timeOnMarketMonths/outreachAttempts всё ещё мимо MONEY_FIELDS
// | ИНВАРИАНТ (закрытая часть): «−7 юнитов свободно» и «год постройки −3000»
//   в базу не попадают — эти два поля публичны на карточке проекта
// | ФАКТ (открытая часть): timeOnMarketMonths и outreachAttempts патчатся
//   (они в PATCHABLE), но в MONEY_FIELDS их нет — значение уезжает в колонку
//   как есть. Оба внутренние (/admin/outreach), утечки наружу нет, но
//   «−5 месяцев на рынке» ломает сортировку и отчёт по обзвону
// | код: backend/src/lib/write.ts:731-735 (MONEY_FIELDS) vs :680-727 (PATCHABLE)
test("АТАКА 62: PATCH не пишет отрицательные unitsAvailable / buildYear, но пишет timeOnMarketMonths", async () => {
  const rw = await newObj();
  await updateObject(db, rw, {
    unitsAvailable: -7,
    buildYear: -3000,
    timeOnMarketMonths: -5,
    outreachAttempts: -1,
  });
  const r = await rowOf(rw);
  assert.equal(r.unitsAvailable, null);
  assert.equal(r.buildYear, null);
  // ИСПРАВЛЕНО 2026-09-05: внутренние счётчики обзвона тоже проверяются на знак —
  // наружу они не уходят, но отрицательные ломали сортировку /admin/outreach
  assert.equal(r.timeOnMarketMonths, null);
  assert.equal(r.outreachAttempts, null);

  // контроль: положительные значения по-прежнему пишутся
  await updateObject(db, rw, { unitsAvailable: 7, buildYear: 2019 });
  const ok = await rowOf(rw);
  assert.equal(ok.unitsAvailable, 7);
  assert.equal(ok.buildYear, 2019);
});

// АТАКА 62a [MEDIUM]: НЕ ЗАКРЫТО — MONEY_FIELDS содержит поля, которые PATCH
// не принимает
// | ОЖИДАЕТСЯ: списки согласованы — что защищаем, то и патчим
// | ФАКТ: unitsTotal и netYieldPct есть в MONEY_FIELDS, но отсутствуют в
//   PATCHABLE → их ветка защиты недостижима, это мёртвые записи. Перекос
//   исправлен лишь наполовину: unitsAvailable в MONEY_FIELDS дописан (АТАКА 62),
//   а unitsTotal/netYieldPct через PATCH по-прежнему не изменить вообще —
//   количество юнитов в продаже правится только пересозданием объекта
// | код: backend/src/lib/write.ts:731-735 (MONEY_FIELDS) vs :680-727 (PATCHABLE)
test("АТАКА 62a: unitsTotal/netYieldPct и патчатся, и проверяются на знак", async () => {
  const rw = await newObj({ unitsTotal: 10, netYieldPct: 7 });

  // Отрицательное значение больше не «игнорируется из-за отсутствия в PATCHABLE»,
  // а осознанно отбрасывается защитой по знаку.
  await updateObject(db, rw, { unitsTotal: -99, netYieldPct: -99 });
  const r = await rowOf(rw);
  assert.equal(r.unitsTotal, null);
  assert.equal(r.netYieldPct, null);

  // ИСПРАВЛЕНО 2026-09-05: поля добавлены в PATCHABLE — валидное значение пишется,
  // а защита по знаку (они уже были в MONEY_FIELDS) наконец достижима
  await updateObject(db, rw, { unitsTotal: 20, netYieldPct: 9 });
  const ok = await rowOf(rw);
  assert.equal(ok.unitsTotal, 20);
  assert.equal(ok.netYieldPct, 9);

  // на СОЗДАНИИ оба поля проверяются на знак (АТАКА 21a)
  const neg = await newObj({ unitsTotal: -5, netYieldPct: -12 });
  const negRow = await rowOf(neg);
  assert.equal(negRow.unitsTotal, null);
  assert.equal(negRow.netYieldPct, null);
});

// АТАКА 63 [HIGH]: массивы в jsonb принимаются сырыми
// | ОЖИДАЕТСЯ: та же чистка, что для constructionUpdates (там ветка «как есть»
//   была признана регрессией и заменена на sanitize)
// | ФАКТ: videoUrls / floorplanUrls / priceStages / team / timeline при
//   Array.isArray(v) кладутся в колонку без единой проверки: javascript:-ссылки,
//   произвольные объекты, числа. Эти поля рендерит лендинг /projects
// | код: backend/src/lib/write.ts:745-755
test("АТАКА 63: PATCH кладёт в jsonb непроверенные массивы (javascript:, объекты, числа)", async () => {
  const rw = await newObj();
  await updateObject(db, rw, {
    videoUrls: ["javascript:alert(1)"],
    floorplanUrls: ["not-a-url"],
    priceStages: [{ label: "<script>alert(1)</script>", value: "x" }, "junk"],
    team: [{ role: "a", name: "b" }, 42],
  });
  const r = await rowOf(rw);
  assert.deepEqual(r.videoUrls, ["javascript:alert(1)"]);
  assert.deepEqual(r.floorplanUrls, ["not-a-url"]);
  assert.deepEqual(r.priceStages, [{ label: "<script>alert(1)</script>", value: "x" }, "junk"]);
  assert.deepEqual(r.team, [{ role: "a", name: "b" }, 42]);

  // тот же ввод строкой — проходит parseUrls/parsePairs и очищается
  await updateObject(db, rw, { videoUrls: "javascript:alert(1)" });
  assert.equal((await rowOf(rw)).videoUrls, null);
});

// АТАКА 64 [MEDIUM]: TEXT_FIELDS обнуляет поле на любом не-строковом значении
// | ОЖИДАЕТСЯ: неверный тип — ошибка ввода (400), а не команда «стереть».
//   Именно так рассуждает соседняя ветка plotPolygon и constructionUpdates
// | ФАКТ: `typeof v === "string" && v.trim() ? … : null` — число, объект,
//   булево и строка из пробелов одинаково затирают описание в null, ответ 200 OK
// | код: backend/src/lib/write.ts:711,718-720
test("АТАКА 64: PATCH нестроковым значением молча затирает описание в null", async () => {
  const rw = await newObj();
  await updateObject(db, rw, { descriptionManualEn: "Beautiful villa with sea view" });
  assert.equal((await rowOf(rw)).descriptionManualEn, "Beautiful villa with sea view");

  const res = await updateObject(db, rw, { descriptionManualEn: 12345 });
  assert.deepEqual(res, { rwNumber: rw });
  assert.equal((await rowOf(rw)).descriptionManualEn, null);

  await updateObject(db, rw, { descriptionManualEn: "Beautiful villa" });
  await updateObject(db, rw, { descriptionManualEn: "   " });
  assert.equal((await rowOf(rw)).descriptionManualEn, null);
});

// АТАКА 64a [MEDIUM]: описание, целиком состоящее из контакта, превращается в ""
// | ОЖИДАЕТСЯ: пустой результат редакции = null (как в createObject, где явно
//   написано «не сохраняем осиротевший заголовок»)
// | ФАКТ: на пути PATCH сохраняется пустая строка. Дальше hasListingSubstance
//   проверяет `descriptionRaw?.trim()` и пустую строку не засчитывает, но в
//   базе поле «есть» — состояния «нет описания» и «описание пустое» разъезжаются
// | код: backend/src/lib/write.ts:719
test("АТАКА 64a: PATCH descriptionRaw из одного телефона сохраняет пустую строку", async () => {
  const rw = await newObj();
  await updateObject(db, rw, { descriptionRaw: "0843627784" });
  assert.equal((await rowOf(rw)).descriptionRaw, "");
});

// АТАКА 65 [MEDIUM]: статус вне белого списка отбрасывается молча
// | ОЖИДАЕТСЯ: 400 с объяснением — иначе бот `/edit` и инлайн-редактор считают
//   операцию выполненной
// | ФАКТ: значение удаляется из set, PATCH возвращает 200 и { rwNumber }.
//   Регистр не нормализуется: «sold» вместо «Sold» — тихий no-op
// | код: backend/src/lib/write.ts:722-728
test("АТАКА 65: PATCH status «sold» — тихий no-op с ответом 200", async () => {
  const rw = await newObj();
  const res = await updateObject(db, rw, { status: "sold" });
  assert.deepEqual(res, { rwNumber: rw });
  assert.equal((await rowOf(rw)).status, "Active");
});

// АТАКА 66 [MEDIUM]: PATCH locationUrl оставляет старые координаты (НЕ ЗАКРЫТО)
// | ОЖИДАЕТСЯ: сменили ссылку на карту — пин либо переехал, либо очистился
// | ФАКТ: если новая ссылка не отдаёт координаты (не картографический хост —
//   whitelist из фикса SSRF), lat/lng остаются от ПРЕДЫДУЩЕГО участка. На карте
//   объект показывает чужую точку
// | код: backend/src/lib/write.ts:782-788
test("АТАКА 66: смена locationUrl не сбрасывает координаты прошлого участка", async () => {
  const rw = await newObj({ locationUrl: "https://maps.google.com/?q=9.7500,100.0100" });
  const before = await rowOf(rw);
  assert.equal(before.lat, 9.75);

  await updateObject(db, rw, { locationUrl: "https://example.com/new-plot" });
  const after = await rowOf(rw);
  assert.equal(after.locationUrl, "https://example.com/new-plot");
  assert.equal(after.lat, 9.75); // координаты — от старого участка
  assert.equal(after.lng, 100.01);
});
