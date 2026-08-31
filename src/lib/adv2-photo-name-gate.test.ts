/**
 * RED-TEAM РАУНД 2: гейт по имени файла (looksLikeDocumentName) — обе стороны.
 *
 * БЫЛО: раунд 1 сделал вет-гейт фото fail-CLOSED по имени файла, потому что
 * вижн-часть выключается вместе с ANTHROPIC_API_KEY. Словарь искал ПОДСТРОКИ
 * в одном только pathname, отсюда два симметричных провала:
 *  - ЛОЖНЫЕ СРАБАТЫВАНИЯ: «survey» и «contract» ловились внутри «aerial survey»
 *    и «contractor». Аэросъёмка — штатная обложка земли (CLAUDE.md: «Обложка:
 *    land = аэро»), а безфотный объект скрыт из каталога
 *    (memory project_photoless_hidden_from_site) — гейт молча стирал инвентарь.
 *  - ОБХОДЫ: словарь не знал ни «цена за рай» (именно так CLAUDE.md называет
 *    конфиденциальный расчётный лист), ни «price_sheet», ни «komissiya», а имя
 *    в query-строке вообще не смотрелось.
 *
 * ИСПРАВЛЕНО 2026-08-31: DOC_LIKE_NAME собран из списка DOC_TOKENS и проверяет
 * ОТДЕЛЬНЫЕ слова (границы — не-буквенный символ или край имени); «survey»
 * документом делает уточнение (land/topo/…-survey, survey-plan). Разделители
 * `-`, `_` и пробел равнозначны. Словарь пополнен (price[-_ ]sheet, komissiya,
 * цена-за-рай, price-per-rai). Проверяется весь URL: pathname + search + hash.
 *
 * Тесты стерегут фикс; 28/29 + новый 28b остаются ХАРАКТЕРИЗУЮЩИМИ.
 *   npx tsx --test src/lib/adv2-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeDocumentName, partitionByVetting } from "./photo-vetting";

delete process.env.ANTHROPIC_API_KEY; // ровно тот режим, ради которого гейт и делали

const B = "https://media.rightwaygroup.co/objects/RW-L0042/";
const u = (name: string) => B + encodeURI(name);

// АТАКА 27 [HIGH]: аэросъёмка участка больше не отбрасывается как документ
// | ИНВАРИАНТ: «survey» — документ только с уточнением (land/topo/survey-plan);
//   «aerial-survey-*» и «drone-survey-*» проходят как фото. Разделитель роли
//   не играет
// | код: backend/src/lib/photo-vetting.ts (DOC_TOKENS, DOC_LIKE_NAME)
test("АТАКА 27: aerial-survey / drone-survey проходят как фото", () => {
  assert.equal(looksLikeDocumentName(u("aerial-survey-1.jpg")), false);
  assert.equal(looksLikeDocumentName(u("aerial_survey_1.jpg")), false);
  assert.equal(looksLikeDocumentName(u("aerial survey.jpg")), false);
  assert.equal(looksLikeDocumentName(u("drone-survey-plot.jpg")), false);
  // а настоящие документы съёмки — остаются документами
  assert.equal(looksLikeDocumentName(u("land-survey-morning.jpg")), true);
  assert.equal(looksLikeDocumentName(u("land_survey.jpg")), true);
  assert.equal(looksLikeDocumentName(u("LAND-SURVEY.JPG")), true);
  assert.equal(looksLikeDocumentName(u("topographic-survey.jpg")), true);
  assert.equal(looksLikeDocumentName(u("survey-plan.jpg")), true);
});

// АТАКА 27a [HIGH]: фотоотчёт подрядчика больше не читается как «contract»
// | ИНВАРИАНТ: «contractor» — отдельное слово, а не вхождение «contract»;
//   фото хода стройки принимаются (под них есть construction_updates,
//   /projects/[slug]/construction)
// | код: backend/src/lib/photo-vetting.ts (DOC_LIKE_NAME — границы слова)
test("АТАКА 27a: contractor-progress проходит как фото", () => {
  assert.equal(looksLikeDocumentName(u("contractor-progress-01.jpg")), false);
  assert.equal(looksLikeDocumentName(u("subcontractor-pool.jpg")), false);
  // само слово «contract» — по-прежнему документ
  assert.equal(looksLikeDocumentName(u("contract-2026.jpg")), true);
});

// АТАКА 27b [HIGH]: следствие — земельный объект с аэросъёмкой сохраняет фото
// | ИНВАРИАНТ: partitionByVetting принимает аэро-обложки (иначе объект остаётся
//   без обложки и выпадает из публичного каталога при 200 OK от addObjectPhotos),
//   но конфиденциальный расчётный лист в той же пачке отбраковывает
// | код: backend/src/lib/photo-vetting.ts (partitionByVetting)
test("АТАКА 27b: земельный объект с аэросъёмкой не теряет фото", async () => {
  const { accepted, rejected } = await partitionByVetting([
    u("aerial-survey-01.jpg"),
    u("drone-survey-sunset.jpg"),
    u("цена-за-рай.jpg"),
  ]);
  assert.deepEqual(accepted, [u("aerial-survey-01.jpg"), u("drone-survey-sunset.jpg")]);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, "имя файла выглядит как документ/прайс");
});

// АТАКА 28 [HIGH]: расчётные листы ловятся по имени
// | ИНВАРИАНТ: артефакт, названный в CLAUDE.md («Google Sheets „цена за рай /
//   комиссия 3%/5%“»), не проходит по имени ни в одном написании-разделителе
// | НЕ ЗАКРЫТО: транслит без словарной формы («raschet», «chanot») по-прежнему
//   проходит — словарь знает только «расч[её]т»/«chanote»
// | код: backend/src/lib/photo-vetting.ts (DOC_TOKENS)
test("АТАКА 28: имена расчётных листов не проходят гейт", async () => {
  for (const n of [
    "цена-за-рай.jpg",
    "цена_за_рай.jpg",
    "цена за рай.jpg",
    "price_sheet.jpg",
    "price-list.jpg",
    "pricelist.jpg",
    "price per rai.jpg",
    "komissiya.jpg",
    "расчёт.jpg",
    "прайс-лист.jpg",
  ]) {
    assert.equal(looksLikeDocumentName(u(n)), true, n);
  }
  const { accepted } = await partitionByVetting([u("цена-за-рай.jpg"), u("price_sheet.jpg")]);
  assert.deepEqual(accepted, []);

  // остаточная дыра: транслит мимо словаря
  assert.equal(looksLikeDocumentName(u("raschet-za-rai.jpg")), false);
  assert.equal(looksLikeDocumentName(u("chanot.jpg")), false);
});

// АТАКА 28a [MEDIUM]: проверяется весь URL, а не только pathname
// | ИНВАРИАНТ: подписанные/прокси-ссылки с именем файла в query или во
//   фрагменте проверяются наравне с прямым путём
// | код: backend/src/lib/photo-vetting.ts (looksLikeDocumentName — pathname+search+hash)
test("АТАКА 28a: имя документа в query-строке и фрагменте гейт видит", () => {
  assert.equal(looksLikeDocumentName(B + "photo.jpg?name=chanote-13681.jpg"), true);
  assert.equal(looksLikeDocumentName(B + "photo.jpg#chanote-13681"), true);
  assert.equal(looksLikeDocumentName(B + "chanote-13681.jpg"), true);
  // контроль: обычная подписанная ссылка на фото не ломается
  assert.equal(looksLikeDocumentName(B + "villa-pool.jpg?sig=abc123&exp=999"), false);
});

// АТАКА 28b [HIGH]: `\w` в токенах словаря — ASCII-only, поэтому кириллические
// словоформы с окончанием проходили мимо гейта (тот же класс бага, что и
// ASCII-`\b` в publishable.ts)
// | ОЖИДАЛОСЬ: «межевой-план.jpg», «кадастровый-план.jpg», «комиссия.jpg»,
//   «чанота.jpg» — документы
// | БЫЛО: токен `межев\w*` матчил «межев», после чего требовалась НЕ-буква, а там
//   кириллическая «о» → правило не срабатывало; ловились только голые основы
// | ИСПРАВЛЕНО 2026-08-31: `\w*` → `[а-яё]*` во всех кириллических токенах
// | код: backend/src/lib/photo-vetting.ts (DOC_TOKENS)
test("АТАКА 28b: кириллические словоформы с окончанием тоже ловятся", () => {
  for (const n of ["межевой-план.jpg", "кадастровый-план.jpg", "комиссия.jpg", "чанота.jpg",
                   "документы.jpg", "договора.jpg", "прайсы.jpg"]) {
    assert.equal(looksLikeDocumentName(u(n)), true, n);
  }
  // голые основы — по-прежнему ловятся
  for (const n of ["межев.jpg", "кадастр.jpg", "комисси.jpg", "чанот-13681.jpg"]) {
    assert.equal(looksLikeDocumentName(u(n)), true, n);
  }
  // ...а законные фото не задеты
  for (const n of ["вилла-вид-на-море.jpg", "участок-аэро.jpg", "бассейн.jpg"]) {
    assert.equal(looksLikeDocumentName(u(n)), false, n);
  }
});

// АТАКА 29 [MEDIUM]: НЕ ЗАКРЫТО — два разных словаря на приёме и на публикации
// | ОЖИДАЕТСЯ: один список doc-подобных имён на оба гейта
// | ФАКТ: ложное срабатывание на приёме починено (aerial-survey теперь проходит
//   в обоих), но расхождение осталось: DOCISH_FILE_RE ищет подстроки, поэтому
//   «sheet-metal-roof.jpg» попадает в базу и молча выпадает из галереи поста,
//   а «цена-за-рай.jpg» — наоборот, режется на приёме, но легаси-фото с таким
//   именем уйдёт в публикацию
// | код: backend/src/lib/photo-vetting.ts (DOC_TOKENS) vs publishable.ts:314-315
test("АТАКА 29: словари приёма и публикации не совпадают", () => {
  const DOCISH_FILE_RE =
    /(chanote|deed|cadast|кадастр|межев|чанот|\bprice\b|прайс|sheet|расч[её]т|scan|скан|\bdoc\b|документ|invoice|contract|договор)/i;

  // ложное срабатывание раунда 1 закрыто с обеих сторон
  assert.equal(looksLikeDocumentName(u("aerial-survey-1.jpg")), false);
  assert.equal(DOCISH_FILE_RE.test(u("aerial-survey-1.jpg")), false);

  // но расхождение осталось в обе стороны
  assert.equal(looksLikeDocumentName(u("sheet-metal-roof.jpg")), false);
  assert.equal(DOCISH_FILE_RE.test(u("sheet-metal-roof.jpg")), true);

  assert.equal(looksLikeDocumentName(u("цена-за-рай.jpg")), true);
  assert.equal(DOCISH_FILE_RE.test(decodeURIComponent(u("цена-за-рай.jpg"))), false);
});
