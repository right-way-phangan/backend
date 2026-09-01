/**
 * RED-TEAM РАУНД 3 — свободный текст на пути записи после второго цикла.
 *
 * Часть 1. parseArea: второй цикл заменил `(?<!-)` на «любой минус → отклоняем
 * ВЕСЬ ввод». Это закрыло «−12 rai → 2 rai», но заодно отклонило тайскую
 * штатную запись площади «рай-нган-ва» («1-2-30 rai») и любые диапазоны. Поле
 * площади при этом остаётся в areaNote — объект выглядит заполненным, а
 * area_rai/area_sqm пустые (детектор полноты /admin/valuation, фильтры и
 * сортировка каталога работают по ним).
 *
 * Часть 2. redactConfidential поставили ровно на два поля (description и
 * descriptionRaw). Остальные свободнотекстовые поля, которые точно так же
 * уезжают в ПУБЛИЧНЫЙ payload /objects, санитайзер не проходят вовсе.
 *
 * ИСПРАВЛЕНО 2026-09-01 (третий цикл, только Часть 1): признаком минуса стал
 * НАСТОЯЩИЙ минус (начало строки либо после пробела/двоеточия/скобки), а тайская
 * тройка «рай-нган-ва» получила собственный разбор. АТАКИ 67, 67a, 67b теперь
 * СТЕРЕГУТ фикс — включая обратную сторону: отрицательная площадь по-прежнему
 * отклоняется целиком.
 *
 * Часть 2 (АТАКИ 68, 69) — ХАРАКТЕРИЗУЮЩИЕ, не закрыта: свободнотекстовые поля
 * кроме description/descriptionRaw санитайзер не проходят.
 *   npx tsx --test src/lib/adv3-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createObject, parseArea, parseEscalation } from "./write";
import { getPublicObjects } from "./queries";

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

// АТАКА 67 [HIGH]: тайская запись площади «рай-нган-ва»
// | ИНВАРИАНТ: «1-2-30 rai» (1 рай 2 нгана 30 ва) — стандартная запись площади
//   в тайских документах и объявлениях — разбирается в 1.58 rai / 2520 m², то
//   есть в точности как та же площадь, записанная словами
// | БЫЛО: правило «любой минус → отклоняем ВЕСЬ ввод» видело дефисы как знак
//   минуса и возвращало {} — площадь терялась полностью.
//   ИСПРАВЛЕНО 2026-09-01: добавлен разбор тройки рай-нган-ва, а признаком
//   минуса стал только НАСТОЯЩИЙ минус — в начале строки либо после пробела,
//   двоеточия или скобки
// | код: backend/src/lib/write.ts:222
test("АТАКА 67: «1-2-30 rai» (рай-нган-ва) разбирается в 2520 m²", () => {
  assert.deepEqual(parseArea("1-2-30 rai"), { sqm: 2520, rai: 1.58 });
  // та же площадь словами даёт тот же ответ — две записи не расходятся
  assert.deepEqual(parseArea("1 rai 2 ngan 30 sq.wah"), { sqm: 2520, rai: 1.58 });
  // ещё пара троек: «2-1-0» = 2.25 rai, «0-2-0» = полрая
  assert.deepEqual(parseArea("2-1-0 rai"), { sqm: 3600, rai: 2.25 });
  assert.deepEqual(parseArea("0-2-0 rai"), { sqm: 800, rai: 0.5 });
});

// АТАКА 67a [HIGH]: дефис внутри строки больше не обнуляет разбор,
// но отрицательная площадь по-прежнему отклоняется
// | ИНВАРИАНТ: дефис-разделитель (номер зоны, дата межевания, диапазон) не
//   снимает площадь целиком; при этом настоящий минус перед числом — в начале
//   строки или после пробела/двоеточия/скобки — по-прежнему отклоняет ВЕСЬ ввод
//   (защита раунда 2: «-12 rai» не должно превращаться в 2 rai, «-800 m2» — в 0)
// | БЫЛО: {} во всех четырёх случаях ниже. ИСПРАВЛЕНО 2026-09-01: просмотр
//   `/(?:^|[\s:(])[-−–—]\s*\d/` отличает минус от дефиса
// | ОСОЗНАННОЕ ПОВЕДЕНИЕ, не идеал: из диапазона «3-5 rai» берётся ВЕРХНЯЯ
//   граница (5 rai), потому что тройку рай-нган-ва и диапазон одним правилом не
//   различить; «5 – 6 rai» (тире через пробелы) читается как минус и отклоняется
// | код: backend/src/lib/write.ts:222
test("АТАКА 67a: дефис-разделитель разбор не обнуляет, настоящий минус — отклоняет", () => {
  assert.deepEqual(parseArea("3-5 rai"), { sqm: 8000, rai: 5 });
  assert.deepEqual(parseArea("Zone 3-2, 1600 m2"), { sqm: 1600, rai: 1 });
  assert.deepEqual(parseArea("Plot 2026-08-31 survey, 4 rai"), { sqm: 6400, rai: 4 });

  // обратная сторона: минус любой формы отклоняет ввод целиком
  for (const s of ["-5 rai", "- 5 rai", "−5 rai", "−12 rai", "Zone A: -3 rai"]) {
    assert.deepEqual(parseArea(s), {}, `минус должен был отклонить ввод: ${s}`);
  }
  // НЕ ЗАКРЫТО: тире через пробелы неотличимо от минуса через пробел
  assert.deepEqual(parseArea("5 – 6 rai"), {});
});

// АТАКА 67b [HIGH]: объект с тайской записью площади доезжает до базы заполненным
// | ИНВАРИАНТ: area_rai / area_sqm заполнены, поэтому фильтр по площади,
//   сортировка и детектор полноты каталога объект видят; areaNote при этом
//   сохраняет исходную строку как было введено
// | БЫЛО: createObject клал строку в areaNote, а area_rai / area_sqm оставлял
//   null — объект выглядел заполненным, но для фильтров не существовал.
//   ИСПРАВЛЕНО 2026-09-01 вместе с parseArea
// | код: backend/src/lib/write.ts:222 → 464-466
test("АТАКА 67b: объект с «1-2-30 rai» уходит в базу с area_rai/area_sqm", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    priceThb: 5_000_000,
    area: "1-2-30 rai",
    photoUrls: ["https://pub.r2.dev/o/aerial.jpg"],
  });
  const obj = (await getPublicObjects(db)).find((o) => o.rwNumber === rwNumber);
  assert.equal(obj?.areaNote, "1-2-30 rai");
  assert.equal(obj?.areaRai, 1.58);
  assert.equal(obj?.areaSqm, 2520);
});

// АТАКА 68 [HIGH]: свободнотекстовые поля мимо санитайзера уходят в публичный payload
// | ОЖИДАЕТСЯ: раз descriptionRaw прогоняют через redactConfidential ровно
//   потому, что он уезжает в публичный /objects, — то же самое делается для
//   всех прочих свободных полей, которые туда уезжают
// | ФАКТ: leaseEscNotes (это ЦЕЛИКОМ исходный текст поля «индексация»),
//   leaseAdditionalTerms, buildingRules, paymentTerms и areaNote пишутся как
//   есть. stripSellerPii их не вырезает. Телефон собственника, комиссия и номер
//   чанота публикуются дословно — та самая утечка, которую якобы закрыли
// | код: backend/src/lib/write.ts:464-486 (нет redactConfidential) + queries.ts:140-162
test("АТАКА 68: комиссия, телефон и номер чанота публичны через leaseEscNotes/paymentTerms", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    priceThb: 5_000_000,
    leaseEscalation: "3% каждые 5 лет, комиссия 5%, звонить +66 84 362 7784",
    leaseAddTerms: "Owner LINE somchai88, chanote No. 13681",
    buildingRules: "Комиссия 5% от цены",
    paymentTerms: "Deposit to owner, phone +66843627784",
    area: "Chanote No 13681, 4 rai",
    photoUrls: ["https://pub.r2.dev/o/aerial.jpg"],
  });
  const obj = (await getPublicObjects(db)).find((o) => o.rwNumber === rwNumber);
  assert.equal(obj?.leaseEscNotes, "3% каждые 5 лет, комиссия 5%, звонить +66 84 362 7784");
  assert.equal(obj?.leaseAdditionalTerms, "Owner LINE somchai88, chanote No. 13681");
  assert.equal(obj?.buildingRules, "Комиссия 5% от цены");
  assert.equal(obj?.paymentTerms, "Deposit to owner, phone +66843627784");
  assert.equal(obj?.areaNote, "Chanote No 13681, 4 rai");

  // для сравнения: то же самое в description — редактируется
  const { rwNumber: rw2 } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    priceThb: 5_000_000,
    description: "Комиссия 5%, звонить +66843627784",
    photoUrls: ["https://pub.r2.dev/o/aerial.jpg"],
  });
  const obj2 = (await getPublicObjects(db)).find((o) => o.rwNumber === rw2);
  assert.equal(obj2?.descriptionRaw?.includes("+66843627784"), false);
});

// АТАКА 68a [MEDIUM]: parseEscalation возвращает исходный текст целиком
// | ОЖИДАЕТСЯ: notes — заметка о механике индексации, а не сырой ввод
// | ФАКТ: `notes: s` — вся присланная строка без обработки; это она и попадает
//   в публичную колонку lease_esc_notes
// | код: backend/src/lib/write.ts:260
test("АТАКА 68a: parseEscalation.notes = сырой ввод, без редакции", () => {
  assert.equal(
    parseEscalation("3% каждые 5 лет, комиссия 5%, звонить +66 84 362 7784").notes,
    "3% каждые 5 лет, комиссия 5%, звонить +66 84 362 7784",
  );
});
