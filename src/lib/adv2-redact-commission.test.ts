/**
 * RED-TEAM РАУНД 2: обходы и ложные срабатывания переписанной редакции комиссии.
 *
 * Раунд 1 закрыл «\b по ASCII не работает на кириллице»: появились
 * COMMISSION_WORD / COMMISSION_GAP через явные просмотры по буквам. Здесь —
 * что новый паттерн всё ещё пропускает и что он лишнего вырезает.
 *
 * Тесты ЗЕЛЁНЫЕ и характеризующие.
 *   npx tsx --test src/lib/adv2-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RealEstateObject } from "./domain";
import { redactConfidential, sanitizeDescription, toPublishable, type PublishOk } from "./publishable";

const base = (over: Partial<RealEstateObject> = {}): RealEstateObject =>
  ({
    id: 1,
    rwNumber: "RW-L0042",
    titleEn: "Flat plot in Sri Thanu",
    type: "Land",
    status: "Active",
    district: "Sri Thanu",
    priceThb: 6_000_000,
    coverImage: "https://cdn.example/r2/aerial.jpg",
    gallery: ["https://cdn.example/r2/aerial.jpg"],
    ...over,
  }) as RealEstateObject;

// АТАКА 18 [HIGH]: длинное тире — штатный русский разделитель, но его нет в
// COMMISSION_GAP `[\s:–-]` (там короткое тире U+2013 и дефис)
// | ОЖИДАЕТСЯ: «Комиссия — 5%» вырезается целиком, как «Комиссия: 5%»
// | ФАКТ: удаляется только слово, процент остаётся в публикуемом описании
//   («— 5% от цены»), а HARD_CONFIDENTIAL требует слово рядом → backstop молчит
// | код: backend/src/lib/publishable.ts:151
test("АТАКА 18: «Комиссия — 5%» (длинное тире) — процент остаётся в описании", () => {
  const warnings: string[] = [];
  const out = redactConfidential("Комиссия — 5% от цены, участок ровный.", warnings);
  assert.equal(out, "— 5% от цены, участок ровный.");
  assert.ok(warnings.includes("из описания убрано упоминание комиссии"));

  // а с двоеточием — вырезается вся конструкция
  assert.equal(redactConfidential("Комиссия: 5% от цены").trim(), "от цены");
});

// АТАКА 18a [HIGH]: тот же обход доезжает до готового поста в канале
// | ОЖИДАЕТСЯ: ok:false ИЛИ описание без процента комиссии
// | ФАКТ: ok:true, в description «— 5% от цены» — внутренняя экономика в канале
// | код: backend/src/lib/publishable.ts:151,166
test("АТАКА 18a: пост публикуется с процентом комиссии после длинного тире", () => {
  const r = toPublishable(base({ descriptionManualRu: "Комиссия — 5% от цены. Участок ровный." }), {
    channel: "telegram",
    lang: "ru",
  });
  assert.equal(r.ok, true);
  assert.match((r as PublishOk).object.description!, /5%/);
});

// АТАКА 18b [MEDIUM]: слово-омоглиф и мягкий перенос обходят просмотры по буквам
// | ОЖИДАЕТСЯ: нормализация текста перед проверкой (NFKC + чистка zero-width)
// | ФАКТ: «Соmmission 5%» (кириллические С и о) и «Ко­миссия 5%» (мягкий
//   перенос — его вставляет копипаст из Word/PDF-дека) не ловятся ни редакцией,
//   ни fail-closed рубежом
// | код: backend/src/lib/publishable.ts:150,164-169
test("АТАКА 18b: омоглифы и мягкий перенос проносят комиссию мимо обеих проверок", () => {
  const homoglyph = "Соmmission 5% с продавца"; // С и о — кириллица
  assert.equal(redactConfidential(homoglyph), homoglyph);
  const r = toPublishable(base({ descriptionManualRu: homoglyph }), {
    channel: "telegram",
    lang: "ru",
  });
  assert.equal(r.ok, true);
  assert.match((r as PublishOk).object.description!, /mmission 5%/);

  // мягкий перенос (U+00AD) прилетает копипастом из Word/PDF-дека
  const softHyphen = "Ко­миссия 5% с продавца";
  assert.equal(redactConfidential(softHyphen), softHyphen);
  const r2 = toPublishable(base({ descriptionManualRu: softHyphen }), {
    channel: "telegram",
    lang: "ru",
  });
  assert.equal(r2.ok, true);
  assert.match((r2 as PublishOk).object.description!, /5%/);
});

// АТАКА 18c [MEDIUM]: `\d{0,2}` и `%?` необязательны — паттерн удаляет ЛЮБОЕ
// вхождение слова «комиссия/commission», даже в законном смысле
// | ОЖИДАЕТСЯ: редактируется только конструкция «комиссия + число/процент»
// | ФАКТ: из описания молча пропадают слова в невинных фразах, текст ломается
//   («Sale on commission basis» → «Sale on basis»), предупреждение при этом
//   заявляет, что «убрано упоминание комиссии»
// | код: backend/src/lib/publishable.ts:152-156
test("АТАКА 18c: законное слово «commission/комиссия» вырезается из описания", () => {
  assert.equal(redactConfidential("Sale on commission basis").replace(/\s+/g, " "), "Sale on basis");
  assert.equal(
    redactConfidential("Разрешение выдала планировочная комиссия острова").replace(/\s+/g, " "),
    "Разрешение выдала планировочная острова",
  );
  // и это доезжает до публикации — фраза в посте бессмысленна
  const w: string[] = [];
  assert.equal(sanitizeDescription("Sale on commission basis only.", "en", w), "Sale on basis only.");
});

// АТАКА 18d [MEDIUM]: редакция работает по словарю из двух слов
// | ОЖИДАЕТСЯ: раз это fail-closed рубеж, синонимы («fee», «вознаграждение»,
//   «наша доля») тоже не должны уходить в канал — или гейт не даёт гарантии
// | ФАКТ: «Our fee 5% from the seller» публикуется дословно
// | код: backend/src/lib/publishable.ts:150,164-169
test("АТАКА 18d: синоним комиссии («fee») уходит в публикацию дословно", () => {
  const txt = "Our fee 5% from the seller, buyer pays nothing.";
  assert.equal(redactConfidential(txt), txt);
  const r = toPublishable(base({ descriptionManualEn: txt }), { channel: "telegram" });
  assert.equal(r.ok, true);
  assert.match((r as PublishOk).object.description!, /fee 5%/);
});
