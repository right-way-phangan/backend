/**
 * RED-TEAM РАУНД 3 — регрессия второго цикла в имя-фильтре фото.
 *
 * Второй цикл починил ложные срабатывания (`aerial-survey-*.jpg`,
 * `contractor-progress-*.jpg`), переведя DOC_TOKENS с подстрок на «отдельные
 * слова»: границей считается не-буквенно-цифровой символ или край имени. Побочный
 * эффект — ЦИФРА сразу после токена снимает срабатывание, а нумерация сканов
 * («chanote2.jpg», «scan001.jpg», «deed3.png») — самый обычный способ назвать
 * пачку снимков документов. Имя-фильтр — единственная защита, когда вижн-гейт
 * выключен (нет ANTHROPIC_API_KEY, а он выгорает при нулевом балансе), то есть
 * ровно в том режиме, ради которого его и добавляли.
 *
 * ИСПРАВЛЕНО 2026-09-01 (третий цикл): в хвост токена добавлена ветка «сразу
 * идут цифры» — нумерованные сканы снова считаются документами, а починка
 * ложных срабатываний при этом сохранена (`aerial-survey-2.jpg`,
 * `contractor-progress-3.jpg` остаются фотографиями). АТАКИ 60 и 60a теперь
 * СТЕРЕГУТ фикс, 61a закрыта наполовину.
 *
 * ХАРАКТЕРИЗУЮЩИМИ остаются: 61 (транслит kadastr/chanot/dogovor не покрыт),
 * половина 61a (токен в ХОСТЕ не проверяется) и хвост 60 («documents.jpg» —
 * после токена буква, а не цифра или разделитель).
 *   npx tsx --test src/lib/adv3-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { looksLikeDocumentName, partitionByVetting } from "./photo-vetting";
import { createObject } from "./write";
import { getPublicObjects } from "./queries";

delete process.env.ANTHROPIC_API_KEY; // вет-гейт выключен — работает только имя-фильтр

let client: PGlite;
let db: AnyPgDatabase;

const url = (name: string) => `https://pub.r2.dev/objects/RW-L0001/${name}`;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

after(async () => {
  await client.close();
});

// АТАКА 60 [CRITICAL]: цифра сразу после токена
// | ИНВАРИАНТ: «chanote2.jpg», «scan001.jpg», «deed3.png», «price-list2.jpg» —
//   очевидные сканы документов — не попадают в PHOTOS; при этом законные фото
//   («villa-exterior.jpg», «aerial-survey.jpg», «contractor-progress.jpg»)
//   остаются фотографиями, то есть фикс не откатил починку ложных срабатываний
// | БЫЛО: граница слова требовала НЕ-алфавитно-цифровой символ, а цифра ей не
//   является — нумерованная пачка сканов проходила имя-фильтр целиком, и защита
//   снималась одним нажатием клавиши. ИСПРАВЛЕНО 2026-09-01: в хвост токена
//   добавлена ветка «сразу идут цифры»
// | имя-фильтр — единственная защита при выключенном вижн-гейте, поэтому тест
//   держит обе стороны сразу
// | код: backend/src/lib/photo-vetting.ts:185-188
test("АТАКА 60: нумерованные имена сканов («chanote2.jpg») ловятся имя-фильтром", () => {
  for (const n of [
    "chanote2.jpg", "scan001.jpg", "deed3.png", "price-list2.jpg",
    "chanote-2.jpg", "scan_001.jpg", "document.jpg",
  ]) {
    assert.equal(looksLikeDocumentName(url(n)), true, `должно было ловиться: ${n}`);
  }
  // законные фото по-прежнему проходят — ложные срабатывания не вернулись
  for (const n of [
    "villa-exterior.jpg", "aerial-survey.jpg", "aerial-survey-2.jpg",
    "contractor-progress.jpg", "contractor-progress-3.jpg", "pool.jpg",
  ]) {
    assert.equal(looksLikeDocumentName(url(n)), false, `должно было пройти как фото: ${n}`);
  }
  // НЕ ЗАКРЫТО: множественное число «documents.jpg» — после токена идёт БУКВА,
  // а не цифра и не разделитель, поэтому хвост токена по-прежнему не совпадает
  assert.equal(looksLikeDocumentName(url("documents.jpg")), false);
});

// АТАКА 60a [CRITICAL]: скан чанота не должен становиться публичной обложкой
// | ИНВАРИАНТ: файл «chanote2.jpg» отсеивается на приёме и в object_photos не
//   попадает (правило медиа: чаноты — не в PHOTOS), поэтому в публичном payload
//   /objects обложки из него не возникает
// | БЫЛО: createObject принимал его, ставил isCover=true, и он выходил в
//   публичный /objects как coverImage — при этом гейт публикации в канал
//   (DOCISH_FILE_RE, подстрочный) тот же файл резал: две сети по одному вопросу
//   расходились в ответах. ИСПРАВЛЕНО 2026-09-01: обе сети отвечают «документ»
// | код: backend/src/lib/photo-vetting.ts:185-215 → write.ts:576
test("АТАКА 60a: «chanote2.jpg» не попадает в публичный /objects", async () => {
  const { accepted, rejected } = await partitionByVetting([url("chanote2.jpg")]);
  assert.deepEqual(accepted, []);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].url, url("chanote2.jpg"));
  assert.equal(rejected[0].isDocument, true);

  const { rwNumber } = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    priceThb: 5_000_000,
    photoUrls: [url("chanote2.jpg"), url("aerial-survey.jpg")],
  });
  const obj = (await getPublicObjects(db)).find((o) => o.rwNumber === rwNumber);
  // обложкой стало законное фото, скан не попал ни в обложку, ни в галерею
  assert.equal(obj?.coverImage, url("aerial-survey.jpg"));
  assert.equal(
    [obj?.coverImage, ...(obj?.gallery ?? [])].includes(url("chanote2.jpg")),
    false,
  );

  // и гейт публикации в канал (другая регулярка, подстрочная) отвечает так же
  const DOCISH = /(chanote|deed|cadast|кадастр|межев|чанот|\bprice\b|прайс|sheet|расч[её]т|scan|скан|\bdoc\b|документ|invoice|contract|договор)/i;
  assert.equal(DOCISH.test(url("chanote2.jpg")), true);
});

// АТАКА 61 [MEDIUM]: транслит и однобуквенные расхождения не покрыты
// | ОЖИДАЕТСЯ: транслитерированные имена («chanot», «titul», «dogovor»,
//   «kadastr», «raschet», «mezhevoy») — те же документы
// | ФАКТ: список токенов держит только пары «латиница-как-в-английском» +
//   «кириллица»; тайско-русский транслит, которым реально называют файлы на
//   Пангане, не покрыт. «cadastr» ловится, «kadastr» — нет
// | код: backend/src/lib/photo-vetting.ts:174-184
test("АТАКА 61: транслит «kadastr/chanot/dogovor/titul» проходит имя-фильтр", () => {
  for (const n of ["chanot.jpg", "titul.jpg", "dogovor.jpg", "raschet.jpg", "kadastr.jpg", "mezhevoy-plan.jpg"]) {
    assert.equal(looksLikeDocumentName(url(n)), false, `должно было пройти: ${n}`);
  }
  assert.equal(looksLikeDocumentName(url("cadastr.jpg")), true); // латинское написание ловится
});

// АТАКА 61a [LOW]: двойное кодирование и имя в хосте — закрыто наполовину
// | ОЖИДАЕТСЯ: имя проверяется после полной нормализации, включая хост
// | БЫЛО: обе половины проходили насквозь. ИСПРАВЛЕНО 2026-09-01 ПОПУТНО (одна
//   половина): «%2520chanote%2520» разворачивается одним decodeURIComponent в
//   «%20chanote%20», и цифра «0» из «%20» слева от токена теперь удовлетворяет
//   новой ветке хвоста — двойное кодирование ловится. Это побочный эффект фикса
//   АТАКИ 60, а не отдельная нормализация: третье кодирование её снова обойдёт
// | НЕ ЗАКРЫТО: хост не проверяется вовсе — путь берётся без него
// | код: backend/src/lib/photo-vetting.ts:190-198
test("АТАКА 61a: двойное кодирование ловится, имя в хосте — НЕ ЗАКРЫТО", () => {
  assert.equal(looksLikeDocumentName("https://pub.r2.dev/o/%2520chanote%2520.jpg"), true);
  // НЕ ЗАКРЫТО: токен живёт в хосте, а проверяется только путь
  assert.equal(looksLikeDocumentName("https://chanote-scans.example.com/img1.jpg"), false);
  // одинарное кодирование — ловится
  assert.equal(looksLikeDocumentName("https://pub.r2.dev/o/chanote%20scan.jpg"), true);
});
