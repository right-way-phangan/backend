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
// | БЫЛО: и REDACT_DEED, и HARD_CONFIDENTIAL требовали индикатор (no./№/#/เลขที่)
//   перед числом, поэтому «Chanote 13681» / «Чанот 13681» проходили насквозь и
//   печатались в посте
// | ИСПРАВЛЕНО 2026-08-31: добавлен паттерн голого номера (4+ цифр рядом со словом
//   chanote/чанот), измерения из-под него исключены отрицательным просмотром
// | код: src/lib/publishable.ts:161-166
test("АТАКА 10: «Chanote 13681» без слова no./№ блокируется рубежом", () => {
  const r = toPublishable(
    base({ descriptionManualEn: "Chanote 13681, road access, electricity on the plot." }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(r.ok, false, "объект заблокирован");

  // и сам рубеж бросает на таком тексте
  assert.throws(() =>
    assertNoConfidential({
      rwNumber: "RW-L0001",
      type: "Land",
      lang: "en",
      title: "Plot",
      typeLabel: "Land",
      description: "Chanote 13681, road access.",
      gallery: [],
      url: "https://rightwaygroup.co/object/RW-L0001",
      vetted: false,
    } as never),
  );

  // номер с индикатором ловится, как и раньше
  assert.equal(sanitizeDescription("Chanote no. 13681 here", "en"), "Chanote here");

  // а измерения рядом со словом chanote — не номер: публикацию не блокируют
  const ok = toPublishable(
    base({ descriptionManualEn: "Chanote plot of 1600 m², 360 degrees view." }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(ok.ok, true, "площадь и градусы не считаются номером документа");
});

// АТАКА 11 [HIGH]: комиссия, записанная другой словоформой («комиссионные 5%»,
// «commission fee of 5%»)
// | ОЖИДАЕТСЯ: комиссия — «наша внутренняя экономика, не в публикацию», рубеж
//   assertNoConfidential должен блокировать
// | БЫЛО: класс `комисси[яюейи]` покрывал только 5 окончаний, а `\b` в JS считается
//   по ASCII и на границе с кириллицей не срабатывал вовсе — «комиссионные» не
//   ловилось ни редактором, ни блокировщиком; в английской ветке слово «commission»
//   вырезалось, а число «5%» оставалось в тексте («of 5% on top»)
// | ИСПРАВЛЕНО 2026-08-31: словоформы через [а-яё]*, границы — явными просмотрами,
//   между словом и числом допускаются «of» и «в размере»
// | код: src/lib/publishable.ts:148-157,165-169
test("АТАКА 11: «комиссионные 5%» вырезаются редактором", () => {
  const r = toPublishable(
    base({ descriptionManualRu: "Участок у дороги. Наши комиссионные 5% сверху к цене." }),
    { channel: "telegram", lang: "ru" },
  );
  assert.equal(r.ok, true, "объект публикуется — но уже без комиссии");
  const desc = (r as PublishOk).object.description ?? "";
  assert.doesNotMatch(desc, /комиссионные/);
  assert.doesNotMatch(desc, /5\s*%/);
  assert.match(desc, /Участок у дороги/, "остальное описание сохранено");
});

test("АТАКА 11a: «commission of 5%» вырезается целиком, вместе с процентом", () => {
  const out = sanitizeDescription("Great plot. Owner pays commission of 5% on top.", "en");
  assert.doesNotMatch(out ?? "", /5%/);
  assert.doesNotMatch(out ?? "", /commission/i);
  assert.match(out ?? "", /Great plot/);
});

test("АТАКА 11b: обратный порядок «5% commission» тоже вырезается", () => {
  const out = sanitizeDescription("Plot near road. 5% commission to agent.", "en");
  assert.doesNotMatch(out ?? "", /5%/);
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
