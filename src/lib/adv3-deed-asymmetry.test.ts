/**
 * RED-TEAM РАУНД 3 — правила «номера документа» после второго цикла фиксов.
 *
 * Второй цикл ввёл LETTER/DEED_WORD/DEED_INDICATOR (кириллица «ожила») и правило
 * «голого номера» с исключениями под площади/деньги/годы/градусы. В результате:
 *  - появился НОВЫЙ класс ложных блокировок — год постройки/выдачи после слова
 *    chanote/title deed валит публикацию объекта целиком;
 *  - блокировка «номер документа» (HARD_CONFIDENTIAL[2]) осталась ASCII-`\b`
 *    и для кириллицы по-прежнему недостижима — её лишь маскирует правило
 *    «голого номера», работающее только на 4-6 цифрах;
 *  - тривиальные обходы (омоглиф, разрядка) не закрыты ни одним правилом.
 *
 * Тесты ЗЕЛЁНЫЕ и характеризующие.
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

// АТАКА 56 [HIGH]: год рядом со словом «chanote» блокирует публикацию объекта
// | ОЖИДАЕТСЯ: «Chanote issued in 2019» / «built 2019» — это год, а не номер
//   документа; объект публикуется
// | ФАКТ: правило «голого номера» исключает год только когда маркер стоит ПОСЛЕ
//   числа («2019 год», «2019 year»). Английская запись «issued in 2019» ставит
//   маркер ПЕРЕД числом, исключение не срабатывает, и весь объект уходит в
//   ok:false — молча пропадает из канала публикации
// | код: backend/src/lib/publishable.ts:213-217
test("АТАКА 56: «Chanote issued in 2019» валит публикацию объекта целиком", () => {
  assert.equal(blocked("Chanote issued in 2019"), true);
  assert.equal(blocked("Villa with chanote, built 2019"), true);
  assert.equal(blocked("Title deed 2018 renovation"), true);

  const res = toPublishable({ ...OBJ, titleEn: "Chanote issued in 2019" }, { channel: "telegram" });
  assert.equal(res.ok, false);
  assert.deepEqual(
    (res as { reasons: string[] }).reasons,
    ["в публикуемом тексте обнаружено конфиденциальное (номер документа (без индикатора))"],
  );
});

// АТАКА 56a [HIGH]: асимметрия EN/RU — русская формулировка того же факта проходит
// | ОЖИДАЕТСЯ: одинаковое поведение на обоих языках (правило двуязычия)
// | ФАКТ: «Чанот выдан в 2019 году» проходит (после числа стоит «году» →
//   исключение), «Chanote issued in 2019» блокируется. Один и тот же объект
//   публикуется в RU-канале и молча не публикуется в EN
// | код: backend/src/lib/publishable.ts:213-217
test("АТАКА 56a: RU-версия «Чанот выдан в 2019 году» публикуется, EN — нет", () => {
  assert.equal(blocked("Чанот выдан в 2019 году"), false);
  assert.equal(blocked("Chanote issued in 2019"), true);
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
