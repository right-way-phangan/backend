/**
 * RED-TEAM РАУНД 3 — правила «номера документа» после второго цикла фиксов.
 *
 * Второй цикл ввёл LETTER/DEED_WORD/DEED_INDICATOR (кириллица «ожила») и правило
 * «голого номера» с исключениями под площади/деньги/годы/градусы. В результате:
 *  - появился НОВЫЙ класс ложных блокировок — год постройки/выдачи после слова
 *    chanote/title deed валил публикацию объекта целиком;
 *  - блокировка «номер документа» (HARD_CONFIDENTIAL[2]) осталась ASCII-`\b`
 *    и для кириллицы по-прежнему недостижима — её лишь маскирует правило
 *    «голого номера», работающее только на 4-6 цифрах;
 *  - тривиальные обходы (омоглиф, разрядка) не закрыты ни одним правилом.
 *
 * ИСПРАВЛЕНО 2026-09-05 (АТАКА 56): добавлен `NOT_AFTER_CONTEXT` — просмотр
 * НАЗАД на слово-маркер перед числом. «Chanote issued in 2019» публикуется.
 * АТАКА 56a ИСПРАВЛЕНА 2026-09-05: ASCII-`\b` внутри просмотра делал всю
 * кириллическую половину списка маркеров недостижимой — асимметрия EN/RU не
 * ушла, а перевернулась. Заменён на просмотр по буквам, как в DEED_WORD.
 * Это был четвёртый случай одной и той же ошибки: в JS `\b` и `\w` считаются
 * по ASCII и на границе с кириллицей не срабатывают.
 *   npx tsx --test src/lib/adv3-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoConfidential, redactConfidential, toPublishable, type PublishableObject } from "./publishable";
import type { RealEstateObject } from "./domain";

const pub = (title: string, description?: string): PublishableObject => ({
  rwNumber: "RW-V0001",
  type: "Villa",
  lang: "en",
  title,
  typeLabel: "Villa",
  features: [],
  gallery: [],
  vetted: false,
  url: "https://rightwaygroup.co/object/RW-V0001",
  description,
});

const blocked = (title: string): boolean => {
  try {
    assertNoConfidential(pub(title));
    return false;
  } catch {
    return true;
  }
};

const OBJ = {
  rwNumber: "RW-V0001",
  type: "Villa",
  status: "Active",
  district: "Sri Thanu",
  coverImage: "https://cdn.example/a.jpg",
  gallery: ["https://cdn.example/a.jpg"],
  priceThb: 9_000_000,
  descriptionManualEn: "Nice villa.",
} as unknown as RealEstateObject;

// АТАКА 56 [HIGH]: год рядом со словом «chanote» больше не блокирует объект
// | ИНВАРИАНТ: «Chanote issued in 2019» / «built 2019» — это год, а не номер
//   документа; объект публикуется. Маркер года читается и слева от числа
// | код: backend/src/lib/publishable.ts:198-200 (NOT_AFTER_CONTEXT), :234-242
test("АТАКА 56: «Chanote issued in 2019» не валит публикацию объекта", () => {
  assert.equal(blocked("Chanote issued in 2019"), false);
  assert.equal(blocked("Villa with chanote, built 2019"), false);
  assert.equal(blocked("Chanote registered 2021"), false);

  const res = toPublishable({ ...OBJ, titleEn: "Chanote issued in 2019" }, { channel: "telegram" });
  assert.equal(res.ok, true);

  // контроль fail-closed: без слова-маркера слева число рядом с DEED_WORD
  // по-прежнему считается номером документа
  assert.equal(blocked("Chanote 2019"), true);
  assert.equal(blocked("Chanote 13681"), true);
  const bare = toPublishable({ ...OBJ, titleEn: "Chanote 13681" }, { channel: "telegram" });
  assert.equal(bare.ok, false);
  assert.deepEqual(
    (bare as { reasons: string[] }).reasons,
    ["в публикуемом тексте обнаружено конфиденциальное (номер документа (без индикатора))"],
  );

  // ОСТАЁТСЯ ХАРАКТЕРИЗУЮЩИМ: «Title deed 2018 renovation» — год без маркера
  // слева и без «year» справа. Отличить его от номера документа правилу нечем
  assert.equal(blocked("Title deed 2018 renovation"), true);
});

// АТАКА 56a [HIGH]: асимметрия EN/RU в маркерах контекста
// | ОЖИДАЛОСЬ: одинаковое поведение на обоих языках (правило двуязычия)
// | БЫЛО: NOT_AFTER_CONTEXT начинался с `(?<!\b(?:issued|…|выдан|…|участок)\s)`,
//   а `\b` в JS — ASCII-only: перед кириллической буквой после пробела границы
//   слова нет, поэтому вся кириллическая половина списка была недостижима.
//   EN-форма «Chanote issued in 2019» проходила, RU-форма «Чанот выдан 2019» —
//   блокировалась; спасал только маркер СПРАВА («2019 году»)
// | ИСПРАВЛЕНО 2026-09-05: просмотр по буквам + словоформы `выдан[а-яё]{0,3}`
// | код: backend/src/lib/publishable.ts:198-200
test("АТАКА 56a: маркеры контекста работают одинаково на EN и RU", () => {
  // EN — маркер слева работает
  assert.equal(blocked("Chanote issued in 2019"), false);
  assert.equal(blocked("Chanote sold in 2018"), false);
  assert.equal(blocked("Chanote land plot 2400"), false);

  // RU — те же маркеры слева работают ровно так же
  assert.equal(blocked("Чанот выдан 2019"), false);
  assert.equal(blocked("Чанот продан в 2018"), false);
  assert.equal(blocked("Чанот участок 2400"), false);
  assert.equal(blocked("Чанот зарегистрирован 2019"), false);
  assert.equal(blocked("Чанот выдана 2019"), false); // словоформа

  // маркер справа продолжает работать
  assert.equal(blocked("Чанот выдан в 2019 году"), false);

  // контроль fail-closed: настоящий номер блокируется на обоих языках
  assert.equal(blocked("Chanote 13681"), true);
  assert.equal(blocked("Чанот 13681"), true);
});

// АТАКА 57 [HIGH]: кириллический номер документа с индикатором утекает в тайтле
// | ОЖИДАЕТСЯ: «Чанот № 1234567» блокирует публикацию так же, как «Chanote No.
//   1234567»
// | ФАКТ: правило HARD_CONFIDENTIAL[2] («номер документа») осталось на ASCII-`\b`
//   — для «чанот» граница слова не возникает, альтернатива недостижима. Прикрывает
//   только правило «голого номера», а оно ограничено 4-6 цифрами: реальный номер
//   чанота из 7 цифр (и любой из 3) проходит. Тайтл через redactConfidential не
//   прогоняется ни на записи, ни на публикации — номер уходит в канал
// | код: backend/src/lib/publishable.ts:206 (vs 174 DEED_WORD)
test("АТАКА 57: «Чанот № 1234567» публикуется, «Chanote No. 1234567» — блокируется", () => {
  assert.equal(blocked("Чанот № 1234567"), false);
  assert.equal(blocked("Чанот № 123"), false);
  assert.equal(blocked("Chanote No. 1234567"), true);
  assert.equal(blocked("Chanote No. 123"), true);

  const res = toPublishable({ ...OBJ, titleEn: "Чанот № 1234567" }, { channel: "telegram" });
  assert.equal(res.ok, true);
  assert.equal((res as { object: PublishableObject }).object.title, "Чанот № 1234567");

  // в ОПИСАНИИ тот же номер вырезается — дыра именно в финальном блокировщике
  assert.equal(redactConfidential("Чанот № 1234567"), "Чанот");
});

// АТАКА 58 [MEDIUM]: омоглиф и разрядка обходят и редакцию, и блокировку
// | ОЖИДАЕТСЯ: «Чaнот 13681» (латинская «a») и «Ч а н о т 13681» ловятся —
//   номер документа остаётся номером документа
// | ФАКТ: DEED_WORD — точный литерал по алфавиту, оба варианта проходят обе
//   сети. Ввод в админку/бота ручной, подмена символа происходит и случайно
//   (раскладка), и намеренно
// | код: backend/src/lib/publishable.ts:174,213
test("АТАКА 58: омоглиф «Чaнот» и разрядка «Ч а н о т» проходят обе сети", () => {
  assert.equal(blocked("Чaнот 13681"), false);
  assert.equal(blocked("Ч а н о т 13681"), false);
  assert.equal(redactConfidential("Чaнот 13681"), "Чaнот 13681");
  assert.equal(redactConfidential("Ч а н о т 13681"), "Ч а н о т 13681");

  // контроль: корректное написание блокируется
  assert.equal(blocked("Чанот 13681"), true);
});

// АТАКА 59 [MEDIUM]: номер дома рядом со словом chanote читается как номер деда
// | ОЖИДАЕТСЯ: «house No 245» — адрес, объект публикуется
// | ФАКТ: индикаторное правило допускает 20 символов между словом-документом и
//   индикатором и не смотрит, к чему относится «No». Достаточно упомянуть тип
//   документа и номер дома в одном предложении, чтобы объект стал непубликуемым
// | код: backend/src/lib/publishable.ts:206
test("АТАКА 59: «Chanote title deed house No 245» — ложная блокировка", () => {
  assert.equal(blocked("Chanote title deed house No 245"), true);
});
