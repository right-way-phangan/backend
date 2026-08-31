/**
 * RED-TEAM: гейт публикуемости (publishable.ts) — обходы fail-closed рубежа.
 * Чистые тесты, без БД/сети. ЗЕЛЁНЫЕ: фиксируют фактическое поведение.
 *   npx tsx --test src/lib/adv-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RealEstateObject } from "./domain";
import { toPublishable, sanitizeDescription, assertNoConfidential, type PublishOk } from "./publishable";

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
    seaView: false, beachfront: false, mountainView: false, jungleView: false,
    flatLand: true, quiet: true, electricity: true,
    ...over,
  }) as RealEstateObject;

// АТАКА 10 [HIGH]: номер чанота в описании БЕЗ слова-индикатора («Chanote 13681» —
// самый частый способ записи), уходит в Telegram-канал
// | ОЖИДАЕТСЯ: модуль обещает fail-closed — «номера чанотов … → объект блокируется»
//   (шапка publishable.ts). Номер документа публично раскрывает участок в LandsMaps
// | ФАКТ: и REDACT_DEED, и HARD_CONFIDENTIAL требуют индикатор (no./№/#/เลขที่)
//   перед числом. «Chanote 13681» / «Чанот 13681» индикатора не имеют → проходят
//   насквозь и печатаются в посте
// | код: src/lib/publishable.ts:135-137 (REDACT_DEED), 145 (HARD_CONFIDENTIAL)
test("АТАКА 10: «Chanote 13681» без слова no./№ проходит fail-closed рубеж и публикуется", () => {
  const r = toPublishable(
    base({ descriptionManualEn: "Chanote 13681, road access, electricity on the plot." }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(r.ok, true, "объект НЕ заблокирован");
  assert.match((r as PublishOk).object.description ?? "", /Chanote 13681/);
  // прямая проверка рубежа — исключения нет
  assert.doesNotThrow(() => assertNoConfidential((r as PublishOk).object));
  // тот же номер с индикатором ловится — значит защита есть, но обходится формой записи
  assert.equal(sanitizeDescription("Chanote no. 13681 here", "en"), "Chanote here");
});

// АТАКА 11 [HIGH]: комиссия, записанная другой словоформой («комиссионные 5%»,
// «commission fee of 5%»)
// | ОЖИДАЕТСЯ: комиссия — «наша внутренняя экономика, не в публикацию», рубеж
//   assertNoConfidential должен блокировать
// | ФАКТ: класс `комисси[яюейи]` + `\b` покрывает только 5 окончаний. «комиссионные»
//   не совпадает ни с редактором, ни с блокировщиком; в английской ветке слово
//   «commission» вырезается, а число «5%» остаётся в тексте
// | код: src/lib/publishable.ts:139-140, 144
test("АТАКА 11: «комиссионные 5%» обходит и редактор, и fail-closed рубеж", () => {
  const r = toPublishable(
    base({ descriptionManualRu: "Участок у дороги. Наши комиссионные 5% сверху к цене." }),
    { channel: "telegram", lang: "ru" },
  );
  assert.equal(r.ok, true);
  assert.match((r as PublishOk).object.description ?? "", /комиссионные 5%/);
});

test("АТАКА 11a: «commission of 5%» — слово вырезается, процент остаётся", () => {
  const out = sanitizeDescription("Great plot. Owner pays commission of 5% on top.", "en");
  assert.match(out ?? "", /of 5% on top/);
});

// АТАКА 12 [MEDIUM]: все фото объекта имеют doc-подобные имена
// | ОЖИДАЕТСЯ: раз обложки для публикации не остаётся — объект блокируется
//   («нет обложки (фото)»), fan-out ничего не постит
// | ФАКТ: проверка `!o.coverImage` идёт ДО фильтра doc-подобных имён. Все фото
//   отсеиваются уже после решения → результат ok:true с coverImage=undefined и
//   пустой галереей. Серверный fan-out получит «зелёный» объект без единого фото
// | код: src/lib/publishable.ts:299 (блокировка) vs 314, 337-338 (фильтр после)
test("АТАКА 12: объект из одних doc-фото проходит гейт как ok, но без обложки и галереи", () => {
  const r = toPublishable(
    base({
      coverImage: "https://cdn.example/r2/chanote-scan.jpg",
      gallery: ["https://cdn.example/r2/chanote-scan.jpg", "https://cdn.example/r2/price-sheet.png"],
    }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(r.ok, true, "гейт не заблокировал");
  assert.equal((r as PublishOk).object.coverImage, undefined);
  assert.deepEqual((r as PublishOk).object.gallery, []);
});
