/**
 * RED-TEAM РАУНД 2: правило «голого» номера чанота режет живой инвентарь.
 *
 * БЫЛО: раунд 1 добавил в HARD_CONFIDENTIAL правило «chanote + 4+ цифр в
 * пределах 20 символов = номер документа», отсекая отрицательным просмотром
 * только измерения (m²/rai/ngan/…). Но рядом со словом «Chanote» стоит не
 * только площадь: цена в батах, год выдачи, «square meters» словами. Всё это
 * ЖЁСТКО БЛОКИРОВАЛО публикацию — assertNoConfidential возвращал ok:false,
 * объект не уходил ни в Telegram, ни в порталы.
 *
 * ИСПРАВЛЕНО 2026-08-31: правило переписано на `DEED_WORD` + расширенный
 * отрицательный просмотр — из «номера документа» исключены площади (`m²`,
 * `sqm`, `square met`, `rai`, `ngan`, `wah`, `рай`), градусы, деньги (`THB`,
 * `฿`, `บาท`, `USD`, `$`, `EUR`, `RUB`, `₽`, `бат`) и годы (`год`, `г.`,
 * `year`). Плюс `(?<![\d,.])\d{4,6}(?![\d]|[.,]\d)` — семизначная цена
 * «6500000» вообще не считается номером документа. RU- и EN-ветки сравнялись.
 *
 * ИСПРАВЛЕНО 2026-09-05 (19a/19d/19e): к правилу добавлен `NOT_AFTER_CONTEXT` —
 * негативный просмотр НАЗАД на слово-маркер ПЕРЕД числом (issued/sold/built/
 * registered/since/from/in/of/plot/lot/unit/parcel + кириллические). Прежняя
 * проверка смотрела только ВПРАВО (единицы, деньги, «год»/«year» после числа),
 * поэтому «Chanote issued in 2019» и «Chanote land plot 2400» блокировали
 * живой листинг во все каналы.
 *
 * Тесты стерегут фикс.
 *   npx tsx --test src/lib/adv2-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RealEstateObject } from "./domain";
import {
  toPublishable,
  assertNoConfidential,
  ConfidentialLeakError,
  type PublishableObject,
} from "./publishable";

const base = (over: Partial<RealEstateObject> = {}): RealEstateObject =>
  ({
    id: 1,
    rwNumber: "RW-L0042",
    titleEn: "Flat plot in Sri Thanu",
    type: "Land",
    status: "Active",
    district: "Sri Thanu",
    priceThb: 6_500_000,
    coverImage: "https://cdn.example/r2/aerial.jpg",
    gallery: ["https://cdn.example/r2/aerial.jpg"],
    ...over,
  }) as RealEstateObject;

const blockedReason = (descriptionManualEn: string): string[] => {
  const r = toPublishable(base({ descriptionManualEn }), { channel: "telegram" });
  return r.ok ? [] : r.reasons;
};

// АТАКА 19 [HIGH]: цена в батах рядом со словом документа больше не читается
// как номер чанота
// | ИНВАРИАНТ: «Chanote title deed, price 6500000 THB» публикуется, а настоящий
//   голый номер («Chanote 13681,») по-прежнему блокирует — фикс не выхолощен
// | код: backend/src/lib/publishable.ts:213-220
test("АТАКА 19: цена в THB рядом со словом Chanote не блокирует публикацию", () => {
  assert.deepEqual(blockedReason("Chanote title deed, price 6500000 THB. Road access."), []);
  assert.deepEqual(blockedReason("Land with Chanote, 4500000 THB negotiable."), []);
  // контроль fail-closed: настоящий номер документа так же блокируется
  assert.deepEqual(blockedReason("Chanote 13681, road access."), [
    "в публикуемом тексте обнаружено конфиденциальное (номер документа (без индикатора))",
  ]);
});

// АТАКА 19a [HIGH]: год выдачи документа больше не читается как номер чанота
// | ИНВАРИАНТ: «Chanote issued in 2019» — обычная фраза DD-описания, публикуется.
//   Маркер года распознаётся и СЛЕВА от числа (issued/sold/built/registered/in),
//   а не только справа («2019 year», «2019 году»)
// | код: backend/src/lib/publishable.ts:198-200 (NOT_AFTER_CONTEXT), :234-242
test("АТАКА 19a: год выдачи чанота перед запятой не блокирует публикацию", () => {
  assert.deepEqual(blockedReason("Chanote issued in 2019, quiet area, jungle view."), []);
  assert.deepEqual(blockedReason("Chanote title deed, built in 2019. Road access."), []);
  // форма со словом-маркером после числа — как и раньше, проходит
  const ru = toPublishable(base({ descriptionManualRu: "Чанот выдан в 2019 году." }), {
    channel: "telegram",
    lang: "ru",
  });
  assert.equal(ru.ok, true);

  // контроль fail-closed: маркера перед числом нет — это номер документа
  assert.deepEqual(blockedReason("Chanote 2019, road access."), [
    "в публикуемом тексте обнаружено конфиденциальное (номер документа (без индикатора))",
  ]);
  assert.deepEqual(blockedReason("Chanote 13681, road access."), [
    "в публикуемом тексте обнаружено конфиденциальное (номер документа (без индикатора))",
  ]);
});

// АТАКА 19b [HIGH]: единицы площади словами попали в отрицательный просмотр
// | ИНВАРИАНТ: «1600 square meters» ведёт себя так же, как «1600 sqm» — публикация
//   не зависит от того, как продавец написал единицу
// | код: backend/src/lib/publishable.ts:215
test("АТАКА 19b: «1600 square meters» и «1600 sqm» одинаково не блокируют", () => {
  assert.deepEqual(blockedReason("Chanote, area 1600 square meters."), []);
  assert.deepEqual(blockedReason("Chanote, area 1600 sqm."), []);
  assert.deepEqual(blockedReason("Chanote, area 1600 rai."), []);
});

// АТАКА 19c [MEDIUM]: RU- и EN-ветки одного правила сошлись
// | ИНВАРИАНТ: «Chanote, price 6500000 THB» и «Чанот, цена 6500000 бат» дают
//   одинаковый результат; голый номер блокируется в обоих языках
// | код: backend/src/lib/publishable.ts:174,213-220
test("АТАКА 19c: RU-вариант той же фразы ведёт себя так же, как EN", () => {
  const en = toPublishable(base({ descriptionManualEn: "Chanote, price 6500000 THB" }), {
    channel: "telegram",
  });
  const ru = toPublishable(base({ descriptionManualRu: "Чанот, цена 6500000 бат" }), {
    channel: "telegram",
    lang: "ru",
  });
  assert.equal(en.ok, true);
  assert.equal(ru.ok, true);

  // и симметрия в обратную сторону: голый номер блокируется на обоих языках
  const enNum = toPublishable(base({ descriptionManualEn: "Chanote 13681, road access." }), {
    channel: "telegram",
  });
  const ruNum = toPublishable(base({ descriptionManualRu: "Чанот 13681, дорога есть." }), {
    channel: "telegram",
    lang: "ru",
  });
  assert.equal(enNum.ok, false);
  assert.equal(ruNum.ok, false);
});

// АТАКА 19d [MEDIUM]: номер лота в тайтле больше не валит объект целиком
// | ИНВАРИАНТ: генератор тайтла и гейт публикации согласованы — «Chanote land
//   plot 2400» публикуется. Номер лота отличается от номера документа
//   словом-маркером слева (plot/lot/unit/parcel)
// | код: backend/src/lib/publishable.ts:198-200, поле title в assertNoConfidential
test("АТАКА 19d: 4 цифры в тайтле рядом со словом Chanote не блокируют объект", () => {
  const r = toPublishable(base({ titleEn: "Chanote land plot 2400", descriptionManualEn: "Quiet." }), {
    channel: "telegram",
  });
  assert.equal(r.ok, true);

  const sqm = toPublishable(base({ titleEn: "Chanote land 1600 sqm", descriptionManualEn: "Quiet." }), {
    channel: "telegram",
  });
  assert.equal(sqm.ok, true);

  // ОСТАЁТСЯ ХАРАКТЕРИЗУЮЩИМ: единица через «sq wah» мимо просмотра вправо —
  // в списке исключений стоит голое `wah`, а тут между числом и единицей «sq»
  const wah = toPublishable(base({ titleEn: "Chanote land 1600 sq wah", descriptionManualEn: "Quiet." }), {
    channel: "telegram",
  });
  assert.equal(wah.ok, false);

  // контроль fail-closed: голый номер в тайтле по-прежнему блокирует объект
  const bare = toPublishable(base({ titleEn: "Chanote 2400 Sri Thanu", descriptionManualEn: "Quiet." }), {
    channel: "telegram",
  });
  assert.equal(bare.ok, false);
  assert.match(bare.reasons[0], /номер документа/);
});

// АТАКА 19e [LOW]: backstop бросает только на реальной утечке
// | ИНВАРИАНТ: assertNoConfidential — последний рубеж перед отправкой в канал,
//   и он молчит на дате продажи («sold in 2018»), но по-прежнему бросает на
//   голом номере документа. Ложное исключение здесь убивает публикацию без
//   шанса на ручное исправление — оно летит уже после гейта
// | код: backend/src/lib/publishable.ts:198-200, assertNoConfidential
test("АТАКА 19e: assertNoConfidential не бросает на дате продажи", () => {
  const payload = (description: string): PublishableObject => ({
    rwNumber: "RW-L0042",
    type: "Land",
    lang: "en",
    title: "Plot",
    typeLabel: "Land",
    district: "Sri Thanu",
    tenureLabel: "Freehold",
    features: [],
    gallery: [],
    vetted: false,
    url: "https://rightwaygroup.co/object/RW-L0042",
    description,
  });
  assert.doesNotThrow(() => assertNoConfidential(payload("Chanote, sold in 2018 by the family.")));
  assert.doesNotThrow(() => assertNoConfidential(payload("Chanote, registered 2018.")));

  // контроль fail-closed: настоящий номер документа так же бросает
  assert.throws(() => assertNoConfidential(payload("Chanote 13681.")), ConfidentialLeakError);
  assert.throws(() => assertNoConfidential(payload("Chanote no. 13681.")), ConfidentialLeakError);
});
